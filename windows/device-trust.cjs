'use strict';
const crypto=require('node:crypto');
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
const uuid=()=>crypto.randomUUID();
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const enrollmentMessage=(gatewayId,clientId,projectId,publicKey)=>['oneleadq-enroll-v1',gatewayId,clientId,projectId,publicKey].join('\n');
const challengeMessage=(gatewayId,deviceId,nonce)=>['oneleadq-reconnect-v1',gatewayId,deviceId,nonce].join('\n');

// Store is mandatory. Production adapter uses Windows DPAPI CurrentUser; tests inject labelled fixtures.
async function createDeviceTrust({gatewayId,store,legacy='http://127.0.0.1:3020',now=Date.now,sessionLifetime=5*60*1000,fetcher=fetch}) {
  if(!validId(gatewayId))throw new Error('Stable gateway identity required');
  const origin=new URL(legacy);if(origin.protocol!=='http:'||!['127.0.0.1','localhost'].includes(origin.hostname)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Legacy gateway must be loopback');
  let records=await store.read();if(!records)records={version:1,devices:{},requests:{}};
  if(records.version!==1||!records.devices||!records.requests)throw new Error('Invalid trust store; refuse to reset authority');
  const sessions=new Map(),challenges=new Map(),attempts=new Map();let queue=Promise.resolve();
  const mutate=operation=>{const pending=queue.then(async()=>{const next=structuredClone(records);const result=operation(next);await store.write(next);records=next;return result;});queue=pending.catch(()=>{});return pending;};
  const auditEntry=(next,event,d,extra={})=>{if(next.audit!==undefined&&!Array.isArray(next.audit))throw Error('Invalid audit store; refuse authority reset');next.audit=[...(next.audit||[]),{id:uuid(),at:now(),event,deviceId:d.id,clientId:d.clientId,projectId:d.projectId,...extra}].slice(-500);};
  async function observe(d,result){const jobs=result.jobs||(result.job?[result.job]:[]);for(const job of jobs){if(job.clientId!==d.clientId||job.projectId!==d.projectId)fail(403,'SCOPE_MISMATCH','Worker result scope mismatch');const key=d.id+':'+job.id;await mutate(next=>{next.jobStates||={};if(next.jobStates[key]!==job.state){auditEntry(next,'JOB_STATUS',d,{jobId:job.id,state:job.state});next.jobStates[key]=job.state;}});}return result;}
  async function upstream(route,body,token){
    let response;try{response=await fetcher(origin.origin+route,{method:body===undefined?'GET':'POST',redirect:'error',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(195000)});}catch{fail(503,'GATEWAY_OFFLINE','Local worker gateway unavailable');}
    let data;try{data=await response.json();}catch{fail(503,'INVALID_GATEWAY_RESPONSE','Local gateway returned an invalid response');}
    if(!response.ok||data.ok!==true)fail(response.status,'UPSTREAM_REJECTED','Local worker rejected request; refresh without replaying approvals');return data;
  }
  function active(deviceId){const d=typeof deviceId==='string'&&/^[\da-f-]{36}$/.test(deviceId)&&Object.hasOwn(records.devices,deviceId)?records.devices[deviceId]:null;if(!d||d.revokedAt||!Number.isFinite(d.expiresAt)||d.expiresAt<=now())fail(401,'TRUST_EXPIRED','Device trust expired or revoked; re-pair on the laptop');return d;}
  function publicKey(value){try{if(typeof value!=='string'||value.length>1024||!/^[-\w+/=]+$/.test(value))throw 0;const key=crypto.createPublicKey({key:Buffer.from(value,'base64'),format:'der',type:'spki'});if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails.namedCurve!=='prime256v1')throw 0;return key;}catch{fail(400,'INVALID_IDENTITY','Android P-256 device identity required');}}
  function verify(key,message,signature){try{return typeof signature==='string'&&signature.length<=256&&crypto.verify('sha256',Buffer.from(message),key,Buffer.from(signature,'base64'));}catch{return false;}}
  async function scopedSession(d){const code=await upstream('/web-development/session/pair',{clientId:d.clientId,projectId:d.projectId});const exchange=await upstream('/web-development/session/exchange',{pairingCode:code.pairingCode,workerOnly:true});if(exchange.clientId!==d.clientId||exchange.projectId!==d.projectId||!exchange.scope?.includes('windows-worker'))fail(403,'SCOPE_MISMATCH','Gateway mapping changed; explicit re-pair required');return exchange;}
  function issue(d,exchange){active(d.id);if(typeof exchange.sessionToken!=='string'||!Number.isFinite(exchange.expiresAt)||exchange.expiresAt<=now())fail(503,'INVALID_UPSTREAM_SESSION','Local worker session unavailable');const token=crypto.randomBytes(32).toString('base64url'),expiresAt=Math.min(now()+sessionLifetime,exchange.expiresAt);sessions.set(token,{deviceId:d.id,upstreamToken:exchange.sessionToken,expiresAt});return {ok:true,gatewayId,deviceId:d.id,clientId:d.clientId,projectId:d.projectId,sessionToken:token,expiresAt,trustExpiresAt:d.expiresAt};}
  function authorize(token){const session=sessions.get(token);if(!session||session.expiresAt<=now())fail(401,'SESSION_EXPIRED','Session expired; reconnect to the trusted laptop');const d=active(session.deviceId);return {session,device:d};}
  function rate(peer){for(const [key,value]of attempts)if(value.until<=now())attempts.delete(key);if(!attempts.has(peer)&&attempts.size>=256)fail(429,'PAIRING_LIMIT','Pairing capacity reached; wait one minute');const current=attempts.get(peer);const slot=current||{count:0,until:now()+60000};if(++slot.count>5)fail(429,'PAIRING_LIMIT','Too many pairing attempts; wait one minute');attempts.set(peer,slot);}
  async function enroll(body,peer){
    rate(peer);if(body.gatewayId!==gatewayId||!validId(body.clientId)||!validId(body.projectId)||!/^\d{6}$/.test(body.pairingCode||''))fail(400,'INVALID_PAIRING','A fresh scoped laptop invitation is required');
    const key=publicKey(body.publicKey);if(!verify(key,enrollmentMessage(gatewayId,body.clientId,body.projectId,body.publicKey),body.signature))fail(401,'BAD_PROOF','Device identity proof rejected');
    // Existing single-use code flow remains the first-pair authority. Never infer approval from enrollment.
    const exchange=await upstream('/web-development/session/exchange',{pairingCode:body.pairingCode,workerOnly:true});
    if(exchange.clientId!==body.clientId||exchange.projectId!==body.projectId||!exchange.scope?.includes('windows-worker'))fail(403,'SCOPE_MISMATCH','Pairing invitation belongs to another client/project or gateway lacks worker-only session support');
    const d={id:uuid(),name:typeof body.name==='string'?body.name.replace(/[\r\n]/g,'').slice(0,60):'Android phone',publicKey:body.publicKey,clientId:exchange.clientId,projectId:exchange.projectId,orchestratorDrafts:exchange.scope.includes('orchestrator-drafts'),createdAt:now(),lastConnectedAt:now(),expiresAt:now()+90*86400000,revokedAt:null};
    await mutate(next=>{for(const prior of Object.values(next.devices))if(prior.publicKey===d.publicKey&&prior.clientId===d.clientId&&prior.projectId===d.projectId&&!prior.revokedAt)prior.revokedAt=now();if(Object.values(next.devices).filter(x=>!x.revokedAt&&x.expiresAt>now()).length>=20)fail(429,'TRUST_LIMIT','Trusted device limit reached; forget an old device first');next.devices[d.id]=d;auditEntry(next,'ENROLLED',d);});return {...issue(d,exchange),trustExpiresAt:d.expiresAt};
  }
  function challenge(body,peer){
    rate('challenge:'+peer);const d=active(body.deviceId);if(body.gatewayId!==gatewayId||body.clientId!==d.clientId||body.projectId!==d.projectId)fail(403,'SCOPE_MISMATCH','Wrong gateway/client/project');
    for(const [key,value]of challenges)if(value.expiresAt<=now())challenges.delete(key);if(challenges.size>=100)fail(429,'CHALLENGE_LIMIT','Reconnect capacity reached');
    const challengeId=uuid(),nonce=crypto.randomBytes(32).toString('base64url'),expiresAt=now()+30000;challenges.set(challengeId,{deviceId:d.id,nonce,expiresAt});return {ok:true,challengeId,nonce,expiresAt,gatewayId,deviceId:d.id};
  }
  async function reconnect(body){
    const c=challenges.get(body.challengeId);if(!c||c.expiresAt<=now())fail(401,'CHALLENGE_EXPIRED','Reconnect challenge expired; request a fresh challenge');challenges.delete(body.challengeId);
    const d=active(c.deviceId);if(body.deviceId!==d.id||body.gatewayId!==gatewayId||body.clientId!==d.clientId||body.projectId!==d.projectId||!verify(publicKey(d.publicKey),challengeMessage(gatewayId,d.id,c.nonce),body.signature))fail(401,'BAD_PROOF','Reconnect identity or scope rejected');
    const exchange=await scopedSession(d);await mutate(next=>{const current=next.devices[d.id];if(current.revokedAt)fail(401,'TRUST_REVOKED','Trust revoked');auditEntry(next,'RECONNECTED',current);current.lastConnectedAt=now();current.expiresAt=now()+90*86400000;});return issue(active(d.id),exchange);
  }
  const listing=()=>Object.values(records.devices).map(({publicKey,...d})=>({...d,gatewayId}));
  async function revoke(deviceId){active(deviceId);await mutate(next=>{next.devices[deviceId].revokedAt=now();auditEntry(next,'REVOKED',next.devices[deviceId]);});for(const [token,s]of sessions)if(s.deviceId===deviceId)sessions.delete(token);return {ok:true};}
  async function invitation(body){if(!validId(body.clientId)||!validId(body.projectId))fail(400,'INVALID_SCOPE','Select an approved client/project');return upstream('/web-development/session/pair',{clientId:body.clientId,projectId:body.projectId});}
  async function proxy(route,method,body,token,requestId){
    const {session,device:d}=authorize(token);
    if(route==='/trusted/status')return {ok:true,gatewayId,clientId:d.clientId,projectId:d.projectId,deviceId:d.id,lastConnectedAt:d.lastConnectedAt,expiresAt:session.expiresAt,draftAccess:d.orchestratorDrafts===true,health:await upstream('/health?dependencies=1')};
    if(route==='/trusted/audit'&&method==='GET')return {ok:true,events:(records.audit||[]).filter(e=>e.deviceId===d.id&&e.clientId===d.clientId&&e.projectId===d.projectId)};
    if(route==='/trusted/forget'&&method==='POST')return revoke(d.id);
    const requestMatch=route.match(/^\/trusted\/requests\/([\da-f-]{36})$/);
    if(requestMatch&&method==='GET'){const r=records.requests[d.id+':'+requestMatch[1]];if(!r)fail(404,'REQUEST_UNKNOWN','Submission not confirmed; do not submit a new task until reviewed');return {ok:true,request:{id:requestMatch[1],state:r.state,jobId:r.jobId||null}};}
    if(/^\/orchestrator\/runs(?:\/[a-f0-9-]{36}(?:\/(cancel|approve|execute))?)?$/.test(route)&&['GET','POST'].includes(method)){
      if(d.orchestratorDrafts!==true)fail(403,'SCOPE_REQUIRED','Owner must enable drafts and explicitly re-pair this device');
      const result=await upstream(route,method==='GET'?undefined:body,session.upstreamToken);
      if(result.clientId!==d.clientId||result.projectId!==d.projectId)fail(403,'SCOPE_MISMATCH','Wrong workspace result');
      await mutate(next=>auditEntry(next,'DRAFT_REQUEST',d,{method,runId:result.run?.id||null}));return result;
    }
    // Worker routes retain their existing authority. No generic URL proxy, customer file writes or Git approval replay.
    if(route==='/windows/jobs'&&method==='POST'){
      if(!/^[\da-f-]{36}$/.test(requestId||'')||!body||Object.keys(body).some(k=>k!=='commandId')||!['npm-typecheck','npm-test','npm-lint','npm-build'].includes(body.commandId))fail(400,'INVALID_SUBMISSION','An allowlisted command and stable request UUID are required');
      const key=d.id+':'+requestId;let reserved=false;
      await mutate(next=>{const current=next.devices[d.id];if(!current||current.revokedAt||current.expiresAt<=now())fail(401,'TRUST_REVOKED','Trust revoked or expired');const previous=next.requests[key];if(previous){if(previous.commandId!==body.commandId)fail(409,'IDEMPOTENCY_CONFLICT','Request ID belongs to a different exact action');return;}if(Object.keys(next.requests).length>=1000)fail(429,'REQUEST_LIMIT','Request history requires owner review');next.requests[key]={commandId:body.commandId,state:'RESERVED',createdAt:now()};auditEntry(next,'DISPATCH_RESERVED',d,{requestId,commandId:body.commandId});reserved=true;});
      if(!reserved){const previous=records.requests[key];if(previous.state!=='DONE')fail(409,'OUTCOME_UNKNOWN','Previous submission outcome uncertain; inspect history, never execute it twice');return upstream('/windows/jobs/'+previous.jobId,undefined,session.upstreamToken);}
      const result=await upstream('/windows/jobs',body,session.upstreamToken);
      await mutate(next=>{next.requests[key].state='DONE';next.requests[key].jobId=result.job.id;auditEntry(next,'DISPATCH_CONFIRMED',d,{requestId,jobId:result.job.id});});return result;
    }
    if(method==='GET'&&(route==='/windows/jobs'||/^\/windows\/jobs\/[\da-f-]{36}$/.test(route)))return observe(d,await upstream(route,undefined,session.upstreamToken));
    if(method==='POST'&&/^\/windows\/jobs\/[\da-f-]{36}\/cancel$/.test(route)){await mutate(next=>auditEntry(next,'CANCEL_REQUESTED',d,{jobId:route.split('/')[3]}));return observe(d,await upstream(route,{},session.upstreamToken));}
    fail(404,'ROUTE_UNAVAILABLE','This trusted-device transport exposes only scoped task monitoring/execution');
  }
  return {enroll,challenge,reconnect,authorize,proxy,listing,revoke,invitation};
}
module.exports={createDeviceTrust,enrollmentMessage,challengeMessage};

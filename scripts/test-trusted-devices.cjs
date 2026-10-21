'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createDeviceTrust,enrollmentMessage,challengeMessage}=require('../windows/device-trust.cjs');
test('scoped durable audit: enrollment, dispatch, completion observation, cancellation and revoke',async()=>{const f=fixture(),a=await f.make(),d=await f.enroll(a);const job=await a.proxy('/windows/jobs','POST',{commandId:'npm-test'},d.sessionToken,crypto.randomUUID());await a.proxy('/windows/jobs/'+job.job.id,'GET',undefined,d.sessionToken);await a.proxy('/windows/jobs/'+job.job.id+'/cancel','POST',{},d.sessionToken);const audit=await a.proxy('/trusted/audit','GET',undefined,d.sessionToken);for(const e of ['ENROLLED','DISPATCH_RESERVED','DISPATCH_CONFIRMED','JOB_STATUS','CANCEL_REQUESTED'])assert.ok(audit.events.some(x=>x.event===e),e);assert.ok(audit.events.every(e=>e.deviceId===d.deviceId&&e.clientId==='client-a'&&e.projectId==='project-a'));assert.ok(!JSON.stringify(f.saved).includes(d.sessionToken));await a.revoke(d.deviceId);assert.ok(f.saved.audit.some(e=>e.event==='REVOKED'));await assert.rejects(a.proxy('/trusted/audit','GET',undefined,d.sessionToken),e=>e.status===401);});
function fixture(){
 let saved=null,clock=Date.now(),executions=0,lose=false;const codes=new Map(),jobs=new Map();
 const store={read:async()=>structuredClone(saved),write:async value=>{saved=structuredClone(value);}};
 const fetcher=async(url,opts)=>{const route=new URL(url).pathname,b=opts.body?JSON.parse(opts.body):{};let data,status=200;
  if(route.endsWith('/pair')){const code=String(100000+codes.size);codes.set(code,b);data={ok:true,pairingCode:code,...b,expiresAt:clock+60000};}
  else if(route.endsWith('/exchange')){const scope=codes.get(b.pairingCode);codes.delete(b.pairingCode);if(!scope){status=401;data={ok:false};}else {assert.equal(b.workerOnly,true);data={ok:true,...scope,scope:['windows-worker'],sessionToken:crypto.randomUUID(),expiresAt:clock+3600000};}}
  else if(route==='/windows/jobs'&&opts.method==='POST'){executions++;const job={id:crypto.randomUUID(),clientId:'client-a',projectId:'project-a',state:'PASSED',logs:[]};jobs.set(job.id,job);if(lose){lose=false;throw Error('lost response');}data={ok:true,job};}
  else if(route==='/windows/jobs')data={ok:true,jobs:[...jobs.values()]};
  else if(route.startsWith('/windows/jobs/'))data={ok:true,job:jobs.get(route.split('/')[3])};
  else data={ok:true,backend:'OFFLINE'};
  return {ok:status<400,status,json:async()=>data};
 };
 const gatewayId=crypto.randomUUID(),keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),publicKey=keys.publicKey.export({format:'der',type:'spki'}).toString('base64');
 const sign=s=>crypto.sign('sha256',Buffer.from(s),keys.privateKey).toString('base64');
 const make=()=>createDeviceTrust({gatewayId,store,fetcher,now:()=>clock});
 async function enroll(authority){const scope={clientId:'client-a',projectId:'project-a'},inv=await authority.invitation(scope);return authority.enroll({...scope,gatewayId,publicKey,pairingCode:inv.pairingCode,signature:sign(enrollmentMessage(gatewayId,scope.clientId,scope.projectId,publicKey))},'phone');}
 async function reconnect(authority,device){const scope={gatewayId,deviceId:device.deviceId,clientId:'client-a',projectId:'project-a'},c=authority.challenge(scope,crypto.randomUUID()),proof={...scope,challengeId:c.challengeId,signature:sign(challengeMessage(gatewayId,device.deviceId,c.nonce))};return {session:await authority.reconnect(proof),proof};}
 return {make,enroll,reconnect,sign,gatewayId,publicKey,store,get saved(){return saved;},get executions(){return executions;},advance:ms=>clock+=ms,loseNext:()=>lose=true};
}
test('trust: first pairing, restart proof, renewal, scope rejection, revocation and no secret persistence',async()=>{
 const f=fixture();let a=await f.make();const first=await f.enroll(a);assert.ok(first.sessionToken);assert.equal(a.listing()[0].publicKey,undefined);
 assert.ok(!JSON.stringify(f.saved).includes(first.sessionToken));assert.ok(!JSON.stringify(f.saved).includes('pairingCode'));
 assert.throws(()=>a.challenge({gatewayId:f.gatewayId,deviceId:first.deviceId,clientId:'wrong',projectId:'project-a'},'wrong'),e=>e.status===403);
 assert.throws(()=>a.challenge({gatewayId:f.gatewayId,deviceId:first.deviceId,clientId:'client-a',projectId:'wrong'},'wrong2'),e=>e.status===403);
 await assert.rejects(a.proxy('/web-development/workflows','POST',{},first.sessionToken),e=>e.status===404);
 await assert.rejects(a.proxy('/git/push','POST',{},first.sessionToken),e=>e.status===404);
 a=await f.make();assert.throws(()=>a.authorize(first.sessionToken),e=>e.status===401);
 const renewed=await f.reconnect(a,first);assert.equal(renewed.session.deviceId,first.deviceId);
 await assert.rejects(a.reconnect(renewed.proof),e=>e.code==='CHALLENGE_EXPIRED');
 f.advance(6*60000);assert.throws(()=>a.authorize(renewed.session.sessionToken),e=>e.code==='SESSION_EXPIRED');const refresh=await f.reconnect(a,first);assert.ok(refresh.session.sessionToken);
 const scope={gatewayId:f.gatewayId,deviceId:first.deviceId,clientId:'client-a',projectId:'project-a'};
 const c=a.challenge(scope,'invalid');await assert.rejects(a.reconnect({...scope,challengeId:c.challengeId,signature:'bad'}),e=>e.code==='BAD_PROOF');
 const expired=a.challenge(scope,'expired');f.advance(31000);await assert.rejects(a.reconnect({...scope,challengeId:expired.challengeId,signature:f.sign(challengeMessage(f.gatewayId,first.deviceId,expired.nonce))}),e=>e.code==='CHALLENGE_EXPIRED');
 await a.revoke(first.deviceId);assert.throws(()=>a.authorize(renewed.session.sessionToken),e=>e.status===401);
 a=await f.make();assert.throws(()=>a.challenge(scope,'revoked'),e=>e.code==='TRUST_EXPIRED');
});
test('durable exact-action idempotency, restart history and uncertain outcome never replayed',async()=>{
 const f=fixture();let a=await f.make(),s=await f.enroll(a);const id=crypto.randomUUID(),body={commandId:'npm-typecheck'};
 const results=await Promise.allSettled([a.proxy('/windows/jobs','POST',body,s.sessionToken,id),a.proxy('/windows/jobs','POST',body,s.sessionToken,id)]);
 assert.equal(f.executions,1);assert.ok(results.some(r=>r.status==='fulfilled'));
 await assert.rejects(a.proxy('/windows/jobs','POST',{commandId:'npm-test'},s.sessionToken,id),e=>e.code==='IDEMPOTENCY_CONFLICT');
 a=await f.make();s=(await f.reconnect(a,s)).session;await a.proxy('/windows/jobs','POST',body,s.sessionToken,id);assert.equal(f.executions,1);
 f.loseNext();const lost=crypto.randomUUID();await assert.rejects(a.proxy('/windows/jobs','POST',body,s.sessionToken,lost));assert.equal(f.executions,2);
 a=await f.make();s=(await f.reconnect(a,s)).session;await assert.rejects(a.proxy('/windows/jobs','POST',body,s.sessionToken,lost),e=>e.code==='OUTCOME_UNKNOWN');assert.equal(f.executions,2);
});
test('expired trust and invalid enrollment proof fail closed',async()=>{
 const f=fixture(),a=await f.make(),s=await f.enroll(a);f.advance(91*86400000);
 assert.throws(()=>a.challenge({gatewayId:f.gatewayId,deviceId:s.deviceId,clientId:'client-a',projectId:'project-a'},'expired'),e=>e.code==='TRUST_EXPIRED');
 await assert.rejects(a.enroll({gatewayId:f.gatewayId,clientId:'client-a',projectId:'project-a',pairingCode:'123456',publicKey:f.publicKey,signature:'bad'},'bad'),e=>e.code==='BAD_PROOF');
});

test('existing worker trust never gains orchestrator authority implicitly',async()=>{const f=fixture(),a=await f.make(),s=await f.enroll(a);await assert.rejects(a.proxy('/orchestrator/runs','GET',undefined,s.sessionToken),e=>e.code==='SCOPE_REQUIRED');assert.equal(f.saved.devices[s.deviceId].orchestratorDrafts,false);});

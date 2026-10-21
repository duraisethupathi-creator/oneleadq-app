'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
function fixture(){
 const exports={},source=fs.readFileSync(require.resolve('../src/services/trustedWindowsCore.ts'),'utf8');vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,setTimeout,clearTimeout,Date,Set,Map});
 const gatewayId=crypto.randomUUID(),deviceId=crypto.randomUUID(),fingerprint='a'.repeat(64);let records=null,online=true,revoked=false,endpoint='https://192.168.1.2:3043',selected='client-a',posts=0,lose=false,calls=0;const jobs=[];let wrongDraft=false;const draftId=crypto.randomUUID();
 const native={identity:async()=> 'public-fixture',sign:async()=> 'signature-fixture',randomId:async()=>crypto.randomUUID(),readRecords:async()=>records,writeRecords:async r=>{records=r;},deleteIdentity:async()=>{},discover:async()=>({endpoints:[endpoint],available:true}),request:async(address,pin,route,method,raw,token,id)=>{
  calls++;if(!online||address!==endpoint)throw Error('network unavailable');if(pin!==fingerprint)throw Error('TLS_PIN_MISMATCH');let data={ok:true},status=200;const body=raw?JSON.parse(raw):{};
  if(revoked){data={ok:false,code:'TRUST_EXPIRED'};status=401;}
  else if(route==='/trusted/enroll'||route==='/trusted/reconnect')data={ok:true,gatewayId,deviceId,clientId:'client-a',projectId:'project-a',sessionToken:'memory-only-session',expiresAt:Date.now()+300000,trustExpiresAt:Date.now()+90*86400000};
  else if(route==='/trusted/challenge')data={ok:true,gatewayId,deviceId,challengeId:crypto.randomUUID(),nonce:crypto.randomBytes(32).toString('base64url')};
  else if(route==='/windows/jobs'&&method==='POST'){posts++;const job={id:crypto.randomUUID(),clientId:'client-a',projectId:'project-a',state:'PASSED',logs:[]};jobs.push(job);if(lose){lose=false;throw Error('lost response');}data={ok:true,job};}
  else if(route==='/windows/jobs')data={ok:true,jobs};
  else if(route.startsWith('/trusted/requests/'))data={ok:true,request:{state:'DONE',jobId:jobs.at(-1)?.id}};
  else if(route==='/trusted/status')data={ok:true,health:{ok:true,backend:'UNAVAILABLE'}};
  else if(route.startsWith('/orchestrator/runs'))data={ok:true,clientId:wrongDraft?'wrong-client':'client-a',projectId:'project-a',runs:[],run:{id:draftId,clientId:'client-a',projectId:'project-a'}};
  else if(route==='/trusted/forget')revoked=true;
  return {status,body:JSON.stringify(data)};
 }};
 return {make:()=>exports.createTrustedWorker(native,async()=>selected),missing:()=>exports.createTrustedWorker(null,async()=>selected),invite:()=>JSON.stringify({version:1,gatewayId,clientId:'client-a',projectId:'project-a',endpoint,fingerprint,pairingCode:'123456',expiresAt:Date.now()+60000}),wrongDraft:()=>wrongDraft=true,get records(){return records;},get posts(){return posts;},get calls(){return calls;},offline:()=>online=false,online:()=>online=true,move:()=>endpoint='https://192.168.2.3:3043',select:v=>selected=v,revoke:()=>revoked=true,lose:()=>lose=true};
}
const settle=()=>new Promise(r=>setTimeout(r,15));
test('mobile controller fixture: first pairing, restart, IP discovery, Wi-Fi recovery, pause and forget',async()=>{
 const f=fixture();let c=f.make();c.setForeground(true);await settle();await c.pair(f.invite());assert.equal(c.getState().status,'Connected');assert.ok(!f.records.includes('123456'));assert.ok(!f.records.includes('memory-only-session'));
 c.setForeground(false);f.move();c=f.make();c.setForeground(true);await settle();await c.initialize();assert.equal(c.getState().status,'Connected');assert.equal(c.getState().devices[0].endpoint,'https://192.168.2.3:3043');
 f.offline();await c.reconnect();assert.equal(c.getState().status,'Offline');f.online();await c.reconnect();assert.equal(c.getState().status,'Connected');assert.equal(f.posts,0);
 c.setForeground(false);const before=f.calls;await settle();assert.equal(f.calls,before);c.setForeground(true);await settle();await c.reconnect();
 const id=c.getState().devices[0].deviceId;await c.disconnect(id);assert.equal(c.getState().devices[0].autoConnect,false);await c.reconnect(id);await c.forget(id);assert.equal(c.getState().devices.length,0);c.setForeground(false);
});
test('mobile controller fixture: lost response restart restores status without duplicate execution; wrong client and revoked fail closed',async()=>{
 const f=fixture();let c=f.make();c.setForeground(true);await settle();await c.pair(f.invite());f.lose();await assert.rejects(c.startJob('npm-typecheck'));assert.equal(f.posts,1);assert.ok(c.getState().devices[0].pending);
 c.setForeground(false);c=f.make();c.setForeground(true);await settle();await c.initialize();assert.equal(c.getState().status,'Connected');assert.equal(f.posts,1);assert.equal(c.getState().devices[0].pending,undefined);
 f.select('wrong');await assert.rejects(c.startJob('npm-typecheck'));assert.equal(f.posts,1);f.select('client-a');c.setForeground(false);f.revoke();c.setForeground(true);await settle();await c.reconnect();assert.equal(c.getState().status,'Authentication Expired');c.setForeground(false);
});
test('missing native module fails closed without blocking initialization',async()=>{const f=fixture(),c=f.missing();c.setForeground(true);await c.initialize();await settle();assert.equal(c.getState().status,'Offline');assert.match(c.getState().message,/approved Android build/);c.setForeground(false);});
test('mobile concurrent submit is exactly one explicit request',async()=>{const f=fixture(),c=f.make();c.setForeground(true);await settle();await c.pair(f.invite());const results=await Promise.allSettled([c.startJob('npm-typecheck'),c.startJob('npm-typecheck')]);assert.equal(f.posts,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);c.setForeground(false);});

test('draft transport uses paired pinned native scope, validates routes and rejects wrong-client replies',async()=>{
 const f=fixture(),c=f.make();c.setForeground(true);await settle();await c.pair(f.invite());
 const data=await c.drafts('/orchestrator/runs','GET',undefined,'client-a');assert.equal(data.clientId,'client-a');
 await assert.rejects(c.drafts('/orchestrator/runs','POST',{},'wrong-client'),/Selected client changed/);
 await assert.rejects(c.drafts('/ai','POST',{},'client-a'),/Unsupported draft/);
 f.wrongDraft();await assert.rejects(c.drafts('/orchestrator/runs','GET',undefined,'client-a'),/Wrong-client/);
 c.setForeground(false);
});

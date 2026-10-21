'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createOrchestrator,SERVICES}=require('../backend/orchestrator.cjs');
const {createGateway}=require('../windows/gateway.cjs');
const {createGeminiPlanner}=require('../backend/gemini.cjs');
const scope={clientId:'qa-a',projectId:'qa-project',workspaceId:'qa-workspace'};
const other={clientId:'qa-b',projectId:'qa-project',workspaceId:'qa-workspace'};
const input=serviceId=>({requestId:crypto.randomUUID(),serviceId,command:'Create a disposable QA draft',...(serviceId==='seo'?{siteHtml:'<html><title>QA</title><h1>QA</h1></html>'}:{})});
test('mobile history stays below the native byte bound without deleting archived runs or crossing clients',async t=>{
 const {engine,dir}=fixture(t);const sample=await terminal(engine,engine.start(scope,input('content')).id);await engine.shutdown();
 // Worst-case valid plan strings: JSON escapes control characters to six bytes each.
 for(let i=0;i<100;i++){const id=crypto.randomUUID();const record={...sample,id,requestId:crypto.randomUUID(),createdAt:i+1,plan:{summary:'x'+'\u0000'.repeat(1999),items:Array.from({length:20},()=> 'x'+'\u0000'.repeat(1999))}};fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify(record));}
 const restored=createOrchestrator({directory:dir,mode:'FIXTURE_TESTED',generate:async()=>assert.fail('History reading must not invoke Gemini')});
 const history=restored.list(scope),serialized=JSON.stringify({ok:true,clientId:scope.clientId,projectId:scope.projectId,runs:history});
 assert.ok(Buffer.byteLength(serialized,'utf8')<1048576);assert.ok(history.length>0&&history.length<100);assert.equal(history.at(-1).id,sample.id);assert.equal(fs.readdirSync(dir).filter(f=>f.endsWith('.json')).length,101);assert.deepEqual(restored.list(other),[]);
 assert.equal(restored.get(scope,sample.id).id,sample.id);await restored.shutdown();
});
test('new draft screen retains valid UTF-8 labels',()=>{
 const screen=fs.readFileSync(path.join(__dirname,'../app/specialist-drafts.tsx'),'utf8');assert.ok(screen.includes('owner\u2019s'));assert.ok(!screen.includes('\u00e2\u20ac\u2122'));assert.ok(!screen.includes('\u00c2\u00b7'));
});
async function terminal(engine,id){for(let i=0;i<150;i++){const run=engine.get(scope,id);if(!['RUNNING','QUEUED'].includes(run.state))return run;await new Promise(r=>setTimeout(r,5));}throw Error('Draft did not finish');}
function fixture(t,options={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oneleadq-v5-drafts-'));const engine=createOrchestrator({directory:dir,generate:async()=>({summary:'Fixture plan',items:['Review proposed output','Approve draft only']}),mode:'FIXTURE_TESTED',...options});t.after(async()=>{await engine.shutdown();fs.rmSync(dir,{recursive:true,force:true});});return {dir,engine};}
for(const serviceId of SERVICES)test(serviceId+': real fixture output, scoped durable history and exact approval',async t=>{
  const {dir,engine}=fixture(t);const raw=input(serviceId),started=engine.start(scope,raw);assert.equal(engine.start(scope,raw).id,started.id);
  const done=await terminal(engine,started.id);assert.equal(done.state,'AWAITING_REVIEW');assert.equal(done.mode,'FIXTURE_TESTED');assert.equal(done.productionVerified,false);assert.equal(done.verification.passed,true);
  for(const a of done.artifacts){const bytes=fs.readFileSync(path.join(dir,done.id+'-draft',a.name));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),a.sha256);assert.equal(bytes.length,a.bytes);}
  assert.throws(()=>engine.get(other,done.id),/unavailable/);assert.deepEqual(engine.list(other),[]);assert.throws(()=>engine.approve(other,done.id,done.previewHash),/unavailable/);assert.throws(()=>engine.approve(scope,done.id,'stale'),/exact current/);
  assert.equal(engine.approve(scope,done.id,done.previewHash).state,'APPROVED_DRAFT');assert.throws(()=>engine.external(),/unavailable/);
  const restored=createOrchestrator({directory:dir,generate:async()=>{throw Error('No restart replay');},mode:'FIXTURE_TESTED'});assert.equal(restored.get(scope,done.id).state,'APPROVED_DRAFT');assert.equal(restored.start(scope,raw).id,done.id);await restored.shutdown();
});
test('schema/path injection, request conflicts and modified artifact fail closed',async t=>{
 const {engine,dir}=fixture(t);assert.throws(()=>engine.start(scope,{...input('content'),workspace:'../../real'}),/Invalid/);assert.throws(()=>engine.start(scope,input('../content')),/Invalid/);
 const raw=input('content'),run=engine.start(scope,raw);assert.throws(()=>engine.start(scope,{...raw,command:'different'}),/conflict/);const done=await terminal(engine,run.id);fs.appendFileSync(path.join(dir,done.id+'-draft',done.artifacts[0].name),'changed');assert.throws(()=>engine.approve(scope,done.id,done.previewHash),/changed/);
});
test('provider failure, actual abort cancellation and bounded timeout/retry',async t=>{
 const {engine}=fixture(t,{generate:async({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('stopped')),{once:true}))});const run=engine.start(scope,input('content'));assert.equal(engine.cancel(scope,run.id).state,'CANCELLED');assert.equal((await terminal(engine,run.id)).state,'CANCELLED');
 let attempts=0;const timed=fixture(t,{timeoutMs:10,maxAttempts:2,generate:async()=>{attempts++;return new Promise(()=>{});}});const timedRun=timed.engine.start(scope,input('content'));assert.equal((await terminal(timed.engine,timedRun.id)).state,'FAILED');assert.equal(attempts,2);
 const malformed=fixture(t,{generate:async()=>({summary:'bad',items:[],command:'run shell'})});assert.equal((await terminal(malformed.engine,malformed.engine.start(scope,input('content')).id)).state,'FAILED');
});
test('Gemini adapter stays backend-only, structured, same provider/model and abortable',async()=>{
 let observed;class FakeGemini{constructor({apiKey}){assert.equal(apiKey,'fixture-not-a-real-key');this.models={generateContent:async request=>{observed=request;return {text:JSON.stringify({summary:'Fixture',items:['Review']})};}};}}
 const generate=createGeminiPlanner({apiKey:'fixture-not-a-real-key',GoogleGenAI:FakeGemini});const controller=new AbortController();assert.deepEqual(await generate({serviceId:'content',command:'fixture',signal:controller.signal}),{summary:'Fixture',items:['Review']});assert.equal(observed.model,'gemini-3.5-flash-lite');assert.equal(observed.config.abortSignal,controller.signal);assert.equal(observed.config.responseMimeType,'application/json');
});
test('interrupted restart never replays provider work and malformed history is preserved',async t=>{
 const {engine,dir}=fixture(t,{generate:async({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))});
 const raw=input('content'),r=engine.start(scope,raw);let invoked=0;
 const restored=createOrchestrator({directory:dir,mode:'FIXTURE_TESTED',generate:async()=>{invoked++;return {summary:'No replay',items:['Review']};}});
 assert.equal(restored.get(scope,r.id).state,'INTERRUPTED');assert.equal(restored.start(scope,raw).id,r.id);assert.equal(invoked,0);await restored.shutdown();await engine.shutdown();
 const file=path.join(dir,crypto.randomUUID()+'.json'),bytes=Buffer.from('{malformed');fs.writeFileSync(file,bytes);
 assert.throws(()=>createOrchestrator({directory:dir,generate:async()=>{},mode:'FIXTURE_TESTED'}));assert.deepEqual(fs.readFileSync(file),bytes);
});
test('provider output is escaped, concurrency is bounded, SEO and forged workspace are rejected before inference',async t=>{
 let calls=0;const f=fixture(t,{generate:async()=>{calls++;return {summary:'<script>alert(1)</script>',items:['<img onerror="bad">']};}});
 assert.throws(()=>f.engine.start(scope,{...input('seo'),siteHtml:undefined}),/provided HTML/);assert.throws(()=>f.engine.start(scope,{...input('content'),clientId:'qa-b'}),/Invalid/);assert.equal(calls,0);
 const done=await terminal(f.engine,f.engine.start(scope,input('webDevelopment')).id);const html=fs.readFileSync(path.join(f.dir,done.id+'-draft','index.html'),'utf8');assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 const blocked=fixture(t,{generate:async({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))});blocked.engine.start(scope,input('content'));blocked.engine.start(scope,input('content'));assert.throws(()=>blocked.engine.start(scope,input('content')),/capacity/);
});
test('Gemini grounded facts do not call provider; transient failures are retryable without leaking errors',async()=>{
 let calls=0;class Fake{constructor(){this.models={generateContent:async()=>{calls++;throw Object.assign(Error('private backend detail'),{status:503});}};}}
 const generate=createGeminiPlanner({apiKey:'fixture-not-a-real-key',GoogleGenAI:Fake});
 const result=await generate({serviceId:'conversation',command:JSON.stringify({message:'What services does Fixture Company provide?',clientContext:{id:'qa',name:'Fixture Company',productsServices:['Verified fixture service']},history:[]})});assert.match(result.summary,/Verified fixture service/);assert.equal(calls,0);
 await assert.rejects(generate({serviceId:'content',command:'fixture'}),e=>e.retryable===true&&!e.message.includes('private'));
});
test('actual loopback HTTP scoped authentication, owner opt-in, eight workflow dispatches and approval denial',async t=>{
 const {engine,dir}=fixture(t);const server=createGateway({mappings:[{...scope,path:dir,enabled:true,orchestratorEnabled:true},{...other,path:dir,enabled:true}],orchestrator:engine});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.shutdown());const base='http://127.0.0.1:'+server.address().port;
 async function call(route,body,token){const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
 assert.equal((await call('/orchestrator/runs')).status,401);
 async function pair(s){const code=await call('/web-development/session/pair',{clientId:s.clientId,projectId:s.projectId});return (await call('/web-development/session/exchange',{pairingCode:code.data.pairingCode,workerOnly:true})).data;}
 const a=await pair(scope),b=await pair(other);assert.ok(a.scope.includes('orchestrator-drafts'));assert.ok(!b.scope.includes('orchestrator-drafts'));assert.equal((await call('/orchestrator/runs',undefined,b.sessionToken)).status,403);
 for(const serviceId of SERVICES){const created=await call('/orchestrator/runs',input(serviceId),a.sessionToken);assert.equal(created.status,200);const done=await terminal(engine,created.data.run.id);assert.equal(done.state,'AWAITING_REVIEW');const checked=await call('/orchestrator/runs/'+done.id,undefined,a.sessionToken);assert.equal(checked.data.run.previewHash,done.previewHash);assert.equal((await call('/orchestrator/runs/'+done.id+'/execute',{},a.sessionToken)).status,403);}
 assert.equal((await call('/orchestrator/runs',undefined,a.sessionToken)).data.runs.length,8);
});

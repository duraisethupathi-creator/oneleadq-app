'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');

test('Windows tree-kill denial keeps the worker tracked and reports failure; retry can cancel',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'oneleadq-cancel-'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({scripts:{test:'node fixture.cjs'}}));
  const child=new EventEmitter();Object.assign(child,{pid:12345,exitCode:null,stdout:new PassThrough(),stderr:new PassThrough()});
  let deny=true,parentKills=0,treeCalls=0;
  child.kill=()=>{parentKills++;child.exitCode=1;child.emit('exit',1);return true;};
  const fake={spawn:()=>child,execFile:(file,args,options,callback)=>{
    treeCalls++;assert.match(file,/taskkill\.exe$/);assert.deepEqual(Array.from(args),['/PID','12345','/T','/F']);
    if(deny)return callback(Object.assign(new Error('Access denied'),{code:1}));
    callback(null,'','');setImmediate(()=>{child.exitCode=1;child.emit('close',1);});
  }};
  const loaded={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../windows/gateway.cjs'),'utf8'),{
    require:name=>name==='node:child_process'?fake:require(name),module:loaded,
    process:{platform:'win32',env:{},execPath:process.execPath},URL,Buffer,setTimeout,clearTimeout,
  });
  const config={mappings:[{clientId:'fixture',projectId:'fixture',workspaceId:'fixture',path:root,enabled:true}],historyDirectory:path.join(root,'history'),npmCli:process.execPath};
  const gateway=loaded.exports.createGateway(config);await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
  t.after(async()=>{
    child.emit('close',1);await gateway.shutdown();
    assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(root).startsWith('oneleadq-cancel-'));
    fs.rmSync(root,{recursive:true,force:true});
  });
  const base='http://127.0.0.1:'+gateway.address().port;
  async function request(route,body,token){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(3000)});return {status:r.status,data:await r.json()};}
  const invite=await request('/web-development/session/pair',{clientId:'fixture',projectId:'fixture'});
  const session=await request('/web-development/session/exchange',{pairingCode:invite.data.pairingCode,workerOnly:true});const token=session.data.sessionToken;
  const start=await request('/windows/jobs',{commandId:'npm-test'},token);assert.equal(start.status,202);const id=start.data.job.id;
  const failed=await request('/windows/jobs/'+id+'/cancel',{},token);
  assert.equal(failed.status,503);assert.match(failed.data.error,/cancellation failed/i);
  assert.equal(parentKills,0,'Never orphan descendants by killing only the npm parent');
  assert.equal((await request('/windows/jobs/'+id,undefined,token)).data.job.state,'RUNNING');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'history',id+'.json'),'utf8')).state,'RUNNING');
  deny=false;const retried=await request('/windows/jobs/'+id+'/cancel',{},token);assert.equal(retried.status,200);
  await new Promise(setImmediate);
  assert.equal((await request('/windows/jobs/'+id,undefined,token)).data.job.state,'CANCELLED');
  assert.equal(treeCalls,2);assert.equal(parentKills,0);
});

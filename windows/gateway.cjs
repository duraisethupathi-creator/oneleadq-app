'use strict';
// Batch3 development gateway. Native Android uses adb reverse; never bind publicly.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { promisify } = require('node:util');
const execFile = promisify(cp.execFile);
const COMMANDS = Object.freeze({ 'npm-typecheck': 'typecheck', 'npm-test': 'test', 'npm-lint': 'lint', 'npm-build': 'build' });
const ACTIONS = new Set(['analyze','plan','propose-files','approve-files','reject-files','validate','git','propose-commit','approve-commit','propose-push','approve-push','design-brief','generate-designs','select-design','refine-design','approve-design','render-design-preview','runtime-check','architecture','rollback-created']);
const id = () => crypto.randomUUID();
const reject = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const redact = value => String(value).replace(/(?:AIza[\w-]{20,}|gh[pousr]_[\w]{20,}|github_pat_[\w_]{20,}|sk-[\w-]{16,}|Bearer\s+\S+)/gi,'[REDACTED]').replace(/((?:password|secret|token|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]');
function createGateway({ mappings, backend = 'http://127.0.0.1:3001', historyDirectory, npmCli = path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'), ttl = 30*60*1000 }) {
  const base = new URL(backend);
  if (base.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Backend must be loopback HTTP');
  const codes = new Map(), sessions = new Map(), attempts = new Map(), jobs = new Map();
  const approved = mappings.filter(m => m.enabled === true).map(m => {
    if (![m.clientId,m.projectId,m.workspaceId].every(v => typeof v === 'string' && /^[\w-]{1,100}$/.test(v))) throw new Error('Invalid explicit workspace mapping');
    const directory = fs.realpathSync(m.path);
    if (!fs.statSync(directory).isDirectory()) throw new Error('Workspace missing');
    return { ...m, path: directory };
  });
  if (new Set(approved.map(m=>m.clientId+'\0'+m.projectId)).size !== approved.length) throw new Error('Ambiguous client/project mapping');
  function prune() { const now = Date.now(); for(const map of [codes,sessions]) for(const [key,value] of map) if(value.expiresAt<=now) map.delete(key); for(const [key,value] of attempts) if(value.expiresAt<=now) attempts.delete(key); }
  async function upstream(suffix, body, token) {
    const response = await fetch(base.origin+suffix,{ method: body === undefined?'GET':'POST',redirect:'error',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(195000) });
    const data = await response.json();
    if (!response.ok || data.ok === false) reject(response.status,'Backend rejected operation; inspect state locally');
    return data;
  }
  const visible = job => ({id:job.id,clientId:job.clientId,projectId:job.projectId,commandId:job.commandId,state:job.state,exitCode:job.exitCode,createdAt:job.createdAt,finishedAt:job.finishedAt,logs:job.logs});
  function persist(job) {
    if (!historyDirectory) return;
    try { fs.mkdirSync(historyDirectory,{recursive:true}); const file=path.join(historyDirectory,job.id+'.json'); fs.writeFileSync(file+'.tmp',JSON.stringify(visible(job)));fs.renameSync(file+'.tmp',file); }
    catch { job.historyError='Local history persistence failed'; }
  }
  if(historyDirectory && fs.existsSync(historyDirectory)) {
    for(const file of fs.readdirSync(historyDirectory).filter(f=>/^[\da-f-]{36}\.json$/.test(f)).slice(-100)) {
      try { const j=JSON.parse(fs.readFileSync(path.join(historyDirectory,file),'utf8'));if(!approved.some(m=>m.clientId===j.clientId&&m.projectId===j.projectId)||!Object.hasOwn(COMMANDS,j.commandId))continue;if(['RUNNING','CANCELLING'].includes(j.state)){j.state='INTERRUPTED';j.finishedAt=new Date().toISOString();}j.logs=Array.isArray(j.logs)?j.logs.slice(-100):[]; jobs.set(j.id,j); } catch {}
    }
  }
  const scopedJob = (key, session) => { const j=jobs.get(key);if(!j || j.clientId!==session.mapping.clientId || j.projectId!==session.mapping.projectId)reject(404,'Task unavailable for this client/project');return j; };
  const append = (job,value) => { job.logs.push({sequence:++job.sequence,at:new Date().toISOString(),text:redact(value).slice(0,4096)}); if(job.logs.length>100)job.logs.shift(); };
  async function stop(job) {
    if(!job.child || !['RUNNING','CANCELLING'].includes(job.state))return;
    job.state='CANCELLING';persist(job);
    if(process.platform==='win32') {
      try { await execFile(path.join(process.env.WINDIR || 'C:/Windows','System32/taskkill.exe'),['/PID',String(job.child.pid),'/T','/F'],{windowsHide:true,timeout:10000}); }
      catch {
        // Killing only npm can orphan descendants that keep stdout/stderr open forever.
        // Keep the worker tracked and retryable when Windows denies tree termination.
        if(job.child) {
          job.state='RUNNING';
          append(job,'Process-tree cancellation failed; worker remains active. Retry or inspect locally.');
          persist(job);
          reject(503,'Process-tree cancellation failed; worker remains active');
        }
      }
    } else job.child.kill('SIGTERM');
  }
  function startJob(mapping, commandId) {
    if(typeof commandId !== 'string' || !Object.hasOwn(COMMANDS,commandId))reject(400,'Command ID not allowlisted');
    if(jobs.size>=100){const oldest=[...jobs.values()].find(j=>!['RUNNING','CANCELLING'].includes(j.state));if(oldest)jobs.delete(oldest.id);else reject(429,'History capacity reached');}
    if([...jobs.values()].filter(j=>['RUNNING','CANCELLING'].includes(j.state)).length>=2)reject(429,'Worker capacity reached');
    if(fs.realpathSync(mapping.path)!==mapping.path)reject(409,'Workspace identity changed');
    const manifestPath=path.join(mapping.path,'package.json');
    const manifestReal=fs.realpathSync(manifestPath);
    if(path.dirname(manifestReal)!==mapping.path)reject(403,'Package manifest escapes approved workspace');
    const manifest=JSON.parse(fs.readFileSync(manifestReal,'utf8'));
    if(typeof manifest.scripts?.[COMMANDS[commandId]]!=='string')reject(400,'Approved script is unavailable');
    if(!fs.existsSync(npmCli))reject(503,'Trusted npm CLI unavailable');
    // Commands are constants; no caller-supplied executable, arguments or shell text.
    const job={id:id(),clientId:mapping.clientId,projectId:mapping.projectId,commandId,state:'RUNNING',createdAt:new Date().toISOString(),logs:[],sequence:0,exitCode:null};jobs.set(job.id,job);persist(job);
    const cleanEnv={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:process.env.PATH,ComSpec:process.env.ComSpec,TEMP:process.env.TEMP,TMP:process.env.TMP,USERPROFILE:process.env.USERPROFILE,HOME:process.env.HOME,CI:'1',NO_COLOR:'1'};
    job.child=cp.spawn(process.execPath,[npmCli,'run',COMMANDS[commandId],'--if-present=false'],{cwd:mapping.path,env:Object.fromEntries(Object.entries(cleanEnv).filter(([,v])=>v!==undefined)),shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    // Buffer complete lines so split process chunks cannot bypass credential screening.
    const pending={stdout:'',stderr:''};
    const consume=(channel,chunk)=>{pending[channel]+=chunk.toString('utf8');let newline;while((newline=pending[channel].indexOf('\n'))>=0){append(job,pending[channel].slice(0,newline));pending[channel]=pending[channel].slice(newline+1);}if(pending[channel].length>65536){pending[channel]='';append(job,'[Oversized output line withheld]');}};
    job.child.stdout.on('data',b=>consume('stdout',b));job.child.stderr.on('data',b=>consume('stderr',b));
    job.child.once('error',()=>{job.state='FAILED';append(job,'Worker process could not start');persist(job);});
    const timer=setTimeout(()=>{job.timedOut=true;void stop(job).catch(()=>{});},180000);timer.unref();
    job.child.once('close',exit=>{clearTimeout(timer);for(const line of Object.values(pending))if(line)append(job,line);job.exitCode=exit;job.state=job.timedOut?'TIMED_OUT':job.state==='CANCELLING'?'CANCELLED':exit===0?'PASSED':'FAILED';job.finishedAt=new Date().toISOString();delete job.child;persist(job);});
    return job;
  }
  const server=http.createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    try {
      prune();
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.headers.origin)reject(403,'Native loopback transport required');
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method==='GET'&&url.pathname==='/health'){
        const health={ok:true,service:'OneLeadQ scoped Windows gateway'};
        if(url.searchParams.get('dependencies')==='1') {
          try {const response=await fetch(base.origin+'/health',{redirect:'error',signal:AbortSignal.timeout(2000)});const data=await response.json();health.backend=response.ok&&data.ok===true?'ONLINE':'UNAVAILABLE';}
          catch {health.backend='UNAVAILABLE';}
        }
        return send(200,health);
      }
      let body;
      if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>256000)reject(413,'Request too large');}try{body=JSON.parse(raw||'{}');}catch{reject(400,'Invalid JSON');}if(!body || typeof body!=='object'||Array.isArray(body))reject(400,'Object required');}
      if(req.method==='POST'&&url.pathname==='/web-development/session/pair') {
        const mapping=approved.find(m=>m.clientId===body.clientId&&m.projectId===body.projectId);
        if(!mapping)reject(403,'Select an approved client/project before pairing');
        if(codes.size>=20)reject(429,'Too many pending pairing codes');
        let code;do{code=String(crypto.randomInt(100000,1000000));}while(codes.has(code));const expiresAt=Date.now()+5*60*1000;codes.set(code,{mapping,expiresAt});return send(200,{ok:true,pairingCode:code,expiresAt,clientId:mapping.clientId,projectId:mapping.projectId});
      }
      if(req.method==='POST'&&url.pathname==='/web-development/session/exchange') {
        const key=req.socket.remoteAddress,attempt=attempts.get(key)||{count:0,expiresAt:Date.now()+60000};if(attempt.count>=5)reject(429,'Pairing temporarily locked');
        const code=codes.get(body.pairingCode);if(!code){attempt.count++;attempts.set(key,attempt);reject(401,'Invalid or expired pairing code');}codes.delete(body.pairingCode);
        const workerOnly=body.workerOnly===true;
        const backendSession=workerOnly?{expiresAt:Date.now()+ttl}:await(async()=>{const pairing=await upstream('/web-development/session/pair',{});return upstream('/web-development/session/exchange',{pairingCode:pairing.pairingCode});})();
        const sessionToken=crypto.randomBytes(32).toString('base64url'),expiresAt=Math.min(Date.now()+ttl,backendSession.expiresAt);
        sessions.set(sessionToken,{mapping:code.mapping,backendToken:backendSession.sessionToken,workerOnly,expiresAt});attempts.delete(key);
        return send(200,{ok:true,sessionToken,expiresAt,scope:[workerOnly?'windows-worker':'web-development'],clientId:code.mapping.clientId,projectId:code.mapping.projectId});
      }
      const token=(req.headers.authorization||'').replace(/^Bearer /,'');const session=sessions.get(token);if(!session)reject(401,'Scoped device pairing required');
      const mapping=session.mapping;
      // Renewed trusted-phone identities cannot obtain website/file/Git/AI authority.
      if(session.workerOnly&&!/^\/windows\/(workspace|session\/revoke|jobs(?:\/[\da-f-]{36}(?:\/cancel)?)?)$/.test(url.pathname))reject(403,'Worker-only session cannot access website, file, Git or AI actions');
      if(req.method==='POST'&&url.pathname==='/windows/session/revoke'){sessions.delete(token);return send(200,{ok:true});}
      if(req.method==='GET'&&url.pathname==='/windows/workspace')return send(200,{ok:true,clientId:mapping.clientId,projectId:mapping.projectId,workspaceId:mapping.workspaceId,commands:Object.keys(COMMANDS)});
      if(url.pathname==='/windows/jobs') {
        if(req.method==='GET')return send(200,{ok:true,jobs:[...jobs.values()].filter(j=>j.clientId===mapping.clientId&&j.projectId===mapping.projectId).map(visible)});
        if(req.method==='POST'){if(Object.keys(body).some(k=>k!=='commandId'))reject(400,'Only commandId is accepted');return send(202,{ok:true,job:visible(startJob(mapping,body.commandId))});}
      }
      const jobMatch=url.pathname.match(/^\/windows\/jobs\/([\da-f-]{36})(\/cancel)?$/);
      if(jobMatch){const job=scopedJob(jobMatch[1],session);if(req.method==='POST'&&jobMatch[2]){await stop(job);return send(200,{ok:true,job:visible(job)});}if(req.method==='GET'&&!jobMatch[2])return send(200,{ok:true,job:visible(job)});}
      if(req.method==='POST'&&url.pathname==='/web-development/workflows'){
        if(body.clientId!==mapping.clientId||body.projectId!==mapping.projectId)reject(403,'Wrong client/project');
        return send(200,await upstream(url.pathname,body,session.backendToken));
      }
      const workflow=url.pathname.match(/^\/web-development\/workflows\/([\da-f-]{36})(?:\/([a-z-]+))?$/);
      if(workflow){
        const prefix='/web-development/workflows/'+workflow[1];const data=await upstream(prefix,undefined,session.backendToken);const ctx=data.workflow?.context;
        if(ctx?.clientId!==mapping.clientId||ctx?.projectId!==mapping.projectId||ctx?.workspaceId!==mapping.workspaceId)reject(403,'Wrong client/project workflow');
        if(req.method==='GET'&&!workflow[2])return send(200,data);
        if(req.method==='POST'&&ACTIONS.has(workflow[2]))return send(200,await upstream(prefix+'/'+workflow[2],body,session.backendToken));
      }
      if(req.method==='POST'&&url.pathname==='/ai') {if(body.clientContext?.id!==mapping.clientId)reject(403,'Wrong client context');return send(200,await upstream('/ai',body));}
      reject(404,'Route not available');
    }catch(error){send(error.status||503,{ok:false,error:error.status?error.message:'Worker or backend unavailable; inspect locally'});}
  });
  server.on('clientError',(_,socket)=>socket.destroy());
  server.shutdown=async()=>{await Promise.all([...jobs.values()].filter(j=>j.child).map(stop));sessions.clear();codes.clear();await new Promise(resolve=>server.close(resolve));};
  return server;
}
module.exports={createGateway,COMMANDS};
if(require.main===module){
  const configPath=process.argv[2];if(!configPath)throw new Error('Usage: node windows/gateway.cjs <approved-config.json>');
  const config=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));const server=createGateway(config);server.listen(3020,'127.0.0.1',()=>console.log('OneLeadQ scoped gateway: http://127.0.0.1:3020 (native loopback only)'));process.on('SIGINT',()=>void server.shutdown());process.on('SIGTERM',()=>void server.shutdown());
}

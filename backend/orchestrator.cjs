'use strict';
// Server-side draft execution only. No generated code is executed and no external action adapter exists.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const SERVICES=Object.freeze(['webDevelopment','mobileDevelopment','seo','metaAds','googleAds','content','automation','youtube']);
const executable=id=>SERVICES.includes(id)||id==='conversation';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const sid=v=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v);
const uid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
function validate(input){
  if(!input||Object.keys(input).some(k=>!['requestId','serviceId','command','siteHtml'].includes(k))||!uid(input.requestId)||!executable(input.serviceId)||typeof input.command!=='string'||!input.command.trim()||input.command.length>8000)fail(400,'Invalid specialist request');
  if(input.siteHtml!==undefined&&(typeof input.siteHtml!=='string'||input.siteHtml.length>100000||input.serviceId!=='seo'))fail(400,'Invalid provided site fixture');
  if(input.serviceId==='seo'&&(!input.siteHtml||!input.siteHtml.trim()))fail(400,'SEO requires provided HTML');
  return {requestId:input.requestId,serviceId:input.serviceId,command:input.command.trim(),...(input.siteHtml===undefined?{}:{siteHtml:input.siteHtml})};
}
function conversationScope(input,mapping){
  if(input.serviceId!=='conversation')return;
  let value;try{value=JSON.parse(input.command);}catch{fail(400,'Invalid conversation contract');}
  if(!value||typeof value.message!=='string'||!value.message.trim()||value.clientContext?.id!==mapping.clientId||!Array.isArray(value.history)||value.history.length>8||value.history.some(t=>!t||t.clientId!==mapping.clientId||!['user','assistant'].includes(t.role)||typeof t.content!=='string'))fail(403,'Conversation client/history scope rejected');
}
function plan(value){
  if(!value||Object.keys(value).some(k=>!['summary','items'].includes(k))||typeof value.summary!=='string'||!value.summary.trim()||value.summary.length>2000||!Array.isArray(value.items)||!value.items.length||value.items.length>20||value.items.some(x=>typeof x!=='string'||!x.trim()||x.length>2000))fail(502,'Invalid Gemini structured plan');
  return {summary:value.summary,items:value.items};
}
const escape=v=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function outputs(service,p,input){
  const json=v=>JSON.stringify(v,null,2)+'\n', draft={draftOnly:true,publishingEnabled:false,...p};
  switch(service){
    case 'conversation':return {'reply.txt':p.summary+'\n'+p.items.join('\n')+'\n'};
    case 'webDevelopment':return {'index.html':'<!doctype html><html lang="en"><meta charset="utf-8"><title>Proposed website</title><main><h1>'+escape(p.summary)+'</h1><ul>'+p.items.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul></main></html>','structure.json':json(draft)};
    case 'mobileDevelopment':return {'app-spec.json':json({...draft,platforms:['android','ios']}),'App.tsx':"import { Text, View } from 'react-native';\nexport default function App(){return <View><Text>Review app-spec.json before development</Text></View>;}\n"};
    case 'seo':{if(!input.siteHtml)fail(400,'SEO requires provided HTML; arbitrary network URLs are not fetched');const html=input.siteHtml;return {'seo-audit.json':json({...draft,source:'provided-html',findings:[{rule:'title',passed:/<title>[^<]+<\/title>/i.test(html)},{rule:'description',passed:/<meta\b[^>]*name\s*=\s*["']description["']/i.test(html)},{rule:'h1',passed:/<h1[\s>]/i.test(html)}]})};}
    case 'metaAds':return {'meta-campaign-draft.json':json({...draft,status:'DRAFT',budgetAuthorized:false,adSets:p.items.map(name=>({name,status:'PAUSED'}))})};
    case 'googleAds':return {'google-campaign-draft.json':json({...draft,status:'DRAFT',budgetAuthorized:false,keywords:p.items,assets:[]})};
    case 'content':return {'content-calendar.json':json({...draft,entries:p.items.map((text,i)=>({order:i+1,text,status:'REVIEW_REQUIRED',scheduledAt:null}))})};
    case 'automation':return {'workflow.json':json({...draft,enabled:false,trigger:'manual',steps:p.items.map(note=>({type:'review-note',note})),externalHooks:[]})};
    case 'youtube':return {'youtube-strategy.json':json({...draft,videos:p.items.map(title=>({title,visibility:'DRAFT',uploaded:false}))})};
  }
}
function createOrchestrator({directory,generate,mode='PRODUCTION_UNVERIFIED',timeoutMs=30000,maxAttempts=2}){
  if(!['FIXTURE_TESTED','PRODUCTION_UNVERIFIED'].includes(mode)||typeof generate!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<1||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)throw Error('Explicit provider and execution mode required');
  fs.mkdirSync(directory,{recursive:true});const root=fs.realpathSync(directory),runs=new Map(),controllers=new Map();
  function safeRoot(){if(fs.realpathSync(directory)!==root)fail(409,'History directory identity changed');}
  function save(run){safeRoot();const file=path.join(root,run.id+'.json');if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())fail(403,'History link rejected');const tmp=path.join(root,crypto.randomUUID()+'.tmp');fs.writeFileSync(tmp,JSON.stringify(run),{flag:'wx',mode:0o600});fs.renameSync(tmp,file);}
  for(const name of fs.readdirSync(root).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){
    const file=path.join(root,name);if(fs.lstatSync(file).isSymbolicLink())throw Error('Linked history rejected');
    const run=JSON.parse(fs.readFileSync(file,'utf8'));if(!uid(run.id)||name!==run.id+'.json'||!sid(run.clientId)||!sid(run.projectId)||!sid(run.workspaceId)||!uid(run.requestId)||!executable(run.serviceId))throw Error('Malformed history; refuse to reset');
    if(['QUEUED','RUNNING'].includes(run.state)){run.state='INTERRUPTED';run.events.push({event:'INTERRUPTED',at:Date.now()});save(run);}runs.set(run.id,run);
  }
  const scoped=(mapping,id)=>{const r=runs.get(id);if(!r||r.clientId!==mapping.clientId||r.projectId!==mapping.projectId||r.workspaceId!==mapping.workspaceId)fail(404,'Run unavailable for selected workspace');return r;};
  const visible=r=>structuredClone(r);
  const event=(r,state)=>{r.state=state;r.updatedAt=Date.now();r.events.push({event:state,at:r.updatedAt});save(r);};
  async function execute(r,input){
    const controller=new AbortController();controllers.set(r.id,controller);event(r,'RUNNING');
    try{
      let p;
      for(let attempt=1;attempt<=maxAttempts;attempt++){
        if(controller.signal.aborted)throw Error('Cancelled');r.attempts=attempt;save(r);
        const timeout=new AbortController();const signal=AbortSignal.any([controller.signal,timeout.signal]);let timer;
        try{p=await Promise.race([Promise.resolve().then(()=>generate({serviceId:r.serviceId,command:input.command,signal})).then(plan),new Promise((_,reject)=>{timer=setTimeout(()=>{timeout.abort();reject(Object.assign(Error('Provider timeout'),{retryable:true}));},timeoutMs);signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});})]);break;}
        catch(error){if(controller.signal.aborted||attempt===maxAttempts||(!error.retryable&&!timeout.signal.aborted))throw error;}
        finally{clearTimeout(timer);timeout.abort();}
      }
      if(controller.signal.aborted)throw Error('Cancelled');
      const files=outputs(r.serviceId,p,input);safeRoot();const out=path.join(root,r.id+'-draft');fs.mkdirSync(out,{recursive:false,mode:0o700});
      // Fixed adapter filenames only; provider text is data, never a path, executable or command.
      const artifacts=[];for(const [name,content]of Object.entries(files)){fs.writeFileSync(path.join(out,name),content,{flag:'wx',mode:0o600});artifacts.push({name,sha256:hash(content),bytes:Buffer.byteLength(content)});}
      r.agentId=r.serviceId==='conversation'?require('./agentRouting.cjs').conversationAgent(input.command):r.serviceId;
      r.plan=p;r.artifacts=artifacts;r.previewHash=hash(JSON.stringify({plan:p,artifacts}));r.verification={passed:true,checks:['structured-plan','fixed-paths','draft-only','artifact-sha256']};event(r,'AWAITING_REVIEW');
    }catch{event(r,controller.signal.aborted?'CANCELLED':'FAILED');r.error=controller.signal.aborted?'CANCELLED':'PROVIDER_OR_DRAFT_FAILED';save(r);}
    finally{controllers.delete(r.id);}
  }
  return {
    start(mapping,raw){if(![mapping.clientId,mapping.projectId,mapping.workspaceId].every(sid))fail(403,'Explicit workspace required');const input=validate(raw);conversationScope(input,mapping);const fingerprint=hash(JSON.stringify(input));const existing=[...runs.values()].find(r=>r.clientId===mapping.clientId&&r.projectId===mapping.projectId&&r.workspaceId===mapping.workspaceId&&r.requestId===input.requestId);if(existing){if(existing.inputHash!==fingerprint)fail(409,'Request ID conflict');return visible(existing);}if(controllers.size>=2)fail(429,'Draft capacity reached; wait for active work');if(runs.size>=1000)fail(429,'History capacity requires owner review');const r={id:crypto.randomUUID(),requestId:input.requestId,inputHash:fingerprint,serviceId:input.serviceId,clientId:mapping.clientId,projectId:mapping.projectId,workspaceId:mapping.workspaceId,state:'QUEUED',mode,productionVerified:false,createdAt:Date.now(),attempts:0,events:[],externalActionsEnabled:false};save(r);runs.set(r.id,r);void execute(r,input);return visible(r);},
    list(mapping){
      // Reserve space below Android's 1 MiB native-response bound, including JSON escaping.
      const matching=[...runs.values()].filter(r=>r.clientId===mapping.clientId&&r.projectId===mapping.projectId&&r.workspaceId===mapping.workspaceId).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
      const recent=[];let bytes=2;
      for(const r of matching){const size=Buffer.byteLength(JSON.stringify(r),'utf8')+1;if(size>700000)fail(503,'History record exceeds mobile limit; inspect locally');if(recent.length>=50||bytes+size>700000)break;recent.push(visible(r));bytes+=size;}
      return recent.reverse(); // Full history remains on disk and individually addressable by scoped ID.
    },
    get(mapping,id){return visible(scoped(mapping,id));},
    cancel(mapping,id){const r=scoped(mapping,id);if(['QUEUED','RUNNING'].includes(r.state)){controllers.get(id)?.abort();event(r,'CANCELLED');}return visible(r);},
    approve(mapping,id,previewHash){const r=scoped(mapping,id);if(r.state!=='AWAITING_REVIEW'||r.previewHash!==previewHash)fail(409,'Review exact current preview before approval');safeRoot();for(const a of r.artifacts){const file=path.join(root,id+'-draft',a.name);if(fs.realpathSync(path.dirname(file))!==path.join(root,id+'-draft')||fs.lstatSync(file).isSymbolicLink()||hash(fs.readFileSync(file))!==a.sha256)fail(409,'Draft changed after verification');}event(r,'APPROVED_DRAFT');return visible(r);},
    external(){fail(403,'External actions unavailable; platform scopes and separate owner approval required');},
    async shutdown(){for(const c of controllers.values())c.abort();while(controllers.size)await new Promise(r=>setTimeout(r,5));}
  };
}
module.exports={createOrchestrator,SERVICES,validate,plan,outputs};

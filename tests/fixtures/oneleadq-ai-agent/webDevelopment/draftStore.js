const fs=require('node:fs'),path=require('node:path');
const {hasSecret,demand}=require('./safety');
// Restart recovery stores requirements only: no session, source, history,
// approval ID, operation journal or previously granted authority is serialized.
function sensitive(value){if(typeof value==='string')return hasSecret(value)||/(?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]|\bbearer\s+\S+/i.test(value);if(value&&typeof value==='object')return Object.values(value).some(sensitive);return false;}
class DraftStore {
 constructor(directory){this.directory=directory;}
 save(run){
  if(!this.directory)return;
  const data={id:run.id,clientId:run.context.clientId,projectId:run.context.projectId,mode:run.mode,requirements:run.requirements,savedAt:new Date().toISOString()};
  demand(!sensitive(data),'Sensitive draft cannot be persisted',400);
  fs.mkdirSync(this.directory,{recursive:true});const file=path.join(this.directory,run.id+'.json');
  fs.writeFileSync(file+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(file+'.tmp',file);
 }
 load(id){
  demand(/^[0-9a-f-]{36}$/.test(id),'Invalid workflow identifier',400);
  if(!this.directory)return null;
  try{const file=path.join(this.directory,id+'.json');if(fs.statSync(file).size>60000)return null;const data=JSON.parse(fs.readFileSync(file,'utf8'));return data.id===id && !sensitive(data)?data:null;}catch{return null;}
 }
}
module.exports={DraftStore};

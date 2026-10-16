const fs=require('node:fs'),crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function mountUpdateRecovery(app,{getApprovedWorkspace,resolveSafePath,runGit}){
 const operations=new Map(),busy=new Set(),check=(ok)=>{if(!ok)throw new Error('Update recovery blocked');};
 const head=async workspace=>runGit(workspace.path,['rev-parse','--verify','HEAD']).catch(()=>'(unborn)');
 async function capture({workspaceId,file,oldContent,newContent}){
  check(operations.size<1000);const workspace=getApprovedWorkspace(workspaceId);check(workspace);const safe=resolveSafePath(workspace,file);const stat=fs.lstatSync(safe.targetPath);check(stat.isFile()&&!stat.isSymbolicLink());
  const item={id:crypto.randomUUID(),workspaceId,file,oldContent,afterHash:digest(newContent),root:fs.realpathSync.native(safe.workspaceRoot),identity:stat.ino,head:await head(workspace),index:await runGit(workspace.path,['ls-files','--stage','-z','--',file]),applied:false};
  operations.set(item.id,item);return item.id;
 }
 app.post('/recovery/updates/:operationId/rollback',async(req,res)=>{
  const item=operations.get(req.params.operationId);let locked=false;
  try{check(item?.applied&&req.body?.approved===true&&req.body.workspaceId===item.workspaceId&&!busy.has(item.workspaceId));busy.add(item.workspaceId);locked=true;
   const workspace=getApprovedWorkspace(item.workspaceId);check(workspace);const safe=resolveSafePath(workspace,item.file),stat=fs.lstatSync(safe.targetPath);
   check(!stat.isSymbolicLink()&&stat.ino===item.identity&&fs.realpathSync.native(safe.workspaceRoot)===item.root);
   check(await head(workspace)===item.head&&await runGit(workspace.path,['ls-files','--stage','-z','--',item.file])===item.index);
   // After the last await re-resolve and verify immediately before the bounded write.
   const current=resolveSafePath(workspace,item.file);check(current.targetPath===safe.targetPath&&!fs.lstatSync(current.targetPath).isSymbolicLink()&&digest(fs.readFileSync(current.targetPath))===item.afterHash);
   fs.writeFileSync(current.targetPath,item.oldContent,'utf8');item.applied=false;res.json({ok:true,restored:true,file:item.file,backupPreserved:true});
  }catch{res.status(409).json({ok:false,error:'Update recovery blocked; preserve files and inspect the operation locally'});}
  finally{if(locked)busy.delete(item.workspaceId);}
 });
 return {capture,applied(id){const item=operations.get(id);check(item);item.applied=true;}};
}
module.exports={mountUpdateRecovery};

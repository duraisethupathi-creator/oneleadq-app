const fs=require('node:fs'),crypto=require('node:crypto');
const check=ok=>{if(!ok)throw new Error('Reviewed repository state changed; request fresh approval');};
async function snapshot(workspace,entries,{resolveSafePath,runGit}){
 const paths=[...new Set(entries.flatMap(e=>[e.file,...(e.originalFile?[e.originalFile]:[])]))];
 check(paths.length>0&&paths.length<=200);
 const root=fs.realpathSync.native(workspace.path),contents=[];let bytes=0;
 for(const file of paths){const safe=resolveSafePath(workspace,file);let stat;try{stat=fs.lstatSync(safe.targetPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!stat){contents.push([file,'ABSENT']);continue;}check(stat.isFile()&&!stat.isSymbolicLink());bytes+=stat.size;check(bytes<=2*1024*1024);
  contents.push([file,crypto.createHash('sha256').update(fs.readFileSync(safe.targetPath)).digest('hex')]);
 }
 const head=await runGit(workspace.path,['rev-parse','--verify','HEAD']).catch(()=>'(unborn)');
 const index=await runGit(workspace.path,['ls-files','--stage','-z','--',...paths]);
 return {root,contents,head,index};
}
function prune(maps,now=Date.now(),ttl=15*60*1000){for(const map of maps)for(const [id,item]of map){const created=Date.parse(item.createdAt);if(!Number.isFinite(created)||created>now||now-created>=ttl)map.delete(id);}}
module.exports={snapshot,prune};

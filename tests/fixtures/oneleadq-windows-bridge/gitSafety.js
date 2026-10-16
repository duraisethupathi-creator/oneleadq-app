function parseStatus(raw){
 const records=raw.split('\0'),changes=[];
 for(let i=0;i<records.length;i++){const entry=records[i];if(!entry)continue;if(entry.length<4||entry[2]!==' ')throw new Error('Malformed Git status');const status=entry.slice(0,2),file=entry.slice(3);const item={status,file};if(/[RC]/.test(status)){const from=records[++i];if(!from)throw new Error('Malformed Git rename/copy');item.originalFile=from;}changes.push(item);}return changes;
}
function indexRestore(previous,paths){const entries=new Map();for(const line of previous.split('\0').filter(Boolean)){const file=line.slice(line.indexOf('\t')+1);entries.set(file,[...(entries.get(file)||[]),line]);}return paths.map(file=>entries.get(file)?.join('\0')||`0 ${'0'.repeat(40)}\t${file}`).join('\0')+'\0';}
async function commitReviewed(runGit,root,paths,message){
 const unique=[...new Set(paths)];if(!unique.length)throw new Error('No reviewed paths');
 // Snapshot only these index entries. Never reset/unstage another user's paths.
 const previous=await runGit(root,['ls-files','--stage','-z','--',...unique]);
 const beforeHead=await runGit(root,['rev-parse','--verify','HEAD']).catch(()=>'(unborn)');
 await runGit(root,['add','--',...unique]);
 const after=await runGit(root,['ls-files','--stage','-z','--',...unique]);
 try{const staged=await runGit(root,['diff','--cached','--stat']);if(!staged.trim())throw new Error('No staged changes');await runGit(root,['commit','-m',message]);return {committed:true};}
 catch(error){
  let recovered=false;
  try{const currentHead=await runGit(root,['rev-parse','--verify','HEAD']).catch(()=>'(unborn)');const current=await runGit(root,['ls-files','--stage','-z','--',...unique]);if(current===after&&currentHead===beforeHead){
    // update-index --index-info restores the prior modes/object IDs directly,
    // including partially staged files, without touching working-tree content.
    const payload=indexRestore(previous,unique);
    await runGit(root,['update-index','-z','--index-info'],payload);recovered=true;
  }}catch{}
  throw Object.assign(new Error(recovered?'Commit failed; staging restored for this operation only.':'Commit failed; index changed or recovery failed. Preserve it and review locally.'),{stagingRecovered:recovered});
 }
}
module.exports={parseStatus,commitReviewed,indexRestore};

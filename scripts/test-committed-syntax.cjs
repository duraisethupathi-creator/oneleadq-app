const cp=require('node:child_process'),assert=require('node:assert/strict'),ts=require('typescript');
const staged=process.argv.includes('--staged');
const files=(staged?cp.execFileSync('git',['ls-files','-z']):cp.execFileSync('git',['ls-tree','-r','--name-only','-z','HEAD'])).toString().split('\0').filter(file=>/\.tsx?$/.test(file));
const failures=[];
for(const file of files){const source=cp.execFileSync('git',['show',(staged?':':'HEAD:')+file],{encoding:'utf8'});const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);for(const error of parsed.parseDiagnostics)failures.push(file+': '+ts.flattenDiagnosticMessageText(error.messageText,' '))}
assert.equal(failures.length,0,failures.join('\n'));console.log('PASS: '+files.length+' '+(staged?'staged':'committed')+' TS/TSX files have valid syntax; semantic dependency validation remains separate');

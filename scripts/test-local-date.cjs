const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
const dates={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/localDate.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:dates});
const fake=(y,m,d,utc)=>({getTime:()=>1,getFullYear:()=>y,getMonth:()=>m,getDate:()=>d,toISOString:()=>utc});
const midnight=fake(2026,9,16,'2026-10-15T19:00:00.000Z');assert.equal(midnight.toISOString().slice(0,10),'2026-10-15');assert.equal(dates.localDateKey(midnight),'2026-10-16');
assert.equal(dates.localDateKey(fake(2026,0,2,'')),'2026-01-02');
assert.equal(dates.localDateKey(fake(2025,11,31,'2026-01-01T01:00:00Z')),'2025-12-31');
assert.throws(()=>dates.localDateKey(new Date(NaN)),/Invalid calendar date/);
console.log('PASS: 4 local-calendar boundary, padding and invalid-date checks');

'use strict';
const cp=require('node:child_process'),path=require('node:path');
function vault(action,file,input){return new Promise((resolve,reject)=>{
  if(process.platform!=='win32')return reject(new Error('Windows DPAPI required; no plaintext fallback'));
  const child=cp.spawn(path.join(process.env.WINDIR||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-File',path.join(__dirname,'trust-vault.ps1'),'-Action',action,'-Path',path.resolve(file)],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';
  const timer=setTimeout(()=>child.kill(),20000);child.stdout.on('data',data=>{output+=data;if(output.length>4000000)child.kill();});child.stderr.resume();child.once('error',()=>{clearTimeout(timer);reject(new Error('DPAPI helper unavailable; trust storage blocked'));});child.once('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('DPAPI access failed; refuse plaintext or authority reset'));try{resolve(action==='Read'?JSON.parse(output.replace(/^\uFEFF/,'')):undefined);}catch{reject(new Error('Invalid DPAPI record; manual recovery required'));}});child.stdin.end(input||'');
});}
module.exports={readVault:file=>vault('Read',file),dpapiStore:file=>({read:()=>vault('Read',file),write:value=>vault('Write',file,JSON.stringify(value))})};

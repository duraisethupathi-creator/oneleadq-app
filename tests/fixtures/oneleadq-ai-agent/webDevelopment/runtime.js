const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const {browserBinary}=require('./reports');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function runtimeCheck(files,{capture=false}={}){
 const binary=browserBinary();if(!binary)return {evidence:'NOT_MEASURED',reason:'Approved local browser unavailable'};
 const server=http.createServer((req,res)=>{let file;try{file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html'}catch{res.writeHead(400).end();return;}
  if(!Object.hasOwn(files,file)||!(/\.(html|css|js)$/.test(file))){res.writeHead(404).end();return;}
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'");res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript');res.end(files[file]);
 });
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'oneleadq-render-'));let child,socket;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  child=spawn(binary,['--headless','--disable-gpu','--disable-extensions','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${directory}`,'about:blank'],{windowsHide:true,stdio:'ignore'});let spawnError;child.on('error',e=>{spawnError=e;});
  const portFile=path.join(directory,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++){if(spawnError)throw spawnError;await pause(100);}if(!fs.existsSync(portFile))throw new Error('Browser did not initialize');
  const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);socket=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let sequence=0;const pending=new Map(),errors=[],resources=[];
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Browser command timed out'))},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const item=pending.get(message.id);if(item){clearTimeout(item.timer);pending.delete(message.id);message.error?item.reject(new Error('Browser command failed')):item.resolve(message.result);}}else if(message.method==='Runtime.exceptionThrown')errors.push({kind:'runtime',detail:'Runtime exception observed'});else if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push({kind:'console',detail:'Console error observed'});else if(message.method==='Network.responseReceived'&&message.params.response.status>=400)resources.push({url:message.params.response.url.startsWith(origin)?message.params.response.url.slice(origin.length):'External resource blocked',status:message.params.response.status});else if(message.method==='Fetch.requestPaused'){const request=message.params;void send(request.request.url.startsWith(origin+'/')?'Fetch.continueRequest':'Fetch.failRequest',{requestId:request.requestId,...(request.request.url.startsWith(origin+'/')?{}:{errorReason:'BlockedByClient'})},message.sessionId).catch(()=>{});}};
  const target=await send('Target.createTarget',{url:'about:blank'}),attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true}),sid=attached.sessionId;
  await send('Page.enable',{},sid);await send('Runtime.enable',{},sid);await send('Network.enable',{},sid);await send('Fetch.enable',{patterns:[{urlPattern:'*'}]},sid);
  const pages=[],screenshots=[];
  for(const file of Object.keys(files).filter(p=>p.endsWith('.html')).slice(0,8)){
   for(const width of [1280,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390},sid);const result=await send('Page.navigate',{url:origin+'/'+file},sid);await pause(350);
    const value=await send('Runtime.evaluate',{expression:'JSON.stringify({cssViewportWidth:innerWidth,title:document.title,ready:document.readyState,overflow:document.documentElement.scrollWidth>innerWidth,links:[...document.querySelectorAll("a[href]")].map(a=>a.getAttribute("href"))})',returnByValue:true},sid);const measured=JSON.parse(value.result.value||'{}');
    const links=[];for(const link of measured.links||[]){if(!link||/^(#|tel:|mailto:)/.test(link))continue;const url=new URL(link,origin+'/'+file);if(url.origin!==origin){links.push({path:'External link NOT MEASURED',status:null});continue;}const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(3000)});links.push({path:url.pathname,status:response.status});}
    if(capture && file==='index.html'){const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sid);screenshots.push({width,height:900,data:screenshot.data,evidence:'MEASURED BROWSER SCREENSHOT ? isolated snapshot'});}
    pages.push({file,width,cssViewportWidth:measured.cssViewportWidth,title:measured.title,render:!result.errorText&&['complete','interactive'].includes(measured.ready),horizontalOverflow:measured.overflow,navigation:links});
   }
  }
  await send('Browser.close').catch(()=>{});
  return {evidence:'MEASURED',scope:'Isolated source snapshot served over temporary loopback HTTP; external networking blocked, not a deployed-site crawl',pages,errors,missingResources:resources,passed:pages.every(p=>p.render&&p.cssViewportWidth===p.width&&!p.horizontalOverflow&&p.navigation.every(l=>l.status===null||l.status<400))&&!errors.length&&!resources.length,performance:'NOT MEASURED',redirects:'Only snapshot HTTP behaviour measured; production redirects NOT MEASURED',screenshots:capture?screenshots:'NOT CAPTURED'};
 }catch{return {evidence:'NOT_MEASURED',reason:'Local browser runtime unavailable or timed out; no measurement claimed'};}
 finally{try{socket?.close()}catch{}child?.kill();await new Promise(r=>server.close(r));if(directory.startsWith(path.join(os.tmpdir(),'oneleadq-render-')))try{fs.rmSync(directory,{recursive:true,force:true})}catch{}}
}
module.exports={runtimeCheck};

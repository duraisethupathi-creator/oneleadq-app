'use strict';
const http=require('node:http'),https=require('node:https'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createDeviceTrust}=require('./device-trust.cjs');
const {readVault,dpapiStore}=require('./dpapi-store.cjs');
async function createTrustedServers({identity,store,legacy,tlsPort=3043,controlPort=3044,advertise=true,address,listenHost='0.0.0.0'}){
  const authority=await createDeviceTrust({gatewayId:identity.gatewayId,store,legacy});let discovery='DISABLED',bonjour,service;
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>256000)throw Object.assign(new Error('Request too large'),{status:413,code:'TOO_LARGE'});}try{const value=JSON.parse(raw||'{}');if(!value||Array.isArray(value)||typeof value!=='object')throw 0;return value;}catch{throw Object.assign(new Error('Invalid JSON'),{status:400,code:'INVALID_JSON'});}}
  const failure=(res,error)=>send(res,error.status||503,{ok:false,code:error.code||'TRANSPORT_UNAVAILABLE',error:error.status?error.message:'Trusted transport unavailable; inspect the laptop locally'});
  const tlsServer=https.createServer({pfx:Buffer.from(identity.pfx,'base64'),passphrase:identity.password,minVersion:'TLSv1.2'},async(req,res)=>{
    try{
      if(req.headers.origin)throw Object.assign(new Error('Native device transport required'),{status:403,code:'ORIGIN_REJECTED'});
      const route=new URL(req.url,'https://oneleadq.local').pathname;const input=req.method==='POST'?await body(req):undefined;
      if(route==='/trusted/enroll'&&req.method==='POST')return send(res,200,await authority.enroll(input,req.socket.remoteAddress));
      if(route==='/trusted/challenge'&&req.method==='POST')return send(res,200,authority.challenge(input,req.socket.remoteAddress));
      if(route==='/trusted/reconnect'&&req.method==='POST')return send(res,200,await authority.reconnect(input));
      const token=(req.headers.authorization||'').replace(/^Bearer /,'');authority.authorize(token);
      send(res,200,await authority.proxy(route,req.method,input,token,req.headers['idempotency-key']));
    }catch(error){failure(res,error);}
  });
  const control=http.createServer(async(req,res)=>{
    try{
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||req.headers.origin)throw Object.assign(new Error('Laptop-local native control required'),{status:403});
      const route=new URL(req.url,'http://localhost').pathname;
      if(route==='/health'&&req.method==='GET'){
        let health;try{health=await(await fetch((legacy||'http://127.0.0.1:3020')+'/health?dependencies=1',{signal:AbortSignal.timeout(2500),redirect:'error'})).json();}catch{health={ok:false};}
        return send(res,200,{ok:true,service:'OneLeadQ trusted transport control',gatewayId:identity.gatewayId,tlsPort:tlsServer.address()?.port||tlsPort,discovery,gateway:health.ok?'ONLINE':'OFFLINE',backend:health.backend||'UNAVAILABLE'});
      }
      if(route==='/trusted/devices'&&req.method==='GET')return send(res,200,{ok:true,devices:authority.listing()});
      const input=req.method==='POST'?await body(req):{};
      if(route==='/trusted/invitation'&&req.method==='POST'){
        const code=await authority.invitation(input);
        const addresses=Object.values(os.networkInterfaces()).flat().filter(x=>x&&!x.internal&&x.family==='IPv4'&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address)).map(x=>x.address);
        const host=address||addresses[0];if(!host)throw Object.assign(new Error('No private LAN address; connect laptop to Wi-Fi'),{status:503});
        // Display to the user once; never persist/log invitations or their codes.
        return send(res,200,{ok:true,version:1,gatewayId:identity.gatewayId,endpoint:'https://'+host+':'+tlsServer.address().port,fingerprint:identity.fingerprint,clientId:code.clientId,projectId:code.projectId,pairingCode:code.pairingCode,expiresAt:code.expiresAt});
      }
      if(route==='/trusted/revoke'&&req.method==='POST')return send(res,200,await authority.revoke(input.deviceId));
      send(res,404,{ok:false,error:'Local control route unavailable'});
    }catch(error){failure(res,error);}
  });
  const onClientError=(_,socket)=>socket.destroy();tlsServer.on('clientError',onClientError);control.on('clientError',onClientError);
  async function start(){
    await new Promise((resolve,reject)=>{tlsServer.once('error',reject);tlsServer.listen(tlsPort,listenHost,resolve);});
    try{await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(controlPort,'127.0.0.1',resolve);});}catch(error){await new Promise(r=>tlsServer.close(r));throw error;}
    if(advertise){try{const {Bonjour}=require('bonjour-service');bonjour=new Bonjour({},()=>{discovery='UNAVAILABLE';});service=bonjour.publish({name:'OneLeadQ-'+identity.gatewayId,type:'oneleadq',protocol:'tcp',port:tlsServer.address().port,txt:{gatewayId:identity.gatewayId,version:'1'},disableIPv6:true});discovery='ADVERTISING';service.on('error',()=>{discovery='UNAVAILABLE';});}catch{discovery='UNAVAILABLE';}}
    return {tlsPort:tlsServer.address().port,controlPort:control.address().port};
  }
  async function close(){if(service)service.stop();if(bonjour)bonjour.destroy();await Promise.all([tlsServer,control].map(server=>new Promise(resolve=>server.close(resolve))));}
  return {authority,start,close};
}
module.exports={createTrustedServers};
if(require.main===module){(async()=>{const file=path.resolve(process.argv[2]||'');const config=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));const identity=await readVault(config.identityFile);if(!identity)throw new Error('Run setup-trusted-transport.ps1 first; no plaintext identity fallback');const servers=await createTrustedServers({...config,identity,store:dpapiStore(config.trustFile)});const ports=await servers.start();console.log('Trusted TLS transport started; device-authenticated LAN port '+ports.tlsPort+'; laptop-local control '+ports.controlPort+'. No credentials logged.');const stop=()=>void servers.close();process.on('SIGINT',stop);process.on('SIGTERM',stop);})().catch(()=>{console.error('Trusted transport startup failed. Check DPAPI identity, existing gateway and port configuration locally. No security fallback enabled.');process.exitCode=1;});}

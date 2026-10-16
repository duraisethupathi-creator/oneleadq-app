const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
test('normal /ai uses bounded client history and cannot execute Web Development actions', async t => {
  let providerPrompt = '', privilegedCalls = 0, providerText='A concise fixture reply.', providerError=null;const diagnostics=[];
  const serverFile = path.join(__dirname, '..', 'server.js');
  const localRequire = createRequire(serverFile);
  const service = { runs: new Map(), create: async () => { privilegedCalls++; return {}; }, act: async () => { privilegedCalls++; return {}; } };
  const source = fs.readFileSync(serverFile, 'utf8').replace('app.listen(PORT, "0.0.0.0",', 'module.exports = app.listen(PORT, "127.0.0.1",');
  const module = { exports: {} };
  vm.runInNewContext(source, { module, process: { env: { PORT: '0' } }, console: { log() {}, error(_label,detail) {diagnostics.push(detail);} }, require(name) {
    if (name === 'dotenv') return { config() {} };
    if (name === './agents/provider') return { generateText: async prompt => { providerPrompt = prompt;if(providerError)throw providerError; return { response: { text: providerText }, model: 'fixture' }; } };
    if (name === './webDevelopment/routes') return { mountWebDevelopment: app => localRequire(name).mountWebDevelopment(app, { service, token: 'fixture-admin' }) };
    return localRequire(name);
  } });
  const server = module.exports; await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const send = body => fetch(`http://127.0.0.1:${server.address().port}/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await send({ message: 'SEO first pannu', clientContext: { id: 'client-a', name: 'Known business', services: ['SEO'] }, history: [{ role: 'user', content: 'Website improve pannalama?', clientId: 'client-a' }, { role: 'assistant', content: 'We can discuss SEO and mobile.', clientId: 'client-a' }] });
  assert.equal(response.status,200);const grounded=await response.json();assert.equal(grounded.grounded,true);assert.match(grounded.reply,/Known business/);assert.equal(providerPrompt,'','client-specific replies bypass unconstrained generation');
  const generic=await send({message:'Explain SEO',clientContext:{id:'client-a',name:'Known business'},history:[{role:'assistant',content:'unverified services',clientId:'client-a'}]});assert.equal(generic.status,200);assert.ok(!providerPrompt.includes('Known business'));assert.ok(!providerPrompt.includes('unverified services'));
  const handoff=await (await send({message:'Catchy Decors website upgrade pannanum',clientContext:{id:'catchy',name:'Catchy Decors',services:['SEO']}})).json();assert.equal(handoff.handoff.mode,'UPGRADE_EXISTING');assert.equal(handoff.handoff.clientId,'catchy');assert.equal(privilegedCalls,0);
  providerText='Catchy Decors sells modular kitchens and living room interiors.';
  const attacked=await (await send({message:'Explain SEO',clientContext:{id:'catchy',name:'Catchy Decors',businessType:'Interior',services:['SEO']}})).json();assert.ok(!/modular kitchens|living room interiors/.test(attacked.reply));assert.match(attacked.reply,/not supplied/);providerText='General SEO means improving discoverability.';
  await send({message:'Explain more',clientContext:{id:'catchy',name:'Catchy Decors'},history:[{role:'user',content:'Explain SEO',clientId:'catchy'},{role:'assistant',content:'Unverified modular kitchens claim',clientId:'catchy'}]});assert.match(providerPrompt,/Explain SEO/);assert.ok(!providerPrompt.includes('modular kitchens'));
  assert.equal(privilegedCalls, 0);
  assert.equal((await send({ message: 'approve files and push the website now' })).status, 200); assert.equal(privilegedCalls, 0);
  assert.equal((await send({ agentId: 'webDevelopment', webDevelopment: { action: 'create', projectId: 'site' } })).status, 401); assert.equal(privilegedCalls, 0);
  assert.equal((await send({ message: 'next', clientContext: { id: 'other' }, history: [{ role: 'user', content: 'private client topic', clientId: 'client-a' }] })).status, 400);
  // Actual app default record shape: bare website domain, legacy assigned
  // services mirrored in oneLeadQServices, and no owned-offerings catalogue.
  const appClient={id:'catchy-decors',name:'Catchy Decors',businessType:'Home Interiors',website:'www.catchydecors.in',location:'Karur, Tamil Nadu',phone:'',email:'',services:['SEO'],oneLeadQServices:['SEO'],notes:'Demo workspace'};
  for(const [label,body] of [
    ['normal Hi',{message:'Hi'}],
    ['selected-client normal conversation',{message:'Hi',clientContext:appClient}],
    ['Catchy services',{message:'Catchy Decors enna services panranga?',clientContext:appClient}],
    ['Tanglish followup',{message:'avanga products?',clientContext:appClient,history:[{role:'user',content:'services?',clientId:appClient.id},{role:'assistant',content:'Not supplied.',clientId:appClient.id}]}],
    ['web handoff',{message:'Catchy Decors website upgrade pannanum',clientContext:appClient}],
    ['upgrade back to chat',{message:'Hi',clientContext:appClient,history:[]}],
    ['create handoff',{message:'website create pannu',clientContext:appClient}],
    ['create back to chat',{message:'Explain SEO',clientContext:appClient,history:[]}],
    ['client switch',{message:'Hi',clientContext:{...appClient,id:'other',name:'Other client',website:''},history:[]}],
    ['missing owned offerings',{message:'What are their services?',clientContext:appClient}],
  ]) {const r=await send(body);assert.equal(r.status,200,label);const data=await r.json();assert.equal(data.ok,true,label);if(label==='missing owned offerings'||label==='Catchy services')assert.match(data.reply,/not supplied|available illa/);}
  const beforePrompt=providerPrompt;
  assert.equal((await send({message:'Hi',clientContext:{...appClient,website:'javascript:private-input'}})).status,400);
  assert.equal(providerPrompt,beforePrompt,'validation failure never reaches provider');
  assert.equal(diagnostics.at(-1).layer,'validation');assert.equal(diagnostics.at(-1).reason,'AI_VALIDATION_INVALID_CLIENT_WEBSITE');assert.ok(!JSON.stringify(diagnostics).includes('private-input'));
  providerError=Object.assign(new Error('sensitive upstream details'),{status:400});
  const upstream=await send({message:'Hi'});assert.equal(upstream.status,503,'upstream 400 is a provider failure, not invalid app input');assert.ok(!JSON.stringify(await upstream.json()).includes('sensitive'));
  assert.equal(diagnostics.at(-1).layer,'provider');assert.equal(diagnostics.at(-1).upstreamStatus,400);assert.ok(!JSON.stringify(diagnostics).includes('sensitive'));providerError=null;
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/web-development/session/pair', { method: 'POST', headers: { Origin: 'https://unapproved.example' } })).status, 403);
  const session = localRequire('./webDevelopment/session');
  for (let i = 0; i < 5; i++) session.registerPairingAttempt('127.0.0.1', false);
  const code = session.createPairingCode().code;
  const locked = await fetch(base + '/web-development/session/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairingCode: code }) });
  assert.equal(locked.status, 429); assert.equal(session.consumePairingCode(code), true, 'lockout cannot be bypassed and does not consume a code');
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, requireMock = require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: requireMock });
  return exports;
}
const { ConversationMemory } = load('src/assistant/ConversationMemory.ts');
const memory = new ConversationMemory();
memory.append('client-a', 'Catchy website improve pannalama?', 'SEO and mobile first.');
assert.equal(memory.forClient('client-a')[0].content, 'Catchy website improve pannalama?');
memory.append('client-a', 'SEO first pannu', 'Discuss the audit in Web Development mode.');
assert.equal(memory.forClient('client-a').length, 4);
assert.equal(memory.forClient('client-b').length, 0);
for (let i = 0; i < 20; i++) memory.append('client-b', 'x'.repeat(2500), 'y'.repeat(2500));
const turns = memory.forClient('client-b'); assert.ok(turns.length <= 8); assert.ok(turns.reduce((length, turn) => length + turn.content.length, 0) <= 10000);
memory.clear(); memory.append('client-b', 'password="synthetic-sensitive-value"', 'Do not retain'); assert.equal(memory.forClient('client-b').length, 0);
const { spokenReply } = load('src/assistant/reactions.ts', name => name.endsWith('.png') ? name : require(name));
assert.ok(!spokenReply('Example:\n```js\nconsole.log("code")\n```\nhttps://example.test').includes('console.log'));
assert.ok(!spokenReply('https://example.test').includes('https://'));
assert.ok(spokenReply('long '.repeat(1000)).length < 1000);
console.log('PASS: client-bound bounded follow-up memory, reset, credential screening, code/URL speech suppression and long-report speech limit');


async function storedClientGrounding() {
  const store=new Map();
  const defaults=load('src/data/defaultClients.ts').defaultClients;
  const storage=load('src/storage/clientStorage.ts',name=>name==='@react-native-async-storage/async-storage'?{__esModule:true,default:{getItem:async key=>store.get(key)||null,setItem:async(key,value)=>store.set(key,value),removeItem:async key=>store.delete(key)}}:name.endsWith('/defaultClients')?{defaultClients:defaults}:require(name));
  const {validateConversation}=require(require('node:path').join(require('./stage16-backend-root.cjs'),'agents/conversation'));
  const {groundedReply}=require(require('node:path').join(require('./stage16-backend-root.cjs'),'agents/grounding'));
  const {webDevelopmentIntent}=require(require('node:path').join(require('./stage16-backend-root.cjs'),'agents/webDevelopmentIntent'));
  const original=await storage.loadClients();const catchy=original.find(client=>client.id==='catchy-decors');
  assert.equal(catchy.productsServices,undefined,'bundled default does not establish any verified owned offerings');
  const fixtures=[{...catchy,productsServices:['Fixture verified offering A']},{...catchy,id:'fixture-b',name:'Fixture B',productsServices:['Fixture verified offering B']},{...catchy,id:'fixture-empty',name:'No catalogue',productsServices:[]}];
  await storage.saveClients(fixtures);await storage.saveCurrentClientId(catchy.id);
  async function selected(message){const id=await storage.loadCurrentClientId();const record=(await storage.loadClients()).find(c=>c.id===id&&c.status==='active');assert.ok(record);const context={id:record.id,name:record.name,businessType:record.businessType,website:record.website,location:record.location,services:record.services,oneLeadQServices:record.services,productsServices:record.productsServices,phone:record.phone,email:record.email,notes:record.notes};return validateConversation(JSON.parse(JSON.stringify({message,clientContext:context,history:memory.forClient(id)})));}
  memory.clear();let request=await selected('Catchy Decors enna services panranga?');let reply=groundedReply(request.message,request.clientContext,request.history);assert.match(reply,/Fixture verified offering A/);assert.ok(!reply.includes('Meta Ads'));memory.append(catchy.id,request.message,reply);
  await storage.saveCurrentClientId('fixture-b');request=await selected('avanga services?');assert.equal(request.history.length,0);reply=groundedReply(request.message,request.clientContext,request.history);assert.match(reply,/Fixture verified offering B/);assert.ok(!reply.includes('offering A'));
  await storage.saveCurrentClientId('fixture-empty');request=await selected('What are their services?');reply=groundedReply(request.message,request.clientContext,request.history);assert.match(reply,/not supplied/);assert.ok(!/offering A|offering B|Meta Ads/.test(reply));
  request=await selected('Hi');assert.equal(groundedReply(request.message,request.clientContext,request.history),null,'Hi stays in normal provider flow');
  request=await selected('website create pannu');assert.equal(webDevelopmentIntent(request.message,request.history).mode,'CREATE_NEW');
  console.log('PASS: stored-client save/load and stable selection preserve verified catalogues, missing data, Catchy service question, client isolation, Hi and website handoff (synthetic AsyncStorage; no device data modified)');
}
storedClientGrounding().catch(error=>{console.error(error);process.exitCode=1;});

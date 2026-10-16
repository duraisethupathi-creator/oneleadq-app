const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require});return exports;}
const {webDevelopmentIntent}=load('src/assistant/webDevelopmentIntent.ts');
const backend=require(require('node:path').join(require('./stage16-backend-root.cjs'),'agents/webDevelopmentIntent'));
const messages=['Catchy Decors website upgrade pannanum','website create pannu','new website build pannu','website analyze pannu','site audit start pannu','existing website improve pannu','website SEO check pannu','புதிய இணையதளம் உருவாக்கு','இணையதளத்தை மேம்படுத்து','website improve panna enna pannalam?','SEO na enna?','website speed improve panna idea sollu','Do not create a website'];
for(const message of messages)assert.deepEqual(JSON.parse(JSON.stringify(webDevelopmentIntent(message))),backend.webDevelopmentIntent(message),message);
assert.equal(webDevelopmentIntent(messages[0]).mode,'UPGRADE_EXISTING');assert.equal(webDevelopmentIntent(messages[1]).mode,'CREATE_NEW');for(const message of messages.slice(9))assert.equal(webDevelopmentIntent(message),null);
const {ConversationMemory}=load('src/assistant/ConversationMemory.ts'),memory=new ConversationMemory();
for(const content of ['{"api_key":"fixture"}','Bearer fixture','https://user:pass@example.test']){memory.clear();memory.append('catchy',content,'not retained');assert.equal(memory.forClient('catchy').length,0);}
memory.append('catchy','avanga services?','Verified own services not supplied.');assert.equal(memory.forClient('other').length,0);memory.clear();assert.equal(memory.forClient('other').length,0);
console.log('PASS: shared English/Tamil/Tanglish action/discussion intent parity, correct handoff modes, credential-free bounded memory and client isolation.');

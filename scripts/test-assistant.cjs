const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => name.endsWith('.png') ? name : require(name),
    process: { env: {} }, Error, AbortController, setTimeout, clearTimeout, ...globals };
  vm.runInNewContext(code, context, { filename: file });
  return context.exports;
}
async function main() {
  const { VoiceSession } = load('src/assistant/VoiceSession.ts');
  const session = new VoiceSession();
  const id = session.begin();
  assert.equal(session.begin(), null, 'parallel native sessions must be rejected');
  session.result('stale before start', true);
  session.start();
  session.result('வணக்கம்', false);
  session.result('SEO check pannu', true);
  session.result('late partial', false);
  assert.equal(session.end(), 'SEO check pannu');
  assert.equal(session.end(), null, 'duplicate end cannot resubmit');
  assert.ok(session.begin() > id);
  session.start();
  session.result('SEO check pannu', true);
  assert.equal(session.end(), 'SEO check pannu', 'a new intentional session may repeat a question');
  session.begin(); session.start(); session.result('cancelled request', true); session.cancel();
  assert.equal(session.begin(), null, 'cancelled native session stays occupied until end');
  assert.equal(session.end(), null, 'close/error/abort must discard transcript');
  session.begin(); session.start(); session.result('partial only', false);
  assert.equal(session.end(), null, 'partial recognition must not trigger an AI action');
  session.begin(); session.cancel(); session.discardUnstarted();
  assert.equal(session.current, null, 'a failed synchronous start must release its slot');
  session.begin(true); session.start();
  session.result('வணக்கம்', true);
  session.result('SEO check', false);
  assert.equal(session.current.transcript, 'வணக்கம் SEO check');
  session.result('SEO check பண்ணுங்கள்', true);
  session.result('unconfirmed trailing speech', false);
  assert.equal(session.end(), 'வணக்கம் SEO check பண்ணுங்கள்');
  assert.equal(session.end(), null, 'segmented session still submits only once');
  session.begin(true); session.start(); session.result('discard', true); session.cancel();
  assert.equal(session.end(), null);
  const reactions = load('src/assistant/reactions.ts');
  assert.equal(Object.keys(reactions.reactionVisuals).length, 22);
  assert.equal(reactions.resolveReaction(['walking', 'listening']), 'listening');
  assert.equal(reactions.resolveReaction(['thinking', 'error']), 'error');
  assert.equal(reactions.resolveReaction(['result', 'talking']), 'talking');
  assert.equal(reactions.resolveReaction(['sleeping', 'alert']), 'alert');
  assert.equal(reactions.resolveReaction(['sleeping']), 'sleeping');
  assert.equal(reactions.requestReaction('SEO check'), 'analyzing');
  assert.equal(reactions.requestReaction('generate copy'), 'working');
  assert.equal(reactions.responseReaction('Approval required'), 'alert');
  assert.equal(reactions.readableReply('# Result\n**Done** [site](https://example.com)'), 'Result\nDone site');
  const voices = [
    { identifier: 'english-india', name: 'English India', language: 'en-IN', quality: 'Enhanced' },
    { identifier: 'tamil-default', name: 'Tamil', language: 'ta-IN', quality: 'Default' },
    { identifier: 'tamil-enhanced', name: 'Tamil Enhanced', language: 'ta-IN', quality: 'Enhanced' },
    { identifier: 'multilingual-india', name: 'Indian Multilingual', language: 'hi-IN', quality: 'Enhanced' },
  ];
  let inventory = voices;
  let lookups = 0;
  const voiceHelper = load('src/assistant/speechVoice.ts', { __DEV__: false, require: name => {
    assert.equal(name, 'expo-speech');
    return { getAvailableVoicesAsync: async () => { lookups++; return inventory; } };
  } });
  assert.equal(voiceHelper.ASSISTANT_GREETING, 'Hello! சொல்லுங்க, என்ன பண்ணலாம்?');
  assert.equal(voiceHelper.selectAssistantVoice(voices).identifier, 'tamil-enhanced');
  assert.equal(voiceHelper.selectAssistantVoice([voices[0], voices[3]]).identifier, 'multilingual-india');
  assert.equal(voiceHelper.selectAssistantVoice([voices[0]]).identifier, 'english-india');
  const profile = await voiceHelper.getAssistantSpeechOptions();
  assert.equal(profile.voice, 'tamil-enhanced'); assert.equal(profile.language, 'ta-IN');
  assert.equal(profile.rate, 0.92); assert.equal(profile.pitch, 1);
  inventory = [voices[0]];
  assert.equal((await voiceHelper.getAssistantSpeechOptions()).voice, 'english-india', 'removed voices must not remain cached');
  inventory = [];
  const defaults = await voiceHelper.getAssistantSpeechOptions();
  assert.equal(defaults.voice, undefined); assert.equal(defaults.language, undefined);
  assert.equal(lookups, 3);
  let sent;
  const draft = {id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',state:'AWAITING_REVIEW',plan:{summary:'Fixture reply',items:['Review']}};
  const modules = name => name==='./orchestrator' ? {
    createDraft:async(...args)=>{sent=args;return draft;},readDraft:async()=>draft,cancelDraft:async()=>draft,
  }:name==='./trustedWindows'?{trustedWindows:{newDraftId:async()=>draft.id}}:name==='../agents/registry'?{resolveAgencyIntent:()=>({kind:'route',serviceId:'seo',backendId:'seo'})}:require(name);
  const service = load('src/services/aiAgent.ts', {require:modules});
  const context = {id:'qa-client',name:'Client B',website:'https://example.test'};
  assert.equal((await service.askOneLeadQAgent(' SEO check ',context)).agentId,'seo');
  assert.equal(sent[0],context.id);assert.equal(sent[1],'conversation');
  assert.equal(JSON.parse(sent[2]).message,'SEO check');
  assert.equal(JSON.parse(sent[2]).clientContext.id,context.id);
  await assert.rejects(service.askOneLeadQAgent('test'),/Select a client/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(service.askOneLeadQAgent('test',context,controller.signal),/stopped or timed out/);
  const unhealthy=load('src/services/aiAgent.ts',{require:modules,fetch:async()=>({ok:false,json:async()=>({ok:true,connected:true})})});
  assert.equal((await unhealthy.checkAIAgentHealth()).connected,false);
  console.log('PASS: voice-session deduplication/cancellation, 22 reaction states and priority, readable replies, device TTS voice ranking/defaults/refresh, AI payload/abort/validation/health');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const granted = { granted: true, status: 'granted', canAskAgain: true };
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(status, requested = granted, androidVersion = 35, initialClient = null) {
  let currentClient=initialClient;
  const timers = new Map(); let clock = 0, timerId = 0;
  const slots = []; let cursor = 0, mounted = false, pendingEffect;
  const events = {}, logs = [], calls = { request: 0, start: 0, stop: 0, abort: 0, ai: 0, options: null, message: null };
  let appChange, cleanup;
  const app = { currentState: 'active', addEventListener: (_, fn) => { appChange = fn; return { remove() {} }; } };
  const react = {
    forwardRef: fn => fn, memo: fn => fn,
    useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => slots[index] = typeof value === 'function' ? value(slots[index]) : value]; },
    useRef: initial => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect: (fn, deps) => { if (!mounted && deps.length === 0) pendingEffect = fn; },
    useImperativeHandle() {},
  };
  const native = {
    getPermissionsAsync: async () => status,
    requestPermissionsAsync: async () => { calls.request++; return requested; },
    isRecognitionAvailable: () => true, getStateAsync: async () => 'inactive',
    start(options) { calls.start++; calls.options = options; }, stop() { calls.stop++; }, abort() { calls.abort++; events.error?.({ error: 'aborted' }); events.end?.(); },
  };
  const rn = { AppState: app, Platform: { OS: 'android', Version: androidVersion }, useWindowDimensions: () => ({ width: 400, height: 800 }),
    StyleSheet: { create: x => x }, Animated: { Value: class { stopAnimation() {} }, View: 'AnimatedView' } };
  for (const name of ['Modal','Image','KeyboardAvoidingView','Pressable','ScrollView','Text','TextInput','View']) rn[name] = name;
  function load(file) {
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const requireMock = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === 'react-native') return rn;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === 'expo-speech') return { stop: async () => {}, getAvailableVoicesAsync: async () => [], speak() {} };
      if (name === 'expo-speech-recognition') return { ExpoSpeechRecognitionModule: native, useSpeechRecognitionEvent: (name, fn) => events[name] = fn };
      if (name.endsWith('/speechVoice')) return load('src/assistant/speechVoice.ts');
      if (name.endsWith('/VoiceSession')) return load('src/assistant/VoiceSession.ts');
      if (name.endsWith('/webDevelopmentIntent')) return load('src/assistant/webDevelopmentIntent.ts');
      if (name.endsWith('/ConversationMemory')) return load('src/assistant/ConversationMemory.ts');
      if (name.endsWith('/reactions')) return load('src/assistant/reactions.ts');
      if (name.endsWith('/clientStorage')) return { loadCurrentClientId: async () => currentClient?.id||null, loadClients: async () => currentClient?[currentClient]:[] };
      if (name.endsWith('/aiAgent') || name.endsWith('/agencyDraft')) return { [name.endsWith('/agencyDraft') ? 'requestAgencyDraft' : 'askOneLeadQAgent']: async (message,clientContext,signal,history) => { require(require('node:path').join(require('./stage16-backend-root.cjs'),'agents/conversation')).validateConversation({message,clientContext,history});calls.ai++; calls.message = message;calls.context=clientContext;calls.history=history;calls.reply=require(require('node:path').join(require('./stage16-backend-root.cjs'),'agents/grounding')).groundedReply(message,clientContext,history)||'Done'; return { reply: calls.reply, ok: true }; } };
      if (name === './webDevelopmentWebsiteTypes') return load('src/components/webDevelopmentWebsiteTypes.ts');
      if (name.endsWith('/registry')) return load('src/agents/registry.ts');
      if (name === './RoamingAssistant') return { __esModule: true, default: 'RoamingAssistant' };
      if (name === './WebDevelopmentPanel') return { __esModule: true, default: 'WebDevelopmentPanel' };
      if (name.endsWith('.png')) return name;
      throw new Error('Unexpected import ' + name);
    };
    vm.runInNewContext(source, { exports, require: requireMock, __DEV__: true, Error, AbortController,
      console: { log: (...args) => logs.push(args) }, setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: clock + ms }); return id; }, clearTimeout: id => timers.delete(id), setInterval: () => 1, clearInterval() {} });
    return exports;
  }
  const Component = load('src/components/FloatingAssistant.tsx').default;
  function render() { cursor = 0; const tree = Component({}, null); if (!mounted) { mounted = true; cleanup = pendingEffect(); } return tree; }
  function find(node, label) {
    if (!node || typeof node !== 'object') return;
    if (node.props?.accessibilityLabel === label) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, label); if (result) return result; }
  }
  render(); find(render(), 'Open OneLeadQ assistant').props.onPress();
  return { calls, logs, events, render,
    find:label=>find(render(),label),
    switchClient:client=>{currentClient=client;},
    advance: ms => { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); } },
    tap: () => find(render(), 'Start voice listening').props.onPress(),
    stop: () => find(render(), 'Finish voice recording').props.onPress(),
    close: () => find(render(), 'Close assistant').props.onPress(),
    web: () => find(render(), 'Enter Web Development mode').props.onPress(),
    chat: () => find(render(), 'Return to normal assistant chat').props.onPress(),
    state: value => { app.currentState = value; appChange(value); },
    unmount: () => cleanup(),
  };
}
async function main() {
  const status = deferred(); const h = harness(status.promise);
  h.tap(); h.events.error({ error: 'aborted' }); h.events.end();
  status.resolve(granted); await flush();
  assert.equal(h.calls.request, 0, 'granted permission must not be requested again');
  assert.equal(h.calls.start, 1, 'stale abort/end during permission check cannot cancel a new attempt');
  h.events.start(); h.events.result({ isFinal: true, results: [{ transcript: 'வணக்கம்' }] }); h.events.end(); h.events.end(); await flush();
  assert.equal(h.calls.ai, 1, 'final transcript submits once');
  h.unmount();
  const longer = harness(granted); longer.tap(); await flush(); longer.events.start();
  assert.equal(longer.calls.options.continuous, true);
  assert.equal(longer.calls.options.lang, 'ta-IN');
  longer.advance(90000);
  assert.equal(longer.calls.stop, 0, 'elapsed time alone must not stop recording');
  assert.equal(longer.calls.abort, 0, 'no 10/20-second or other duration abort');
  assert.equal(longer.calls.start, 1, 'there is no restart loop');
  longer.events.result({ isFinal: true, results: [{ transcript: 'வணக்கம்' }] });
  longer.events.result({ isFinal: true, results: [{ transcript: 'SEO check பண்ணுங்கள்' }] });
  assert.equal(longer.calls.ai, 0, 'final segments must not submit before the session ends');
  longer.stop(); assert.equal(longer.calls.stop, 1);
  longer.events.end(); longer.events.end(); await flush();
  assert.equal(longer.calls.message, 'வணக்கம் SEO check பண்ணுங்கள்');
  assert.equal(longer.calls.ai, 1);
  const ended = longer.logs.find(args => args[0] === '[Assistant] recognition end');
  assert.equal(ended[1].reason, 'user stop'); assert.equal(ended[1].appRecordingTimeout, false);
  longer.unmount();
  const older = harness(granted, granted, 31); older.tap(); await flush(); older.events.start();
  assert.equal(older.calls.options.continuous, false, 'older Android retains supported native single-utterance mode');
  older.events.speechend(); older.events.result({ isFinal: true, results: [{ transcript: 'native result' }] }); older.events.end(); await flush();
  assert.equal(older.calls.ai, 1); assert.equal(older.calls.stop, 0);
  const nativeEnd = older.logs.find(args => args[0] === '[Assistant] recognition end');
  assert.equal(nativeEnd[1].speechEndObserved, true);
  assert.match(nativeEnd[1].reason, /native end/); older.unmount();
  const silence = harness(granted); silence.tap(); await flush(); silence.events.start();
  silence.events.result({ isFinal: true, results: [{ transcript: 'finished before silence' }] });
  silence.events.error({ error: 'no-speech' }); silence.events.end(); silence.events.end(); await flush();
  assert.equal(silence.calls.ai, 1, 'silence after final segments must preserve one submission');
  assert.equal(silence.calls.message, 'finished before silence'); silence.unmount();
  const permission = deferred(); const first = harness({ granted: false, canAskAgain: true, status: 'undetermined' }, permission.promise);
  first.tap(); await flush(); first.events.error({ error: 'aborted' }); first.events.end(); permission.resolve(granted); await flush();
  assert.equal(first.calls.request, 1); assert.equal(first.calls.start, 1); first.unmount();
  for (const reason of ['close', 'background', 'unmount']) {
    const pending = deferred(); const test = harness(pending.promise); test.tap();
    if (reason === 'close') test.close(); else if (reason === 'unmount') test.unmount(); else { test.state('background'); test.state('active'); }
    pending.resolve(granted); await flush(); assert.equal(test.calls.start, 0, reason + ' must invalidate pending preparation');
    if (reason !== 'unmount') test.unmount();
  }
  const denied = harness({ granted: false, canAskAgain: false, status: 'denied' }); denied.tap(); await flush();
  assert.equal(denied.calls.request, 0); assert.equal(denied.calls.start, 0); denied.unmount();
  const aborted = harness(granted); aborted.tap(); await flush(); aborted.events.start();
  aborted.events.error({ error: 'aborted' }); aborted.events.result({ isFinal: true, results: [{ transcript: 'discard me' }] }); aborted.events.end(); await flush();
  assert.equal(aborted.calls.ai, 0, 'active-session abort must still discard the transcript'); aborted.unmount();
  const mode = harness(granted); mode.tap(); await flush(); mode.events.start();
  mode.events.result({ isFinal: true, results: [{ transcript: 'discard after mode switch' }] });
  mode.web(); mode.events.end(); await flush(); assert.equal(mode.calls.ai, 0);
  mode.chat(); mode.tap(); await flush(); mode.events.start();
  mode.events.result({ isFinal: true, results: [{ transcript: 'ordinary website question' }] }); mode.events.end(); await flush();
  assert.equal(mode.calls.ai, 1, 'normal chat retains AI flow after leaving web mode'); mode.unmount();
  const catchy={id:'catchy-id',name:'Catchy Decors',status:'active',website:'www.catchydecors.in',services:['SEO']};
  const action=harness(granted,granted,35,catchy);action.tap();await flush();action.events.start();action.events.result({isFinal:true,results:[{transcript:'Catchy Decors website upgrade pannanum'}]});action.events.end();await flush();
  assert.equal(action.calls.ai,0,'action handoff precedes normal AI advice');assert.ok(action.find('Open Web Development workspace'),'detailed controls remain behind compact launcher');assert.ok(action.find('Return to normal assistant chat'));
  assert.equal(action.find('Selected Web Development mode').props.children.join(''),'Mode: UPGRADE_EXISTING');
  const scroll=action.find('Assistant scrollable content');assert.equal(scroll.props.style.flexGrow,0);assert.equal(scroll.props.style.flexShrink,1);assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');
  assert.equal(action.find('Supported static website types'),undefined,'upgrade does not reserve a website-type area');
  const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
  assert.equal(nodes(action.render()).filter(n=>n.type==='WebDevelopmentPanel').length,0,'detailed workspace is absent from launcher');
  action.find('Open Web Development workspace').props.onPress();
  const modal=nodes(action.render()).find(n=>n.type==='Modal');assert.ok(modal);assert.equal(nodes(modal).filter(n=>n.type==='WebDevelopmentPanel').length,1);
  action.find('Return to compact assistant').props.onPress();assert.equal(nodes(action.render()).filter(n=>n.type==='WebDevelopmentPanel').length,0);
  action.chat();action.tap();await flush();action.events.start();action.events.result({isFinal:true,results:[{transcript:'hello'}]});action.events.end();await flush();assert.equal(action.calls.ai,1,'normal chat after action handoff retains AI');action.unmount();
  const create=harness(granted,granted,35,catchy);create.tap();await flush();create.events.start();create.events.result({isFinal:true,results:[{transcript:'website create pannu'}]});create.events.end();await flush();
  assert.equal(create.calls.ai,0);assert.equal(create.find('Selected Web Development mode').props.children.join(''),'Mode: CREATE_NEW');assert.ok(create.find('Supported static website types'));assert.ok(create.find('Website type: Product showcase (static; no checkout)'));
  create.find('Website type: Business / Corporate').props.onPress();create.find('Open Web Development workspace').props.onPress();const panel=nodes(create.render()).find(n=>n.type==='WebDevelopmentPanel');assert.equal(panel.props.handoff.websiteType,'BUSINESS');assert.equal(panel.props.handoff.clientId,catchy.id);create.find('Return to compact assistant').props.onPress();create.chat();create.tap();await flush();create.events.start();create.events.result({isFinal:true,results:[{transcript:'Hi'}]});create.events.end();await flush();assert.equal(create.calls.ai,1,'CREATE_NEW back to chat accepts real default client schema');create.switchClient({...catchy,id:'other-client',name:'Other client'});create.tap();await flush();create.events.start();create.events.result({isFinal:true,results:[{transcript:'Hi'}]});create.events.end();await flush();assert.equal(create.calls.ai,2,'client switch sends history matching new stable ID');create.unmount();
  const discussion=harness(granted,granted,35,catchy);discussion.tap();await flush();discussion.events.start();discussion.events.result({isFinal:true,results:[{transcript:'website speed improve panna idea sollu'}]});discussion.events.end();await flush();assert.equal(discussion.calls.ai,1,'discussion remains normal AI');assert.ok(discussion.find('Enter Web Development mode'));discussion.unmount();
  const verified=harness(granted,granted,35,{...catchy,productsServices:['Fixture verified offering A']});
  async function ask(test,transcript){test.tap();await flush();test.events.start();test.events.result({isFinal:true,results:[{transcript}]});test.events.end();await flush();}
  await ask(verified,'Catchy Decors enna services panranga?');assert.match(verified.calls.reply,/Fixture verified offering A/);assert.deepEqual(verified.calls.context.productsServices,['Fixture verified offering A']);assert.ok(!verified.calls.reply.includes('SEO'));
  verified.switchClient({...catchy,id:'client-b',name:'Another client',productsServices:['Fixture verified offering B']});await ask(verified,'avanga services?');assert.match(verified.calls.reply,/Fixture verified offering B/);assert.ok(!verified.calls.reply.includes('offering A'));assert.equal(verified.calls.history.length,0,'switch removes prior-client turns');
  verified.switchClient({...catchy,id:'client-c',name:'Missing offerings client'});await ask(verified,'What are their services?');assert.match(verified.calls.reply,/not supplied/);assert.ok(!/offering A|offering B/.test(verified.calls.reply));verified.unmount();
  console.log('PASS: component mic preparation, permission reuse, cancellation, exactly-once submission and explicit Web Development mode switching');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

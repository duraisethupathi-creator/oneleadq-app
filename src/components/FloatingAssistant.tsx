import { resolveAgencyIntent, serviceRegistry, type ServiceId } from '../agents/registry';
import RoamingAssistant from './RoamingAssistant';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, AppState, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, StyleSheet, useWindowDimensions } from 'react-native';
import { webDevelopmentIntent } from '../assistant/webDevelopmentIntent';
import { requestAgencyDraft as askOneLeadQAgent } from '../services/agencyDraft';
import { loadClients, loadCurrentClientId } from '../storage/clientStorage';
import { AssistantReaction, reactionVisuals, readableReply, spokenReply, requestReaction, resolveReaction, responseReaction } from '../assistant/reactions';
import { ConversationMemory } from '../assistant/ConversationMemory';
import { VoiceSession } from '../assistant/VoiceSession';
import { ASSISTANT_GREETING, getAssistantSpeechOptions } from '../assistant/speechVoice';
import { WEBSITE_TYPES } from './webDevelopmentWebsiteTypes';
import WebDevelopmentPanel, { type WebSessionTokenProvider } from './WebDevelopmentPanel';

const SLEEP_AFTER_MS = 60000;
const WALK_FOR_MS = 15000;

// TEMPORARY development tracing: no transcript, client context, or backend payloads.
function assistantLog(boundary: string, details?: Record<string, unknown>) {
  if (__DEV__) console.log('[Assistant] ' + boundary, details ?? '');
}

const AssistantMascot = memo(function AssistantMascot({ reaction, facingLeft = false, active }: {
  reaction: AssistantReaction; facingLeft?: boolean; active: boolean;
}) {
  const visual = reactionVisuals[reaction];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (!active || visual.frames.length < 2) return;
    const timer = setInterval(() => setFrame(value => (value + 1) % visual.frames.length), visual.frameMs);
    return () => clearInterval(timer);
  }, [active, visual]);
  return <View style={s.mascotViewport}><Image accessibilityLabel={visual.label}
    source={visual.frames[frame % visual.frames.length]} resizeMode="contain"
    style={[s.mascot, { transform: [{ scaleX: facingLeft ? -1 : 1 }] }]} /></View>;
});

export type FloatingAssistantHandle = { handleScreenTouch: () => void };
export type FloatingAssistantProps = { getWebDevelopmentSessionToken?: WebSessionTokenProvider; compactDock?: boolean; dockBottomInset?: number; wakeSignal?: string; motionPaused?: boolean };
const FloatingAssistant = forwardRef<FloatingAssistantHandle, FloatingAssistantProps>(function FloatingAssistant({ getWebDevelopmentSessionToken, compactDock = false, dockBottomInset = 0, wakeSignal, motionPaused = false }, ref) {
  const [open, setOpen] = useState(false);
  const [webWorkspaceOpen,setWebWorkspaceOpen]=useState(false);
  const [webHandoff,setWebHandoff]=useState<{clientId:string;mode:'CREATE_NEW'|'UPGRADE_EXISTING';intent:string;nonce:number;websiteType?:string}>();
  const [selectedClient,setSelectedClient]=useState<{id:string;name:string}|null>(null);
  const visibleClient=useRef<string|null>(null);
  const [webCommand,setWebCommand]=useState<{text:string;nonce:number;clientId:string}>();
  const [webMode, setWebMode] = useState(false);
  const webModeRef = useRef(false);
  const [textMode, setTextMode] = useState(false);
  const [input, setInput] = useState('');
  const [clarificationChoices, setClarificationChoices] = useState<ServiceId[]>([]);
  const [transcript, setTranscript] = useState('');
  const [message, setMessage] = useState("Hi! I'm your OneLeadQ AI Assistant. How can I help you today?");
  const [notice, setNotice] = useState('');
  const [language, setLanguage] = useState<'ta-IN' | 'en-IN'>('ta-IN');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [talking, setTalking] = useState(false);
  const [pendingReaction, setPendingReaction] = useState<AssistantReaction>('thinking');
  const [outcome, setOutcome] = useState<AssistantReaction>('idle');
  const [moving, setMoving] = useState(true);
  const [sleeping, setSleeping] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [facingLeft, setFacingLeft] = useState(true);
  const { width, height } = useWindowDimensions();
  const travel = Math.max(0, width - (compactDock ? 80 : 124));
  const walkX = useRef(new Animated.Value(0)).current;
  const mounted = useRef(true);
  const openRef = useRef(false);
  const activeRef = useRef(AppState.currentState === 'active');
  const sending = useRef(false);
  const voiceStarting = useRef(false);
  const micAttempt = useRef(0);
  const lifecycle = useRef(0);
  const ttsGeneration = useRef(0);
  const request = useRef<AbortController | null>(null);
  const voice = useRef(new VoiceSession()).current;
  const conversation = useRef(new ConversationMemory()).current;
  const recognitionEnd = useRef({ reason: 'native end (endpoint/platform reason not exposed)', startedAt: 0, speechEndObserved: false });
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function valid(epoch: number) {
    return mounted.current && openRef.current && activeRef.current && lifecycle.current === epoch;
  }
  function clearIdleTimers() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (walkTimer.current) clearTimeout(walkTimer.current);
    idleTimer.current = walkTimer.current = null;
  }
  function wake() {
    clearIdleTimers();
    setSleeping(false);
    idleTimer.current = setTimeout(() => { setSleeping(true); setMoving(false); }, SLEEP_AFTER_MS);
  }
  function cancelRecognition(reason = 'explicit cancellation') {
    recognitionEnd.current.reason = reason;
    assistantLog('recognition abort requested', { reason, sessionId: voice.current?.id });
    assistantLog('mic attempt cancelled', { attemptId: micAttempt.current, reason });
    ++micAttempt.current;
    voice.cancel();
    voiceStarting.current = false;
    setStarting(false);
    setListening(false);
    try { ExpoSpeechRecognitionModule.abort(); } catch { /* Native session may already be inactive. */ }
  }
  function stopSpeech() {
    ++ttsGeneration.current;
    setTalking(false);
    void Speech.stop().catch(() => { /* No utterance may be active. */ });
  }
  function cancelActivity(reason: string) {
    ++lifecycle.current;
    request.current?.abort();
    request.current = null;
    sending.current = false;
    setBusy(false);
    cancelRecognition(reason);
    stopSpeech();
    clearIdleTimers();
  }

  // No microphone auto-restart: the user explicitly starts each recording.
  async function speak(text: string, epoch: number) {
    const generation = ++ttsGeneration.current;
    const current = () => valid(epoch) && generation === ttsGeneration.current;
    try {
      await Speech.stop();
      if (!current()) return;
      const speechOptions = await getAssistantSpeechOptions();
      if (!current()) return;
      setTalking(true);
      const finish = () => {
        if (!current()) return;
        setTalking(false);
        setOutcome(previous => previous === 'result' ? 'success' : previous);
        wake();
      };
      const plain = spokenReply(text);
      const chunks = plain.match(/[\s\S]{1,3500}/g) ?? [];
      let index = 0;
      const speakNext = () => {
        if (!current()) return;
        if (index >= chunks.length) { finish(); return; }
        Speech.speak(chunks[index++], {
        ...speechOptions,
        onDone: speakNext, onStopped: finish,
        onError: () => { if (current()) { setTalking(false); setNotice('Speech playback unavailable. Your reply is shown above.'); wake(); } },
        });
      };
      speakNext();
    } catch {
      if (current()) { setTalking(false); setNotice('Speech playback unavailable. Your reply is shown above.'); wake(); }
    }
  }

  async function send(value = input) {
    if (webModeRef.current) { if(value.trim() && openRef.current && activeRef.current){const epoch=lifecycle.current;try{const clientId=await loadCurrentClientId();if(valid(epoch)&&webModeRef.current){setWebCommand({text:value.trim(),nonce:Date.now(),clientId:clientId||''});setInput('');}}catch{if(valid(epoch))setNotice('Unable to load the selected client.');}}return; }
    const q = value.trim();
    if (!q || sending.current || voiceStarting.current || voice.current || !openRef.current || !activeRef.current) return;
    // Set synchronously before any await; renders cannot protect against repeated events.
    sending.current = true;
    const epoch = lifecycle.current;
    const controller = new AbortController();
    request.current = controller;
    stopSpeech();
    clearIdleTimers();
    setSleeping(false);
    setBusy(true);
    setOutcome('idle');
    setPendingReaction(requestReaction(q));
    setNotice('');
    setClarificationChoices([]);
    setInput('');
    setMessage('OneLeadQ AI is processing your request…');
    try {
      // Read at send time: this host stays mounted when the selected client changes.
      const id = await loadCurrentClientId();
      const clients = id ? await loadClients() : [];
      if (!valid(epoch) || controller.signal.aborted) return;
      const client = clients.find(item => item.id === id && item.status === 'active');
      const clientId = client?.id || null;
      setSelectedClient(client?{id:client.id,name:client.name}:null);visibleClient.current=clientId;
      const history = conversation.forClient(clientId);
      const routing = resolveAgencyIntent(q);
      const handoff=webDevelopmentIntent(q,history);
      if(handoff && routing.kind !== 'clarify' && routing.kind !== 'unavailable'){webModeRef.current=true;setWebMode(true);setWebWorkspaceOpen(false);setWebHandoff({clientId:clientId||'',...handoff,nonce:Date.now()});setNotice('Website request ready. Review the selected client and configured project in the workspace. No files have changed.');void speak('Website workflow ready. Review the selected client and configured project. No files have changed.',epoch);return;}
      const result = await askOneLeadQAgent(q, client ? {
        id: client.id,
        name: client.name, businessType: client.businessType, website: client.website,
        location: client.location, services: client.services, oneLeadQServices:client.services, productsServices:client.productsServices, phone:client.phone,email:client.email,notes: client.notes,
      } : undefined, controller.signal, history);
      const currentId=await loadCurrentClientId();
      if (!valid(epoch)||controller.signal.aborted) return;
      if((currentId||null)!==clientId){conversation.forClient(currentId||null);setMessage('Selected client changed. Please send your request again.');return;}
      if(result.handoff?.kind==='web-development' && result.handoff.clientId===clientId){webModeRef.current=true;setWebMode(true);setWebWorkspaceOpen(false);setWebHandoff({clientId:clientId||'',mode:result.handoff.mode,intent:result.handoff.intent,nonce:Date.now()});setNotice(result.reply||'Review the selected client and configured project.');if(result.reply)void speak(result.reply,epoch);return;}
      if (result.clarificationRequired || result.unavailable) { setClarificationChoices(result.choices || []); setMessage(result.reply || 'Choose one service to continue.'); setOutcome('alert'); if(result.reply)void speak(result.reply,epoch); return; }
      if (!result.reply?.trim()) throw new Error('OneLeadQ AI returned an empty reply. Please try again.');
      const reply = readableReply(result.reply);
      conversation.append(clientId, q, reply);
      setMessage(reply);
      setOutcome(responseReaction(reply));
      void speak(result.reply, epoch);
    } catch {
      if (valid(epoch) && !controller.signal.aborted) {
        setOutcome('error');
        setInput(q);
        setMessage('Unable to finish this request. Check the AI backend connection and try again.');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        sending.current = false;
        if (valid(epoch)) { setBusy(false); wake(); }
      }
    }
  }

  useSpeechRecognitionEvent('start', () => {
    assistantLog('recognition start', { hasSession: !!voice.current, open: openRef.current, active: activeRef.current });
    if (!openRef.current || !activeRef.current || !voice.current || voice.current.cancelled) {
      try { ExpoSpeechRecognitionModule.abort(); } catch {}
      return;
    }
    voice.start();
    setNotice('கேட்கிறேன்… பேசுங்கள்.');
    setStarting(false);
    setListening(true);
  });
  useSpeechRecognitionEvent('speechend', () => {
    if (!voice.current || voice.current.cancelled) return;
    recognitionEnd.current.speechEndObserved = true;
    assistantLog('native speech endpoint', { sessionId: voice.current.id, note: 'May indicate silence; no app timer or restart is triggered.' });
  });
  useSpeechRecognitionEvent('speechstart', () => {
    if (voice.current && !voice.current.cancelled) recognitionEnd.current.speechEndObserved = false;
  });
  useSpeechRecognitionEvent('result', event => {
    assistantLog('recognition result', { final: event.isFinal, alternatives: event.results.length });
    if (!openRef.current || !activeRef.current || !voice.current || voice.current.cancelled) return;
    const text = event.results[0]?.transcript?.trim();
    if (!text) return;
    voice.result(text, event.isFinal);
    setTranscript(voice.current.transcript);
  });
  useSpeechRecognitionEvent('error', event => {
    assistantLog('recognition error', { code: event.error, hasSession: !!voice.current });
    if (!voice.current) {
      assistantLog(event.error === 'aborted' ? 'stale abort ignored' : 'unowned recognition error ignored', { attemptId: micAttempt.current, preparing: voiceStarting.current });
      return;
    }
    ++micAttempt.current;
    const cancelled = voice.current.cancelled;
    if (!cancelled) recognitionEnd.current.reason = event.error === 'no-speech' || event.error === 'speech-timeout'
      ? 'native silence/no-speech: ' + event.error : 'native error: ' + event.error;
    const completedBeforeSilence = !cancelled && voice.current.final
      && (event.error === 'no-speech' || event.error === 'speech-timeout');
    // A continuous recognizer may report silence after already finalizing segments.
    // Preserve those segments for terminal end; fatal errors/aborts still discard them.
    if (!completedBeforeSilence) voice.cancel();
    voiceStarting.current = false;
    if (!mounted.current) return;
    setStarting(false);
    setListening(false);
    if (cancelled || !openRef.current || !activeRef.current) return;
    if (completedBeforeSilence) { setNotice('Finishing recording…'); return; }
    setOutcome(event.error === 'no-speech' || event.error === 'speech-timeout' ? 'idle' : 'error');
    setNotice(event.error === 'no-speech' || event.error === 'speech-timeout'
      ? 'குரல் கேட்கவில்லை. மீண்டும் Mic-ஐ அழுத்திப் பேசுங்கள்.'
      : event.error === 'not-allowed' ? 'Microphone permission is required. Enable it in app settings.'
      : 'Voice recognition unavailable. Try again or use Text Chat.');
    wake();
  });
  useSpeechRecognitionEvent('end', () => {
    assistantLog('recognition end', { hasSession: !!voice.current, cancelled: voice.current?.cancelled,
      reason: voice.current ? recognitionEnd.current.reason : 'stale/unowned end',
      speechEndObserved: recognitionEnd.current.speechEndObserved,
      elapsedMs: voice.current && recognitionEnd.current.startedAt ? Date.now() - recognitionEnd.current.startedAt : undefined,
      appRecordingTimeout: false,
    });
    if (!voice.current) { assistantLog('stale end ignored', { attemptId: micAttempt.current, preparing: voiceStarting.current }); return; }
    ++micAttempt.current;
    const cancelled = voice.current.cancelled;
    const text = voice.end(); // Consume before sending; repeated end events have nothing to submit.
    voiceStarting.current = false;
    if (!mounted.current) return;
    setStarting(false);
    setListening(false);
    if (!openRef.current || !activeRef.current || cancelled) return;
    if (text) void send(text);
    else { setNotice('No final speech captured. Please try again.'); wake(); }
  });

  async function startListening() {
    const blocked = sending.current ? 'AI is processing your previous request.'
      : voiceStarting.current ? 'Preparing the microphone. Please wait…'
      : voice.current ? 'The previous recording is still finishing. Please wait or reopen the assistant.'
      : !openRef.current ? 'Open the assistant before recording.'
      : !activeRef.current ? 'Return to the app before recording.' : null;
    assistantLog('startListening entered', {
      sending: sending.current, preparing: voiceStarting.current, hasSession: !!voice.current,
      sessionCancelled: voice.current?.cancelled, open: openRef.current,
      active: activeRef.current, appState: AppState.currentState,
    });
    if (blocked) {
      assistantLog('mic blocked', { reason: blocked });
      setNotice(blocked);
      return;
    }
    const attemptId = ++micAttempt.current;
    assistantLog('mic attempt created', { attemptId });
    voiceStarting.current = true;
    // Mic preparation owns its token; unrelated speech events cannot invalidate it.
    const currentAttempt = (boundary: string) => {
      const current = micAttempt.current === attemptId && mounted.current && openRef.current && activeRef.current;
      if (!current) assistantLog('mic start cancelled', {
        boundary, attemptId, currentAttemptId: micAttempt.current,
        mounted: mounted.current, open: openRef.current, active: activeRef.current,
      });
      return current;
    };
    setStarting(true);
    setOutcome('idle');
    setNotice('Preparing to listen… மைக் தயாராகிறது…');
    setTranscript('');
    clearIdleTimers();
    setSleeping(false);
    stopSpeech();
    try {
      let permission = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      assistantLog('permission status', { attemptId, granted: permission.granted, status: permission.status, canAskAgain: permission.canAskAgain });
      if (!currentAttempt('permission status')) return;
      if (!permission.granted && permission.canAskAgain) {
        assistantLog('requesting mic permission', { attemptId });
        permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      }
      assistantLog('permission result', {
        attemptId, granted: permission.granted, status: permission.status, canAskAgain: permission.canAskAgain,
      });
      if (!currentAttempt('permission result')) return;
      if (!permission.granted) {
        setOutcome('alert');
        setNotice('Microphone permission is required. Enable it in app settings or use Text Chat.');
        return;
      }
      assistantLog('stopping TTS before recognition');
      await Speech.stop();
      if (!currentAttempt('TTS stop')) return;
      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      assistantLog('recognition availability', { available });
      if (!available) throw new Error('Recognition unavailable');
      const nativeState = await ExpoSpeechRecognitionModule.getStateAsync();
      if (!currentAttempt('native state')) return;
      assistantLog('recognition native state', { state: nativeState });
      if (nativeState !== 'inactive') throw new Error('Recognition is still stopping');
      // Installed 57.1.1 supports continuous microphone streaming on Android 13+.
      // Older Android uses native single-utterance endpointing, without app restart loops.
      const continuous = Platform.OS === 'android' && Number(Platform.Version) >= 33;
      const id = voice.begin(continuous);
      if (id === null) { assistantLog('mic blocked', { reason: 'session already occupied' }); setNotice('A recording is already active. Please wait.'); return; }
      recognitionEnd.current = { reason: 'native end (endpoint/platform reason not exposed)', startedAt: Date.now(), speechEndObserved: false };
      assistantLog('starting recognition', { attemptId, language, sessionId: id, continuous, appRecordingTimeout: false });
      ExpoSpeechRecognitionModule.start({ lang: language, interimResults: true, continuous, maxAlternatives: 1 });
    } catch (error) {
      assistantLog('mic start failed', { errorType: error instanceof Error ? error.name : typeof error });
      if (currentAttempt('start failure')) {
        cancelRecognition('native start failure');
        // A synchronous start failure may have no terminal native event.
        voice.discardUnstarted();
        setOutcome('error');
        setNotice('Unable to start voice recognition. Check your speech service or use Text Chat.');
      }
    } finally {
      if (micAttempt.current === attemptId && mounted.current) {
        voiceStarting.current = false;
        // Keep the preparation indicator until the native start event arrives.
        if (!voice.current) { setStarting(false); wake(); }
      }
    }
  }

  function toggleAssistant() {
    if (openRef.current) {
      openRef.current = false;
      cancelActivity('assistant closed');
      setOpen(false);
      webModeRef.current = false;
      setWebMode(false);
      setTextMode(false);
      setOutcome('idle');
      setMoving(true);
      wake();
    } else {
      openRef.current = true;
      ++lifecycle.current;
      setOpen(true);
      setMoving(false);
      setOutcome('greeting');
      setNotice('');
      setMessage(ASSISTANT_GREETING);
      wake();
      void speak(ASSISTANT_GREETING, lifecycle.current);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      assistantLog('app state changed', { state, attemptId: micAttempt.current, preparing: voiceStarting.current, hasSession: !!voice.current });
      const foreground = state === 'active';
      activeRef.current = foreground;
      setActive(foreground);
      if (!foreground) {
        const interrupted = sending.current;
        cancelActivity('app ' + state);
        setMoving(false);
        if (interrupted) { setOutcome('alert'); setMessage('Request interrupted when the app entered the background. Please try again.'); }
      } else { wake(); }
    });
    wake();
    return () => {
      mounted.current = false;
      openRef.current = false;
      ++lifecycle.current;
      ++micAttempt.current;
      assistantLog('mic attempt cancelled', { reason: 'component unmounted' });
      ++ttsGeneration.current;
      request.current?.abort();
      recognitionEnd.current.reason = 'component unmounted';
      voice.cancel();
      clearIdleTimers();
      try { ExpoSpeechRecognitionModule.abort(); } catch {}
      void Speech.stop().catch(() => {});
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (compactDock || open || !active || sleeping || !moving || travel === 0) return;
    let stopped = false;
    let animation: Animated.CompositeAnimation | null = null;
    function step(left: boolean) {
      if (stopped) return;
      setFacingLeft(left);
      animation = Animated.timing(walkX, { toValue: left ? -travel : 0, duration: 6500, useNativeDriver: true });
      animation.start(({ finished }) => { if (finished && !stopped) step(!left); });
    }
    walkX.stopAnimation(value => step(value > -travel + 2));
    walkTimer.current = setTimeout(() => setMoving(false), WALK_FOR_MS);
    return () => { stopped = true; animation?.stop(); walkX.stopAnimation(); if (walkTimer.current) clearTimeout(walkTimer.current); };
  }, [compactDock, open, active, sleeping, moving, travel, walkX]);

  useEffect(()=>{if(!open)return;let disposed=false;void(async()=>{try{const id=await loadCurrentClientId();const clients=await loadClients();if(disposed)return;const client=clients.find(c=>c.id===id && c.status==='active');const next=client?.id||null;if(visibleClient.current!==next){conversation.forClient(next);setMessage(ASSISTANT_GREETING);setWebCommand(undefined);setWebHandoff(undefined);setWebWorkspaceOpen(false);}visibleClient.current=next;setSelectedClient(client?{id:client.id,name:client.name}:null);}catch{if(!disposed)setNotice('Unable to load the selected client.');}})();return()=>{disposed=true;};},[open,active]);

  useEffect(() => { if (wakeSignal !== undefined && activeRef.current) wake(); }, [wakeSignal]);

  useImperativeHandle(ref, () => ({ handleScreenTouch() {
    if (!openRef.current && !compactDock) setMoving(false);
    wake();
  } }));

  const reaction = resolveReaction([
    outcome === 'error' && 'error', outcome === 'alert' && 'alert', (starting || listening) && 'listening',
    talking && 'talking', busy && pendingReaction,
    (!sleeping || outcome === 'error' || outcome === 'alert') && outcome,
    sleeping && 'sleeping',
    !open && moving && active && 'walking',
  ]);
  const ui = reactionVisuals[reaction];
  function handleMicPress() {
    assistantLog('mic press', { busy, starting, listening });
    wake();
    if (listening) {
      recognitionEnd.current.reason = 'user stop';
      assistantLog('stopping recognition', { reason: 'user stop', sessionId: voice.current?.id });
      setNotice('Finishing recording…');
      try { ExpoSpeechRecognitionModule.stop(); }
      catch { cancelRecognition(); setNotice('Unable to stop recording. Please try again.'); }
    } else {
      void startListening();
    }
  }
  const voiceBusy = busy || starting;
  return <View pointerEvents="box-none" style={s.layer}>
    {open && <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={12}
      style={[s.keyboardLayer, { paddingBottom: Math.min(212, height * 0.22) }]} pointerEvents="box-none">
      <View onTouchStart={() => assistantLog('panel touch')} style={[s.panel, { width: Math.min(340, width - 24), maxHeight: height * 0.68 }]}>
        <View style={s.head}><View><Text style={s.title}>OneLeadQ Assistant</Text>
          <Text style={[s.state, { color: ui.accent }]} accessibilityLiveRegion="polite">{starting ? 'Preparing to listen…' : ui.label}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close assistant" onPress={toggleAssistant} style={s.close}><Ionicons name="close" size={20} /></Pressable></View>
        <ScrollView key={webMode ? "web-launcher" : "normal-chat"} accessibilityLabel="Assistant scrollable content" style={s.contentScroll} contentContainerStyle={s.contentBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!!notice && <Text style={s.voiceHint} accessibilityLiveRegion="polite">{notice}</Text>}
        {!webMode && <Pressable accessibilityRole="button" accessibilityLabel="Clear conversation history"
          onPress={() => { cancelActivity('conversation cleared'); conversation.clear(); setMessage(ASSISTANT_GREETING); setOutcome('idle'); setNotice('Recent conversation cleared.'); wake(); }}
          style={s.keyboardButton}><Text style={s.keyboardText}>Clear conversation</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={webMode ? 'Return to normal assistant chat' : 'Enter Web Development mode'}
          onPress={() => {
            cancelActivity('assistant mode changed');setWebCommand(undefined);setWebHandoff(undefined);setWebWorkspaceOpen(false);
            webModeRef.current = !webModeRef.current;
            setWebMode(webModeRef.current);
            setNotice(''); setOutcome('idle'); wake();
          }} style={s.keyboardButton}><Text style={s.keyboardText}>{webMode ? 'Back to normal chat' : 'Web Development'}</Text></Pressable>
        <Text style={s.voiceHint}>Current client: {selectedClient?.name||'No active client selected'}</Text>
          {webMode ? <View style={s.webLauncher}>
            <Text accessibilityLabel="Selected Web Development mode" style={s.webText}>Mode: {webHandoff?.mode || 'Choose a mode'}</Text>
            <View style={s.actions}>{(['CREATE_NEW','UPGRADE_EXISTING'] as const).map(mode => <Pressable key={mode} accessibilityRole="button" accessibilityLabel={mode==='CREATE_NEW'?'New Website':'Upgrade Existing Website'} accessibilityState={{selected:webHandoff?.mode===mode}} onPress={()=>{setWebHandoff({clientId:selectedClient?.id||'',mode,intent:mode==='CREATE_NEW'?'create':'upgrade',nonce:Date.now()});}} style={s.chip}><Text style={s.chipText}>{mode==='CREATE_NEW'?'New Website':'Upgrade Existing Website'}</Text></Pressable>)}</View>
            <Pressable accessibilityRole="button" accessibilityLabel="Open Web Development workspace" onPress={()=>setWebWorkspaceOpen(true)} style={s.keyboardButton}><Text style={s.keyboardText}>Open Web Development Workspace</Text></Pressable>
            {webHandoff?.mode==='CREATE_NEW' && <>
              <Text style={s.webText}>STATIC_HTML website types</Text>
              <Text style={s.webText}>Static presentation only; no checkout, booking engine, publishing system or SaaS app.</Text>
              <ScrollView horizontal nestedScrollEnabled accessibilityLabel="Supported static website types" style={s.typeScroll} keyboardShouldPersistTaps="handled">
                {WEBSITE_TYPES.map(type=><Pressable key={type.id} accessibilityRole="button" accessibilityLabel={`Website type: ${type.label}`} accessibilityState={{selected:webHandoff.websiteType===type.id}} onPress={()=>setWebHandoff({...webHandoff,websiteType:type.id,nonce:Date.now()})} style={[s.typeChip,webHandoff.websiteType===type.id&&s.typeSelected]}><Text style={s.chipText}>{type.label}</Text></Pressable>)}
              </ScrollView>
            </>}
            <Text style={s.webText}>Select the configured project in the workspace. Analysis and all approvals stay there.</Text>
          </View> : <><View style={s.reply}><View style={s.replyMascot}><AssistantMascot reaction={reaction} active={active} /></View>
            <Text selectable style={s.replyText}>{message}</Text></View>
        {clarificationChoices.map(id=>{const choice=serviceRegistry.find(item=>item.id===id)!;return <Pressable key={id} accessibilityRole="button" accessibilityLabel={'Choose '+choice.name} style={s.keyboardButton}
          onPress={()=>{stopSpeech();setTextMode(true);setInput(choice.exampleCommand);setClarificationChoices([]);setMessage('Service selected. Review the input and send when ready. No request has been submitted.');}}><Text style={s.keyboardText}>{choice.name}{choice.status==='PLANNED'?' (planned)':''}</Text></Pressable>;})}
          {!!transcript && <Text selectable style={s.voiceHint}>You said: {transcript}</Text>}</>}
        {<>
        {talking && <Pressable accessibilityRole="button" onPress={stopSpeech} style={s.keyboardButton}><Text style={s.keyboardText}>Stop speaking</Text></Pressable>}
        {!textMode ? <View style={s.voiceBox}>
          <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Finish voice recording' : 'Start voice listening'}
            accessibilityState={{ busy: voiceBusy }}
            onLayout={event => { const { x, y, width, height } = event.nativeEvent.layout; assistantLog('mic layout', { x, y, width, height }); }}
            onPressIn={() => assistantLog('mic press-in')}
            onPress={handleMicPress}
            style={({ pressed }) => [s.bigMic, (starting || listening) && s.bigMicListening,
              pressed && { opacity: 0.65, transform: [{ scale: 0.95 }] }, busy && { opacity: 0.5 }]}>
            <Ionicons name={listening ? 'stop' : 'mic-outline'} size={34} color="white" /></Pressable>
          <Text style={s.voiceTitle}>{listening ? 'Listening…' : starting ? 'Preparing to listen…' : busy ? 'Processing…' : 'Voice Chat'}</Text>
          <Text style={s.voiceHint}>{listening ? 'பேசுங்கள்… முடிக்க Stop-ஐ அழுத்துங்கள்' : 'Mic-ஐ அழுத்திப் பேசலாம்'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Change recognition language" disabled={listening || voiceBusy}
            onPress={() => { wake(); setLanguage(v => v === 'ta-IN' ? 'en-IN' : 'ta-IN'); }} style={s.keyboardButton}>
            <Text style={s.keyboardText}>{language === 'ta-IN' ? 'தமிழ் · Switch to English' : 'English · தமிழுக்கு மாற்று'}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { ++lifecycle.current; cancelRecognition('switched to text chat'); stopSpeech(); setTextMode(true); wake(); }}
            disabled={busy} style={s.keyboardButton}><Text style={s.keyboardText}>Text Chat</Text></Pressable>
        </View> : <View style={s.textBox}>
          <View style={s.textModeHead}><Text style={s.textModeTitle}>Text Chat</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setTextMode(false); wake(); }} style={s.voiceSwitch}><Text style={s.keyboardText}>Voice</Text></Pressable></View>
          <View style={s.inputRow}><TextInput value={input} editable={!busy} onChangeText={text => { setInput(text); wake(); }}
            onSubmitEditing={() => void send()} accessibilityLabel="Message OneLeadQ assistant" placeholder="Type your message…" style={s.input} />
            <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={busy || !input.trim()}
              onPress={() => void send()} style={[s.send, (busy || !input.trim()) && { opacity: 0.5 }]}><Ionicons name="arrow-up" size={20} color="white" /></Pressable></View>
        </View>}
        </>}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>}
    {open && webWorkspaceOpen && <Modal visible animationType="slide" onRequestClose={()=>setWebWorkspaceOpen(false)}>
      <KeyboardAvoidingView style={s.workspace} behavior={Platform.OS==='ios'?'padding':'height'}>
        <Pressable accessibilityRole="button" accessibilityLabel="Return to compact assistant" onPress={()=>setWebWorkspaceOpen(false)} style={s.keyboardButton}><Text style={s.keyboardText}>Back to assistant</Text></Pressable>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.workspaceBody}>
          <WebDevelopmentPanel handoff={webHandoff} onCommandConsumed={()=>setWebCommand(undefined)} command={webCommand} active={active} getSessionToken={getWebDevelopmentSessionToken} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>}
    {compactDock ? <RoamingAssistant active={!open && active} awake={!sleeping} bottomInset={dockBottomInset} onOpen={toggleAssistant} onWake={wake} paused={motionPaused}>
      {(running, walking, left) => <AssistantMascot reaction={reaction === 'walking' ? (walking ? (running ? 'running' : 'walking') : 'idle') : reaction} active={active && !sleeping} facingLeft={left} />}
    </RoamingAssistant> : <Animated.View pointerEvents="box-none" style={[s.walker, compactDock && { bottom: 8 }, { transform: [{ translateX: open ? 0 : walkX }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Close OneLeadQ assistant' : 'Open OneLeadQ assistant'} onPress={toggleAssistant} style={[s.bot, compactDock && { width: 56, height: 56 }]}>
        <AssistantMascot reaction={reaction} active={active} facingLeft={!open && facingLeft} />
      </Pressable>
    </Animated.View>}
  </View>;
});
export default FloatingAssistant;

const s=StyleSheet.create({
 layer:{position:'absolute',top:0,right:0,bottom:0,left:0,zIndex:999,elevation:30,pointerEvents:'box-none'},
 walker:{zIndex:1,position:'absolute',right:12,bottom:82,alignItems:'flex-end'},
 bot:{width:100,height:122,alignItems:'center',justifyContent:'flex-end',shadowColor:'#000',shadowOpacity:.16,shadowRadius:8,shadowOffset:{width:0,height:4}},
 mascotViewport:{width:'100%',height:'100%',overflow:'hidden',alignItems:'center',justifyContent:'flex-end'},
 mascot:{width:'100%',height:'100%'},
 keyboardLayer:{zIndex:2,position:'absolute',top:0,right:0,bottom:0,left:0,justifyContent:'flex-end',alignItems:'flex-end',paddingRight:12,paddingBottom:212},
 panel:{flexShrink:1,backgroundColor:'#FFFDF8',borderRadius:22,padding:14,borderWidth:1,borderColor:'#E5D8A8',shadowColor:'#000',shadowOpacity:.18,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:24},
 contentScroll:{flexGrow:0,flexShrink:1},
 contentBody:{paddingBottom:8},
 webLauncher:{alignItems:'stretch',gap:8,paddingVertical:8},
 webText:{color:'#26312E',lineHeight:19},
 typeScroll:{flexGrow:0},
 typeChip:{maxWidth:240,marginRight:8,borderWidth:1,borderColor:'#D8CFB2',borderRadius:14,padding:10,justifyContent:'center'},
 typeSelected:{backgroundColor:'#E9F1EE',borderColor:'#0B5D4B'},
 workspace:{flex:1,paddingTop:40,paddingHorizontal:12,backgroundColor:'#FFFDF8'},
 workspaceBody:{paddingBottom:40},
 head:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 title:{fontSize:16,fontWeight:'900',color:'#0B5D4B'},
 state:{fontSize:11,fontWeight:'800',marginTop:2},
 close:{width:38,height:38,borderRadius:19,backgroundColor:'#F0EDE4',alignItems:'center',justifyContent:'center'},
 reply:{flexDirection:'row',gap:10,alignItems:'center',backgroundColor:'white',padding:10,borderRadius:16,marginTop:10},
 replyMascot:{width:52,height:70},
 replyText:{flex:1,color:'#26312E',lineHeight:19},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},
 chip:{borderWidth:1,borderColor:'#D8CFB2',borderRadius:16,paddingHorizontal:11,paddingVertical:8},
 chipText:{fontSize:12,fontWeight:'800',color:'#0B5D4B'},
 voiceBox:{alignItems:'center',marginTop:12,paddingVertical:12},
 bigMic:{width:72,height:72,borderRadius:36,backgroundColor:'#0B5D4B',alignItems:'center',justifyContent:'center'},
 bigMicListening:{transform:[{scale:1.08}]},
 voiceTitle:{fontSize:16,fontWeight:'900',color:'#0B5D4B',marginTop:9},
 voiceHint:{fontSize:12,fontWeight:'700',color:'#5F6E69',marginTop:4,textAlign:'center'},
 keyboardButton:{marginTop:12,flexDirection:'row',alignItems:'center',gap:6,borderWidth:1,borderColor:'#D8CFB2',borderRadius:16,paddingHorizontal:13,paddingVertical:8,backgroundColor:'white'},
 keyboardText:{fontSize:12,fontWeight:'800',color:'#0B5D4B'},
 textBox:{marginTop:10},
 textModeHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 textModeTitle:{fontSize:14,fontWeight:'900',color:'#0B5D4B'},
 voiceSwitch:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:'#D8CFB2',borderRadius:14,paddingHorizontal:10,paddingVertical:7,backgroundColor:'white'},
 inputRow:{flexDirection:'row',gap:8,marginTop:10},
 input:{flex:1,minHeight:44,borderWidth:1,borderColor:'#D8CFB2',borderRadius:14,paddingHorizontal:12,backgroundColor:'white'},
 send:{width:44,height:44,borderRadius:14,backgroundColor:'#0B5D4B',alignItems:'center',justifyContent:'center'}
});

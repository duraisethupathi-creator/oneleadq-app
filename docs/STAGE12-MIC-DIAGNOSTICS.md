# Stage 12 Android mic follow-up

## Device evidence supplied by the user

Development APK, Metro connection, dashboard, assistant visibility/opening, Tamil UI and mic visibility passed. The prior RNSScreen crash was not reproduced. Mic tap produced no visible reaction. Speech/transcript/AI/TTS acceptance remains pending.

## What is established

The large mic Pressable had onPress attached to an inline callback which called startListening(), or stop() while listening. AssistantHost and the assistant/keyboard overlay use box-none. The root onTouchStart is a passive bubbling notification, not a responder capture.

Confirmed code problems: mic disabled={busy || starting} prevented handler execution while busy/preparing; startListening's five guards returned without visible explanation; there were no mic-path console logs; finally cleared the preparing indicator immediately after native start() returned, rather than waiting for the native start event. The short-screen panel offset could overlap the avatar's 82–204px bottom region, and the panel/avatar sibling stacking order was implicit.

These are fixed or instrumented. They do NOT establish which one caused the user's initial tap failure. Exact physical-device root cause is unconfirmed until the instrumented tap trace is observed. No missing native module is assumed.

## Changes in this follow-up

Only src/components/FloatingAssistant.tsx and this report changed in this follow-up. Previously edited files remain intact.

- Named handleMicPress directly attached to the large mic Pressable.
- Button remains touchable while busy/preparing so each tap is logged and guard rejection produces a visible explanation; synchronous voice/request guards still prevent duplicates.
- Pressed appearance, Preparing to listen title/reaction and notice are set before awaiting permission. Preparing remains until recognition start/end/error/timeout.
- Permission/guard messages are outside the reply scroller, making them visible without scrolling through an AI reply.
- Explicit panel zIndex 2 and avatar zIndex 1; panel bottom offset 212 clears the avatar's top at 204; panel can shrink in constrained layouts. Fullscreen layers remain box-none.
- Development-only temporary tracing for panel touch, mic layout/press-in/press, guards, permission, TTS stop, availability/native state, recognition start/result/end/error. No transcripts, client context, provider keys or backend payloads are logged.
- requestPermissionsAsync runs before awaiting TTS stop. Recognition still waits for TTS to stop and requires permission.granted, recognition availability and native inactive state.

## Actual installed API

expo-speech-recognition 57.1.1 was verified from its installed package.json and build/ExpoSpeechRecognitionModule.types.d.ts. Installed declarations confirm requestPermissionsAsync(): Promise<PermissionResponse>, isRecognitionAvailable(): boolean, getStateAsync(): Promise<'inactive'|'starting'|'recognizing'|'stopping'>, start(options): void, stop(): void and abort(): void. Permission granted/status/canAskAgain fields are used. Recognition starts with ta-IN (or en-IN selected in UI), interimResults:true, continuous:false and maxAlternatives:1. No dependency or native configuration changed.

## Mic and permission path

Pressable.onPressIn -> pressed appearance + mic press-in log
Pressable.onPress -> handleMicPress -> mic press log -> wake
  -> while listening: stop() -> final result/end -> consume-once send
  -> otherwise: startListening -> log guard snapshot
     -> blocked: mic blocked log + visible reason
     -> allowed: synchronous voiceStarting guard + Preparing to listen UI
        -> requesting mic permission log -> requestPermissionsAsync
        -> permission result log (granted/status/canAskAgain only)
        -> denied: visible permission message, alert reaction, preparation cleanup
        -> granted: await Speech.stop -> isRecognitionAvailable -> getStateAsync
        -> voice.begin -> starting recognition log -> start(options)
        -> recognition start log -> Listening UI
        -> final recognition result -> end -> exactly-once AI send -> response -> TTS

Close/background lifecycle checks still cancel pending work. Native start/error/end events are logged before their own guards, so ignored events remain diagnosable.

## Validation

- npx tsc --noEmit: PASS (final source).
- node scripts/test-assistant.cjs: PASS (existing voice deduplication/cancellation, reaction and transport tests). This does not simulate Android touch delivery.
- npx expo doctor: local CLI reports unsupported and directs to npx expo-doctor.
- npx expo-doctor: PASS, 21/21 checks.
- npx expo install --check: PASS, dependencies are up to date.
- git diff --check: PASS.
- No physical mic test was executed by the agent.

**DEVELOPMENT APK REBUILD NOT REQUIRED.** This follow-up changes JS/TS and documentation only. Use the fresh development APK already tested by the user.

## Device retest

Run npx expo start --dev-client --clear in D:\MY AGENT\oneleadq-app, reload the development client, open the assistant and tap the large mic once. Observe the React Native DevTools JavaScript console as well as Metro.

Expected boundaries: mic press-in -> mic press -> startListening entered -> requesting mic permission -> permission result -> stopping TTS before recognition -> recognition availability -> recognition native state -> starting recognition -> recognition start. Panel touch may appear among the press logs because touch events bubble.

- No panel touch or mic press-in: touch delivery/layout remains the first broken boundary; native speech has not been implicated. Verify the new JS actually loaded (mic layout should log when the panel opens).
- Panel touch but no mic press-in: the touch did not reach the mic Pressable.
- Press-in without mic press: the press was cancelled before release.
- Mic press followed by mic blocked: the logged guard and visible reason identify the blocked state.
- Requesting permission without permission result: permission request has not resolved.
- Permission result with granted:false: denied permission; follow the visible settings/text-chat guidance.
- Starting recognition followed by error: inspect the logged recognition error code before changing native setup.

Full acceptance remains pending: mic tap -> visible preparation/listening -> permission -> recognition -> Tamil transcript -> exactly one AI request -> AI response -> TTS. No commit or push was performed.

## Follow-up: granted permission cancelled before recognition start

Device logs confirmed press-in/onPress, open/active state, and granted permission. They stopped at the permission-result validity check. The previous no-session error/end handlers already returned without mutation; therefore the logs do not prove those unowned events themselves changed lifecycle state. The actual code coupling was mic preparation's use of the shared lifecycle epoch. App-state cleanup during a permission activity is a plausible source, now explicitly logged rather than assumed.

Changed in this follow-up:
- src/components/FloatingAssistant.tsx
- scripts/test-assistant-mic.cjs (new)
- docs/STAGE12-MIC-DIAGNOSTICS.md (this update)

Preparation now creates a monotonically increasing micAttempt token before awaiting permission. After every await, the same token, mounted/open state and active state must still hold. Close, explicit cancellation, background/inactive and unmount invalidate it. Error/end events with no owned recognition session log stale abort ignored/stale end ignored and do not change the token or preparing state. Genuine owned-session errors and end events still invalidate/consume the current session; duplicate-request protection remains. An older attempt's finally block cannot clear a newer attempt's flags. Native events have no session ID, so active ownership still uses VoiceSession and the native inactive-state gate.

The installed 57.1.1 getPermissionsAsync declaration was checked. Each start checks status first and requests permission only when not granted and canAskAgain is true. Denied permission still shows the existing visible alert. Already-granted permission avoids repeatedly entering the native permission-request path. Real background/inactive cancellation is intentionally preserved; if it occurs again, app state changed and mic attempt cancelled logs identify it.

Validation: final TypeScript PASS; existing assistant regression tests PASS; new component regression tests PASS; Expo dependency check PASS. New tests exercise the actual component with mocked native events and deferred permission promises: stale abort/end during status/request, granted permission reuse, first permission request, close/background/unmount, active-session abort, and exactly-one AI submission. These do not replace a phone test.

Expected next trace:
mic press -> mic attempt created {attemptId} -> permission status -> [requesting mic permission only if needed] -> permission result granted -> stopping TTS before recognition -> recognition availability -> recognition native state inactive -> starting recognition {attemptId,sessionId} -> recognition start -> visible Listening. Any no-session abort/end may log stale abort ignored/stale end ignored without disrupting that sequence.

DEVELOPMENT APK REBUILD NOT REQUIRED. This follow-up changes only JS/TS and documentation. No native dependency/configuration changes, commit or push. Next phone acceptance is progression to starting recognition and recognition start with visible Listening. Tamil transcript/AI/TTS verification remains pending.

Final Expo Doctor result for this follow-up: PASS, 21/21 checks.

## Follow-up: recording duration and native endpointing

The user confirmed mic tap, granted permission, recognition start, Tamil recognition, transcript UI and no crash on Android. They reported an approximately 10-second automatic stop.

Search findings: active FloatingAssistant.tsx had LISTEN_LIMIT_MS=20000 and a timer that aborted recognition after 20 seconds, even while speaking. It had no active 10000/10*1000 timeout. A 10-second no-speech stop remains in preserved, unimported backups: FloatingAssistant-current-full.txt, FloatingAssistant.voice-source.bak and src/components/FloatingAssistant.voice-backup.tsx. Those backups were retained. The active component also used continuous:false. Installed native code ends that mode on its final result. Therefore the previous 20-second app limit is confirmed, but an observed stop at roughly 10 seconds cannot be attributed to that timer without the end trace; a native endpoint/service limit or older loaded JS must be distinguished. No exact native cause is claimed from elapsed time alone.

Changes in this follow-up:
- src/components/FloatingAssistant.tsx: removed the recording timeout, timer ref and timer cleanup entirely; supported continuous:true on Android API 33+; native single-utterance fallback on older Android; manual stop retained; reasons/elapsed time/native speech endpoint and appRecordingTimeout:false logged; silence after finalized segments retains them for terminal submission.
- src/assistant/VoiceSession.ts: continuous mode accumulates final segments and current interim text for display. Only finalized speech is consumed once on end. Fatal errors, aborts and lifecycle cancellation still discard it.
- scripts/test-assistant.cjs: continuous final-segment/interim/cancellation coverage.
- scripts/test-assistant-mic.cjs: continuous options, simulated 90-second listening with no stop/abort/restart, manual stop with combined transcript and one AI call, older Android native end and silence after final segments.
- docs/STAGE12-MIC-DIAGNOSTICS.md: this update.

Version 57.1.1 installed declarations and Android implementation were inspected. continuous is supported; its Android 13+ implementation streams microphone audio through EXTRA_AUDIO_SOURCE and segmented sessions. continuous is documented unsupported on Android 12 and below, so those devices use continuous:false without an app timer. No speculative intent extras, oversized silence values or restart loop were introduced.

Expected UX: first tap starts Tamil ta-IN listening. Speaking can continue while the selected native engine supports it, with all finalized segments retained. Second tap invokes stop(), waits for final results/end, and submits once. Native end is honored without restart. Some continuous engines keep streaming across silence and require the second tap; automatic silence completion cannot be guaranteed by this API. Native speechend is diagnostic only, not an app stop trigger. Native no-speech/speech-timeout is logged as silence/no-speech; a generic end is logged as native end (endpoint/platform reason not exposed), not falsely classified as proven silence. Lifecycle/explicit cancellation and user stop are logged separately. There is no explicit app recording timeout left.

Validation: final npx tsc --noEmit PASS; both assistant regression scripts PASS; npx expo-doctor PASS 21/21; npx expo install --check PASS; git diff --check PASS. Device validation beyond the reported successes remains pending. Retest speaking longer than 20 seconds, then stop manually, and separately test silence/native end; verify the full combined transcript leads to one AI request and TTS.

DEVELOPMENT APK REBUILD NOT REQUIRED. This follow-up changes JS/TS and documentation only, with no dependency/native configuration changes. No commit or push.

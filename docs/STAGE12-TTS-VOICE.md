# Stage 12 local TTS voice quality

This follow-up changes JS/TS only. DEVELOPMENT APK REBUILD NOT REQUIRED. No cloud/paid TTS dependency, native configuration change, commit or push.

Files changed: src/assistant/speechVoice.ts (new), src/components/FloatingAssistant.tsx, scripts/test-assistant.cjs, scripts/test-assistant-mic.cjs (helper import in native mock), docs/STAGE12-TTS-VOICE.md. Existing work remains intact.

Installed expo-speech declarations were inspected: getAvailableVoicesAsync returns identifier/name/language/quality; SpeechOptions supports voice/language/rate/pitch. Native device voice inventory is queried at runtime for every greeting/reply. The agent cannot directly enumerate the physical phone's installed voices from the desktop.

The reusable helper prefers ta-IN, then other Tamil locales, explicitly named Indian multilingual voices, then en-IN. Enhanced quality wins within each locale tier. Only identifiers returned in the current device inventory are used. If no suitable voice exists or enumeration fails, voice and language are omitted so the operating system uses its default. No hardcoded provider voice identifier or speculative multilingual flag is used. Expo exposes no multilingual-capability metadata; matching a multilingual name is only a selection hint, not proof of pronunciation quality.

Greeting and AI replies share the helper and deterministic Tamil-first selection, rate 0.92 and natural pitch 1.0. The greeting displays and speaks exactly: Hi dude! என்ன உதவி வேண்டும்? The speaking rate is slightly below normal, without exaggerated pitch. The existing generation/lifecycle guards prevent a delayed greeting from restarting speech after mic activation or assistant close. No microphone auto-start is added.

AI reply UI is set before asynchronous voice lookup and playback. Recognition, ta-IN, selected-client context, agent routing, exactly-once request protection and the reaction engine remain in place. Existing long-reply chunks and Stop speaking are retained.

Development logs show [Assistant TTS] selected voice, language, rate and pitch. They contain device voice metadata only, not transcripts, client context or AI/provider credentials. On-device listening remains necessary to assess naturalness and mixed Tamil/English pronunciation; local synthesis quality depends on the engine and installed voice data.

Validation: TypeScript PASS; existing assistant and component regression suites PASS; voice ranking, enhanced Tamil preference, Indian fallback, missing/removed inventory and system default covered; Expo dependency check PASS. Next device check: reload JS, open assistant, listen to the greeting and inspect the selected-voice logs; then request a mixed Tamil/English reply and verify speech/reactions plus mic interruption.

Final Expo Doctor: PASS, 21/21 checks.

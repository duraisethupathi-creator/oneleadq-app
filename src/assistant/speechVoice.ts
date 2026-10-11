import * as Speech from 'expo-speech';

export const ASSISTANT_GREETING = 'Hi dude! என்ன உதவி வேண்டும்?';
const RATE = 0.92;
const PITCH = 1.0;
const locale = (voice: Speech.Voice) => voice.language.replace(/_/g, '-').toLowerCase();

// expo-speech exposes locale and quality, but no multilingual-capability flag.
// Only treat a voice as explicitly multilingual when its supplied name says so.
export function selectAssistantVoice(voices: Speech.Voice[]): Speech.Voice | undefined {
  const rank = (voice: Speech.Voice) => {
    const language = locale(voice);
    if (language === 'ta-in') return 0;
    if (language.startsWith('ta-') || language === 'ta') return 1;
    if (language.endsWith('-in') && /multilingual|multi[- ]?language/i.test(voice.name)) return 2;
    if (language === 'en-in') return 3;
    return 4;
  };
  return voices.filter(voice => voice.identifier && rank(voice) < 4).sort((a, b) =>
    rank(a) - rank(b)
    || Number(b.quality === 'Enhanced') - Number(a.quality === 'Enhanced')
    || a.identifier.localeCompare(b.identifier)
  )[0];
}

export async function getAssistantSpeechOptions(): Promise<Speech.SpeechOptions> {
  let selected: Speech.Voice | undefined;
  try {
    // Query each utterance: never keep an identifier for a voice removed from the device.
    selected = selectAssistantVoice(await Speech.getAvailableVoicesAsync());
  } catch {
    // No known suitable installed voice: leave voice/language unset for system defaults.
  }
  const options: Speech.SpeechOptions = { rate: RATE, pitch: PITCH };
  if (selected) { options.voice = selected.identifier; options.language = selected.language; }
  if (__DEV__) {
    console.log('[Assistant TTS] selected voice', selected ? {
      identifier: selected.identifier, name: selected.name, quality: selected.quality,
    } : 'system default');
    console.log('[Assistant TTS] language', options.language ?? 'system default');
    console.log('[Assistant TTS] rate', RATE);
    console.log('[Assistant TTS] pitch', PITCH);
  }
  return options;
}

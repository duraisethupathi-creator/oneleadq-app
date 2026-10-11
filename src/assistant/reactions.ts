import type { ImageSourcePropType } from 'react-native';

export type AssistantReaction = 'idle' | 'walking' | 'running' | 'greeting' | 'talking'
  | 'listening' | 'thinking' | 'idea' | 'excited' | 'success' | 'alert' | 'analyzing'
  | 'working' | 'result' | 'error' | 'sleeping' | 'pointingRight' | 'pointingLeft'
  | 'presenting' | 'holdingBoard' | 'announcement' | 'thankYou';

export const walkFrames: ImageSourcePropType[] = [
  require('../../asset/assistant/walk/walk_01.png'),
  require('../../asset/assistant/walk/walk_02.png'),
  require('../../asset/assistant/walk/walk_03.png'),
  require('../../asset/assistant/walk/walk_04.png'),
  require('../../asset/assistant/walk/walk_05.png'),
  require('../../asset/assistant/walk/walk_06.png'),
  require('../../asset/assistant/walk/walk_07.png'),
  require('../../asset/assistant/walk/walk_08.png'),
];

type ReactionVisual = {
  label: string; accent: string; priority: number; frames: ImageSourcePropType[];
  frameMs: number; assetMissing: boolean;
};
const fallback = (label: string, priority: number, accent = '#0B5D4B'): ReactionVisual => ({
  label, priority, accent, frames: [walkFrames[0]], frameMs: 160, assetMissing: true,
});
// Only walking artwork exists. Never use the reference sheet or unrelated imagery at runtime.
export const reactionVisuals: Record<AssistantReaction, ReactionVisual> = {
  idle: fallback('Ready', -1),
  sleeping: fallback('Resting', 0),
  walking: { ...fallback('Walking', 10), frames: walkFrames, assetMissing: false },
  running: { ...fallback('Running', 10), frames: walkFrames, frameMs: 90 },
  greeting: fallback('Hello!', 20),
  idea: fallback('Suggestion', 20),
  excited: fallback('Great!', 20),
  pointingRight: fallback('Look here', 20),
  pointingLeft: fallback('Look here', 20),
  presenting: fallback('Explaining', 20),
  holdingBoard: fallback('Report ready', 20),
  announcement: fallback('Update', 20),
  thankYou: fallback('Thank you', 20),
  success: fallback('Done', 30),
  result: fallback('Result ready', 30),
  thinking: fallback('Thinking…', 40, '#9A6B16'),
  analyzing: fallback('Analyzing…', 50, '#9A6B16'),
  working: fallback('Working…', 50, '#9A6B16'),
  talking: fallback('Speaking…', 60),
  listening: fallback('Listening…', 70),
  alert: fallback('Needs attention', 80, '#B34038'),
  error: fallback('Unable to finish', 90, '#B34038'),
};
export function resolveReaction(candidates: Array<AssistantReaction | null | false>): AssistantReaction {
  return candidates.reduce<AssistantReaction>((best, next) =>
    next && reactionVisuals[next].priority > reactionVisuals[best].priority ? next : best, 'idle');
}
// This describes the request, not a claim that the backend has emitted live progress.
export function requestReaction(text: string): AssistantReaction {
  if (/seo|audit|analy[sz]|check|review|சரிபார்/i.test(text)) return 'analyzing';
  if (/create|write|build|generate|உருவாக்க/i.test(text)) return 'working';
  return 'thinking';
}
export function responseReaction(text: string): AssistantReaction {
  if (/approval required|requires approval|needs approval|ஒப்புதல் தேவை/i.test(text)) return 'alert';
  if (/recommend|suggest|பரிந்துரை/i.test(text)) return 'idea';
  if (/report|அறிக்கை/i.test(text)) return 'holdingBoard';
  return 'result';
}
export function readableReply(text: string): string {
  return text.replace(/\x60{3}[^\n]*\n([\s\S]*?)\x60{3}/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
    .replace(/\x60([^\x60]+)\x60/g, '$1').replace(/^\s*[-*]\s+/gm, '• ').trim();
}

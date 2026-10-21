import { createDraft, readDraft, cancelDraft } from './orchestrator';
import { trustedWindows } from './trustedWindows';
import { resolveAgencyIntent } from '../agents/registry';
// Public connection address only; provider credentials stay on the backend.
const AI_AGENT_URL = process.env.EXPO_PUBLIC_AI_AGENT_URL?.trim().replace(/\/$/, '') || 'http://192.168.1.2:3001';
const AI_REQUEST_TIMEOUT = 120000;
const HEALTH_TIMEOUT = 5000;
export type AIClientContext = {
  id?: string;
  name: string; businessType?: string; website?: string; location?: string;
  services?: string[]; oneLeadQServices?: string[]; productsServices?: string[]; phone?: string; email?: string; notes?: string;
};
export type AIAgentResponse = {
  ok: boolean; provider?: string; model?: string; agent?: string; agentId?: string;
  reply?: string; error?: string; grounded?: boolean;
  handoff?: {kind:'web-development';mode:'CREATE_NEW'|'UPGRADE_EXISTING';intent:'create'|'upgrade'|'analyze';clientId:string|null};
};
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const upstream = options.signal;
  const abort = () => controller.abort();
  if (upstream?.aborted) controller.abort();
  upstream?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    // Timeout includes consuming the response body, not only receiving headers.
    const data: unknown = await response.json();
    return { response, data };
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener('abort', abort);
  }
}
export type ConversationTurn = { role: 'user' | 'assistant'; content: string; clientId: string | null };
export async function askOneLeadQAgent(message: string, clientContext?: AIClientContext, signal?: AbortSignal, history: ConversationTurn[] = []): Promise<AIAgentResponse> {
  const cleanMessage = message.trim();
  if (!cleanMessage) throw new Error('Message is required');
  if (signal?.aborted) throw new Error('OneLeadQ AI request stopped or timed out. Please try again.');
  if (!clientContext?.id) throw new Error('Select a client and pair its trusted laptop before requesting a draft.');
  const intent = resolveAgencyIntent(cleanMessage);
  const routed = intent.kind === 'route' || intent.kind === 'unavailable' ? intent.serviceId : null;
  // SEO conversation remains advice. Fetching a site is never implied; HTML audits use the dedicated screen.
  const serviceId = !routed || routed === 'seo' ? 'conversation' : routed;
  const safeHistory = history.filter(turn => turn.clientId === clientContext.id).slice(-8);
  const command = JSON.stringify({ message: cleanMessage, clientContext, history: safeHistory });
  let draft = await createDraft(clientContext.id, serviceId, command, await trustedWindows.newDraftId());
  const deadline = Date.now() + AI_REQUEST_TIMEOUT;
  try {
    while (['QUEUED', 'RUNNING'].includes(draft.state)) {
      if (signal?.aborted || Date.now() >= deadline) throw new Error('OneLeadQ AI request stopped or timed out. Please try again.');
      await new Promise<void>(resolve => setTimeout(resolve, 400));
      draft = await readDraft(clientContext.id, draft.id);
    }
    if (signal?.aborted) throw new Error('OneLeadQ AI request stopped or timed out. Please try again.');
    if (draft.state !== 'AWAITING_REVIEW' || !draft.plan) throw new Error('Draft failed. Inspect Specialist Drafts history before retrying with a new request.');
    return { ok: true, provider: 'Gemini', agentId: intent.kind === 'route' ? intent.backendId : routed || 'general', agent: 'Specialist draft', reply: draft.plan.summary + '\n' + draft.plan.items.join('\n') + '\nDraft only; open Specialist Drafts to review files and hashes. Production execution is unverified.' };
  } catch (error) {
    if (signal?.aborted || Date.now() >= deadline) { try { await cancelDraft(clientContext.id, draft.id); } catch { /* Outcome remains in scoped server history. */ } }
    throw error;
  }
}

export async function checkAIAgentHealth() {
  try {
    const { response, data } = await fetchWithTimeout(AI_AGENT_URL + '/health', {}, HEALTH_TIMEOUT);
    const health = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    return { ...health, connected: response.ok && health.ok === true };
  } catch (error) {
    return { connected: false, error: error instanceof Error && error.name === 'AbortError'
      ? 'AI Agent connection timed out' : 'Unable to connect to AI Agent' };
  }
}

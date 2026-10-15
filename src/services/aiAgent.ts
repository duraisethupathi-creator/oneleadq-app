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
  try {
    const { response, data } = await fetchWithTimeout(AI_AGENT_URL + '/ai', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: cleanMessage, clientContext, ...(history.length ? { history } : {}) }),
    }, AI_REQUEST_TIMEOUT);
    if (!data || typeof data !== 'object' || !('ok' in data) || data.ok !== true || !response.ok) {
      throw new Error('OneLeadQ AI Agent request failed');
    }
    if (!('reply' in data) || typeof data.reply !== 'string') throw new Error('Invalid AI reply');
    return data as AIAgentResponse;
  } catch (error) {
    // Never display raw backend errors or log client context.
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OneLeadQ AI request stopped or timed out. Please try again.');
    }
    throw new Error('Unable to connect to OneLeadQ AI. Check the AI Agent and your network connection.');
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

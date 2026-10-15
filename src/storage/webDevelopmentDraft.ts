import AsyncStorage from '@react-native-async-storage/async-storage';

const FIELDS = ['mode','projectId','websiteType','description','designPreference','pages','siteLanguage','design','workflowId'] as const;
export type WebDraft = Partial<Record<typeof FIELDS[number], string>> & { version: 1; clientId: string; state: 'DRAFT' };
const sensitive = (text: string) => /-----BEGIN|\b(?:sk-[\w-]{16,}|AIza[\w-]{20,}|gh[pousr]_[\w]{20,})|(?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]|bearer\s+\S+|https?:\/\/[^\s/"'<>:@]+:[^\s/"'<>@]+@/i.test(text);
export function safeWebDraft(clientId: string, input: Record<string, unknown>): WebDraft {
  const result: WebDraft = { version: 1, clientId, state: 'DRAFT' };
  for (const field of FIELDS) {
    const value = input[field];
    if (typeof value === 'string' && value.length <= 6000 && !sensitive(value)) result[field] = field === 'design' ? JSON.stringify(parseDesignDraft(value)) : value;
  }
  return result;
}
const key = (id: string) => `oneleadq:web-draft:v1:${encodeURIComponent(id)}`;
export async function saveWebDraft(clientId: string, input: Record<string, unknown>, newForm = false) {
  if (!clientId || clientId.length > 200 || sensitive(clientId)) return;
  const draft = safeWebDraft(clientId, input);
  if (draft.workflowId) await AsyncStorage.setItem(key(clientId) + ':workflow:' + encodeURIComponent(draft.workflowId), JSON.stringify(draft));
  await AsyncStorage.setItem(key(clientId) + (newForm ? ":new-form" : ""), JSON.stringify(draft));
}
export async function loadWebDraft(clientId: string, newForm = false): Promise<WebDraft | null> {
  const raw = await AsyncStorage.getItem(key(clientId) + (newForm ? ":new-form" : ""));
  if (!raw || raw.length > 40000) return null;
  try { const value = JSON.parse(raw); return value.version === 1 && value.clientId === clientId && value.state === 'DRAFT' ? safeWebDraft(clientId, value) : null; } catch { return null; }
}
export function parseDesignDraft(raw = '{}'): Record<string, string> {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, string> = {};
    for (const key of ['style','primary','accent','tone','typography','corners','animation','density','cta','sections','reference','instruction','assetsAvailability']) {
      if (typeof value[key] === 'string' && value[key].length <= 1200 && !sensitive(value[key])) result[key] = value[key];
    }
    return result;
  } catch { return {}; }
}

// Local navigation preference only; never grants workflow or approval authority.
export async function saveNewWebForm(clientId: string) {
  if (!clientId || clientId.length > 200 || sensitive(clientId)) throw new Error('Invalid client');
  await AsyncStorage.setItem(key(clientId) + ':open-new-form', 'true');
}
export async function opensNewWebForm(clientId: string) {
  return (await AsyncStorage.getItem(key(clientId) + ':open-new-form')) === 'true';
}

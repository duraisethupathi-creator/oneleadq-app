import { trustedWindows } from './trustedWindows';
import type { ServiceId } from '../agents/registry';
export type DraftRun = {
  id: string; clientId: string; projectId: string; workspaceId: string; serviceId: ServiceId | 'conversation';
  state: string; mode: 'FIXTURE_TESTED' | 'PRODUCTION_UNVERIFIED'; productionVerified: false;
  plan?: { summary: string; items: string[] }; previewHash?: string;
  artifacts?: Array<{ name: string; sha256: string; bytes: number }>; externalActionsEnabled: false;
};
function run(value: unknown, clientId: string): DraftRun {
  const r = value as DraftRun;
  if (!r || r.clientId !== clientId || !/^[a-f0-9-]{36}$/.test(r.id) || typeof r.state !== 'string' || r.externalActionsEnabled !== false || r.productionVerified !== false || !['FIXTURE_TESTED', 'PRODUCTION_UNVERIFIED'].includes(r.mode)) throw new Error('Invalid or wrong-client draft rejected.');
  return r;
}
export async function listDrafts(clientId: string) {
  const data = await trustedWindows.drafts('/orchestrator/runs', 'GET', undefined, clientId);
  if (!Array.isArray(data.runs)) throw new Error('Invalid draft history.');
  return data.runs.map(r => run(r, clientId));
}
export async function createDraft(clientId: string, serviceId: ServiceId | 'conversation', command: string, requestId: string, siteHtml?: string) {
  const data = await trustedWindows.drafts('/orchestrator/runs', 'POST', { requestId, serviceId, command, ...(siteHtml === undefined ? {} : { siteHtml }) }, clientId);
  return run(data.run, clientId);
}
export async function readDraft(clientId: string, id: string) { return run((await trustedWindows.drafts('/orchestrator/runs/' + id, 'GET', undefined, clientId)).run, clientId); }
export async function cancelDraft(clientId: string, id: string) { return run((await trustedWindows.drafts('/orchestrator/runs/' + id + '/cancel', 'POST', {}, clientId)).run, clientId); }
export async function approveDraft(clientId: string, draft: DraftRun) { return run((await trustedWindows.drafts('/orchestrator/runs/' + draft.id + '/approve', 'POST', { previewHash: draft.previewHash }, clientId)).run, clientId); }

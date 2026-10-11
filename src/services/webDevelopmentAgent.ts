// Stage 16 is opt-in. The existing Floating Assistant keeps its current API.
// Obtain this dedicated authorization token from a trusted session; never put
// the Bridge token or a privileged token in EXPO_PUBLIC_* or persistent storage.
export const WEB_DEVELOPMENT_BASE_URL =
  process.env.EXPO_PUBLIC_AI_AGENT_URL?.trim().replace(/\/$/, '') ||
  'http://192.168.1.2:3001';

const BASE_URL = WEB_DEVELOPMENT_BASE_URL;

export type WebWorkflowState = 'IDLE' | 'ANALYZING' | 'ANALYSIS_COMPLETE' | 'CHANGE_PLAN_READY' |'NO_CHANGES_NEEDED'|
  'WAITING_FOR_FILE_APPROVAL' | 'APPLYING_APPROVED_CHANGES' | 'VALIDATING' | 'VALIDATION_FAILED' |
  'VALIDATION_PASSED' | 'WAITING_FOR_COMMIT_APPROVAL' | 'COMMITTED' | 'WAITING_FOR_PUSH_APPROVAL' | 'PUSHED' | 'FAILED';
export type WebWorkflow = {
  id: string; agentId: 'webDevelopment'; state: WebWorkflowState;
  context: { clientId: string; projectId: string; workspaceId: string; repository: string };
  history: { state: WebWorkflowState; at: string }[];
  beforeReport?: Record<string, unknown>; afterReport?: Record<string, unknown>;
  plan: { file: string; reason: string; content: string; beforeHash: string; afterHash: string }[];
  approvals: { file: string; approvalId: string; applied: boolean }[];
  filesChanged: string[]; commitApprovalId?: string; pushApprovalId?: string;
  committedRevision?: string;
  pushProposal?: { branch: string; headCommit: string; remoteName: string };
  git?: { status: Record<string, unknown>; diff: string; diffScope: string };
};
export type WebAction = 'analyze' | 'plan' | 'propose-files' | 'approve-files' | 'validate' |
  'git' | 'propose-commit' | 'approve-commit' | 'propose-push' | 'approve-push';
export class WebDevelopmentAgent {
  constructor(private readonly getToken: () => Promise<string>) {}
  private async request(path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<WebWorkflow> {
    const token = await this.getToken();
    if (signal?.aborted) throw new Error('Web agent request cancelled');
    if (!token) throw new Error('Web agent authorization is required');
    const response = await fetch(BASE_URL + path, {
      method: body === undefined ? 'GET' : 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
const data = await response.json() as {
  ok?: boolean;
  workflow?: WebWorkflow;
  error?: string;
}; 
   if (!response.ok || data.ok !== true || !data.workflow) {
  const safeMessage =
    typeof data.error === 'string' && data.error.trim()
      ? data.error.trim()
      : 'Web agent operation failed. Refresh the workflow before retrying.';

  throw new Error(safeMessage);
}
    return data.workflow;
  }
  create(clientId: string, projectId: string, signal?: AbortSignal) { return this.request('/web-development/workflows', { clientId, projectId }, signal); }
  get(id: string, signal?: AbortSignal) { return this.request(`/web-development/workflows/${encodeURIComponent(id)}`, undefined, signal); }
  act(id: string, action: WebAction, input: Record<string, unknown> = {}, signal?: AbortSignal) {
    return this.request(`/web-development/workflows/${encodeURIComponent(id)}/${action}`, input, signal);
  }
}

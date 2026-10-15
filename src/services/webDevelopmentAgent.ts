// Stage 16 is opt-in. The existing Floating Assistant keeps its current API.
// Obtain this dedicated authorization token from a trusted session; never put
// the Bridge token or a privileged token in EXPO_PUBLIC_* or persistent storage.
export const WEB_DEVELOPMENT_BASE_URL =
  process.env.EXPO_PUBLIC_AI_AGENT_URL?.trim().replace(/\/$/, '') ||
  'http://192.168.1.2:3001';

const BASE_URL = WEB_DEVELOPMENT_BASE_URL;

export type WebWorkflowState = 'IDLE' | 'ANALYZING' | 'ANALYSIS_COMPLETE' | 'CHANGE_PLAN_READY' |'NO_CHANGES_NEEDED'|
  'DESIGN_VARIANTS_READY' | 'DESIGN_LOCKED' | 'REQUIREMENTS_READY' | 'ARCHITECTURE_READY' | 'ROLLED_BACK' |
  'WAITING_FOR_FILE_APPROVAL' | 'APPLYING_APPROVED_CHANGES' | 'VALIDATING' | 'VALIDATION_FAILED' |
  'VALIDATION_PASSED' | 'WAITING_FOR_COMMIT_APPROVAL' | 'COMMITTED' | 'WAITING_FOR_PUSH_APPROVAL' | 'PUSHED' | 'FAILED';
export type WebWorkflow = {
  id: string; agentId: 'webDevelopment'; state: WebWorkflowState;
  mode?: 'CREATE_NEW' | 'UPGRADE_EXISTING'; architecture?: Record<string, unknown>;
  designBrief?: Record<string, unknown>; designVariants?: DesignVariant[]; selectedDesignId?: string;
  designLock?: { selectedVariantId: string; state: string; revision: number; layoutSpecification: DesignVariant['spec'] };
  restored?: boolean; restoreNotice?: string;
  validationCommands?: string[];
  context: { clientId: string; projectId: string; workspaceId: string; repository: string };
  history: { state: WebWorkflowState; at: string }[];
  beforeReport?: Record<string, unknown>; afterReport?: Record<string, unknown>;
  plan: { file: string; operation?: 'CREATE' | 'UPDATE'; reason: string; content: string; beforeHash: string | null; afterHash: string }[];
  approvals: { file: string; operation?: 'CREATE' | 'UPDATE'; approvalId: string; applied: boolean; rejected?: boolean; rolledBack?: boolean; operationId?: string }[];
  filesChanged: string[]; commitApprovalId?: string; pushApprovalId?: string;
  committedRevision?: string;
  commitProposal?: { message: string; files: string[] };
  pushProposal?: { branch: string; headCommit: string; remoteName: string };
  git?: { status: Record<string, unknown>; diff: string; diffScope: string; newFiles?: { file: string; content: string; afterHash: string }[] };
};
export type DesignVariant = { renderedPreviews?: {width:number;data:string}[]; previewRenderStatus?: string; id: string; name: string; revision: number; evidence: string; refinement?: string; refinementStatus?: string; spec: { buttonInk?: string; layout: string; primary: string; accent: string; background: string; ink: string; cta: string; sections: string[]; typography: string; cards: string; mobile: string; style: string } };
export type WebAction = 'analyze' | 'plan' | 'propose-files' | 'approve-files' | 'validate' |
  'design-brief' | 'generate-designs' | 'select-design' | 'refine-design' | 'approve-design' | 'render-design-preview' | 'runtime-check' | 'architecture' | 'reject-files' | 'rollback-created' |
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
  if (response.status === 409 && data.error === 'CREATE_NEW conflicts with existing files; use UPGRADE_EXISTING') {
    const error = new Error('CREATE_NEW target already contains website files. Start a new workflow with an empty configured project, or use UPGRADE_EXISTING. No files were overwritten.');
    error.name = 'CreateNewFileConflict';
    throw error;
  }
  const safeMessage =
    typeof data.error === 'string' && data.error.trim()
      ? data.error.trim()
      : 'Web agent operation failed. Refresh the workflow before retrying.';

  throw new Error(safeMessage);
}
    return data.workflow;
  }
  async report(id: string, phase: 'BEFORE' | 'AFTER', signal?: AbortSignal): Promise<Blob> {
    const token = await this.getToken(); if (signal?.aborted || !token) throw new Error('Session authentication required');
    const response = await fetch(`${BASE_URL}/web-development/workflows/${encodeURIComponent(id)}/reports/${phase}`, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!response.ok) throw new Error('PDF renderer unavailable or report generation failed.');
    return response.blob();
  }
  create(clientId: string, projectId: string, signal?: AbortSignal, options: Record<string, unknown> = {}) { return this.request('/web-development/workflows', { ...options, clientId, projectId }, signal); }
  get(id: string, signal?: AbortSignal) { return this.request(`/web-development/workflows/${encodeURIComponent(id)}`, undefined, signal); }
  act(id: string, action: WebAction, input: Record<string, unknown> = {}, signal?: AbortSignal) {
    return this.request(`/web-development/workflows/${encodeURIComponent(id)}/${action}`, input, signal);
  }
}

// Native development transport. adb reverse tcp:3020 tcp:3020; never expose gateway to LAN.
const BASE = 'http://127.0.0.1:3020';
export type WorkerJob = {
  id: string; clientId: string; projectId: string; commandId: string;
  state: string; exitCode: number | null;
  logs: { sequence: number; at: string; text: string }[];
};
type Session = { token: string; expiresAt: number; clientId: string; projectId: string };
let session: Session | null = null;
export function disconnectWindowsWorker() { session = null; }
async function request(path: string, body: Record<string, unknown> | undefined, token?: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const timeout = new AbortController();
  const abort = () => timeout.abort();
  if (signal?.aborted) timeout.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(BASE + path, { method: body ? 'POST' : 'GET', signal: timeout.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const value: unknown = await response.json();
    if (response.status === 401) disconnectWindowsWorker();
    if (!response.ok || !value || typeof value !== 'object' || !('ok' in value) || value.ok !== true) throw new Error('Windows Worker rejected the request. Check pairing, client and project.');
    return value as Record<string, unknown>;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
function authorization(clientId: string, projectId: string) {
  if (!session || session.expiresAt <= Date.now() + 30000 || session.clientId !== clientId || session.projectId !== projectId) {
    disconnectWindowsWorker(); throw new Error('Pair this client and project again.');
  }
  return session.token;
}
export async function pairWindowsWorker(code: string, clientId: string, projectId: string, signal?: AbortSignal) {
  if (!/^\d{6}$/.test(code.trim()) || !clientId || !projectId) throw new Error('Select a client, enter its mapped project and six-digit laptop code.');
  disconnectWindowsWorker();
  const data = await request('/web-development/session/exchange', { pairingCode: code.trim() }, undefined, signal);
  if (signal?.aborted || typeof data.sessionToken !== 'string' || typeof data.expiresAt !== 'number' ||
    data.expiresAt <= Date.now() + 30000 || data.clientId !== clientId || data.projectId !== projectId ||
    !Array.isArray(data.scope) || !data.scope.includes('web-development')) throw new Error('Pairing code belongs to a different client/project or is expired.');
  session = { token: data.sessionToken, expiresAt: data.expiresAt, clientId, projectId };
}
function validateJob(value: unknown, clientId: string, projectId: string): WorkerJob {
  const job = value as Partial<WorkerJob> | null;
  if (!job || job.clientId !== clientId || job.projectId !== projectId || typeof job.id !== 'string' ||
    !/^[\da-f-]{36}$/.test(job.id) || typeof job.state !== 'string' || !Array.isArray(job.logs) ||
    job.logs.some(log => typeof log.text !== 'string' || typeof log.sequence !== 'number')) throw new Error('Invalid or wrong-client worker result.');
  return job as WorkerJob;
}
export async function listWindowsJobs(clientId: string, projectId: string, signal?: AbortSignal) {
  const data = await request('/windows/jobs', undefined, authorization(clientId, projectId), signal);
  if (!Array.isArray(data.jobs)) throw new Error('Invalid worker history.');
  return data.jobs.map(job => validateJob(job, clientId, projectId)).reverse();
}
export async function startWindowsJob(clientId: string, projectId: string, commandId: string, signal?: AbortSignal) {
  if (!['npm-typecheck', 'npm-test', 'npm-lint', 'npm-build'].includes(commandId)) throw new Error('Command is not allowlisted.');
  const data = await request('/windows/jobs', { commandId }, authorization(clientId, projectId), signal);
  return validateJob(data.job, clientId, projectId);
}
export async function cancelWindowsJob(clientId: string, projectId: string, jobId: string, signal?: AbortSignal) {
  if (!/^[\da-f-]{36}$/.test(jobId)) throw new Error('Invalid worker task ID.');
  const data = await request(`/windows/jobs/${encodeURIComponent(jobId)}/cancel`, {}, authorization(clientId, projectId), signal);
  return validateJob(data.job, clientId, projectId);
}

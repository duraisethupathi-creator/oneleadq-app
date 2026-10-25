import type { WorkerJob } from './windowsWorker';
export type TrustedDevice = {
  gatewayId: string; deviceId: string; clientId: string; projectId: string; endpoint: string; fingerprint: string;
  name: string; lastConnectedAt: number; trustExpiresAt: number; autoConnect: boolean;
  pending?: { id: string; commandId: string };
  pendingDraftId?: string;
};
export type ConnectionView = { status: 'Connecting' | 'Connected' | 'Offline' | 'Authentication Expired'; message: string; devices: TrustedDevice[]; jobs: WorkerJob[]; gatewayHealth?: string; backendHealth?: string };
export interface TrustNative {
  identity(gatewayId: string): Promise<string>;
  sign(gatewayId: string, payload: string): Promise<string>;
  randomId(): Promise<string>;
  readRecords(): Promise<string | null>;
  writeRecords(value: string): Promise<unknown>;
  deleteIdentity(gatewayId: string): Promise<unknown>;
  discover(gatewayId: string): Promise<{ endpoints: string[]; available: boolean }>;
  request(endpoint: string, fingerprint: string, route: string, method: string, body: string | null, token: string | null, requestId: string | null): Promise<{ status: number; body: string }>;
}
class ConnectionError extends Error { constructor(public code: string, message: string) { super(message); } }
const scopeId = (s: unknown): s is string => typeof s === 'string' && /^[\w-]{1,100}$/.test(s);
const uuid = (s: unknown): s is string => typeof s === 'string' && /^[\da-f-]{36}$/.test(s);
function origin(value: unknown): string {
  if (typeof value !== 'string') throw new ConnectionError('INVALID_ADDRESS', 'A laptop-provided encrypted invitation is required.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new ConnectionError('INVALID_ADDRESS', 'Only encrypted gateway origins are accepted.');
  return url.origin;
}
export function createTrustedWorker(native: TrustNative | null, selectedClient: () => Promise<string | null>, now = Date.now) {
  let devices: TrustedDevice[] = [], loaded: Promise<void> | null = null, foreground = false, epoch = 0;
  let session: { deviceId: string; token: string; expiresAt: number } | null = null;
  let view: ConnectionView = { status: 'Offline', message: 'Pair a trusted laptop once.', devices: [], jobs: [] };
  const listeners = new Set<(value: ConnectionView) => void>();
  let flight: Promise<void> | null = null, timer: ReturnType<typeof setTimeout> | null = null, failures = 0;
  let writes: Promise<unknown> = Promise.resolve();
  const submitting = new Set<string>();
  const publish = (next: Partial<ConnectionView>) => { view = { ...view, ...next, devices: devices.map(d => ({ ...d })) }; listeners.forEach(listener => listener(view)); };
  function api() { if (!native) throw new ConnectionError('NATIVE_UNAVAILABLE', 'Secure reconnection needs the approved Android build with OneLeadQTrust. Existing development APK cannot add Keystore/TLS support through Metro.'); return native; }
  async function load() {
    if (!loaded) loaded = (async () => {
      const raw = await api().readRecords();
      if (raw) { const data = JSON.parse(raw) as { version?: number; devices?: TrustedDevice[] };
        if (data.version !== 1 || !Array.isArray(data.devices) || data.devices.length > 20) throw new ConnectionError('STORAGE_INVALID', 'Encrypted device records need review; no authority was reset.');
        for (const d of data.devices) if (!d || !uuid(d.gatewayId) || !uuid(d.deviceId) || !scopeId(d.clientId) || !scopeId(d.projectId) || !/^[a-f0-9]{64}$/.test(d.fingerprint) || !Number.isFinite(d.trustExpiresAt) || !Number.isFinite(d.lastConnectedAt) || typeof d.autoConnect !== 'boolean' || (d.pending && (!uuid(d.pending.id) || !['npm-typecheck', 'npm-test', 'npm-lint', 'npm-build'].includes(d.pending.commandId)))) throw new ConnectionError('STORAGE_INVALID', 'Invalid trusted-device identity; explicit re-pair required.');
        devices = data.devices.map(d => ({ ...d, endpoint: origin(d.endpoint) }));
        if (devices.some(d => d.pendingDraftId !== undefined && !uuid(d.pendingDraftId))) throw new ConnectionError('STORAGE_INVALID', 'Invalid pending draft identity; no authority was reset.');
      }
      publish({});
    })();
    await loaded;
  }
  async function save() { const snapshot = JSON.stringify({ version: 1, devices }); const pending = writes.then(() => api().writeRecords(snapshot)); writes = pending.catch(() => {}); await pending; publish({}); }
  function current(version: number) { if (!foreground || epoch !== version) throw new ConnectionError('INTERRUPTED', 'Connection paused while the app is inactive or context changed.'); }
  function message(error: unknown) {
    if (error instanceof ConnectionError) return error.message;
    return 'Encrypted connection unavailable. Keep the laptop gateway running on the same Wi-Fi and tap Retry. No task was replayed.';
  }
  async function call(d: Pick<TrustedDevice, 'endpoint' | 'fingerprint'>, route: string, method = 'GET', body?: Record<string, unknown>, token?: string, requestId?: string) {
    let response: { status: number; body: string };
    try { response = await api().request(origin(d.endpoint), d.fingerprint, route, method, body ? JSON.stringify(body) : null, token ?? null, requestId ?? null); }
    catch (e) { if (String(e).includes('TLS_PIN_MISMATCH')) throw new ConnectionError('LAPTOP_IDENTITY_CHANGED', 'Authentication Expired. Laptop certificate identity changed; verify and re-pair explicitly.'); if (/timeout|timed out/i.test(String(e))) throw new ConnectionError('REQUEST_TIMEOUT', 'Laptop request timed out. Review draft history before retrying; no request was replayed.'); throw new ConnectionError('NETWORK_UNAVAILABLE', 'Encrypted laptop connection unavailable. Check Wi-Fi/gateway and Retry; no task replayed.'); }
    let data: Record<string, unknown>;
    try { data = JSON.parse(response.body) as Record<string, unknown>; } catch { data = {}; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    const httpMessages: Record<number, string> = {401:'Session expired. Reconnect to the trusted laptop; no request was replayed.',403:'This paired client is not authorized for the requested operation. Ask the laptop owner to review its scope.',404:route.startsWith('/orchestrator/')?'The trusted laptop is missing the draft route. Upgrade its gateway and transport together; do not switch to direct AI.':'Gateway endpoint unavailable (HTTP 404). Check the compatible laptop service.',409:'Draft request conflict. Review the existing request and history before trying again.',429:'Laptop request limit reached. Wait before retrying.',500:'Laptop service failed. Its health may still be online; review history before retrying.',503:'Laptop AI service is temporarily unavailable. Review history before retrying.'};
    if (response.status < 400 && data.ok === undefined) throw new ConnectionError('BAD_RESPONSE', 'Gateway response invalid; refresh without replaying an action.');
    if (response.status >= 400 || data.ok !== true) {
      const code = typeof data.code === 'string' ? data.code : 'REQUEST_REJECTED';
      const messages: Record<string, string> = { SCOPE_REQUIRED: 'Draft access is not enabled for this paired client. Ask the laptop owner to authorize drafts and issue a new pairing invitation.', TRUST_EXPIRED: 'Authentication Expired. Trust was revoked or expired; re-pair on the laptop.', TRUST_REVOKED: 'Authentication Expired. Laptop revoked this device.', BAD_PROOF: 'Authentication Expired. Device identity rejected; explicit re-pair required.', SCOPE_MISMATCH: 'Wrong client/project. Select the originally paired client or re-pair explicitly.', SESSION_EXPIRED: 'Session expired; reconnect to the trusted laptop.', OUTCOME_UNKNOWN: 'Task submission outcome uncertain. Review history; it was not executed again.', REQUEST_UNKNOWN: 'Task submission not confirmed. Review the laptop history before retrying the same request ID.', UPSTREAM_REJECTED: 'Worker session rejected. Retry connection; no approvals or tasks are replayed.', GATEWAY_OFFLINE: 'Laptop worker is offline. Retry when the gateway is running.', PAIRING_LIMIT: 'Too many pairing attempts; wait one minute.', INVALID_PAIRING: 'Invitation invalid or expired. Generate a fresh invitation on the laptop.' };
      throw new ConnectionError(code, messages[code] ?? httpMessages[response.status] ?? 'Gateway request failed. Review laptop health and history; no request was replayed.');
    }
    return data;
  }
  function validateJob(value: unknown, d: TrustedDevice) {
    const job = value as WorkerJob;
    if (!job || !uuid(job.id) || job.clientId !== d.clientId || job.projectId !== d.projectId || typeof job.state !== 'string' || !Array.isArray(job.logs) || job.logs.some(x => typeof x.text !== 'string')) throw new ConnectionError('SCOPE_MISMATCH', 'Wrong-client or invalid worker result rejected.');
    return job;
  }
  async function device(id?: string) { await load(); const selected = await selectedClient(); const d = devices.find(value => value.clientId === selected && (id ? value.deviceId === id : value.autoConnect)); if (!d) throw new ConnectionError('NO_TRUST', 'Pair the selected client with a laptop once.'); if (d.trustExpiresAt <= now()) throw new ConnectionError('TRUST_EXPIRED', 'Authentication Expired. Re-pair this laptop explicitly.'); return d; }
  async function readJobs(d: TrustedDevice) { if (!session || session.deviceId !== d.deviceId) throw new ConnectionError('SESSION_EXPIRED', 'Reconnect before reading worker tasks.'); const data = await call(d, '/windows/jobs', 'GET', undefined, session.token); if (!Array.isArray(data.jobs)) throw new ConnectionError('BAD_RESPONSE', 'Invalid worker history.'); return data.jobs.map(j => validateJob(j, d)).reverse(); }
  function schedule() { if (timer) clearTimeout(timer); if (!foreground || view.status === 'Authentication Expired') return; timer = setTimeout(() => { void reconnect(); }, view.status === 'Connected' ? 20000 : Math.min(30000, 1000 * 2 ** Math.min(failures, 5))); }
  async function reconnect(id?: string) {
    if (flight) return flight;
    flight = (async () => {
      const version = epoch;
      try {
        await load(); current(version);
        const d = await device(id);
        if (!id && !d.autoConnect) return;
        publish({ status: 'Connecting', message: 'Connecting to the previously trusted laptop…' });
        if (session?.deviceId === d.deviceId && session.expiresAt > now() + 30000) { const jobs = await readJobs(d); const status = await call(d, '/trusted/status', 'GET', undefined, session.token); current(version); const health = status.health as { ok?: boolean; backend?: string } | undefined; publish({ status: 'Connected', message: 'Connected. Pending task statuses restored; no actions replayed.', jobs, gatewayHealth: health?.ok ? 'ONLINE' : 'UNAVAILABLE', backendHealth: health?.backend ?? 'UNAVAILABLE' }); failures = 0; return; }
        session = null;
        let discovered: string[] = []; try { discovered = (await api().discover(d.gatewayId)).endpoints; } catch { /* Saved pinned address remains an authenticated fallback. */ }
        current(version);
        const candidates = [...new Set([...discovered.slice(0, 8), d.endpoint])]; let last: unknown;
        for (const endpoint of candidates) {
          try {
            const candidate = { ...d, endpoint: origin(endpoint) };
            const scope = { gatewayId: d.gatewayId, deviceId: d.deviceId, clientId: d.clientId, projectId: d.projectId };
            const challenge = await call(candidate, '/trusted/challenge', 'POST', scope); current(version);
            if (challenge.gatewayId !== d.gatewayId || challenge.deviceId !== d.deviceId || !uuid(challenge.challengeId) || typeof challenge.nonce !== 'string' || !/^[\w-]{43}$/.test(challenge.nonce)) throw new ConnectionError('BAD_PROOF', 'Gateway identity/challenge mismatch.');
            const payload = ['oneleadq-reconnect-v1', d.gatewayId, d.deviceId, challenge.nonce].join('\n');
            const signature = await api().sign(d.gatewayId, payload); current(version);
            const response = await call(candidate, '/trusted/reconnect', 'POST', { ...scope, challengeId: challenge.challengeId, signature }); current(version);
            if (response.gatewayId !== d.gatewayId || response.deviceId !== d.deviceId || response.clientId !== d.clientId || response.projectId !== d.projectId || typeof response.sessionToken !== 'string' || typeof response.expiresAt !== 'number' || response.expiresAt <= now()) throw new ConnectionError('BAD_PROOF', 'Renewed session scope rejected.');
            session = { deviceId: d.deviceId, token: response.sessionToken, expiresAt: response.expiresAt };
            d.endpoint = candidate.endpoint; d.lastConnectedAt = now(); if (typeof response.trustExpiresAt === 'number') d.trustExpiresAt = response.trustExpiresAt; d.autoConnect = true; await save(); current(version);
            if (d.pending) {
              try { const outcome = await call(d, `/trusted/requests/${d.pending.id}`, 'GET', undefined, session.token); if ((outcome.request as { state?: string })?.state === 'DONE') { delete d.pending; await save(); } } catch { /* Unknown action stays locked for review, never replayed. */ }
            }
            const jobs = await readJobs(d); const status = await call(d, '/trusted/status', 'GET', undefined, session.token); current(version);
            const health = status.health as { gateway?: string; backend?: string; ok?: boolean } | undefined;
            publish({ status: 'Connected', message: d.pending ? 'Connected. Previous submission uncertain; review history before another task.' : 'Connected securely. Task history restored without replaying actions.', jobs, gatewayHealth: health?.ok ? 'ONLINE' : 'UNAVAILABLE', backendHealth: health?.backend ?? 'UNAVAILABLE' }); failures = 0; return;
          } catch (error) { session = null; last = error; if (error instanceof ConnectionError && ['TRUST_EXPIRED', 'TRUST_REVOKED', 'SCOPE_MISMATCH', 'BAD_PROOF'].includes(error.code)) throw error; }
        }
        throw last ?? new ConnectionError('OFFLINE', 'Trusted laptop not found. Keep it on the same Wi-Fi and tap Retry.');
      } catch (error) {
        if (version !== epoch) return;
        session = null;
        const expired = error instanceof ConnectionError && ['TRUST_EXPIRED', 'TRUST_REVOKED', 'BAD_PROOF', 'STORAGE_INVALID', 'SCOPE_MISMATCH', 'LAPTOP_IDENTITY_CHANGED'].includes(error.code);
        publish({ status: expired ? 'Authentication Expired' : 'Offline', message: message(error), jobs: [] }); failures++;
      } finally { if (version === epoch && devices.some(d => d.autoConnect) && native) schedule(); }
    })().finally(() => { flight = null; if (foreground && view.status !== 'Authentication Expired' && devices.some(d => d.autoConnect) && native) schedule(); }); return flight;
  }
  async function pair(invitationText: string) {
    await load(); const version = epoch; current(version);
    let invite: Record<string, unknown>;
    try { invite = JSON.parse(invitationText) as Record<string, unknown>; } catch { throw new ConnectionError('INVALID_PAIRING', 'Invitation format invalid. Paste the fresh laptop invitation; no secret content is logged.'); }
    if (invite.version !== 1 || !uuid(invite.gatewayId) || !scopeId(invite.clientId) || !scopeId(invite.projectId) || typeof invite.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(invite.fingerprint) || typeof invite.pairingCode !== 'string' || !/^\d{6}$/.test(invite.pairingCode) || typeof invite.expiresAt !== 'number' || invite.expiresAt <= now() || invite.clientId !== await selectedClient()) throw new ConnectionError('INVALID_PAIRING', 'Fresh laptop invitation must match the selected client.');
    const endpoint = origin(invite.endpoint); const publicKey = await api().identity(invite.gatewayId); current(version);
    const signature = await api().sign(invite.gatewayId, ['oneleadq-enroll-v1', invite.gatewayId, invite.clientId, invite.projectId, publicKey].join('\n')); current(version);
    const response = await call({ endpoint, fingerprint: invite.fingerprint }, '/trusted/enroll', 'POST', { gatewayId: invite.gatewayId, clientId: invite.clientId, projectId: invite.projectId, pairingCode: invite.pairingCode, publicKey, signature, name: 'OneLeadQ Android' }); current(version);
    if (!uuid(response.deviceId) || response.gatewayId !== invite.gatewayId || response.clientId !== invite.clientId || response.projectId !== invite.projectId || typeof response.sessionToken !== 'string' || typeof response.expiresAt !== 'number' || typeof response.trustExpiresAt !== 'number') throw new ConnectionError('BAD_PROOF', 'Enrollment scope rejected.');
    const d: TrustedDevice = { gatewayId: invite.gatewayId, deviceId: response.deviceId, clientId: invite.clientId, projectId: invite.projectId, endpoint, fingerprint: invite.fingerprint, name: 'Trusted Windows laptop', lastConnectedAt: now(), trustExpiresAt: response.trustExpiresAt, autoConnect: true };
    devices = [...devices.filter(v => !(v.gatewayId === d.gatewayId && v.clientId === d.clientId && v.projectId === d.projectId)), d];
    await save(); current(version); session = { deviceId: d.deviceId, token: response.sessionToken, expiresAt: response.expiresAt }; const jobs = await readJobs(d); current(version); publish({ status: 'Connected', message: 'Trusted laptop paired. Future foreground launches reconnect automatically.', jobs }); schedule();
  }
  async function ensure(id?: string) { const version = epoch; const d = await device(id); current(version); if (!session || session.deviceId !== d.deviceId || session.expiresAt <= now() + 30000) await reconnect(d.deviceId); current(version); if (!session || session.deviceId !== d.deviceId) throw new ConnectionError('OFFLINE', view.message); return d; }
  return {
    async newDraftId() { const d = await device(); if (d.pendingDraftId) return d.pendingDraftId; const value = await api().randomId(); if (!uuid(value)) throw new ConnectionError('BAD_REQUEST_ID', 'Secure request ID unavailable.'); return value; },
    async drafts(route: string, method: 'GET' | 'POST', body?: Record<string, unknown>, clientId?: string) {
      if (!/^\/orchestrator\/runs(?:\/[a-f0-9-]{36}(?:\/(cancel|approve))?)?$/.test(route)) throw new ConnectionError('ROUTE_REJECTED', 'Unsupported draft operation.');
      const d = await ensure(), version = epoch;
      if (clientId !== d.clientId || await selectedClient() !== d.clientId) throw new ConnectionError('SCOPE_MISMATCH', 'Selected client changed.');
      const status = await call(d, '/trusted/status', 'GET', undefined, session!.token); current(version);
      if ((status.health as { draftProtocol?: number } | undefined)?.draftProtocol !== 1) throw new ConnectionError('WORKER_UPGRADE_REQUIRED', 'The paired laptop runs an incompatible draft gateway. Upgrade its gateway and trusted transport together. Direct AI fallback is disabled.');
      if (status.draftAccess !== true) throw new ConnectionError('SCOPE_REQUIRED', 'Draft access is not enabled for this paired client. Ask the laptop owner to authorize drafts and issue a new pairing invitation.');
      const creating = route === '/orchestrator/runs' && method === 'POST';
      if (creating) {
        if (!uuid(body?.requestId)) throw new ConnectionError('BAD_REQUEST_ID', 'Stable draft request identity required.');
        if (d.pendingDraftId && d.pendingDraftId !== body.requestId) throw new ConnectionError('OUTCOME_UNKNOWN', 'Previous draft submission is uncertain. Refresh history or retry the same request ID.');
        d.pendingDraftId = body.requestId; await save(); current(version);
      }
      const result = await call(d, route, method, body, session!.token); current(version);
      if (await selectedClient() !== d.clientId || result.clientId !== d.clientId || result.projectId !== d.projectId) throw new ConnectionError('SCOPE_MISMATCH', 'Wrong-client draft response rejected.');
      const returned = result.run as {id?: string;clientId?: string;projectId?: string;requestId?: string} | undefined;
      if (returned && (returned.clientId !== d.clientId || returned.projectId !== d.projectId)) throw new ConnectionError('SCOPE_MISMATCH', 'Wrong-client/project draft rejected.');
      if (creating && (!returned || !uuid(returned.id) || returned.requestId !== body?.requestId)) throw new ConnectionError('OUTCOME_UNKNOWN', 'Draft submission response invalid. Review history or retry the same request identity.');
      if (creating || (Array.isArray(result.runs) && result.runs.some(r => r && r.requestId === d.pendingDraftId && r.clientId === d.clientId && r.projectId === d.projectId))) { delete d.pendingDraftId; await save(); current(version); }
      return result;
    },
    getState: () => view,
    subscribe(listener: (value: ConnectionView) => void) { listeners.add(listener); listener(view); return () => { listeners.delete(listener); }; },
    async initialize() { try { await load(); if (foreground && devices.some(d => d.autoConnect)) await reconnect(); } catch (error) { publish({ status: 'Offline', message: message(error) }); } },
    setForeground(value: boolean) { foreground = value; epoch++; if (timer) clearTimeout(timer); timer = null; if (!value) { session = null; publish({ status: 'Offline', message: 'Connection paused while app is in background; resumes in foreground.', jobs: [] }); } else { void reconnect(); } },
    reconnect,
    pair,
    async disconnect(id: string) { await load(); const d = devices.find(v => v.deviceId === id); if (d) { epoch++; session = null; d.autoConnect = false; if (timer) clearTimeout(timer); await save(); publish({ status: 'Offline', message: 'Disconnected. Trust is retained securely; Retry to reconnect.', jobs: [] }); } },
    async forget(id: string) { const d = await ensure(id); await call(d, '/trusted/forget', 'POST', {}, session!.token); epoch++; session = null; devices = devices.filter(v => v.deviceId !== id); await save(); if (!devices.some(v => v.gatewayId === d.gatewayId)) await api().deleteIdentity(d.gatewayId); publish({ status: 'Offline', message: 'Device trust revoked on laptop and removed locally. Re-pair needs a fresh invitation.', jobs: [] }); },
    async listJobs(id?: string) { const d = await ensure(id); const jobs = await readJobs(d); publish({ jobs }); return jobs; },
    async startJob(commandId: string, id?: string) {
      if (!['npm-typecheck', 'npm-test', 'npm-lint', 'npm-build'].includes(commandId)) throw new ConnectionError('COMMAND_REJECTED', 'Command is not allowlisted.');
      const d = await ensure(id), version = epoch;
      if (d.pending || submitting.has(d.deviceId)) throw new ConnectionError('OUTCOME_UNKNOWN', 'Previous submission needs history review; no duplicate task will be sent.');
      submitting.add(d.deviceId);
      try { const requestId = await api().randomId(); if (!uuid(requestId)) throw new ConnectionError('BAD_REQUEST_ID', 'Secure request identity unavailable.'); d.pending = { id: requestId, commandId }; await save(); current(version); if (await selectedClient() !== d.clientId) throw new ConnectionError('SCOPE_MISMATCH', 'Selected client changed; no task submitted.'); const data = await call(d, '/windows/jobs', 'POST', { commandId }, session!.token, requestId); const job = validateJob(data.job, d); delete d.pending; await save(); current(version); publish({ jobs: [job, ...view.jobs.filter(j => j.id !== job.id)] }); return job; }
      finally { submitting.delete(d.deviceId); }
    },
    async retryPending(id?: string) { const d = await ensure(id); if (!d.pending || submitting.has(d.deviceId)) throw new ConnectionError('NO_PENDING', 'No exact pending request is available to retry.'); submitting.add(d.deviceId); try { const data = await call(d, '/windows/jobs', 'POST', { commandId: d.pending.commandId }, session!.token, d.pending.id); const job = validateJob(data.job, d); delete d.pending; await save(); publish({ jobs: [job, ...view.jobs.filter(j => j.id !== job.id)] }); return job; } finally { submitting.delete(d.deviceId); } },
    async cancelJob(jobId: string, id?: string) { if (!uuid(jobId)) throw new ConnectionError('BAD_REQUEST_ID', 'Invalid task ID.'); const d = await ensure(id); return validateJob((await call(d, `/windows/jobs/${jobId}/cancel`, 'POST', {}, session!.token)).job, d); }
  };
}

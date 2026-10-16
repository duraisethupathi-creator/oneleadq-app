const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WorkflowService, STATES } = require('../webDevelopment/workflow');
const { analyze } = require('../webDevelopment/analysis');
const { Bridge } = require('../webDevelopment/bridge');
const { safeFile, hasSecret } = require('../webDevelopment/safety');
const mapping = { clientId: 'client-1', projectId: 'website', workspaceId: 'approved', repository: 'owner/website', enabled: true };
function fixture() {
  const files = { 'index.html': '<html><head><title>Example</title></head><body><h1>Example</h1></body></html>', 'package.json': JSON.stringify({ scripts: { typecheck: 'tsc --noEmit', test: 'jest', build: 'vite build' }, dependencies: { react: '1', vite: '1', next: '1' } }) };
  const calls = []; const pending = new Map(); const backups = {}; let sequence = 0;
  const bridge = {
    changed: [], exitCode: 0, enabled: true, failWrite: false,
    async request(path, body) {
      calls.push({ path, body });
      if (path === '/workspaces') return { workspaces: [{ id: 'approved', enabled: this.enabled, available: true }] };
      if (/^\/approvals\/.+\/approve$/.test(path)) {
        if (this.failWrite) { const e = new Error('uncertain'); e.status = 503; throw e; }
        const id = path.split('/')[2]; const proposal = pending.get(id); assert.ok(proposal);
        assert.equal(files[proposal.path], proposal.old);
        backups[proposal.path] = files[proposal.path]; files[proposal.path] = proposal.content; pending.delete(id);
        this.changed.push({ file: proposal.path, status: ' M' }); return { backupCreated: true };
      }
      if (path.startsWith('/git/approvals/')) { this.changed = []; return { ok: true, git: { commitHash: 'fixture-commit' } }; }
      if (path.startsWith('/git/push/approvals/')) return { ok: true };
      throw new Error('Unexpected path');
    },
    async workspace(id, suffix, body) {
      assert.equal(id, 'approved'); calls.push({ path: suffix, body });
      if (suffix === 'git/status') return { git: { repository: true, clean: this.changed.length === 0, branch: 'main', changedFiles: this.changed } };
      if (suffix === 'git/diff') return { git: { diff: 'diff --git a/index.html b/index.html\n--- a/index.html\n+++ b/index.html\n+<meta name="viewport">\n' } };
      if (suffix.startsWith('files?')) return { items: Object.keys(files).map(name => ({ name, type: 'file' })) };
      if (suffix.startsWith('file?')) return { content: files[decodeURIComponent(suffix.split('=')[1])] };
      if (suffix === 'write/propose') { const id = `write-${++sequence}`; pending.set(id, { ...body, old: files[body.path] }); return { approvalId: id }; }
      if (suffix === 'terminal/run') return { terminal: { exitCode: this.exitCode, stdout: 'private output must not appear' } };
      if (suffix === 'git/commit/propose') return { approvalId: 'commit-1', git: { changedFiles: this.changed } };
      if (suffix === 'git/push/propose') return { approvalId: 'push-1', git: { headCommit: 'fixture-commit', branch: 'main', remoteName: 'origin' } };
      throw new Error(`Unexpected suffix ${suffix}`);
    },
  };
  const service = new WorkflowService({ bridge, mappings: [mapping] });
  return { service, bridge, files, backups, calls, pending };
}
async function prepared(f) {
  const run = await f.service.create('client-1', 'website');
  await f.service.act(run.id, 'analyze'); await f.service.act(run.id, 'plan');
  return run.id;
}
async function applied(f) {
  const id = await prepared(f); const waiting = await f.service.act(id, 'propose-files');
  await f.service.act(id, 'approve-files', { approved: true, approvalIds: waiting.approvals.map(a => a.approvalId) }); return id;
}
test('full workflow keeps file, commit and push approvals separate', async () => {
  const f = fixture(); const original = f.files['index.html']; const id = await prepared(f);
  assert.equal(f.files['index.html'], original);
  const waiting = await f.service.act(id, 'propose-files'); assert.equal(waiting.state, 'WAITING_FOR_FILE_APPROVAL');
  assert.equal(f.files['index.html'], original);
  await assert.rejects(f.service.act(id, 'approve-files', { approvalIds: ['write-1'] }));
  await assert.rejects(f.service.act(id, 'approve-files', { approved: true, approvalIds: ['other'] }));
  await f.service.act(id, 'approve-files', { approved: true, approvalIds: ['write-1'] });
  assert.equal(f.backups['index.html'], original); assert.match(f.files['index.html'], /viewport/);
  const validated = await f.service.act(id, 'validate'); assert.equal(validated.state, 'VALIDATION_PASSED');
  assert.equal(validated.afterReport.passedChecks.length, 3); assert.equal(validated.afterReport.filesChanged.length, 1);
  assert.ok(!JSON.stringify(validated).includes('private output'));
  const commit = await f.service.act(id, 'propose-commit', { message: 'Fix mobile viewport' });
  assert.equal(commit.state, 'WAITING_FOR_COMMIT_APPROVAL');
  assert.ok(!f.calls.some(c => c.path.startsWith('/git/approvals/')));
  await assert.rejects(f.service.act(id, 'approve-commit', { approved: true, approvalId: 'wrong' }));
  await f.service.act(id, 'approve-commit', { approved: true, approvalId: commit.commitApprovalId });
  assert.ok(!f.calls.some(c => c.path.startsWith('/git/push/approvals/')));
  const push = await f.service.act(id, 'propose-push');
  await assert.rejects(f.service.act(id, 'approve-push', { approved: true, approvalId: commit.commitApprovalId }));
  const done = await f.service.act(id, 'approve-push', { approved: true, approvalId: push.pushApprovalId });
  assert.equal(done.state, 'PUSHED'); assert.ok(done.history.every(h => STATES.includes(h.state)));
});
test('unknown clients and revoked mappings block access', async () => {
  const f = fixture(); await assert.rejects(f.service.create('unknown', 'website'), /not configured/);
  assert.equal(f.calls.length, 0);
  const id = await prepared(f); f.bridge.enabled = false;
  await assert.rejects(f.service.act(id, 'propose-files'), /not approved/); assert.equal(f.pending.size, 0);
});
test('existing Bridge backups are preserved instead of overwritten', async () => {
  const f = fixture(); f.files['index.html.oneleadq-backup'] = 'previous version';
  const id = await prepared(f);
  await assert.rejects(f.service.act(id, 'propose-files'), /Existing backup/);
  assert.equal(f.files['index.html.oneleadq-backup'], 'previous version'); assert.equal(f.pending.size, 0);
});
test('push cannot include a revision added after this workflow commit', async () => {
  const f = fixture(); const id = await applied(f); await f.service.act(id, 'validate');
  const proposal = await f.service.act(id, 'propose-commit', { message: 'fix' });
  await f.service.act(id, 'approve-commit', { approved: true, approvalId: proposal.commitApprovalId });
  const original = f.bridge.workspace.bind(f.bridge);
  f.bridge.workspace = (workspace, suffix, body) => suffix === 'git/push/propose' ? { approvalId: 'unexpected', git: { headCommit: 'other-commit' } } : original(workspace, suffix, body);
  await assert.rejects(f.service.act(id, 'propose-push'), /HEAD changed/);
  assert.equal(f.service.get(id).state, 'COMMITTED');
  assert.ok(!f.calls.some(c => c.path.startsWith('/git/push/approvals/')));
});
test('file changed after analysis blocks proposal; uninspected and unsafe paths cannot be planned', async () => {
  const f = fixture(); const id = await prepared(f); f.files['index.html'] += 'new edit';
  await assert.rejects(f.service.act(id, 'propose-files'), /changed since analysis/); assert.equal(f.pending.size, 0);
  for (const file of ['../index.html', '.env', 'missing.html', 'node_modules/a.js']) await assert.rejects(f.service.act(id, 'plan', { changes: [{ file, content: 'x', reason: 'fix' }] }));
});
test('allowlist rejects shell text and validation failure blocks commit', async () => {
  const f = fixture(); const id = await applied(f);
  await assert.rejects(f.service.act(id, 'validate', { commandIds: ['npm run build && whoami'] }));
  assert.ok(!f.calls.some(c => c.path === 'terminal/run'));
  f.bridge.exitCode = 1; const failed = await f.service.act(id, 'validate');
  assert.equal(failed.state, 'VALIDATION_FAILED'); assert.equal(failed.afterReport.failedChecks.length, 3);
  await assert.rejects(f.service.act(id, 'propose-commit', { message: 'fix' }));
});
test('unrelated files, backups and sensitive paths block commits', async () => {
  for (const file of ['other.js', 'index.html.oneleadq-backup', '.env']) {
    const f = fixture(); const id = await applied(f); await f.service.act(id, 'validate');
    f.bridge.changed.push({ file, status: '??' });
    await assert.rejects(f.service.act(id, 'propose-commit', { message: 'fix' }), /Commit blocked/);
    assert.ok(!f.calls.some(c => c.path === 'git/commit/propose'));
  }
});
test('concurrency and uncertain write results fail closed', async () => {
  const f = fixture(); const id = await prepared(f); await f.service.act(id, 'propose-files');
  f.service.get(id).busy = true; await assert.rejects(f.service.act(id, 'git'), /in progress/); f.service.get(id).busy = false;
  f.bridge.failWrite = true;
  await assert.rejects(f.service.act(id, 'approve-files', { approved: true, approvalIds: ['write-1'] }));
  assert.equal(f.service.get(id).state, 'FAILED');
});
test('static report detects stacks and categories without source excerpts', () => {
  const report = analyze({ 'index.html': '<html><head></head><body><img src="a"><a href="#">x</a><button></button></body></html>', 'main.css': 'width: 1200px', 'package.json': '{"dependencies":{"next":"1","react":"1","vite":"1"}}', 'main.ts': '' });
  for (const label of ['HTML', 'CSS', 'TypeScript', 'React', 'Next.js', 'Vite']) assert.ok(report.detectedStack.includes(label));
  for (const category of ['metadata', 'seo', 'responsive', 'accessibility', 'performance', 'internal-linking', 'content-structure', 'ui']) assert.ok(report.issues.some(i => i.category === category));
  assert.ok(!JSON.stringify(report).includes('<html>'));
  assert.ok(hasSecret('api_key = "example-sensitive-value"')); assert.ok(!safeFile('.env')); assert.ok(!safeFile('../a.js'));
});
test('Bridge pins local origin, never follows redirects, and suppresses raw errors', async () => {
  assert.throws(() => new Bridge({ url: 'https://example.com' }));
  let captured;
  const bridge = new Bridge({ token: 'test-only', fetcher: async (url, options) => { captured = options; return { ok: false, status: 403, json: async () => ({ error: 'credential must never appear' }) }; } });
  await assert.rejects(bridge.request('/workspaces'), error => !error.message.includes('credential'));
  assert.equal(captured.redirect, 'error');
});
test('HTTP specialist routes require authentication and preserve ordinary /ai', async t => {
  // This test runs from the installed backend, using its existing Express dependency.
  const express = require('express'); const { mountWebDevelopment } = require('../webDevelopment/routes');
  const app = express(); app.use(express.json()); const f = fixture();
  mountWebDevelopment(app, { service: f.service, token: 'test-web-token' });
  app.post('/ai', (req, res) => res.json({ reply: 'existing assistant' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = (path, body, authenticated = true) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer test-web-token' } : {}) }, body: JSON.stringify(body) });
  assert.equal((await send('/web-development/workflows', {}, false)).status, 401);
  const ordinary = await send('/ai', { message: 'hello' }, false); assert.equal((await ordinary.json()).reply, 'existing assistant');
  assert.equal((await send('/ai', { agentId: 'webDevelopment', webDevelopment: { action: 'create' } }, false)).status, 401);
  const created = await send('/ai', { agentId: 'webDevelopment', clientContext: { id: 'client-1', name: 'Example' }, webDevelopment: { action: 'create', projectId: 'website' } });
  const payload = await created.json(); assert.equal(payload.workflow.state, 'IDLE'); assert.equal(payload.agentId, 'webDevelopment');
  const analyzed = await send(`/web-development/workflows/${payload.workflow.id}/analyze`, {}); assert.equal((await analyzed.json()).workflow.state, 'ANALYSIS_COMPLETE');
});

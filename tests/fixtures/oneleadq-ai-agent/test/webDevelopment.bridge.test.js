const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { Bridge } = require('../webDevelopment/bridge');
const { WorkflowService } = require('../webDevelopment/workflow');
test('Stage 16 uses real Stage 15 read/write/validation gates in an isolated fixture', async t => {
  const bridgeRoot = process.env.STAGE15_BRIDGE_ROOT || 'D:\\MY AGENT\\oneleadq-windows-bridge';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oneleadq-stage16-'));
  const project = path.join(root, 'project'); fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'index.html'), '<html><head><title>Test</title></head><body><h1>Test</h1></body></html>');
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ scripts: { typecheck: 'node --check check.js' } }));
  fs.writeFileSync(path.join(project, 'check.js'), 'const valid = true;');
  fs.writeFileSync(path.join(project, '.env'), 'FIXTURE_ONLY=synthetic');
  fs.writeFileSync(path.join(project, 'hero.jpg'), Buffer.alloc(400000));
  execFileSync('git', ['init', '--quiet'], { cwd: project });
  // Untracked fixture files: this stabilization suite never stages or commits.
  fs.writeFileSync(path.join(root, 'workspaces.json'), JSON.stringify({ workspaces: [{ id: 'fixture', name: 'Isolated test', path: project, enabled: true }] }));
  if (fs.existsSync(path.join(bridgeRoot, 'creation.js'))) fs.copyFileSync(path.join(bridgeRoot, 'creation.js'), path.join(root, 'creation.js'));
  for(const file of ['gitSafety.js','updateRecovery.js','approvalGuards.js'])fs.copyFileSync(path.join(bridgeRoot,file),path.join(root,file));
  // Execute original Bridge handlers/security unchanged. Only replace its fixed
  // port and capture the listener for cleanup; dependency lookup uses Bridge deps.
  let source = fs.readFileSync(path.join(bridgeRoot, 'server.js'), 'utf8');
  assert.ok(source.includes('const PORT = 3010;'));
  source = source.replace('const PORT = 3010;', 'const PORT = 0;')
    .replace('app.listen(PORT, BRIDGE_HOST,', 'module.exports = app.listen(PORT, BRIDGE_HOST,');
  const previous = { token: process.env.BRIDGE_API_TOKEN, host: process.env.BRIDGE_HOST };
  process.env.BRIDGE_API_TOKEN = 'isolated-test-token'; process.env.BRIDGE_HOST = '127.0.0.1';
  const mod = new Module(path.join(root, 'server.js'), module); mod.filename = path.join(root, 'server.js');
  mod.paths = Module._nodeModulePaths(bridgeRoot);
  const oldLog = console.log;
  try { console.log = () => {}; mod._compile(source, mod.filename); } finally { console.log = oldLog; }
  const server = mod.exports;
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (previous.token === undefined) delete process.env.BRIDGE_API_TOKEN; else process.env.BRIDGE_API_TOKEN = previous.token;
    if (previous.host === undefined) delete process.env.BRIDGE_HOST; else process.env.BRIDGE_HOST = previous.host;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + '/workspaces')).status, 401);
  const health = await (await fetch(url + '/health')).json();
  assert.equal(health.ok, true); assert.ok(!JSON.stringify(health).includes('fixture'));
  const bridge = new Bridge({ url, token: 'isolated-test-token' });
  if (fs.existsSync(path.join(bridgeRoot, 'creation.js'))) {
    for (const file of ['../escape.html', '.env', 'credentials.json', 'index.html', 'CON.html', 'escape/new.html']) {
      if (file === 'escape/new.html') continue;
      await assert.rejects(bridge.workspace('fixture', 'create/propose', { path: file, content: 'blocked' }));
    }
    const proposal = await bridge.workspace('fixture', 'create/propose', { path: 'new-site/pages/contact.html', content: '<h1>Known business</h1>' });
    assert.equal(fs.existsSync(path.join(project, 'new-site')), false);
    await assert.rejects(bridge.request(`/create/approvals/${proposal.approvalId}/approve`, { workspaceId: 'fixture' }));
    await assert.rejects(bridge.request(`/create/approvals/${proposal.approvalId}/approve`, { approved: true, workspaceId: 'other' }));
    const created = await bridge.request(`/create/approvals/${proposal.approvalId}/approve`, { approved: true, workspaceId: 'fixture' });
    assert.equal(fs.readFileSync(path.join(project, 'new-site/pages/contact.html'), 'utf8'), '<h1>Known business</h1>');
    fs.writeFileSync(path.join(project, 'new-site/pages/contact.html'), 'user edit');
    await assert.rejects(bridge.request(`/create/operations/${created.operationId}/rollback`, { approved: true, workspaceId: 'fixture' }));
    fs.writeFileSync(path.join(project, 'new-site/pages/contact.html'), '<h1>Known business</h1>');
    await bridge.request(`/create/operations/${created.operationId}/rollback`, { approved: true, workspaceId: 'fixture' });
    assert.equal(fs.existsSync(path.join(project, 'new-site')), false);
    const stale = await bridge.workspace('fixture', 'create/propose', { path: 'new.html', content: '<h1>new</h1>' });
    fs.writeFileSync(path.join(project, 'new.html'), 'concurrent file');
    await assert.rejects(bridge.request(`/create/approvals/${stale.approvalId}/approve`, { approved: true, workspaceId: 'fixture' }));
    fs.unlinkSync(path.join(project, 'new.html'));
  }
  await assert.rejects(bridge.workspace('fixture', 'file?path=.env'));
  await assert.rejects(bridge.workspace('fixture', 'file?path=..%2Fworkspaces.json'));
  await assert.rejects(bridge.workspace('fixture', 'terminal/run', { commandId: 'whoami' }));
  const deniedCors = await fetch(url + '/workspaces', { headers: { Authorization: 'Bearer isolated-test-token', Origin: 'https://unapproved.example' } });
  assert.equal(deniedCors.status, 403);
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'escape.html'), 'outside');
  fs.symlinkSync(outside, path.join(project, 'escape'), 'junction');
  if (fs.existsSync(path.join(bridgeRoot, 'creation.js'))) await assert.rejects(bridge.workspace('fixture', 'create/propose', { path: 'escape/new.html', content: 'blocked' }));
  await assert.rejects(bridge.workspace('fixture', 'file?path=escape%2Fescape.html'));
  const service = new WorkflowService({ bridge, mappings: [{ clientId: 'test', projectId: 'site', workspaceId: 'fixture', repository: 'fixture-only', enabled: true }] });
  await assert.rejects(service.create('unmapped', 'site'));
  const run = await service.create('test', 'site'); const original = fs.readFileSync(path.join(project, 'index.html'), 'utf8');
  await service.act(run.id, 'analyze'); await service.act(run.id, 'plan');
  if (fs.existsSync(path.join(bridgeRoot, 'creation.js'))) assert.ok(service.get(run.id).beforeReport.measuredFindings.some(issue => issue.file === 'hero.jpg'));
  const proposal = await service.act(run.id, 'propose-files');
  assert.equal(fs.readFileSync(path.join(project, 'index.html'), 'utf8'), original);
  await service.act(run.id, 'approve-files', { approved: true, approvalIds: proposal.approvals.map(a => a.approvalId) });
  assert.equal(fs.readFileSync(path.join(project, 'index.html.oneleadq-backup'), 'utf8'), original);
  const validated = await service.act(run.id, 'validate');
  assert.equal(validated.state, 'VALIDATION_PASSED'); assert.equal(validated.afterReport.validations[0].commandId, 'npm-typecheck');
  assert.equal(validated.git.diff,''); // No staged/tracked baseline exists in this fixture.
  assert.match(fs.readFileSync(path.join(project,'index.html'),'utf8'),/viewport/);
  await assert.rejects(service.act(run.id, 'propose-commit', { message: 'Fixture only' }), /Commit blocked/);
  // No commits or pushes are executed by this integration test.
  const stale = await bridge.workspace('fixture', 'write/propose', { path: 'check.js', content: 'const modified = true;' });
  fs.writeFileSync(path.join(project, 'check.js'), 'const concurrentEdit = true;');
  await assert.rejects(bridge.request(`/approvals/${stale.approvalId}/approve`, {}));
  assert.equal(fs.readFileSync(path.join(project, 'check.js'), 'utf8'), 'const concurrentEdit = true;');
  if (fs.existsSync(path.join(bridgeRoot, 'creation.js'))) {
    const fresh = path.join(root, 'fresh'); fs.mkdirSync(fresh); execFileSync('git', ['init', '--quiet'], { cwd: fresh });
    fs.writeFileSync(path.join(root, 'workspaces.json'), JSON.stringify({ workspaces: [{ id: 'fresh', name: 'Explicit lifecycle fixture', path: fresh, enabled: true }] }));
    const lifecycle = new WorkflowService({ bridge, mappings: [{ clientId: 'new-site-test', projectId: 'new-site', workspaceId: 'fresh', repository: 'disposable-local-fixture', enabled: true }] });
    const created = await lifecycle.create('new-site-test', 'new-site', { mode: 'CREATE_NEW', requirements: { businessName: 'Fixture Studio', description: 'Client-supplied content.', website: 'https://example.test', pages: ['home', 'contact'], framework: 'STATIC_HTML', language: 'en' } });
    assert.equal(created.state, 'REQUIREMENTS_READY');
    await lifecycle.act(created.id, 'analyze');
    await assert.rejects(lifecycle.act(created.id, 'plan'), /architecture/i);
    await assert.rejects(lifecycle.act(created.id,'architecture'));
    const variants=await lifecycle.act(created.id,'generate-designs');assert.equal(variants.designVariants.length,3);
    await lifecycle.act(created.id,'select-design',{variantId:variants.designVariants[1].id});
    await assert.rejects(lifecycle.act(created.id,'approve-design',{variantId:variants.designVariants[1].id}));
    await lifecycle.act(created.id,'approve-design',{approved:true,variantId:variants.designVariants[1].id});
    const architecture = await lifecycle.act(created.id, 'architecture'); assert.equal(architecture.state, 'ARCHITECTURE_READY');
    const planned = await lifecycle.act(created.id, 'plan');assert.ok(planned.plan.every(file=>file.operation==='CREATE'));
    assert.equal(fs.existsSync(path.join(fresh, 'index.html')), false);
    const proposed = await lifecycle.act(created.id, 'propose-files'); assert.equal(fs.existsSync(path.join(fresh, 'index.html')), false);
    await lifecycle.act(created.id, 'reject-files', { approvalIds: proposed.approvals.filter(a => a.file === 'design-review.json').map(a => a.approvalId) });
    await lifecycle.act(created.id, 'approve-files', { approved: true, approvalIds: proposed.approvals.filter(a => a.file !== 'design-review.json').map(a => a.approvalId) });
    assert.equal(fs.existsSync(path.join(fresh, 'design-review.json')), false);
    const checked = await lifecycle.act(created.id, 'validate'); assert.equal(checked.state, 'VALIDATION_PASSED'); assert.ok(checked.afterReport.audit.sections);
    assert.ok(checked.git.newFiles.some(file => file.file === 'index.html'));
    const commit = await lifecycle.act(created.id, 'propose-commit', { message: 'Reviewed fixture website' });
    assert.equal(commit.state, 'WAITING_FOR_COMMIT_APPROVAL'); assert.equal(commit.commitProposal.message, 'Reviewed fixture website');
    // Owner requested no commits. Stop at the real Bridge commit approval boundary.
    await assert.rejects(lifecycle.act(created.id, 'approve-push', { approved: true, approvalId: commit.commitApprovalId }));
    const rollbackRun = await lifecycle.create('new-site-test', 'new-site', { mode: 'UPGRADE_EXISTING' });
    await lifecycle.act(rollbackRun.id, 'analyze');
    await lifecycle.act(rollbackRun.id, 'plan', { changes: [{ operation: 'CREATE', file: 'draft/notes.html', reason: 'Disposable reviewed draft', content: '<h1>Draft</h1>' }] });
    const rollbackProposal = await lifecycle.act(rollbackRun.id, 'propose-files');
    const appliedDraft = await lifecycle.act(rollbackRun.id, 'approve-files', { approved: true, approvalIds: rollbackProposal.approvals.map(a => a.approvalId) });
    await lifecycle.act(rollbackRun.id, 'rollback-created', { approved: true, operationIds: appliedDraft.approvals.map(a => a.operationId) });
    assert.equal(fs.existsSync(path.join(fresh, 'draft')), false); assert.equal(fs.existsSync(path.join(fresh, 'index.html')), true);
  }
});

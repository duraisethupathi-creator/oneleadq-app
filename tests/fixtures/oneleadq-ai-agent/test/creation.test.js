const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mountCreation, validPath } = require(process.env.STAGE15_BRIDGE_ROOT ? path.join(process.env.STAGE15_BRIDGE_ROOT, 'creation.js') : 'D:\\MY AGENT\\oneleadq-windows-bridge\\creation.js');
test('creation path constraints reject Windows aliases and sensitive names', () => {
  for (const file of ['../escape.html', '/absolute.html', 'C:/escape.html', 'a\\b.html', '.env', 'secrets.json', 'CON.html', 'NUL.html', 'file.html.', 'file.html:stream', 'node_modules/a.js']) assert.equal(validPath(file), false, file);
  assert.equal(validPath('pages/contact.html'), true); assert.equal(validPath('sitemap.xml'), true); assert.equal(validPath('robots.txt'), true);
});
test('creation and rollback bind workspace, HEAD and indexed state', async t => {
  const express = require('express');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oneleadq-create-gate-'));
  let revision = 'head-a', indexed = false;
  const app = express(); app.use(express.json());
  mountCreation(app, { getApprovedWorkspace: id => id === 'approved' ? { path: root } : null,
    resolveSafePath: (workspace, file) => ({ workspaceRoot: workspace.path, targetPath: path.join(workspace.path, file) }),
    runGit: async (_, args) => args[0] === 'ls-files' ? indexed ? 'pages/new.html' : '' : args[1] === '--is-inside-work-tree' ? 'true' : revision });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const send = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const proposal = await send('/workspaces/approved/create/propose', { path: 'pages/new.html', content: '<h1>Known</h1>' });
  const approve = `/create/approvals/${proposal.data.approvalId}/approve`;
  revision = 'head-b'; assert.equal((await send(approve, { approved: true, workspaceId: 'approved' })).status, 409);
  revision = 'head-a'; const created = await send(approve, { approved: true, workspaceId: 'approved' }); assert.equal(created.status, 200);
  const rollback = `/create/operations/${created.data.operationId}/rollback`;
  assert.equal((await send(rollback, { approved: true, workspaceId: 'other' })).status, 409);
  revision = 'head-b'; assert.equal((await send(rollback, { approved: true, workspaceId: 'approved' })).status, 409);
  revision = 'head-a'; indexed = true; assert.equal((await send(rollback, { approved: true, workspaceId: 'approved' })).status, 409);
  indexed = false; assert.equal((await send(rollback, { approved: true, workspaceId: 'approved' })).status, 200);
  assert.equal(fs.existsSync(path.join(root, 'pages')), false);
});

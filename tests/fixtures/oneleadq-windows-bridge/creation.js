const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
function validPath(file) {
  return typeof file === 'string' && file.length < 220 && file.split('/').length <= 7 &&
    file.split('/').every(part => /^[A-Za-z0-9_@()[\]-][A-Za-z0-9_@()[\].-]*$/.test(part) && !part.endsWith('.') &&
      !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part) &&
      !/env|secret|credential|private|token|backup|lock|node_modules|^vendor$|^dist$|^build$/i.test(part)) &&
    (/\.(html|css|js|jsx|ts|tsx|json)$/.test(file) || /(?:^|\/)(robots\.txt|sitemap\.xml)$/.test(file));
}
function sensitive(content) { return /-----BEGIN [\w ]*PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|password|secret|authorization|BRIDGE_API_TOKEN|WEB_AGENT_API_TOKEN)\s*[:=]\s*["'`][^"'`\r\n]{4,}|\b(?:sk-[\w-]{16,}|AIza[\w-]{20,}|gh[pousr]_[\w]{20,})|https?:\/\/[^\s/"'<>:@]+:[^\s/"'<>@]+@/i.test(content); }
function mountCreation(app, { getApprovedWorkspace, resolveSafePath, runGit }) {
  const pending = new Map(), operations = new Map(), busy = new Set();
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const exists = file => { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
  function safe(workspaceId, file) {
    const workspace = getApprovedWorkspace(workspaceId); check(workspace, 'Workspace is not approved');
    check(validPath(file), 'Unsupported or sensitive creation path');
    const result = resolveSafePath(workspace, file);
    // Reuse Stage 15 root/realpath/sensitive checks and additionally refuse any
    // symlink parent, including symlinks that currently point inside the root.
    let cursor = result.workspaceRoot;
    for (const part of file.split('/')) {
      cursor = path.join(cursor, part);
      if (exists(cursor)) check(!fs.lstatSync(cursor).isSymbolicLink(), 'Symlink creation path blocked');
    }
    return { ...result, workspace };
  }
  async function head(workspace) {
    await runGit(workspace.path, ['rev-parse', '--is-inside-work-tree']);
    try { return await runGit(workspace.path, ['rev-parse', '--verify', 'HEAD']); }
    catch { return '(unborn)'; }
  }
  const handler = fn => async (req, res) => {
    try { res.json({ ok: true, ...await fn(req) }); }
    catch { res.status(409).json({ ok: false, error: 'Creation operation blocked or failed; review path, approval, source and repository state locally' }); }
  };
  app.get('/workspaces/:workspaceId/asset-info', handler(req => {
    const file = req.query.path;
    check(typeof file === 'string' && /\.(png|jpe?g|webp|gif|avif|svg|woff2?)$/i.test(file), 'Unsupported asset');
    check(validPath(file.replace(/\.[^.]+$/, '.js')), 'Unsafe asset path');
    const workspace = getApprovedWorkspace(req.params.workspaceId); check(workspace, 'Workspace not approved');
    const checked = resolveSafePath(workspace, file); const stats = fs.statSync(checked.targetPath);
    check(stats.isFile(), 'Asset is not a file');
    return { file, bytes: stats.size, measured: 'filesystem-byte-size' };
  }));
  app.post('/workspaces/:workspaceId/create/propose', handler(async req => {
    check(pending.size < 1000, 'Approval capacity reached');
    const { path: file, content } = req.body || {};
    const target = safe(req.params.workspaceId, file);
    check(!exists(target.targetPath), 'CREATE cannot overwrite existing paths');
    check(typeof content === 'string' && Buffer.byteLength(content) <= 150000 && !sensitive(content), 'Invalid or sensitive content');
    const approvalId = crypto.randomUUID();
    pending.set(approvalId, { workspaceId: req.params.workspaceId, file, content, hash: digest(content), root: fs.realpathSync.native(target.workspaceRoot), head: await head(target.workspace), expires: Date.now() + 15 * 60000 });
    return { approvalId, approvalRequired: true, operation: 'CREATE', file, preview: { content, hash: digest(content) }, created: false };
  }));
  app.post('/create/approvals/:approvalId/reject', handler(req => {
    const item = pending.get(req.params.approvalId);
    check(item && item.workspaceId === req.body?.workspaceId, 'Approval workspace mismatch');
    pending.delete(req.params.approvalId); return { rejected: true };
  }));
  app.post('/create/approvals/:approvalId/approve', handler(async req => {
    check(req.body?.approved === true, 'Explicit approval required');
    const item = pending.get(req.params.approvalId);
    check(item && item.expires > Date.now() && item.workspaceId === req.body.workspaceId, 'Approval missing, expired or wrong workspace');
    check(!busy.has(item.workspaceId), 'Workspace operation busy'); busy.add(item.workspaceId);
    let operation;
    try {
      const target = safe(item.workspaceId, item.file);
      check(fs.realpathSync.native(target.workspaceRoot) === item.root && await head(target.workspace) === item.head, 'Workspace or HEAD changed');
      check(!exists(target.targetPath), 'Target appeared after proposal');
      const operationId = crypto.randomUUID();
      operation = { operationId, workspaceId: item.workspaceId, file: item.file, hash: item.hash, head: item.head, root: item.root, directories: [], created: false };
      operations.set(operationId, operation);
      let directory = target.workspaceRoot;
      for (const part of item.file.split('/').slice(0, -1)) {
        directory = path.join(directory, part);
        safe(item.workspaceId, item.file);
        if (!exists(directory)) { fs.mkdirSync(directory); operation.directories.push(path.relative(target.workspaceRoot, directory).replace(/\\/g, '/')); }
        check(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink(), 'Unsafe parent');
      }
      const current = safe(item.workspaceId, item.file);
      check(fs.realpathSync.native(current.workspaceRoot) === item.root, 'Workspace root changed');
      const descriptor = fs.openSync(current.targetPath, 'wx');
      operation.created = true; operation.identity = fs.fstatSync(descriptor).ino;
      try { fs.writeFileSync(descriptor, item.content, 'utf8'); }
      catch (error) {
        try {
          const checked = safe(item.workspaceId, item.file);
          if (fs.lstatSync(checked.targetPath).ino === operation.identity && !fs.lstatSync(checked.targetPath).isSymbolicLink()) { fs.unlinkSync(checked.targetPath); operation.created = false; }
        } catch {}
        throw error;
      } finally { fs.closeSync(descriptor); }
      pending.delete(req.params.approvalId);
      return { operationId, file: item.file, created: true, contentHash: item.hash, directoriesCreated: operation.directories };
    } catch (error) {
      // Only empty directories made by this operation are eligible for cleanup.
      if (operation && !operation.created) for (const relative of [...operation.directories].reverse()) {
        try { const target = safe(operation.workspaceId, relative + '/probe.html'); fs.rmdirSync(path.dirname(target.targetPath)); } catch {}
      }
      throw error;
    } finally { busy.delete(item.workspaceId); }
  }));
  app.post('/create/operations/:operationId/rollback', handler(async req => {
    check(req.body?.approved === true, 'Explicit rollback approval required');
    const item = operations.get(req.params.operationId);
    check(item?.created && item.workspaceId === req.body.workspaceId, 'Unknown operation or workspace');
    check(!busy.has(item.workspaceId), 'Workspace operation busy'); busy.add(item.workspaceId);
    try {
      const target = safe(item.workspaceId, item.file);
      check(fs.realpathSync.native(target.workspaceRoot) === item.root && await head(target.workspace) === item.head, 'Cannot rollback after commit or root change');
      check(exists(target.targetPath) && fs.statSync(target.targetPath).ino === item.identity && digest(fs.readFileSync(target.targetPath)) === item.hash, 'Created file changed; preserve it');
      // Never remove files already staged by a user, even before the first commit.
      const index = await runGit(target.workspace.path, ['ls-files', '--', item.file]);
      check(!index.trim(), 'Indexed file cannot be rolled back');
      fs.unlinkSync(target.targetPath); item.created = false;
      for (const directory of [...item.directories].reverse()) {
        try { const checked = safe(item.workspaceId, directory + '/probe.html'); fs.rmdirSync(path.dirname(checked.targetPath)); } catch {}
      }
      return { rolledBack: true, file: item.file };
    } finally { busy.delete(item.workspaceId); }
  }));
}
module.exports = { mountCreation, validPath };

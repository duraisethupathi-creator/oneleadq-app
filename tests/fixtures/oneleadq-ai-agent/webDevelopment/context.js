const { demand, hasSecret } = require('./safety');
async function resolveContext(mappings, clientId, projectId, bridge) {
  demand(typeof clientId === 'string' && typeof projectId === 'string', 'clientId and projectId are required', 400);
  const matches = mappings.filter(m => m.clientId === clientId && m.projectId === projectId && m.enabled === true);
  demand(matches.length === 1, 'No approved repository/workspace mapping exists for this client. Project is not configured.', 403);
  const mapping = matches[0];
  demand(typeof mapping.workspaceId === 'string' && typeof mapping.repository === 'string' && mapping.repository.length > 0,
    'Workspace mapping requires an explicit repository', 503);
  if(mapping.repository.startsWith('local://'))demand(mapping.repository==='local://'+mapping.workspaceId && /^[A-Za-z0-9_-]+$/.test(mapping.workspaceId),'Local repository identity must match the explicitly configured workspace ID',400);
  demand(!/[\r\n]/.test(mapping.repository),'Invalid repository identity',400);
  demand(mapping.repository.length<=512 && !hasSecret(mapping.repository) && !/^[A-Za-z]:[\\/]|^\//.test(mapping.repository),'Repository identity must be a safe label, not credentials or a filesystem path',503);
  if(/^https?:\/\//i.test(mapping.repository)){let remote;try{remote=new URL(mapping.repository);}catch{}demand(remote && !remote.username && !remote.password,'Repository identity must not contain credentials',503);}
  const available = await bridge.request('/workspaces');
  demand(available.workspaces.some(w => w.id === mapping.workspaceId && w.enabled && w.available), 'Mapped workspace is not approved or available', 403);
  const status = await bridge.workspace(mapping.workspaceId, 'git/status');
  demand(status.git.repository === true, 'Mapped workspace is not a Git repository', 403);
  // The repository label is an administrator assertion. Stage 15 does not expose
  // a safe read-only remote identity endpoint; never infer ownership from a name.
  return { clientId, projectId, workspaceId: mapping.workspaceId, repository: mapping.repository };
}
module.exports = { resolveContext };

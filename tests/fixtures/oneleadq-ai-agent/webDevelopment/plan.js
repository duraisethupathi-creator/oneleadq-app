const { demand, safeFile, hasSecret, hash } = require('./safety');
function createPlan(files, changes, { allowCreate = false } = {}) {
  if (changes === undefined) {
    changes = Object.entries(files).filter(([file, text]) => file.endsWith('.html') && /<head\b[^>]*>/i.test(text) && !/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(text))
      .map(([file, text]) => ({ file, reason: 'Add standard mobile viewport', content: text.replace(/(<head\b[^>]*>)/i, '$1\n<meta name="viewport" content="width=device-width, initial-scale=1">') }));
  }
  demand(Array.isArray(changes) && changes.length > 0 && changes.length <= 20, 'Provide 1–20 reviewed file changes; no automatic safe fix is available', 400);
  const seen = new Set();
  return changes.map(change => {
    const operation = change?.operation || 'UPDATE';
    demand(['CREATE', 'UPDATE'].includes(operation), 'Unsupported file operation', 400);
    demand(change && safeFile(change.file) && !seen.has(change.file) && (operation === 'CREATE' ? allowCreate && !Object.hasOwn(files, change.file) : Object.hasOwn(files, change.file)), 'Changes must target distinct inspected web files, or approved new paths', 400);
    demand(typeof change.content === 'string' && Buffer.byteLength(change.content) <= 150000 && !hasSecret(change.content), 'Invalid or sensitive proposed content', 400);
    demand(typeof change.reason === 'string' && change.reason.length > 0 && change.reason.length <= 500 && !hasSecret(change.reason), 'A safe change reason is required', 400);
    demand(change.content !== files[change.file], 'Proposed content must differ', 400);
    seen.add(change.file);
    return { file: change.file, operation, reason: change.reason, beforeHash: operation === 'CREATE' ? null : hash(files[change.file]), afterHash: hash(change.content), content: change.content };
  });
}
module.exports = { createPlan };

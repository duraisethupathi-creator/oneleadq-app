const crypto = require('node:crypto');
class WorkflowError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
function demand(condition, message, status) {
  if (!condition) throw new WorkflowError(message, status);
}
function safeFile(file) {
  return typeof file === 'string' && file.length < 240 &&
    !file.includes('\\') && !file.startsWith('/') &&
    file.split('/').every(p => /^[A-Za-z0-9_()[\]@.-]+$/.test(p) && !p.startsWith('.') &&
      !/^(node_modules|dist|build|coverage|vendor)$/i.test(p) &&
      !/env|secret|credential|private|token|backup|lock/i.test(p)) &&
    (/\.(html|css|js|jsx|ts|tsx|json)$/i.test(file) || /(?:^|\/)(robots\.txt|sitemap\.xml)$/.test(file));
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
// Reports never include source excerpts or command output. Secret-bearing source
// is excluded entirely from analysis and proposals, rather than sent to an LLM.
function hasSecret(value) {
  return /-----BEGIN [\w ]*PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|password|secret|authorization|BRIDGE_API_TOKEN)\s*[:=]\s*["'`][^"'`\r\n]{4,}|\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})|https?:\/\/[^\s/"'<>:@]+:[^\s/"'<>@]+@/i.test(value);
}
module.exports = { WorkflowError, demand, safeFile, hash, hasSecret };

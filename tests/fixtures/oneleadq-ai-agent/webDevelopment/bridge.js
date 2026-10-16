const { WorkflowError, demand } = require('./safety');
class Bridge {
  constructor({ url = process.env.WEB_AGENT_BRIDGE_URL || 'http://127.0.0.1:3010', token = process.env.BRIDGE_API_TOKEN, fetcher = fetch } = {}) {
    const parsed = new URL(url);
    demand(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname) && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash,
      'Bridge must use a local HTTP address', 503);
    this.url = parsed.origin; this.token = token; this.fetcher = fetcher;
  }
  async request(path, body) {
    demand(this.token, 'Bridge authentication is not configured', 503);
    let response;
    try {
      response = await this.fetcher(this.url + path, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(195000),
      });
      const data = await response.json();
      // Validation nonzero exits are expected Bridge 400 responses.
      if (path.endsWith('/terminal/run') && data.terminal && Number.isInteger(data.terminal.exitCode)) return data;
      if (!response.ok || data.ok !== true) throw new WorkflowError('Bridge rejected operation; inspect Bridge locally', response.status >= 500 ? 503 : 409);
      return data;
    } catch (error) {
      if (error instanceof WorkflowError) throw error;
      throw new WorkflowError('Bridge unavailable or operation outcome uncertain; inspect Bridge before retrying', 503);
    }
  }
  workspace(id, suffix, body) { return this.request(`/workspaces/${encodeURIComponent(id)}/${suffix}`, body); }
}
module.exports = { Bridge };

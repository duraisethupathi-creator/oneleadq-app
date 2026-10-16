const crypto = require('node:crypto');
const { WorkflowError } = require('./safety');
const { Bridge } = require('./bridge');
const { WorkflowService, STATES } = require('./workflow');

const {
  createPairingCode,
  consumePairingCode,
  registerPairingAttempt,
  pairingLocked,
  createSessionToken,
  verifySessionToken,
  isLoopbackRequest,
} = require('./session');

function mountWebDevelopment(
  app,
  { service, token = process.env.WEB_AGENT_API_TOKEN } = {}
) {
  service ||= new WorkflowService({
    bridge: new Bridge(),
    mappings: require('./workspaces.json').mappings,
    draftDirectory: require('node:path').join(process.env.LOCALAPPDATA || require('node:os').homedir(),'OneLeadQ','workflow-drafts'),
  });

  function safeEqual(left, right) {
    const a = Buffer.from(left || '');
    const b = Buffer.from(right || '');

    return (
      a.length === b.length &&
      a.length > 0 &&
      crypto.timingSafeEqual(a, b)
    );
  }

  function getBearerToken(req) {
    const authorization =
      req.get('authorization') || '';

    if (!authorization.startsWith('Bearer ')) {
      return '';
    }

    return authorization.slice(7).trim();
  }

  /*
   * Accept either:
   * 1. Existing backend master token for trusted backend/admin use.
   * 2. Short-lived scoped mobile session token.
   *
   * The master token must never be embedded in the mobile application.
   */
  const auth = (req, res, next) => {
    if (!token) {
      return res.status(503).json({
        ok: false,
        error:
          'Web agent authentication is not configured',
      });
    }

    const suppliedToken = getBearerToken(req);

    if (safeEqual(suppliedToken, token)) {
      req.webAgentAuth = {
        type: 'master',
      };

      return next();
    }

    const session =
      verifySessionToken(suppliedToken);

    if (session) {
      req.webAgentAuth = {
        type: 'session',
        session,
      };

      return next();
    }

    return res.status(401).json({
      ok: false,
      error:
        'Web agent authentication required',
    });
  };

  /*
   * Shared safe request handler.
   *
   * Important:
   * Never log:
   * - Authorization headers
   * - session tokens
   * - pairing codes
   * - request bodies
   * - source-file contents
   * - secrets
   */
  const handle = (operation) => async (req, res) => {
    try {
      const result = await operation(req);

      return res.json({
        ok: true,
        agentId: 'webDevelopment',
        ...result,
      });
    } catch (error) {
      const status =
        error instanceof WorkflowError
          ? error.status
          : 500;

      /*
       * Safe diagnostic logging only.
       * This helps diagnose workflow failures without
       * exposing authentication or source-code data.
       */
      console.error('[WebDevelopment]', {
        action:
          req.params?.action || 'request',
        status,
        name:
          error?.name || 'Error',
        message: 'Operation failed; details withheld',
      });

      return res.status(status).json({
        ok: false,

        error:
          error instanceof WorkflowError
            ? error.message
            : 'Web agent operation failed',

        ...(
          req.params.id &&
          service.runs.has(req.params.id)
            ? {
                workflow: service.view(
                  service.get(req.params.id)
                ),
              }
            : {}
        ),
      });
    }
  };

  /*
   * Pairing code creation is deliberately localhost-only.
   *
   * Android/LAN clients cannot create their own pairing code.
   * Pairing must be initiated from the trusted laptop.
   */
  app.post(
    '/web-development/session/pair',
    (req, res) => {
      const origin = req.get('origin');
      const allowedOrigins = ['http://localhost:8081', 'http://127.0.0.1:8081', 'http://localhost:19006', 'http://127.0.0.1:19006'];
      if (!isLoopbackRequest(req) || origin && !allowedOrigins.includes(origin)) {
        return res.status(403).json({
          ok: false,
          error:
            'Pairing can only be initiated locally on this computer',
        });
      }

      try {
        const pairing = createPairingCode();

        return res.json({
          ok: true,
          pairingCode: pairing.code,
          expiresAt: pairing.expiresAt,
        });
      } catch {
        return res.status(503).json({
          ok: false,
          error:
            'Web agent session authentication is not configured',
        });
      }
    }
  );

  /*
   * Exchange a valid one-time pairing code for a
   * short-lived web-development session token.
   *
   * Pairing codes are:
   * - short-lived
   * - single-use
   * - protected by attempt limiting
   */
  app.post(
    '/web-development/session/exchange',
    (req, res) => {
      try {
        const pairingCode = String(
          req.body?.pairingCode || ''
        ).trim();

        const clientKey =
          req.socket?.remoteAddress ||
          req.connection?.remoteAddress ||
          'unknown';

        if (pairingLocked(clientKey)) return res.status(429).json({ ok: false, error: 'Too many pairing attempts. Wait before retrying.' });
        const validPairingCode =
          consumePairingCode(pairingCode);

        const attempt =
          registerPairingAttempt(
            clientKey,
            validPairingCode
          );

        if (!attempt.allowed) {
          return res.status(429).json({
            ok: false,
            error:
              'Too many pairing attempts. Wait one minute and try again.',
          });
        }

        if (!validPairingCode) {
          return res.status(401).json({
            ok: false,
            error:
              'Invalid or expired pairing code',
          });
        }

        const session =
          createSessionToken();

        return res.json({
          ok: true,
          sessionToken:
            session.token,
          expiresAt:
            session.expiresAt,
          scope: [
            'web-development',
          ],
        });
      } catch {
        return res.status(503).json({
          ok: false,
          error:
            'Web agent session authentication is not configured',
        });
      }
    }
  );

  app.get(
    '/web-development/states',
    auth,
    handle(() => ({
      states: STATES,
    }))
  );

  app.get('/web-development/workflows/:id/reports/:phase',auth,async(req,res)=>{
    try{const run=service.get(req.params.id),phase=req.params.phase.toUpperCase();
      if(req.query.format==='html'){res.type('html').send(require('./reports').reportHtml(run,phase));return;}
      const bytes=await require('./reports').pdf(run,phase);res.set('Content-Disposition',`attachment; filename=OneLeadQ-${phase}-${run.id}.pdf`).type('application/pdf').send(bytes);
    }catch(e){res.status(e.status||503).json({ok:false,error:e instanceof WorkflowError?e.message:'Report rendering failed; HTML report remains available.'});}
  });

  app.post(
    '/web-development/workflows',
    auth,
    handle(async (req) => ({
      workflow:
        await service.create(
          req.body?.clientId,
          req.body?.projectId, req.body
        ),
    }))
  );

  app.get(
    '/web-development/workflows/:id',
    auth,
    handle((req) => ({
      workflow:
        service.view(
          service.get(req.params.id)
        ),
    }))
  );

  app.post(
    '/web-development/workflows/:id/:action',
    auth,
    handle(async (req) => ({
      workflow:
        await service.act(
          req.params.id,
          req.params.action,
          req.body || {}
        ),
    }))
  );

  /*
   * Explicit Web Development specialist dispatch.
   *
   * Ordinary conversational /ai requests remain unchanged.
   */
  app.post(
    '/ai',

    (req, res, next) =>
      req.body?.agentId ===
        'webDevelopment' &&
      req.body?.webDevelopment
        ? auth(req, res, next)
        : next('route'),

    handle(async (req) => {
      const input =
        req.body.webDevelopment;

      const workflow =
        input.action === 'create'
          ? await service.create(
              req.body
                .clientContext?.id,
              input.projectId, input
            )
          : await service.act(
              input.workflowId,
              input.action,
              input
            );

      return {
        workflow,
        agent:
          'Web Development Agent',
        reply:
          `Web development workflow: ${workflow.state}`,
      };
    })
  );

  return service;
}

module.exports = {
  mountWebDevelopment,
};

const crypto = require('node:crypto');

const PAIRING_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_PAIRING_ATTEMPTS = 5;
const PAIRING_LOCKOUT_MS = 60 * 1000;

const pairingAttempts = new Map();

const pairingCodes = new Map();

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function createPairingCode() {
  const code = crypto.randomInt(100000, 1000000).toString();
  const now = Date.now();

  pairingCodes.set(code, {
    createdAt: now,
    expiresAt: now + PAIRING_TTL_MS,
    used: false,
  });

  cleanupPairingCodes();

  return {
    code,
    expiresAt: now + PAIRING_TTL_MS,
  };
}

function cleanupPairingCodes() {
  const now = Date.now();

  for (const [code, record] of pairingCodes.entries()) {
    if (
      record.used ||
      !Number.isFinite(record.expiresAt) ||
      record.expiresAt <= now
    ) {
      pairingCodes.delete(code);
    }
  }
}

function registerPairingAttempt(clientKey, success) {
  const now = Date.now();
  const key = clientKey || 'unknown';
  const current = pairingAttempts.get(key);

  if (success) {
    pairingAttempts.delete(key);
    return { allowed: true };
  }

  if (current?.lockedUntil && current.lockedUntil > now) {
    return {
      allowed: false,
      lockedUntil: current.lockedUntil,
    };
  }

  const attempts =
    current && now - current.firstAttemptAt < PAIRING_LOCKOUT_MS
      ? current.attempts + 1
      : 1;

  const record = {
    attempts,
    firstAttemptAt:
      current && now - current.firstAttemptAt < PAIRING_LOCKOUT_MS
        ? current.firstAttemptAt
        : now,
    lockedUntil:
      attempts >= MAX_PAIRING_ATTEMPTS
        ? now + PAIRING_LOCKOUT_MS
        : null,
  };

  pairingAttempts.set(key, record);

  return {
    allowed: record.lockedUntil === null,
    lockedUntil: record.lockedUntil,
  };
}

function consumePairingCode(code) {
  cleanupPairingCodes();

  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return false;
  }

  const record = pairingCodes.get(code);

  if (!record || record.used || record.expiresAt <= Date.now()) {
    return false;
  }

  record.used = true;
  pairingCodes.delete(code);

  return true;
}
function pairingLocked(clientKey) {
  return (pairingAttempts.get(clientKey)?.lockedUntil || 0) > Date.now();
}

function getSigningSecret() {
  const secret = process.env.WEB_AGENT_SESSION_SECRET;

  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error(
      'WEB_AGENT_SESSION_SECRET must be configured with at least 32 characters'
    );
  }

  return secret;
}

function sign(encodedPayload) {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');
}

function createSessionToken() {
  const now = Date.now();

  const payload = {
    type: 'web-agent-session',
    scope: ['web-development'],
    jti: randomId(),
    iat: now,
    exp: now + SESSION_TTL_MS,
  };

  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = sign(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: payload.exp,
  };
}

function verifySessionToken(token) {
  if (typeof token !== 'string' || token.length > 4096) {
    return null;
  }

  const parts = token.split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, suppliedSignature] = parts;

  if (!encodedPayload || !suppliedSignature) {
    return null;
  }

  let expectedSignature;

  try {
    expectedSignature = sign(encodedPayload);
  } catch {
    return null;
  }

  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  let payload;

  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );
  } catch {
    return null;
  }

  const now = Date.now();

  if (
    !payload ||
    payload.type !== 'web-agent-session' ||
    !Array.isArray(payload.scope) ||
    !payload.scope.includes('web-development') ||
    typeof payload.jti !== 'string' ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.exp) ||
    payload.iat > now + 60_000 ||
    payload.exp <= now ||
    payload.exp - payload.iat > SESSION_TTL_MS
  ) {
    return null;
  }

  return payload;
}

function isLoopbackRequest(req) {
  const address =
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    '';

  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  );
}

module.exports = {
  PAIRING_TTL_MS,
  SESSION_TTL_MS,
  createPairingCode,
  consumePairingCode,
  registerPairingAttempt,
  pairingLocked,
  createSessionToken,
  verifySessionToken,
  isLoopbackRequest,
};

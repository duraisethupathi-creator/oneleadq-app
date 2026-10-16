const test = require('node:test');
const assert = require('node:assert/strict');

process.env.WEB_AGENT_SESSION_SECRET =
  process.env.WEB_AGENT_SESSION_SECRET ||
  'test-only-session-secret-0123456789abcdef';

const {
  createPairingCode,
  consumePairingCode,
  createSessionToken,
  verifySessionToken,
  registerPairingAttempt,
} = require('../webDevelopment/session');

test('pairing code is single-use', () => {
  const pairing = createPairingCode();

  assert.equal(consumePairingCode(pairing.code), true);
  assert.equal(consumePairingCode(pairing.code), false);
});

test('invalid pairing codes are rejected', () => {
  assert.equal(consumePairingCode('123'), false);
  assert.equal(consumePairingCode('abcdef'), false);
  assert.equal(consumePairingCode('0000000'), false);
});

test('valid session token verifies with web-development scope', () => {
  const session = createSessionToken();
  const payload = verifySessionToken(session.token);

  assert.ok(payload);
  assert.equal(payload.type, 'web-agent-session');
  assert.ok(payload.scope.includes('web-development'));
  assert.ok(payload.exp > Date.now());
});

test('tampered session token is rejected', () => {
  const session = createSessionToken();
  const [payload, signature] = session.token.split('.');

  const tamperedPayload =
    `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;

  assert.equal(
    verifySessionToken(`${tamperedPayload}.${signature}`),
    null
  );
});

test('pairing attempts lock after repeated failures', () => {
  const clientKey = `test-client-${Date.now()}`;

  for (let attempt = 1; attempt < 5; attempt += 1) {
    const result = registerPairingAttempt(clientKey, false);
    assert.equal(result.allowed, true);
  }

  const locked = registerPairingAttempt(clientKey, false);

  assert.equal(locked.allowed, false);
  assert.ok(locked.lockedUntil > Date.now());
});

test('successful pairing clears failed-attempt state', () => {
  const clientKey = `test-reset-${Date.now()}`;

  registerPairingAttempt(clientKey, false);
  registerPairingAttempt(clientKey, false);

  const success = registerPairingAttempt(clientKey, true);
  assert.equal(success.allowed, true);

  const nextFailure = registerPairingAttempt(clientKey, false);
  assert.equal(nextFailure.allowed, true);
});
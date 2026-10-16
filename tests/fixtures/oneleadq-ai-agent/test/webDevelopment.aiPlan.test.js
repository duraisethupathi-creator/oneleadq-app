const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  extractJson,
} = require('../webDevelopment/aiPlan');

test('AI plan parser accepts an empty safe plan', () => {
  const result = extractJson('[]');

  assert.deepEqual(result, []);
});

test('AI plan parser accepts JSON inside a code fence', () => {
  const result = extractJson('```json\n[]\n```');

  assert.deepEqual(result, []);
});

test('AI plan parser rejects invalid JSON', () => {
  assert.throws(
    () => extractJson('not-json'),
    SyntaxError
  );
});
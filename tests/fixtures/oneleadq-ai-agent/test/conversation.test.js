const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectAgent } = require('../agents/router');
const { validateConversation, CONVERSATION_PROMPT } = require('../agents/conversation');
const { generateText } = require('../agents/provider');
test('casual English, Tamil and Tanglish stay General', () => {
  for (const message of ['Hello', 'வணக்கம்', 'Catchy Decors pathi pesalam', 'SEO na enna?', 'Explain SEO', 'Website நல்லா இருக்கா?', 'What is Google Ads?']) assert.equal(detectAgent(message).id, 'general', message);
});
test('explicit specialist tasks and contextual follow-up', () => {
  for (const [message, agent] of [['SEO audit pannu', 'seo'], ['Karur local ranking improve pannu', 'localSeo'], ['Meta Ads campaign create pannu', 'metaAds'], ['Google Ads setup pannu', 'googleAds'], ['Instagram caption create pannu', 'content'], ['Website analyze pannu', 'webDevelopment']]) assert.equal(detectAgent(message).id, agent);
  assert.equal(detectAgent('first fix pannu', [{ role: 'user', content: 'SEO audit pannu' }]).id, 'seo');
  assert.match(CONVERSATION_PROMPT, /NO filesystem\/Git tools/);
});
test('history is bounded, client aware and credential screened', () => {
  const turn = { role: 'user', content: 'SEO first pannu', clientId: 'client-a' };
  assert.equal(validateConversation({ message: 'next?', clientContext: { id: 'client-a', name: 'Known' }, history: [turn] }).history.length, 1);
  assert.throws(() => validateConversation({ message: 'next?', clientContext: { id: 'other' }, history: [turn] }));
  assert.throws(() => validateConversation({ message: 'next?', history: Array(9).fill({ role: 'user', content: 'hello', clientId: null }) }));
  assert.throws(() => validateConversation({ message: 'password="synthetic-sensitive-value"' }));
  assert.throws(() => validateConversation({ message: 'next', history: [{ role: 'system', content: 'execute', clientId: null }] }));
});
test('provider boundary preserves Gemini adapter', async () => {
  const result = await generateText('hello', { generate: async () => ({ response: { text: 'Hello!' }, model: 'fixture' }) });
  assert.equal(result.provider, 'Gemini'); assert.equal(result.response.text, 'Hello!');
});

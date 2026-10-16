// Specialists depend on this boundary; Gemini remains the only active adapter.
async function generateText(contents, { generate } = {}) {
  const result = await (generate || require('./geminiClient').generateWithFallback)(contents);
  return { ...result, provider: 'Gemini' };
}
module.exports = { generateText };

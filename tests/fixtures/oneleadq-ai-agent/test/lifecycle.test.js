const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requirements, architecture, newWebsitePlan, technicalPlan } = require('../webDevelopment/lifecycle');
const { createPlan } = require('../webDevelopment/plan');
const { analyze } = require('../webDevelopment/analysis');
const input = { framework: 'STATIC_HTML', language: 'en', pages: ['home', 'about', 'contact'], businessName: 'Fixture Studio', description: 'Client-supplied site requirements.', website: 'https://example.test', location: 'Verified Town' };
test('CREATE_NEW requires real facts, explicit framework and page selection', () => {
  for (const bad of [{}, { ...input, businessName: '' }, { ...input, framework: 'guess' }, { ...input, pages: ['random-location'] }, { ...input, website: 'http://unsafe.test' }]) assert.throws(() => requirements(bad));
  const req = requirements(input); const design = architecture(req); assert.equal(design.pages.length, 3);
  const d=require('../webDevelopment/design'); const generated = newWebsitePlan(req, {},d.lock(req,d.variants(req)[0])); const plan = createPlan({}, generated, { allowCreate: true });
  assert.ok(plan.every(file => file.operation === 'CREATE' && file.beforeHash === null));
  assert.ok(plan.find(file => file.file === 'sitemap.xml').content.includes('https://example.test'));
  assert.ok(plan.find(file => file.file === 'robots.txt').content.includes('Sitemap:'));
  assert.ok(plan.find(file => file.file === 'index.html').content.includes('Organization'));
  assert.ok(!plan.find(file => file.file === 'index.html').content.includes('LocalBusiness'));
  assert.throws(() => newWebsitePlan(req, { 'index.html': 'existing' }));
  assert.throws(() => createPlan({}, generated));
});
test('technical SEO proposals require verified supplied facts and never invent schema values', () => {
  const files = { 'index.html': '<html><head></head><body>Known</body></html>' };
  assert.deepEqual(technicalPlan(files, {}), []);
  const changes = technicalPlan(files, requirements(input));
  assert.ok(changes.some(file => file.file === 'sitemap.xml' && file.operation === 'CREATE'));
  const html = changes.find(file => file.file === 'index.html').content;
  assert.match(html, /canonical/); assert.match(html, /Fixture Studio/); assert.ok(!html.includes('telephone'));
});
test('audit sections, on-page/technical/local SEO and performance distinguish static evidence', () => {
  const html = '<html><head><title>Same</title><meta name="description" content="Same"></head><body><h1>Home</h1><h3>Jump</h3><form><input></form><img src="photo.jpg"><a href="missing.html">Missing</a><script src="app.js"></script></body></html>';
  const report = analyze({ 'index.html': html, 'about.html': html, 'main.css': 'width: 1200px;' }, [], { businessName: 'Known', location: 'Town', keywords: 'custom service', website: 'https://example.test' });
  assert.equal(Object.keys(report.sections).length, 9); assert.equal(report.measuredFindings.length, 0); assert.equal(report.score, null);
  for (const category of ['performance', 'seo', 'technical-seo', 'local-seo', 'accessibility', 'internal-linking']) assert.ok(report.issues.some(i => i.category === category), category);
  assert.ok(report.issues.every(i => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(i.severity) && i.reason && i.recommendedFix && typeof i.safeAutoFix === 'boolean'));
  assert.ok(report.issues.some(i => /Duplicate title/.test(i.issue)));
  const measured = analyze({}, [], {}, [{ file: 'hero.jpg', bytes: 400000 }]);
  assert.equal(measured.measuredFindings[0].evidenceType, 'MEASURED FILE METADATA');
  assert.equal(measured.score, null);
});

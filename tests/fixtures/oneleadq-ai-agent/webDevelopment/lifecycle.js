const { demand, hasSecret } = require('./safety');
const escape = text => String(text || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function requirements(input) {
  demand(input && typeof input === 'object' && !Array.isArray(input), 'Website requirements are required', 400);
  const result = {};
  for (const key of ['businessName', 'businessType', 'location', 'address', 'phone', 'email', 'website', 'description', 'productsServices', 'designPreference', 'seoLocation', 'keywords', 'assets']) {
    demand(input[key] === undefined || typeof input[key] === 'string' && input[key].length <= 3000 && !hasSecret(input[key]), 'Invalid or sensitive requirements', 400);
    result[key] = input[key]?.trim() || '';
  }
  demand(result.businessName && result.description, 'Provide the real business name and website requirements/description', 400);
  demand(input.framework === 'STATIC_HTML', 'CREATE_NEW currently requires explicitly selected STATIC_HTML', 400);
  demand(['en', 'ta'].includes(input.language), 'Select the website language explicitly', 400);
  demand(Array.isArray(input.pages) && input.pages.length > 0 && input.pages.length <= 8 && new Set(input.pages).size === input.pages.length && input.pages.every(p => ['home', 'about', 'services', 'products', 'gallery', 'projects', 'contact', 'privacy-policy'].includes(p)), 'Select distinct supported pages', 400);
  demand(input.pages.includes('home'), 'Home page is required', 400);
  if (result.website) {
    let url; try { url = new URL(result.website); } catch {}
    demand(url && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'Provide a verified HTTPS website URL', 400);
    result.website = url.href.replace(/\/$/, '');
  }
  const {preferences,websiteType}=require('./design');
  const type=websiteType(input.websiteType || 'BUSINESS');
  return { ...result, framework: input.framework, language: input.language, pages: input.pages, websiteType:type.id, design:preferences(input.design), assetReferences:require('./staticSite').assetList(input.assetReferences) };
}
const pageFile = page => page === 'home' ? 'index.html' : `${page}.html`;
function architecture(req, designLock) {
  return { designLock, adapters:require('./frameworks').ADAPTERS, framework: req.framework, language: req.language, pages: req.pages.map(page => ({ page, file: pageFile(page) })),
    assets: req.assets || 'No assets supplied; no logo or image will be invented', designPreference: req.designPreference || 'Minimal responsive layout',
    contentSource: 'Only explicitly supplied requirements; missing page copy is labelled pending review',
    files: [...req.pages.map(pageFile), 'styles.css', 'site.js', 'validate-site.js', 'design-review.json', 'package.json', 'robots.txt', ...(req.website ? ['sitemap.xml'] : [])] };
}
function schema(req) {
  return { '@context': 'https://schema.org', '@type': req.address ? 'LocalBusiness' : 'Organization', name: req.businessName,
    ...(req.website ? { url: req.website } : {}), ...(req.address ? { address: req.address } : {}), ...(req.phone ? { telephone: req.phone } : {}) };
}
function technicalPlan(files, req) {
  const changes = [];
  if (!req.website || !req.businessName) return changes;
  const pages = Object.entries(files).filter(([file, text]) => file.endsWith('.html') && !/noindex/i.test(text));
  for (const [file, text] of pages) {
    let content = text;
    if (!/application\/ld\+json/i.test(content)) content = content.replace(/<\/head>/i, `<script type="application/ld+json">${JSON.stringify(schema(req)).replace(/</g, '\\u003c')}</script></head>`);
    if (!/<link\b[^>]*rel=["']canonical["']/i.test(content)) content = content.replace(/<\/head>/i, `<link rel="canonical" href="${escape(req.website + '/' + (file === 'index.html' ? '' : file))}"></head>`);
    if (content !== text) changes.push({ file, content, reason: 'Propose canonical and supported schema from supplied real client facts', operation: 'UPDATE' });
  }
  if (pages.length && !Object.hasOwn(files, 'robots.txt')) changes.push({ file: 'robots.txt', content: `User-agent: *\nAllow: /\nSitemap: ${req.website}/sitemap.xml\n`, reason: 'Review public crawl policy before creation', operation: 'CREATE' });
  if (pages.length && !Object.hasOwn(files, 'sitemap.xml')) changes.push({ file: 'sitemap.xml', content: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(([file]) => `<url><loc>${escape(req.website + '/' + (file === 'index.html' ? '' : file))}</loc></url>`).join('')}</urlset>\n`, reason: 'Propose inspected indexable HTML pages on the supplied verified domain', operation: 'CREATE' });
  return changes;
}
const newWebsitePlan=(req,files,designLock)=>require('./staticSite').build(req,files,designLock);
module.exports = { requirements, architecture, newWebsitePlan, schema, technicalPlan };

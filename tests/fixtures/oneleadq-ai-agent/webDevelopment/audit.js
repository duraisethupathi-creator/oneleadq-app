const path = require('node:path').posix;
const SECTIONS = ['Website Health', 'UI/UX', 'Mobile/Responsive', 'On-Page SEO', 'Technical SEO', 'Local SEO', 'Performance', 'Accessibility Basics', 'Broken Elements'];
function extendAudit(files, report, client = {}, assets = []) {
  const issues = report.issues.map(issue => ({ ...issue, severity: issue.severity.toUpperCase(), issue: issue.recommendation, reason: 'Static source signal requires review', recommendedFix: issue.recommendation, safeAutoFix: issue.category === 'responsive' && /viewport/.test(issue.recommendation), evidenceType: 'STATIC / INFERRED' }));
  const add = (file, category, severity, issue, reason, recommendedFix, safeAutoFix = false) => issues.push({ id: `extended-${issues.length + 1}`, file, category, severity, issue, reason, recommendation: recommendedFix, recommendedFix, safeAutoFix, evidenceType: 'STATIC / INFERRED' });
  const pages = Object.entries(files).filter(([file]) => file.endsWith('.html'));
  const titles = new Map(), descriptions = new Map(), bodyCopies = new Map();
  for (const [file, html] of pages) {
    const meta = name => { const tag = (html.match(/<meta\b[^>]*>/gi) || []).find(tag => new RegExp(`(?:name|property)\\s*=\\s*["']${name}["']`, 'i').test(tag)); return tag?.match(/content\s*=\s*["']([^"']*)/i)?.[1] || ''; };
    const title = html.match(/<title\b[^>]*>([^<]*)/i)?.[1]?.trim() || '';
    const description = meta('description');
    for (const [value, map, label] of [[title, titles, 'title'], [description, descriptions, 'description']]) if (value) {
      if (map.has(value)) add(file, 'seo', 'MEDIUM', `Duplicate ${label}`, `Matches another inspected page: ${map.get(value)}`, 'Write page-specific metadata using approved facts'); else map.set(value, file);
    }
    if (!/<link\b[^>]*rel\s*=\s*["']canonical["']/i.test(html)) add(file, 'technical-seo', 'MEDIUM', 'Missing canonical', 'No static canonical link found', 'Confirm production URL and propose canonical');
    if (!meta('og:title') || !meta('og:description') || !meta('twitter:card')) add(file, 'seo', 'LOW', 'Incomplete social metadata', 'Open Graph/Twitter metadata not found', 'Propose page-specific social metadata');
    let previous = 0;
    for (const heading of html.matchAll(/<h([1-6])\b/gi)) { const level = Number(heading[1]); if (previous && level > previous + 1) add(file, 'content-structure', 'LOW', 'Skipped heading level', 'Heading hierarchy jumps by more than one', 'Review heading hierarchy'); previous = level; }
    const body = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (body.split(/\s+/).filter(Boolean).length < 80) add(file, 'content-structure', 'LOW', 'Thin content signal', 'Fewer than 80 static body words; app-rendered text may be absent from source', 'Review useful page-specific content; avoid padding or fabricated claims');
    if (body && bodyCopies.has(body)) add(file, 'content-structure', 'MEDIUM', 'Duplicate body content signal', 'Static body matches another inspected page', 'Review duplicate content and canonical intent'); else if (body) bodyCopies.set(body, file);
    if (!/<nav\b/i.test(html)) add(file, 'ui', 'LOW', 'Navigation landmark not found', 'No nav element in static source', 'Review accessible site navigation');
    if (!/href\s*=\s*["'](?:[^"']*contact|tel:|mailto:)/i.test(html) && !/<form\b/i.test(html)) add(file, 'ui', 'LOW', 'Contact conversion path not detected', 'No contact link or form detected in static source', 'Review a real contact path using supplied contact details');
    if (/target\s*=\s*["']_blank["']/i.test(html) && !/rel\s*=\s*["'][^"']*noopener/i.test(html)) add(file, 'seo', 'LOW', 'External link attributes need review', 'New-tab links may lack explicit opener isolation', 'Review rel attributes without changing destination intent');
    if ((html.match(/href\s*=\s*["']([^"']+)["']/gi)||[]).some(tag=>/\.html(?:[?#]|["']$)/i.test(tag)&&/[A-Z ]/.test(tag.replace(/^href\s*=\s*["']/i,'')))) add(file, 'technical-seo', 'LOW', 'URL structure signal', 'Uppercase or spaces in a static page URL', 'Review consistent URL conventions; preserve redirects before changing paths');
    if (/<form\b/i.test(html) && !/\b(?:action|onSubmit)\s*=/i.test(html)) add(file, 'broken-elements', 'HIGH', 'Form submission handling not detected', 'Static form lacks action or onSubmit', 'Verify real submission behavior; never invent a backend');
    if (/<input\b/i.test(html) && !/<label\b|aria-label\s*=/i.test(html)) add(file, 'accessibility', 'HIGH', 'Form labels not detected', 'No labels found for inputs', 'Associate each field with a visible label');
    for (const match of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
      const link = match[1];
      if (/^http:\/\//i.test(link)) add(file, 'technical-seo', 'MEDIUM', 'Insecure URL signal', 'HTTP resource or link in source', 'Verify HTTPS availability before changing URL');
      if (/^https?:\/\//i.test(link) || /^(#|mailto:|tel:|data:|javascript:)/i.test(link)) continue;
      const clean = link.split(/[?#]/)[0]; if (!clean) continue;
      const target = path.normalize(clean.startsWith('/') ? clean.slice(1) : path.join(path.dirname(file), clean));
      const candidates = [target, target.replace(/\/$/, '') + '/index.html', target + '.html'];
      if (/\.(html|css|js)$/.test(target) && !candidates.some(p => Object.hasOwn(files, p))) add(file, 'internal-linking', 'HIGH', 'Possibly broken internal resource', 'Target missing from bounded inspected files; routes/rewrites may supply it', 'Verify route or resource before fixing');
    }
    if (/<img\b(?![^>]*loading\s*=)[^>]*>/i.test(html)) add(file, 'performance', 'LOW', 'Image loading policy absent', 'No loading attribute; above-fold hero images should not be lazy', 'Lazy-load verified below-fold images only');
    if ((html.match(/<script\b[^>]*>/gi)||[]).some(tag=>/\bsrc\s*=/i.test(tag)&&! /\b(?:defer|async)\b|type\s*=\s*["']module/i.test(tag))) add(file, 'performance', 'MEDIUM', 'Potential blocking script', 'Script source lacks visible deferred loading', 'Verify execution dependencies before deferring');
    if (/@font-face/.test(html) && !/font-display\s*:/.test(html)) add(file, 'performance', 'LOW', 'Font display policy missing', 'Inline font-face without font-display', 'Review font-display: swap and layout shift');
    if (client.location && !html.toLowerCase().includes(client.location.toLowerCase())) add(file, 'local-seo', 'LOW', 'Supplied location not present', 'Location text absent from static source', 'Review useful contact/location relevance; do not generate doorway pages');
    if (client.businessName && !html.includes(client.businessName)) add(file, 'local-seo', 'MEDIUM', 'Business name consistency needs review', 'Supplied business name absent from source', 'Review naming against client-approved facts');
    if (client.phone && !html.includes(client.phone)) add(file, 'local-seo', 'LOW', 'Supplied phone not present', 'Verified contact value absent from source', 'Review contact consistency against supplied phone');
    if (client.address && !html.includes(client.address)) add(file, 'local-seo', 'LOW', 'Supplied address not present', 'Verified address absent from source', 'Review useful contact/address consistency');
    if (client.address && !/maps\.google|google\.com\/maps/i.test(html)) add(file, 'local-seo', 'LOW', 'Maps integration not detected', 'No map link in static source', 'Ask for the verified business map URL before proposing an integration');
    if (client.keywords && !client.keywords.split(',').some(k => k.trim() && html.toLowerCase().includes(k.trim().toLowerCase()))) add(file, 'seo', 'LOW', 'Provided keyword relevance signal absent', 'None of the supplied terms detected in static source', 'Review natural relevance without keyword stuffing');
    if (!/application\/ld\+json/i.test(html)) add(file, 'technical-seo', 'LOW', 'Structured data not found', 'No JSON-LD in static page', 'Propose supported Organization/LocalBusiness facts only');
    for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) try { JSON.parse(match[1]); } catch { add(file, 'broken-code', 'HIGH', 'Invalid JSON-LD', 'Structured data cannot be parsed', 'Correct JSON syntax without fabricating fields'); }
  }
  if (pages.length && !Object.keys(files).some(f => f === 'robots.txt')) add('robots.txt', 'technical-seo', 'MEDIUM', 'robots.txt absent from inspection', 'Crawler policy not inspected; deployment may supply it', 'Propose only after verifying desired crawl policy', true);
  if (pages.length && !Object.keys(files).some(f => f === 'sitemap.xml')) add('sitemap.xml', 'technical-seo', 'MEDIUM', 'sitemap.xml absent from inspection', 'No sitemap found in bounded source', 'Use a confirmed domain and reviewed indexable URLs', !!client.website);
  for (const [file, text] of Object.entries(files)) {
    if (/\.css$/.test(file) && /!important/g.test(text) && (text.match(/!important/g) || []).length > 5) add(file, 'performance', 'LOW', 'CSS complexity signal', 'Many important declarations', 'Review cascade and unused styles with browser coverage');
    if (/\.js$/.test(file) && text.length > 100000) add(file, 'performance', 'LOW', 'Large source module signal', 'Source exceeds 100 KB; bundled size unmeasured', 'Inspect bundle and code splitting before optimization');
    if (/ReactDOM\.render\s*\(/.test(text)) add(file, 'broken-code', 'LOW', 'Legacy render API signal', 'ReactDOM.render found; compatibility depends on installed React version', 'Verify dependency version and migrate only if needed');
    if (/\beval\s*\(/.test(text)) add(file, 'broken-code', 'CRITICAL', 'Dynamic evaluation requires security review', 'eval call found; execution context is unverified', 'Review and replace dynamic evaluation where possible');
    if (/<meta\b[^>]*http-equiv\s*=\s*["']refresh["']/i.test(text)) add(file, 'technical-seo', 'MEDIUM', 'Meta refresh redirect signal', 'Client-side redirect detected', 'Review redirect destination and server-side status configuration');
    if (/noindex/i.test(text)) add(file, 'technical-seo', 'HIGH', 'Noindex signal', 'Source contains noindex; may be intentional', 'Confirm page indexability before changing');
  }
  const sectionFor = category => ({ ui: 'UI/UX', responsive: 'Mobile/Responsive', seo: 'On-Page SEO', metadata: 'On-Page SEO', 'content-structure': 'On-Page SEO', 'technical-seo': 'Technical SEO', 'local-seo': 'Local SEO', performance: 'Performance', accessibility: 'Accessibility Basics', 'broken-elements': 'Broken Elements', 'internal-linking': 'Broken Elements' })[category] || 'Website Health';
  for (const asset of assets) if (/\.(png|jpe?g|webp|gif|avif)$/i.test(asset.file) && asset.bytes > 300000) {
    add(asset.file, 'performance', 'MEDIUM', 'Large image file', `Filesystem size ${asset.bytes} bytes exceeds the documented 300000-byte review threshold`, 'Review responsive formats and compression; display size and loading time are unmeasured');
    issues[issues.length - 1].evidenceType = 'MEASURED FILE METADATA';
  }
  return { ...report, issues, recommendedChanges: issues.map(issue => ({ issueId: issue.id, file: issue.file, recommendation: issue.recommendedFix })), filesThatWouldBeModified: [...new Set(issues.map(issue => issue.file))], sections: Object.fromEntries(SECTIONS.map(section => [section, issues.filter(i => sectionFor(i.category) === section)])),
    measuredFindings: issues.filter(issue => issue.evidenceType === 'MEASURED FILE METADATA'), assetMetadata: assets, evidenceType: 'STATIC / INFERRED with separately identified file metadata', score: null,
    limitations: [...report.limitations, 'Static audit does not measure live crawl, redirects, caching, Lighthouse or Core Web Vitals. Asset bytes and optional snapshot runtime checks are labeled separately.', 'React/Next/Vite rendered metadata and component versions require runtime/dependency review.'] };
}
module.exports = { extendAudit, SECTIONS };

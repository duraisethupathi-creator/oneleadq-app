const { safeFile, hasSecret } = require('./safety');
async function inspect(bridge, workspaceId) {
  const files = {}; const skipped = []; const assets = []; const queue = [{ path: '', depth: 0 }];
  let directories = 0; let bytes = 0;
  while (queue.length && directories < 60 && Object.keys(files).length < 100 && bytes < 2000000) {
    const next = queue.shift(); directories++;
    let listing;
    try { listing = await bridge.workspace(workspaceId, `files?path=${encodeURIComponent(next.path)}`); }
    catch (error) { if (!next.path) throw error; skipped.push(next.path); continue; }
    for (const item of listing.items.slice(0, 300)) {
      const file = next.path ? `${next.path}/${item.name}` : item.name;
      if (item.type === 'file' && /\.(png|jpe?g|webp|gif|avif|svg|woff2?)$/i.test(file) && safeFile(file.replace(/\.[^.]+$/, '.js')) && assets.length < 100) {
        try { const metadata = await bridge.workspace(workspaceId, `asset-info?path=${encodeURIComponent(file)}`); if (Number.isFinite(metadata.bytes)) assets.push({ file, bytes: metadata.bytes }); } catch { skipped.push(file); }
      }
      if (item.type === 'directory' && next.depth < 5 && safeFile(`${file}/probe.js`)) queue.push({ path: file, depth: next.depth + 1 });
      if (item.type !== 'file' || !safeFile(file)) continue;
      if (Object.keys(files).length >= 100 || bytes >= 2000000) break;
      try {
        const result = await bridge.workspace(workspaceId, `file?path=${encodeURIComponent(file)}`);
        if (typeof result.content !== 'string' || Buffer.byteLength(result.content) > 150000 || hasSecret(result.content)) { skipped.push(file); continue; }
        bytes += Buffer.byteLength(result.content); files[file] = result.content;
      } catch { skipped.push(file); }
    }
  }
  return { files, skipped, assets, bounded: true };
}
function analyze(files, skipped = [], client = {}, assets = []) {
  const stack = new Set(); const issues = []; let scripts = {};
  const add = (file, category, severity, recommendation) => issues.push({ id: `issue-${issues.length + 1}`, file, category, severity, recommendation });
  for (const [file, text] of Object.entries(files)) {
    const extension = file.split('.').pop();
    const tech = { html: 'HTML', css: 'CSS', js: 'JavaScript', jsx: 'React', ts: 'TypeScript', tsx: 'React' }[extension];
    if (tech) stack.add(tech);
    if (file.endsWith('package.json')) {
      stack.add('package.json-based web project');
      try {
        const pkg = JSON.parse(text); const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [key, label] of [['react', 'React'], ['next', 'Next.js'], ['vite', 'Vite']]) if (deps[key]) stack.add(label);
        if (file === 'package.json') scripts = pkg.scripts || {};
      } catch { add(file, 'broken-code', 'high', 'Repair invalid package.json JSON before validation'); }
    }
    if (extension === 'html') {
      if (!/<title\b[^>]*>\s*[^<\s]/i.test(text)) add(file, 'metadata', 'medium', 'Add a descriptive page title using approved client content');
      if (!/<meta\b[^>]*name\s*=\s*["']description["']/i.test(text)) add(file, 'seo', 'medium', 'Add a page-specific meta description');
      if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(text)) add(file, 'responsive', 'high', 'Add the standard device-width viewport meta tag');
      if (!/<html\b[^>]*\blang\s*=/i.test(text)) add(file, 'accessibility', 'medium', 'Specify the page language');
      if (!/<h1\b/i.test(text)) add(file, 'content-structure', 'medium', 'Add a meaningful main heading');
      if ((text.match(/<h1\b/gi) || []).length > 1) add(file, 'content-structure', 'low', 'Review multiple main headings for a clear hierarchy');
    }
    if (/\.(html|jsx|tsx)$/.test(file)) {
      if (/<img\b(?![^>]*\balt\s*=)[^>]*>/i.test(text)) add(file, 'accessibility', 'high', 'Provide appropriate image alt text');
      if (/<img\b(?![^>]*\b(?:width|height)\s*=)[^>]*>/i.test(text)) add(file, 'performance', 'medium', 'Set image dimensions to reduce layout shift');
      if (/href\s*=\s*["'](?:#|javascript:)["']/i.test(text)) add(file, 'internal-linking', 'medium', 'Replace placeholder navigation with verified destinations');
      if (/<button\b[^>]*>\s*<\//i.test(text)) add(file, 'ui', 'high', 'Give empty buttons a visible label and accessible name');
    }
    if (/(?:^|[;{])\s*width\s*:\s*(?:[89]\d\d|[1-9]\d{3,})px/i.test(text)) add(file, 'responsive', 'medium', 'Review fixed widths on mobile; use constrained fluid layouts');
  }
  return require('./audit').extendAudit(files, { detectedStack: [...stack], filesInspected: Object.keys(files), issues, recommendedChanges: issues.map(i => ({ issueId: i.id, file: i.file, recommendation: i.recommendation })),
    filesThatWouldBeModified: [...new Set(issues.map(i => i.file))], skippedFiles: skipped,
    limitations: ['Bounded static heuristics; findings require review.', 'Browser layout, runtime correctness, crawl completeness and measured performance are not tested.'],
    validationCommands: [['typecheck', 'npm-typecheck'], ['test', 'npm-test'], ['lint', 'npm-lint'], ['build', 'npm-build']].filter(([script]) => typeof scripts[script] === 'string').map(([, command]) => command) }, client, assets);
}
module.exports = { inspect, analyze };

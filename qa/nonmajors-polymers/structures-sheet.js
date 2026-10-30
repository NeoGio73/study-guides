// Renders every RDKit structure SVG from the polymers guide onto contact sheets (PNG) for visual review.
// Usage: node structures-sheet.js -> structures-1.png, structures-2.png, ...
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../../organic-chemistry/polymers-surf-zone.html'), 'utf8');
const body = html.replace(/<script[\s\S]*?<\/script>/g, '');
const svgs = [...body.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m => m[0]).filter(s => /rdkit/.test(s));
const cells = svgs.map((s, i) => { const lab = (s.match(/aria-label="([^"]*)"/) || [])[1] || ''; return `<div class="c"><div class="n">${i}: ${lab}</div>${s}</div>`; });
const per = 12; const out = [];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1.5 });
  for (let k = 0; k * per < cells.length; k++) {
    const doc = `<html><body style="background:#fff;color:#000;font:14px sans-serif;margin:8px"><style>.g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.c{border:1px solid #ccc;padding:6px}.c svg{width:100%;height:auto;max-height:260px}.n{font-weight:bold;margin-bottom:4px}</style><div class="g">${cells.slice(k * per, (k + 1) * per).join('')}</div></body></html>`;
    await p.setContent(doc); const f = path.join(__dirname, `structures-${k + 1}.png`); await p.screenshot({ path: f, fullPage: true }); out.push(f);
  }
  await b.close(); console.log(svgs.length, 'structures ->', out.join(' '));
})();

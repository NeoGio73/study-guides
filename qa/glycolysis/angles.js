// Measures bond angles at each trigonal carbon from the <line> elements the page draws.
const P = require('./page.js');
const want = { Glc: [0], G6P: [0], G3P: [0], BPG: [0], PG3: [0], PG2: [0], PEP: [0, 1], Pyr: [0, 1], F6P: [1], FBP: [1], DHAP: [1] };
const out = []; let worst = 0;
for (const [key, rowsWanted] of Object.entries(want)) for (const flip of key === 'DHAP' ? [false, true] : [false]) {
  const svg = P.fischer(key, { num: true, flip });
  const lines = [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)].map(m => m.slice(1).map(Number));
  const Cs = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)" font-size="15" text-anchor="middle"[^>]*>C<\/text>/g)].map(m => [Number(m[1]), Number(m[2]) - 5]);
  // rows: carbon text y order; pick the C atoms in the wanted rows (C atoms only exist for non-condensed rows)
  const rowY = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" font-size="11" text-anchor="end"/g)].map(m => Number(m[1]) - 5);
  for (const r of rowsWanted) {
    const row = flip ? rowY.length - 1 - r : r; const cy = rowY[row];
    const c = Cs.find(p => Math.abs(p[1] - cy) < 0.01); if (!c) { out.push(key + ' row ' + r + ': no C found'); continue; }
    const dirs = [];
    for (const [x1, y1, x2, y2] of lines) {
      const d1 = Math.hypot(x1 - c[0], y1 - c[1]), d2 = Math.hypot(x2 - c[0], y2 - c[1]);
      if (Math.min(d1, d2) > 13.5 || Math.max(d1, d2) < Math.min(d1, d2) + 4) continue;
      let ux = x2 - x1, uy = y2 - y1; if (d1 > d2) { ux = -ux; uy = -uy; }
      const a = Math.atan2(-uy, ux) * 180 / Math.PI;           // math angle, y up
      if (!dirs.some(b => Math.abs(((a - b + 540) % 360) - 180) < 1)) dirs.push(a);   // a double bond counts once
    }
    dirs.sort((p, q) => p - q);
    const gaps = dirs.map((a, i) => ((dirs[(i + 1) % dirs.length] - a + 360) % 360) || 360);
    gaps.forEach(g => worst = Math.max(worst, Math.abs(g - 120)));
    out.push(`${key}${flip ? ' (flipped)' : ''} C-${r + 1}: ${dirs.length} bonds, directions ${dirs.map(a => a.toFixed(1)).join(', ')}°, angles ${gaps.map(g => g.toFixed(1)).join(' / ')}°`);
  }
}
console.log(out.join('\n')); console.log('max deviation from 120°:', worst.toFixed(2) + '°');

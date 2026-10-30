// Collects results/*.json into results/summary.json: problems per section, checks run, and faults grouped
// by code (slip-shadowing pairs that come from coincident numbers are summarised separately).
'use strict';
const fs = require('fs');
const R = n => JSON.parse(fs.readFileSync(__dirname + '/results/' + n + '.json', 'utf8'));
const summary = { generated: new Date().toISOString(), guides: {} };
for (const n of ['mole', 'stoich', 'solstoich', 'solgas']) {
  const r = R(n);
  // problems per section (sections without a type are counted once, not twice)
  const problems = {};
  for (const [k, v] of Object.entries(r.problems)) {
    if (k.includes(':')) continue;
    const typed = Object.keys(r.problems).some(x => x.startsWith(k + ':'));
    problems[k] = (typed || k === 'lab') ? v : v / 2;      // untyped sections were counted twice by the recorder
  }
  const checksByType = {};
  for (const [k, v] of Object.entries(r.checks)) { const t = k.split(' | ')[1].replace(/: .*/, ''); checksByType[t] = (checksByType[t] || 0) + v; }
  const faults = {}, shadow = {};
  for (const f of r.faults) {
    if (/^slip-message-shadowed/.test(f.code)) { shadow[f.code] = (shadow[f.code] || 0) + f.n; continue; }
    const key = f.code;
    faults[key] = faults[key] || { n: 0, bySection: {}, detail: f.detail, example: f.examples[0] };
    faults[key].n += f.n; faults[key].bySection[f.section] = (faults[key].bySection[f.section] || 0) + f.n;
  }
  summary.guides[r.guide] = { problems, checksTotal: Object.values(checksByType).reduce((a, b) => a + b, 0), checksByType, faults,
    slipShadowingPairs: Object.keys(shadow).length, slipShadowingInstances: Object.values(shadow).reduce((a, b) => a + b, 0) };
}
const ui = R('ui-grade');
summary.uiGrade = { problems: 0, accepted: 0, slipChecks: 0, slipMismatches: 0, blankChecks: 0, blankFails: 0 };
for (const p of ui) for (const x of p.runs) { const s = summary.uiGrade; s.problems += x.n; s.accepted += x.ok; s.slipChecks += x.slipChecks || 0; s.slipMismatches += (x.slipFails || []).length; s.blankChecks += x.blankChecks || 0; s.blankFails += (x.blankFails || []).length; }
const sm = R('smoke');
summary.smoke = sm.map(p => ({ page: p.page, view: p.view, clicks: p.clicks, problems: p.problemsSeen, pageErrors: p.pageErrors.length, consoleErrors: p.consoleErrors.length,
  badTokenHits: p.bad.reduce((s, b) => s + b.hits.length, 0), overflow: p.overflow.length, notes: p.notes }));
summary.boundaryRng = R('extreme').map(g => ({ guide: g.guide, problems: g.problems, faults: g.faults.length }));
summary.content = R('content');
fs.writeFileSync(__dirname + '/results/summary.json', JSON.stringify(summary, null, 1));
for (const [g, v] of Object.entries(summary.guides)) {
  console.log('\n' + g, JSON.stringify(v.problems), 'checks', v.checksTotal, 'shadowPairs', v.slipShadowingPairs);
  for (const [k, f] of Object.entries(v.faults)) console.log('  ', k, f.n, JSON.stringify(f.bySection).slice(0, 300));
}
console.log(JSON.stringify(summary.uiGrade), JSON.stringify(summary.smoke.map(s => [s.view, s.page.slice(0, 12), s.clicks, s.pageErrors, s.consoleErrors, s.badTokenHits, s.overflow])));

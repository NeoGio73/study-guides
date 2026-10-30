// Calorimetry guide: does each named slip message fire when the slip value is typed the way a student would
// round it (3 significant figures, or 1 decimal for temperatures)? Also: the worked solution's printed q for
// Section 1 problems, compared with the q the guided blank expects.
'use strict';
const L = require('./lib');
const N = +(process.env.N || 2000);
(async () => {
  const browser = await L.launch();
  const {ctx, page, errors} = await L.openPage(browser, L.CALOR, {seed: 2718});
  const res = await page.evaluate(N => {
    const div = document.createElement('div'); const txt = h => { div.innerHTML = String(h); return div.textContent; };
    const out = {};
    const rec = (kind, type, key, ok, sample) => { const K = out[kind + '/' + type] = out[kind + '/' + type] || {tried: 0, fired: 0, missed: {}, samples: {}}; K.tried++; if(ok) K.fired++; else { K.missed[key] = (K.missed[key] || 0) + 1; if(!K.samples[key]) K.samples[key] = sample; } };
    const solQ = {count: 0, mismatched: 0, sample: null};
    for(const kind of ['heat', 'exchange', 'coffee', 'thermo', 'hess']){
      let prev = null;
      for(let k = 0; k < N * (kind === 'heat' ? 3 : kind === 'hess' ? 1 : 2); k++){
        const P = kind === 'hess' ? makeHess(prev) : makeProblem(kind, prev); prev = P;
        const parts = kind === 'hess' ? [hessPart(P, P.eqs.map(e => ({rev: e.need < 0, mult: Math.abs(e.need)})))] : P.parts;
        parts.forEach(p => { if(p.type !== 'num') return;
          p.errors.forEach(e => {
            const typed = p.sf ? Number(e.value).toPrecision(3) : Number(e.value).toFixed(1);
            const g = gradePart(p, typed), key = txt(e.msg).replace(/−?[\d.]+ (g|mL|°C|J|kJ)/g, 'X $1').slice(0, 110);
            rec(kind, P.type || 'hess', key, g.status === 'wrong' && g.msg === e.msg, {q: txt(P.question || ''), answer: p.answer, slip: e.value, typed, got: g.status + ': ' + txt(g.msg || '').slice(0, 120)});
          }); });
        if(kind === 'heat' && P.type !== 'q' && P.type !== 'qk'){
          const m = txt(P.solution).match(/Heat in joules\. q = (−?[\d,.]+) J/); const want = P.blanks.q.want; solQ.count++;
          const shown = Number(m[1].replace('−', '-').replace(/,/g, ''));
          if(Math.abs(shown - want) > 0.01 * Math.abs(want)){ solQ.mismatched++; if(!solQ.sample) solQ.sample = {q: txt(P.question), solutionLine: m[0], blankWant: want}; }
        }
      }
    }
    return {out, solQ};
  }, N);
  await ctx.close(); await browser.close();
  L.writeJSON('calor-slips.json', res);
  for(const k in res.out){ const K = res.out[k]; console.log(k.padEnd(18), 'slip messages fired', K.fired + '/' + K.tried, Object.keys(K.missed).length ? JSON.stringify(K.missed) : ''); for(const s in K.samples) console.log('      e.g.', s.slice(0, 80), '::', JSON.stringify(K.samples[s]).slice(0, 380)); }
  console.log('Section 1 worked solution q vs guided-blank q:', JSON.stringify(res.solQ));
  console.log('page errors', errors.length);
})();

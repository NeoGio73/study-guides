// Gases guide: does each worked explanation ("why") end with the same answer string the page displays as the answer?
'use strict';
const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const {ctx, page} = await L.openPage(browser, L.GASES, {seed: 5150, patch: L.patchGases});
  const r = await page.evaluate(() => { const G = window.__G, div = document.createElement('div'); const txt = h => { div.innerHTML = String(h); return div.textContent; }; const out = {}; let total = 0;
    for(const s in G.BANK){ if(s === 'mix') continue; G.BANK[s].forEach((it, i) => { if(typeof it !== 'function') return; for(let k = 0; k < 1000; k++){ const Q = it(); if(Q.k !== 'num') return; total++;
      const show = txt(Q.show), why = txt(Q.why || ''); if(why.indexOf(show) < 0){ const key = s + '[' + i + ']'; out[key] = out[key] || {n: 0, sample: null}; out[key].n++; if(!out[key].sample) out[key].sample = {q: txt(Q.q), show, why: why.slice(-160)}; } } }); }
    return {total, out}; });
  L.writeJSON('gases-why.json', r);
  console.log('numeric problems', r.total); for(const k in r.out) console.log(k, r.out[k].n, JSON.stringify(r.out[k].sample).slice(0, 400));
  await ctx.close(); await browser.close();
})();

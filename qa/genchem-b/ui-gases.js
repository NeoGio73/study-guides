// Gases guide through the real practice UI: for every section, 2,000 questions. Each one is answered with the
// page's own displayed answer typed into the box (as plain text, the way it reads on screen), sometimes after
// opening the hint/setup, sometimes after first typing a named slip to see that its message appears.
'use strict';
const L = require('./lib');
const N = +(process.env.N || 2000);

(async () => {
  const browser = await L.launch();
  const {ctx, page, errors} = await L.openPage(browser, L.GASES, {seed: 777, patch: L.patchGases});
  const secs = await page.evaluate(() => window.__G.SECTIONS.filter(s => s.n).map(s => s.id));
  const out = {N, sections: {}, pageErrors: errors};
  for(const id of secs){
    const r = await page.evaluate(([id, N]) => {
      const G = window.__G; G.go(id, false);
      const el = document.querySelector('[data-quiz="' + id + '"]'), S = G.quiz[id];
      const div = document.createElement('div'); const txt = h => { div.innerHTML = String(h); return div.textContent; };
      const fb = () => (el.querySelector('.fb') || {}).textContent || '';
      const submit = () => el.querySelector('form').dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
      const res = {count: 0, byKind: {}, fails: [], slipTried: 0, slipShown: 0, slipMissing: [], hintsOpened: 0};
      for(let k = 0; k < N; k++){
        const Q = S.Q; res.byKind[Q.k] = (res.byKind[Q.k] || 0) + 1; res.count++;
        if(k % 3 === 1){ const h = el.querySelector('[data-act="hint"]'); if(h){ h.click(); res.hintsOpened++; } }
        if(Q.k === 'num'){
          if(k % 4 === 0 && Q.traps && Q.traps.length){
            const t = Q.traps[k % Q.traps.length], typed = txt(G.numH(t[0], 3));
            el.querySelector('.pin').value = typed; submit(); res.slipTried++;
            if(fb().indexOf(txt(t[1])) >= 0) res.slipShown++; else if(res.slipMissing.length < 15) res.slipMissing.push({q: txt(Q.q), typed, want: txt(t[1]), got: fb()});
          }
          // °C answers: a slip typed to whole degrees, the way the page rounds its own °C answers
          if(Q.unit === '°C' && Q.traps && Q.traps.length && S.misses < 2){
            const t = Q.traps[(k >> 1) % Q.traps.length], typed = String(Math.round(t[0]));
            el.querySelector('.pin').value = typed; submit(); res.degTried = (res.degTried || 0) + 1;
            if(fb().indexOf(txt(t[1])) >= 0) res.degShown = (res.degShown || 0) + 1; else if((res.degMissing || (res.degMissing = [])).length < 10) res.degMissing.push({q: txt(Q.q), typed, want: txt(t[1]), got: fb()});
          }
          el.querySelector('.pin').value = txt(Q.show);
          submit();
          if(/^−0$/.test(txt(Q.show))) res.minusZero = (res.minusZero || 0) + 1;
        } else if(Q.k === 'mc'){
          const i = Q.opts.indexOf(Q.c); const inp = el.querySelector('input[type=radio][value="' + i + '"]'); inp.checked = true; submit();
        } else if(Q.k === 'order'){ Q.cur = Q.items.slice(); submit(); }
        const f = fb();
        if(!/Correct\./.test(f)) res.fails.push({kind: Q.k, q: txt(Q.q), show: Q.show ? txt(Q.show) : txt(Q.c || ''), fb: f.slice(0, 300)});
        const nx = el.querySelector('[data-act="next"]'); if(!nx){ res.fails.push({q: txt(Q.q), note: 'no next button'}); break; } nx.click();
      }
      return res;
    }, [id, N]);
    out.sections[id] = r;
    console.log(id.padEnd(8), 'questions', r.count, JSON.stringify(r.byKind), 'not accepted', r.fails.length, 'hints', r.hintsOpened, 'slip messages shown', r.slipShown + '/' + r.slipTried, '°C whole-degree slips shown', (r.degShown || 0) + '/' + (r.degTried || 0), '−0 shown', r.minusZero || 0);
    (r.degMissing || []).slice(0, 3).forEach(f => console.log('   °C SLIP MISSING', JSON.stringify(f).slice(0, 400)));
    r.fails.slice(0, 3).forEach(f => console.log('   FAIL', JSON.stringify(f).slice(0, 400)));
    r.slipMissing.slice(0, 3).forEach(f => console.log('   SLIP MSG MISSING', JSON.stringify(f).slice(0, 400)));
  }
  await ctx.close(); await browser.close();
  L.writeJSON('gases-ui.json', out);
  console.log('page errors', errors.length, errors.slice(0, 3));
})();

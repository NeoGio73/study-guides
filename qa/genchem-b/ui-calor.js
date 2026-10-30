// Calorimetry guide through the real UI at all three help levels. For each problem the guided blanks are filled
// with values computed here from the question text, the answer boxes with either the page's own displayed answer
// (as on-screen text) or this script's independent answer rounded to the page's significant figures.
'use strict';
const L = require('./lib');
const C = require('./calor-solve');
const PER = +(process.env.N || 700);    // problems per help level per section

const patch = body => { body = L.patchCalor(body); const mk = 'function renderTabs(){'; if(body.indexOf(mk) < 0) throw new Error('renderTabs'); return body.replace(mk, 'window.__S = state;\n' + mk); };
const roundLike = (x, sf, dp) => dp != null ? x.toFixed(dp) : x.toPrecision(sf);   // keeps trailing zeros, like a student reporting sig figs

(async () => {
  const browser = await L.launch();
  const {ctx, page, errors} = await L.openPage(browser, L.CALOR, {seed: 99, patch});
  const out = {PER, sections: {}, hess: null, pageErrors: errors};
  for(const kind of (process.env.KINDS || 'heat,exchange,coffee,thermo').split(',')){
    await page.evaluate(k => document.querySelector('#tabs button[data-tab="' + k + '"]').click(), kind);
    const R = out.sections[kind] = {};
    for(const mode of ['guided', 'hint', 'solo']){
      await page.evaluate(m => document.querySelector('.modebar button[data-mode="' + m + '"]').click(), mode);
      const M = R[mode] = {problems: 0, accepted: 0, mineAccepted: 0, mineTried: 0, failures: [], blankRejects: [], blankMsgs: 0, hintsShown: 0};
      for(let k = 0; k < PER; k++){
        // read the problem as the student sees it
        const info = await page.evaluate(kind => { const S = window.__S[kind], P = S.P; const div = document.createElement('div'); const txt = h => { div.innerHTML = String(h); return div.textContent; };
          return {type: P.type, q: document.querySelector('#problem .q').textContent, eq: (document.querySelector('#problem .eqwrap') || {}).textContent || '', parts: P.parts.map(p => ({show: txt(p.show), sf: p.sf, tolAbs: p.tolAbs})),
            blanks: Array.from(document.querySelectorAll('#help input.blank')).map(i => i.dataset.k)}; }, kind);
        M.problems++;
        let mine = null; try { mine = C.solve(kind, info.type, C.sub(info.q), C.sub(info.eq)); } catch(e){ M.failures.push({q: info.q, err: 'solver: ' + e.message}); }
        const useMine = mine && k % 2 === 1;
        const answers = info.parts.map((p, i) => { if(!useMine) return p.show.replace(/\s+(J|kJ|g|mol|°C|kJ\/mol|J\/\(g·°C\)).*$/, '');
          return roundLike(mine.exp[i], p.sf || 3, p.sf ? null : 1); });
        if(useMine) M.mineTried++;
        const bv = mode === 'guided' ? C.blankValues(kind, info.type, info.q, info.eq) : {};
        const r = await page.evaluate(([answers, bv, mode, k]) => {
          if(mode === 'hint'){ for(let j = 0; j < 2; j++){ const h = document.querySelector('#actions [data-act="hint"]'); if(h) h.click(); } }
          const hints = document.querySelectorAll('#help .helplab').length;
          document.querySelectorAll('#help input.blank').forEach(i => { if(bv[i.dataset.k] != null) i.value = bv[i.dataset.k]; });
          document.querySelectorAll('#ans .pin').forEach((p, i) => { p.value = answers[i]; });
          document.querySelector('#ans').dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
          const fb = document.querySelector('#fb').textContent;
          const badBlanks = Array.from(document.querySelectorAll('#help input.blank.no')).map(i => i.dataset.k + '=' + i.value);
          const unfilled = Array.from(document.querySelectorAll('#help input.blank')).filter(i => !i.value).map(i => i.dataset.k);
          const ok = /^✓/.test(fb) && /Correct|All parts correct/.test(fb), sig = /significant figures/.test(fb);
          const nx = document.querySelector('#actions [data-act="next"]'); if(nx) nx.click();
          return {fb, ok, sig, badBlanks, unfilled, hints};
        }, [answers, bv, mode, k]);
        M.hintsShown += r.hints;
        if(r.ok && !r.sig){ M.accepted++; if(useMine) M.mineAccepted++; }
        else M.failures.push({type: info.type, q: info.q, typed: answers, show: info.parts.map(p => p.show), fb: r.fb.slice(0, 300), mine: useMine});
        if(r.badBlanks.length) M.blankRejects.push({type: info.type, q: info.q, bad: r.badBlanks, fb: r.fb.slice(0, 200)});
        if(mode === 'guided' && r.unfilled.length) M.blankMsgs++;
      }
      console.log(kind.padEnd(9), mode.padEnd(7), 'problems', M.problems, 'accepted', M.accepted, '(independent answers accepted ' + M.mineAccepted + '/' + M.mineTried + ')', 'blank rejects', M.blankRejects.length, 'unfilled-blank problems', M.blankMsgs, 'hint panels', M.hintsShown);
      M.failures.slice(0, 3).forEach(f => console.log('    FAIL', JSON.stringify(f).slice(0, 500)));
      M.blankRejects.slice(0, 3).forEach(f => console.log('    BLANK', JSON.stringify(f).slice(0, 400)));
    }
  }

  // Hess's law through the UI: arrange each equation with the Reverse and multiplier buttons, fill the guided ΔH
  // blanks with values computed from the displayed ΔH, then enter the displayed answer.
  if(process.env.NOHESS){ await ctx.close(); await browser.close(); L.writeJSON('calor-ui-heat-rerun.json', out); console.log('page errors', errors.length); return; }
  await page.evaluate(() => document.querySelector('#tabs button[data-tab="hess"]').click());
  const H = out.hess = {};
  for(const mode of ['guided', 'hint', 'solo']){
    await page.evaluate(m => document.querySelector('.modebar button[data-mode="' + m + '"]').click(), mode);
    const M = H[mode] = {problems: 0, accepted: 0, matched: 0, failures: [], blankRejects: [], oddCoefs: {}};
    for(let k = 0; k < PER; k++){
      const r = await page.evaluate(([mode, k]) => {
        const S = window.__S.hess, P = S.P, res = {};
        const cards = document.querySelectorAll('#problem .hcard');
        // a detour first: multiply every equation by ½ and look at what "Your version" shows
        P.eqs.forEach((e, i) => cards[i].querySelector('[data-mult="' + i + ':0.5"]').click());
        res.odd = Array.from(document.querySelectorAll('#problem [id^="hv"] .coef')).map(c => c.textContent).filter(t => /\d\.\d*\//.test(t));
        res.tipOdd = /\d\.\d*\//.test(document.querySelector('#hsum').textContent) ? document.querySelector('#hsum').textContent.slice(0, 260) : ''; res.yourVersion = Array.from(document.querySelectorAll('#problem [id^="hv"]')).map(x => x.textContent).filter(t => /\d\.\d*\//.test(t)).slice(0, 2);
        // now the right arrangement
        P.eqs.forEach((e, i) => { const c = cards[i]; if(S.ch[i].rev !== (e.need < 0)) c.querySelector('[data-rev="' + i + '"]').click(); c.querySelector('[data-mult="' + i + ':' + Math.abs(e.need) + '"]').click(); });
        res.matched = /matches the target/.test(document.querySelector('#hsum').textContent) || mode === 'solo';
        const dhShown = Array.from(cards).map(c => Number(c.querySelector('.eq .dh').textContent.replace(/[^\d.+−-]/g, '').replace('−', '-').replace('+', '')));
        if(mode === 'guided') P.eqs.forEach((e, i) => { const v = dhShown[i] * (e.need < 0 ? -1 : 1) * Math.abs(e.need); document.getElementById('hb' + i).value = (v >= 0 ? '+' : '') + v.toFixed(1); });
        const mine = P.eqs.reduce((s, e, i) => s + dhShown[i] * e.need, 0);
        document.getElementById('pin0').value = k % 2 ? mine.toFixed(1) : '';
        if(!(k % 2)){ const div = document.createElement('div'); div.innerHTML = hessPart(P, S.ch).show; document.getElementById('pin0').value = div.textContent.replace(' kJ', ''); }
        document.getElementById('ans').dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
        res.fb = document.querySelector('#fb').textContent; res.ok = /^✓/.test(res.fb) && /Correct/.test(res.fb);
        res.bad = Array.from(document.querySelectorAll('#problem input.blank.no')).map(i => i.id + '=' + i.value);
        res.typed = document.getElementById('pin0').value;
        document.querySelector('#actions [data-act="next"]').click();
        return res;
      }, [mode, k]);
      M.problems++; if(r.ok) M.accepted++; else M.failures.push(r); if(r.matched) M.matched++;
      if(r.bad.length) M.blankRejects.push(r);
      r.odd.forEach(c => { M.oddCoefs[c] = (M.oddCoefs[c] || 0) + 1; }); if(r.tipOdd){ M.oddCoefs['in the sum/tip line'] = (M.oddCoefs['in the sum/tip line'] || 0) + 1; if(!M.tipSample) M.tipSample = r.tipOdd; } if(r.yourVersion.length && !M.versionSample) M.versionSample = r.yourVersion;
    }
    console.log('hess     ', mode.padEnd(7), 'problems', M.problems, 'accepted', M.accepted, 'arrangement matched', M.matched, 'blank rejects', M.blankRejects.length, 'odd coefficient texts', JSON.stringify(M.oddCoefs));
    M.failures.slice(0, 3).forEach(f => console.log('    FAIL', JSON.stringify(f).slice(0, 400)));
    console.log('    sample Your version:', JSON.stringify(M.versionSample), ' sum/tip:', JSON.stringify(M.tipSample));
  }
  await ctx.close(); await browser.close();
  L.writeJSON('calor-ui.json', out);
  console.log('page errors', errors.length, errors.slice(0, 3));
})();

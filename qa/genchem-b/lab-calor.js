// Virtual calorimeter: (1) thousands of simulated runs through the page's own model functions with energy
// bookkeeping and independent grading of the calculation parts; (2) real runs through the UI with a fast clock.
'use strict';
const L = require('./lib');
const I = require('./indep');
const RUNS = +(process.env.N || 2000);

(async () => {
  const browser = await L.launch();
  const {ctx, page, errors} = await L.openPage(browser, L.CALOR, {seed: 31337});
  const sims = await page.evaluate(RUNS => {
    const div = document.createElement('div'); const txt = h => { div.innerHTML = String(h); return div.textContent; };
    const out = {metal: [], neut: [], salt: []};
    for(const exp of ['metal', 'neut', 'salt']){
      let prev = null;
      for(let k = 0; k < RUNS; k++){
        const Lb = makeLab(exp, prev); prev = Lb; const d = {};
        if(exp === 'metal'){ d.mm = Lb.mMetal; d.vw = ['50.0', '75.0', '100.0'][k % 3]; d.mw = labWater(d.vw); d.Tm = Lb.Tbath; }
        else if(exp === 'neut'){ d.Va = ['25.0', '50.0'][k % 2]; d.Vb = ['25.0', '50.0'][(k >> 1) % 2]; }
        else { d.vw = ['50.0', '75.0', '100.0'][k % 3]; d.mw = labWater(d.vw); let s = 0; const stopAt = 2 + Math.random() * 8; while(s < 2 || (s < stopAt && s + 2.2 <= 10)) s += 0.9 + Math.random() * 1.3; d.ms = s.toFixed(2); /* the page's scoop rule: no scoop once the next could pass 10 g */ }
        d.Ti = labRead(Lb.Troom).toFixed(2);
        const sim = labMix(Lb, d), C = sim.C, Cb = sim.body ? sim.body.C : 0;
        let worst = 0, peak = sim.T, tPeak = 0, Q0 = sim.Q, start = sim.T;
        const log = [];
        for(let t = 1; t <= 240; t++){
          const T0 = sim.T, B0 = sim.body ? sim.body.T : 0, Qb = sim.Q;
          const T = labStep(sim, 1);
          // undo the loss term to get the temperature just before heat leaked to the room
          const Tmid = (T - LAB_LOSS * sim.room) / (1 - LAB_LOSS);
          const released = Qb - sim.Q;   // heat the reaction gave the solution this step
          const imbalance = C * (Tmid - T0) + (sim.body ? Cb * (sim.body.T - B0) : 0) - released;
          worst = Math.max(worst, Math.abs(imbalance) / Math.max(1, Math.abs(Q0) + Cb * 80));
          if(Math.abs(T - start) > Math.abs(peak - start)){ peak = T; tPeak = t; }
          log.push(T);
        }
        // ideal (no loss) final temperature from conservation of energy
        const ideal = exp === 'metal' ? (Cb * Number(Lb.Tbath) + C * Lb.Troom) / (Cb + C) : Lb.Troom + Q0 / C;
        d.Tf = labRead(peak).toFixed(2);
        const parts = labParts(Lb, d);
        const graded = parts.map(p => p.type === 'choice' ? (gradePart(p, p.answer).status) : gradePart(p, txt(p.show).replace(/\s+[A-Za-z(].*$/, '')).status);
        out[exp].push({L: {metal: Lb.metal, c: Lb.c, mMetal: Lb.mMetal, Tbath: Lb.Tbath, Troom: Lb.Troom, M: Lb.M, acid: Lb.acid, base: Lb.base, f: Lb.f, H: Lb.H, MM: Lb.MM}, d,
          worstImbalance: worst, peak, tPeak, ideal, parts: parts.map((p, i) => ({label: txt(p.label), answer: p.answer, sf: p.sf, show: txt(p.show), status: graded[i]})), end: log[239]});
      }
    }
    return out;
  }, RUNS);

  const R = {RUNS, model: {}, faults: [], notes: []};
  for(const exp of ['metal', 'neut', 'salt']){
    const arr = sims[exp], S = R.model[exp] = {runs: arr.length, maxEnergyImbalance: 0, peakShortfall: [], displayedRejected: 0, indepMismatch: 0, misidentified: 0, errPct: [], resultLow: 0, overSolubility: 0, msOver10: 0, sigLess3: 0, examples: {}};
    for(const r of arr){
      S.maxEnergyImbalance = Math.max(S.maxEnergyImbalance, r.worstImbalance);
      S.peakShortfall.push(Math.abs(r.ideal - r.L.Troom) > 0 ? 1 - (r.peak - r.L.Troom) / (r.ideal - r.L.Troom) : 0);
      r.parts.forEach(p => { if(p.status !== 'correct'){ S.displayedRejected++; if(!S.examples.rejected) S.examples.rejected = p; } if(p.sf && p.sf < 3) S.sigLess3++; });
      const d = r.d, Ti = +d.Ti, Tf = +d.Tf, dT = Tf - Ti;
      let mine, acc;
      if(exp === 'metal'){ const qw = +d.mw * I.CSP.water * dT, c = qw / (+r.L.mMetal * (+r.L.Tbath - Tf));
        const best = Object.entries({aluminum: 0.897, titanium: 0.523, iron: 0.449, copper: 0.385, silver: 0.235, lead: 0.129}).sort((a, b) => Math.abs(a[1] - c) - Math.abs(b[1] - c))[0][0];
        mine = [qw, c, best]; acc = r.L.c; if(best !== r.L.metal[0]){ S.misidentified++; if(!S.examples.misid) S.examples.misid = {metal: r.L.metal[0], measured: c, picked: best}; } S.errPct.push((c - acc) / acc * 100); if(c < acc) S.resultLow++; }
      else if(exp === 'neut'){ const q = (+d.Va + +d.Vb) * 1.00 * I.CSP.water * dT, nn = Math.min(+d.Va, +d.Vb) / 1000 * +r.L.M, dH = -q / nn / 1000; mine = [q, nn, dH]; acc = I.DH_NEUT; S.errPct.push((dH - acc) / Math.abs(acc) * 100); if(Math.abs(dH) < Math.abs(acc)) S.resultLow++; }
      else { const q = (+d.mw + +d.ms) * I.CSP.water * dT, nn = +d.ms / I.MM(r.L.f), dH = -q / nn / 1000; mine = [q, nn, dH]; acc = r.L.H; S.errPct.push((dH - acc) / Math.abs(acc) * 100); if(Math.abs(dH) < Math.abs(acc)) S.resultLow++;
        if(100 * +d.ms / +d.mw > I.solubAt(r.L.f, Tf)){ S.overSolubility++; if(!S.examples.overSol) S.examples.overSol = {salt: r.L.f, ms: d.ms, mw: d.mw, Tf: d.Tf}; }
        if(+d.ms > 10) S.msOver10++; }
      r.parts.forEach((p, i) => { const m = mine[i]; if(typeof m === 'string'){ if(m !== p.answer){ S.indepMismatch++; } return; }
        const tol = Math.max(0.01 * Math.abs(p.answer), p.sf ? 0.5001 * Math.pow(10, Math.floor(Math.log10(Math.abs(p.answer))) - p.sf + 1) : 0);
        if(Math.abs(m - p.answer) > tol){ S.indepMismatch++; if(!S.examples.mismatch) S.examples.mismatch = {label: p.label, page: p.answer, mine: m}; } });
    }
    const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(f * (s.length - 1))]; };
    S.peakShortfallMedianPct = 100 * q(S.peakShortfall, 0.5); S.peakShortfallMaxPct = 100 * q(S.peakShortfall, 1);
    S.errPctMedian = q(S.errPct, 0.5); S.errPctRange = [q(S.errPct, 0), q(S.errPct, 1)]; delete S.peakShortfall; delete S.errPct;
    console.log(exp, JSON.stringify(S));
  }

  // UI runs with Playwright's fake clock: record at the extreme, and once early
  const ui = R.ui = [];
  for(const exp of ['metal', 'neut', 'salt']) for(const when of ['peak', 'early']){
    const c2 = await browser.newContext(); const p2 = await c2.newPage(); const errs = [];
    p2.on('pageerror', e => errs.push(String(e))); p2.on('console', m => { if(m.type() === 'error') errs.push(m.text()); });
    await p2.clock.install(); await p2.goto(L.CALOR); await p2.clock.runFor(200);
    await p2.evaluate(() => document.querySelector('#tabs button[data-tab="lab"]').click());
    await p2.evaluate(exp => { const b = document.querySelector('#view button[data-exp="' + exp + '"]'); if(b) b.click(); }, exp);
    const clickStep = async (re) => p2.evaluate(re => { const b = Array.from(document.querySelectorAll('#stepbtns button:not([disabled])')).find(x => new RegExp(re).test(x.textContent)) || document.querySelector('#stepbtns button:not([disabled])'); if(!b) return null; b.click(); return b.textContent; }, re);
    const steps = [];
    for(let k = 0; k < 30; k++){
      const t = await clickStep(when === 'peak' ? '100|50\\.0|Use|Weigh|Heat|Start|Measure|Add|Transfer|Pour' : '50\\.0|25\\.0|Use|Weigh|Heat|Start|Measure|Add|Transfer|Pour');
      if(!t) { await p2.clock.runFor(500); continue; }
      steps.push(t);
      if(/Heat the metal/.test(t)) await p2.clock.runFor(2500);
      if(/Start/.test(t)) await p2.clock.runFor(3200);
      if(/Add a scoop/.test(t)) continue;
      if(/Transfer|Pour|Add the solid/.test(t)){
        if(when === 'early') await p2.clock.runFor(400);
        else { // wait until the reading stops moving toward its extreme
          let last = null, best = null; for(let j = 0; j < 240; j++){ await p2.clock.runFor(100); const T = await p2.evaluate(() => Number(document.querySelector('#labstatus').textContent.match(/(-?[\d.]+) °C/)[1]));
            if(best === null || Math.abs(T - last) > 0 && ((exp === 'salt' ? T < best : T > best))) best = T; if(last !== null && (exp === 'salt' ? T > best + 0.03 : T < best - 0.03)) break; last = T; } }
        break;
      }
    }
    // the salt may cool or warm: fall back to "whichever way it moved"
    await clickStep('Record');
    const nb = await p2.evaluate(() => { const rows = {}; document.querySelectorAll('#notebook tr').forEach(tr => { rows[tr.querySelector('th').textContent] = tr.querySelector('td').textContent; }); return {rows, aim: document.querySelector('#problem .q').textContent, eq: (document.querySelector('#problem .eqwrap') || {}).textContent || ''}; });
    const val = re => { const k = Object.keys(nb.rows).find(x => re.test(x)); return k ? Number(nb.rows[k].replace(/[^\d.\-]/g, '')) : NaN; };
    const Ti = val(/^Starting temperature/), Tf = val(/^Final temperature/); const dT = Tf - Ti;
    let answers = [];
    if(exp === 'metal'){ const mw = val(/Mass of water/), mm = val(/Mass of metal/), Tm = val(/bath/); const qw = mw * 4.184 * dT, c = qw / (mm * (Tm - Tf));
      const best = Object.entries({aluminum: 0.897, titanium: 0.523, iron: 0.449, copper: 0.385, silver: 0.235, lead: 0.129}).sort((a, b) => Math.abs(a[1] - c) - Math.abs(b[1] - c))[0][0]; answers = [qw, c, best]; }
    else if(exp === 'neut'){ const ks = Object.keys(nb.rows); const Va = Number(nb.rows[ks[0]].replace(/[^\d.]/g, '')), Vb = Number(nb.rows[ks[1]].replace(/[^\d.]/g, '')), M = Number(ks[0].match(/([\d.]+) M/)[1]); const q = (Va + Vb) * 4.184 * dT, nn = Math.min(Va, Vb) / 1000 * M; answers = [q, nn, -q / nn / 1000]; }
    else { const mw = val(/Mass of water/), ms = val(/^Mass of (?!water)/); const f = nb.aim.match(/\(([A-Za-z0-9₀-₉]+)\)/)[1].replace(/[₀-₉]/g, d => '₀₁₂₃₄₅₆₇₈₉'.indexOf(d)); const q = (mw + ms) * 4.184 * dT, nn = ms / I.MM(f); answers = [q, nn, -q / nn / 1000]; }
    const sfs = await p2.evaluate(() => Array.from(document.querySelectorAll('#labparts .part')).length);
    const sf = Math.min(3, Math.max(1, Math.abs(dT).toFixed(2).replace('.', '').replace(/^0+/, '').length));
    const typed = answers.map((a, i) => typeof a === 'string' ? a : (i === 1 && exp !== 'metal' ? a.toPrecision(3) : a.toPrecision(sf)));
    const fb = await p2.evaluate(typed => { document.querySelectorAll('#labparts li').forEach((li, i) => { const pin = li.querySelector('.pin'); if(pin) pin.value = typed[i]; else { const r = li.querySelector('input[value="' + typed[i] + '"]'); if(r) r.checked = true; } });
      const f = document.querySelector('#ans'); if(f && !f.hidden) f.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true})); return document.querySelector('#fb').textContent; }, typed);
    const pe = fb.match(/off by ([\d.]+)%/);
    const accepted = exp === 'metal' ? null : null;
    ui.push({exp, when, steps, notebook: nb.rows, typed, feedback: fb.slice(0, 600), errors: errs, ok: /Your calculations are correct/.test(fb), percentShown: pe ? +pe[1] : null});
    console.log('UI', exp, when, 'ok=' + /Your calculations are correct/.test(fb), JSON.stringify(nb.rows), 'typed', JSON.stringify(typed), '|', fb.slice(0, 380), errs.length ? 'ERR ' + errs.join(' ; ') : '');
    await c2.close();
  }
  await ctx.close(); await browser.close();
  L.writeJSON('calor-lab.json', R);
  console.log('page errors', errors.length);
})();

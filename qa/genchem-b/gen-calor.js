// Calorimetry and Hess's law guide: drive makeProblem/makeHess/lab model thousands of times, recompute each
// answer from the question text with independently typed data, and grade the page's own displayed answers.
'use strict';
const L = require('./lib');
const I = require('./indep');
const PER = +(process.env.N || 2000);   // problems per problem type

const {solve, parseEq, balanced, dHfromHf, sub, n} = require('./calor-solve');

async function batch(page, kind, count){
  return page.evaluate(([kind, count]) => {
    const div = document.createElement('div'); const txt = h => { div.innerHTML = String(h); return div.textContent; };
    const caret = h => txt(String(h).replace(/<sup>(.*?)<\/sup>/g, '^$1'));
    const out = []; let prev = null;
    for(let k = 0; k < count; k++){
      let P; window.__raw = [];
      try { P = kind === 'hess' ? makeHess(prev) : makeProblem(kind, prev); } catch(e){ out.push({err: String(e.stack || e)}); continue; }
      prev = P;
      const r = {type: P.type || 'hess', q: txt(P.question || ''), eq: txt(P.eqHTML || ''), parts: []};
      if(kind === 'hess'){
        // the given equations exactly as displayed, plus what grading expects
        r.eqs = P.eqs.map(e => ({r: e.r, p: e.p, dH: e.dH, need: e.need, shown: txt(eqInner(e)) + ' ΔH = ' + plus(fx(e.dH, 1))}));
        r.target = P.target; r.answer = P.answer;
        const ch = P.eqs.map(e => ({rev: e.need < 0, mult: Math.abs(e.need)})); const N2 = hessNet(P, ch); r.correctArrangementMatches = N2.match;
        const part = hessPart(P, ch); r.show = txt(part.show); r.status = gradePart(part, r.show).status; r.statusCaret = gradePart(part, caret(part.show)).status;
        r.blanks = P.eqs.map((e, i) => { const want = e.need * e.dH, shown = fx(want, 1); return {shown, ok: Math.abs(parseInput(shown).value - want) <= 0.06}; });
        r.coefTexts = []; P.eqs.forEach(e => e.r.concat(e.p).forEach(s => r.coefTexts.push(coefTxt(s[0]))));
        // what the student sees in "Your version" for every multiplier the buttons allow
        r.yourVersionCoefs = []; P.eqs.forEach((e, i) => MULTS.forEach(mm => { const sc = scaleEq(e, mm); sc.r.concat(sc.p).forEach(s => r.yourVersionCoefs.push(coefTxt(s[0]))); }));
        r.solution = txt(hessSolution(P));
      } else {
        r.parts = P.parts.map(p => ({label: txt(p.label), answer: p.answer, sf: p.sf, show: txt(p.show), status: gradePart(p, txt(p.show).replace(/\s*[A-Za-z(][^\d]*$/, '')).status,
          statusFull: gradePart(p, txt(p.show)).status, statusCaret: gradePart(p, caret(p.show)).status, errors: p.errors.map(e => ({value: e.value, msg: txt(e.msg)}))}));
        r.blanks = Object.keys(P.blanks || {}).map(k => ({k, want: P.blanks[k].want, tol: P.blanks[k].tol}));
        r.raw = (window.__raw || []).map(x => ({ans: x.ans, errors: x.errors.map(e => ({value: e.value, msg: txt(e.msg)}))}));
        r.solution = txt(P.solution); r.am = P.am ? amLine(P.am) : '';
      }
      out.push(r);
    }
    return out;
  }, [kind, count]);
}
// amLine and the Hess display helpers are page functions; amLine lives inside the page block, so define a fallback
const AMLINE = `if(typeof amLine === 'undefined'){ window.amLine = list => { const seen = []; list.forEach(f => parseFormula(f).forEach(([e]) => { if(seen.indexOf(e) < 0) seen.push(e); })); return seen.map(e => e + ' ' + AM[e]).join(', '); }; }`;

// does an independently computed value, rounded the way a student would, pass the page's grader?
async function gradeMine(page, kind, recs){
  return page.evaluate(([kind, items]) => items.map(it => it.map(([partIdx, problemIdx, typed]) => null)), [kind, []]);
}

(async () => {
  const browser = await L.launch();
  const {ctx, page, errors} = await L.openPage(browser, L.CALOR, {seed: 4242, patch: L.patchCalor});
  await page.evaluate(AMLINE);
  const res = {PER, kinds: {}, pageErrors: errors};
  const TYPES = {heat: ['q', 'qk', 'm', 'c', 'dT', 'Tf'], exchange: ['c', 'Tf'], coffee: ['neut', 'diss', 'predict'], thermo: ['g2kJ', 'kJ2g', 'mol2kJ'], hess: ['hess']};
  const WEIGHT = {heat: 7 / 1, exchange: 3 / 1, coffee: 1 / 0.2, thermo: 1 / 0.15, hess: 1};
  for(const kind of Object.keys(TYPES)){
    const total = Math.ceil(PER * WEIGHT[kind] * 1.15);
    const recs = [];
    for(let done = 0; done < total; done += 2000) recs.push(...await batch(page, kind, Math.min(2000, total - done)));
    const K = res.kinds[kind] = {};
    for(const r of recs){
      const T = K[r.type] = K[r.type] || {count: 0, exceptions: 0, displayedRejected: 0, displayedSig: 0, caretRejected: 0, trueRejected: 0, true3Rejected: 0, maxDevOverTol: 0, notes: {}, samples: {}, slipsAccepted: {}, slipNotFired: {}};
      const note = (k, s) => { T.notes[k] = (T.notes[k] || 0) + 1; if(!T.samples[k]) T.samples[k] = s; };
      T.count++;
      if(r.err){ T.exceptions++; note('exception', r.err.slice(0, 300)); continue; }
      if(/\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]/.test(r.q + r.solution + JSON.stringify(r.parts))) note('bad text', (r.q + ' ' + r.solution).slice(0, 300));
      if(kind === 'hess'){
        if(!r.correctArrangementMatches) note('documented arrangement does not reach the target', JSON.stringify(r.target));
        if(r.status !== 'correct') { T.displayedRejected++; note('displayed answer not accepted: ' + r.status, r.show); }
        if(r.statusCaret !== 'correct') T.caretRejected++;
        r.blanks.forEach(b => { if(!b.ok) note('guided ΔH blank: displayed value rejected', b.shown); });
        r.coefTexts.forEach(c => { if(/\d\.\d*\//.test(c)) note('given equation shows decimal-over-2 coefficient', c); });
        r.yourVersionCoefs.forEach(c => { if(/\d\.\d*\//.test(c)) note('"Your version" can show coefficient ' + c, 'appears when a student multiplies an equation with a ½ or 3/2 coefficient by ½'); });
        // independent answer: solve for multipliers from the displayed equations, then compare with ΔHf data
        const spec = {}; const add = (e, s) => { e.r.forEach(x => { const k = x[1] + '|' + x[2]; spec[k] = spec[k] || 0; }); e.p.forEach(x => { const k = x[1] + '|' + x[2]; spec[k] = spec[k] || 0; }); };
        r.eqs.forEach(add); add(r.target);
        const keys = Object.keys(spec), vec = e => keys.map(k => (e.p.find(x => x[1] + '|' + x[2] === k) || [0])[0] - (e.r.find(x => x[1] + '|' + x[2] === k) || [0])[0]);
        const A = r.eqs.map(vec), b = vec(r.target);
        // least squares normal equations (A rows are equations)
        const m = A.length, M = [...Array(m)].map((_, i) => [...Array(m)].map((_, j) => A[i].reduce((s, v, k) => s + v * A[j][k], 0))), y = A.map(row => row.reduce((s, v, k) => s + v * b[k], 0));
        for(let i = 0; i < m; i++){ let p = i; for(let j = i + 1; j < m; j++) if(Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j; [M[i], M[p]] = [M[p], M[i]]; [y[i], y[p]] = [y[p], y[i]]; for(let j = i + 1; j < m; j++){ const f = M[j][i] / M[i][i]; for(let k = i; k < m; k++) M[j][k] -= f * M[i][k]; y[j] -= f * y[i]; } }
        const x = Array(m).fill(0); for(let i = m - 1; i >= 0; i--){ let s = y[i]; for(let k = i + 1; k < m; k++) s -= M[i][k] * x[k]; x[i] = s / M[i][i]; }
        const resid = b.map((v, k) => v - x.reduce((s, xi, i) => s + xi * A[i][k], 0)); if(resid.some(v => Math.abs(v) > 1e-6)) note('given equations cannot add up to the target', JSON.stringify(r.target));
        const mine = x.reduce((s, xi, i) => s + xi * r.eqs[i].dH, 0);
        if(Math.abs(mine - r.answer) > 0.051) note('answer differs from independent solve', 'page ' + r.answer + ' mine ' + mine);
        T.maxDevOverTol = Math.max(T.maxDevOverTol, Math.abs(mine - r.answer) / 0.15);
        const tgt = {r: r.target.r, p: r.target.p}, ref = dHfromHf(tgt);
        const key = r.target.r.map(s => s[0] + s[1]).join('+') + '→' + r.target.p.map(s => s[0] + s[1]).join('+');
        if(ref != null && Math.abs(ref - r.answer) > 2) note('target ΔH vs ΔHf data: ' + key + ' page ' + r.answer.toFixed(1) + ', ΔHf-based ' + ref.toFixed(1), '');
        r.eqs.forEach(e => { const rf = dHfromHf(e); if(rf != null && Math.abs(rf - e.dH) > Math.max(1.5, 0.005 * Math.abs(e.dH))) note('given equation ΔH vs ΔHf data: ' + e.r.map(s => s[0] + s[1]).join('+') + '→' + e.p.map(s => s[0] + s[1]).join('+') + ' page ' + e.dH + ' ΔHf-based ' + rf.toFixed(1), ''); });
        continue;
      }
      let S; try { S = solve(kind, r.type, sub(r.q), sub(r.eq)); } catch(e){ note('solver could not parse', r.q + ' || ' + e.message); continue; }
      (S.notes || []).forEach(x => note(x.replace(/\d+\.\d °C/g, 'X °C').replace(/[\d.]+ g\/100 g water exceeds its solubility \([\d.]+ g\/100 g\) at the final X °C/, 'exceeds solubility at the final temperature'), r.q));
      r.parts.forEach((p, i) => {
        if(p.statusFull !== 'correct'){ T.displayedRejected++; note('displayed answer graded "' + p.statusFull + '"', r.q + ' || ' + p.label + ' show ' + p.show); }
        if(p.statusCaret !== 'correct'){ T.caretRejected++; note('displayed answer typed with ^ graded "' + p.statusCaret + '"', p.show); }
        const exp = S.exp[i]; if(exp == null) return;
        const tolPage = Math.max(0.01 * Math.abs(p.answer), p.sf ? 0 : 0.15);
        T.maxDevOverTol = Math.max(T.maxDevOverTol, Math.abs(exp - p.answer) / tolPage);
        if(Math.abs(exp - p.answer) > tolPage){ T.trueRejected++; note('independent answer outside page tolerance: ' + p.label, r.q + ' || page ' + p.answer + ' mine ' + exp); }
      });
      // slips inside the 2 % window that clean() dropped: identical (harmless) vs different value (wrong method marked right)
      (r.raw || []).forEach(g => g.errors.forEach(e => { if(!isFinite(e.value)) return; const d = Math.abs(e.value - g.ans), tol = Math.max(0.01 * Math.abs(g.ans), 0.5001 * Math.pow(10, Math.floor(Math.log10(Math.abs(g.ans))) - 2));
        if(d <= tol){ const same = d <= 1e-7 * Math.abs(g.ans); const k = (same ? 'same value: ' : 'DIFFERENT value accepted: ') + e.msg.replace(/[\d.]+ (mL|g|°C)/g, 'X $1'); T.slipsAccepted[k] = (T.slipsAccepted[k] || 0) + 1; if(!T.samples[k]) T.samples[k] = r.q + ' || ans ' + g.ans + ' slip ' + e.value; } }));
    }
    for(const t in K){ const T = K[t]; console.log(kind.padEnd(9), t.padEnd(8), 'n=' + T.count, 'exc=' + T.exceptions, 'shownRejected=' + T.displayedRejected, 'caretRej=' + T.caretRejected, 'indepOutsideTol=' + T.trueRejected, 'maxDev/tol=' + T.maxDevOverTol.toFixed(3),
      JSON.stringify(T.notes), Object.keys(T.slipsAccepted).filter(k => /^DIFF/.test(k)).length ? 'SLIP-ACCEPTED ' + JSON.stringify(Object.fromEntries(Object.entries(T.slipsAccepted).filter(e => /^DIFF/.test(e[0])))) : ''); }
  }
  await ctx.close(); await browser.close();
  L.writeJSON('calor-generators.json', res);
  console.log('page errors', errors.length, errors.slice(0, 3));
})();

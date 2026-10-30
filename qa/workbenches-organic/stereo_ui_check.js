// UI-level checks for the two stereochemistry pages (grading of every option, pair relationships,
// and JSmol screen-space orientation of the H-away / H-toward quiz models).
// node stereo_ui_check.js -> stereo_ui_results.json
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8905/organic-chemistry/';
const res = { lab: {}, practice: {}, faults: [] };
const fault = (sec, msg, ex) => res.faults.push({ sec, msg, ex });
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  /* ---------------- LAB ---------------- */
  let page = await ctx.newPage();
  page.on('pageerror', e => fault('lab', 'pageerror', String(e)));
  await page.goto(BASE + 'stereochemistry-lab.html'); await page.waitForTimeout(5000);
  const M = await page.evaluate(() => MISSIONS.map(m => ({ t: m.title, n: m.options.length, a: m.answer })));
  const grading = [];
  for (let i = 0; i < M.length; i++) {
    await page.selectOption('#mission', String(i));
    for (let o = 0; o < M[i].n; o++) {
      await page.check(`#choices input[value="${o}"]`); await page.click('#check');
      const fb = await page.textContent('#feedback');
      const ok = /^(Correct|All 12 solved)/.test(fb);
      grading.push([M[i].t, o, ok]);
      if (ok !== (o === M[i].a)) fault('lab', 'challenge grading', { m: M[i].t, o, fb: fb.slice(0, 60) });
    }
  }
  res.lab.grading = { answered: grading.length, score: await page.textContent('#score') };
  // pair relationships: all 16 combinations
  const pairs = [];
  const SM = JSON.parse(fs.readFileSync(__dirname + '/stereo_results.json')).lab;
  const smi = c => SM['pair:' + c].smiles;
  const mirror = s => s.replace(/@@/g, '!').replace(/@/g, '@@').replace(/!/g, '@');
  for (const a of ['RR', 'SS', 'RS', 'SR']) for (const b of ['RR', 'SS', 'RS', 'SR']) {
    await page.selectOption('#pair-a', a); await page.selectOption('#pair-b', b);
    const rel = await page.textContent('#pair-result .relationship');
    // independent: identical if same canonical SMILES; enantiomers if b is the mirror image of a and not identical
    const ident = smi(a) === smi(b);
    const enant = !ident && (mirror(smi(a)) === smi(b) || (a.replace(/[RS]/g, c => c === 'R' ? 'S' : 'R') === b));
    const want = ident ? 'Identical' : enant ? 'Enantiomers' : 'Diastereomers';
    pairs.push([a, b, rel, want]);
    if (rel !== want) fault('lab', 'pair relationship', { a, b, rel, want });
  }
  res.lab.pairs = pairs;
  // JSmol screen orientation for missions 5 and 6 (after reset)
  const orient = [];
  for (const mi of [4, 5]) {
    await page.selectOption('#mission', String(mi)); await page.waitForTimeout(2500);
    await page.click('#reset-question'); await page.waitForTimeout(2500);
    const o = await page.evaluate(() => {
      const ap = Object.values(Jmol._applets).find(a => a._id && a._id.includes('quizmodela')) || window.stereoquizmodela;
      const ev = e => Jmol.evaluateVar(ap, e);
      const pts = [3, 4, 1, 9, 2].map(n => [ev(`{atomno=${n}}.sx`), ev(`{atomno=${n}}.sy`), ev(`{atomno=${n}}.sz`)]);
      return { id: ap && ap._id, pts };
    });
    // Jmol: sx right, sy up (origin bottom-left) per Jmol docs; sz grows away from the viewer. Calibrate sy direction with model y.
    const [O, Cet, Cme, H, C] = o.pts;
    const v = p => [p[0] - C[0], p[1] - C[1]];
    const a = v(O), b = v(Cet), c = v(Cme);
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    orient.push({ mission: mi + 1, raw: o, H_sz_minus_C: H[2] - C[2], area });
  }
  res.lab.jsmolOrientation = orient;
  await page.close();

  /* ---------------- PRACTICE ---------------- */
  page = await ctx.newPage();
  page.on('pageerror', e => fault('practice', 'pageerror', String(e)));
  await page.goto(BASE + 'stereochemistry-practice.html'); await page.waitForTimeout(5000);
  const Q = await page.evaluate(() => { /* QUESTIONS is closure-scoped; read prompts/options from the DOM instead */ return null; });
  const nQ = 20; const log = [];
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < nQ; i++) {
      await page.click(`#dots li:nth-child(${i + 1}) button`);
      const opts = await page.$$eval('#opts .opt', els => els.map(e => ({ v: +e.querySelector('input').value, t: e.textContent })));
      const pick = opts.find(o => o.v === pass) || opts[0];
      await page.check(`#opts input[value="${pick.v}"]`); await page.click('#check');
      const fb = await page.textContent('#feedback h3');
      const correctLabel = await page.$eval('#opts .opt.correct', e => e.textContent).catch(() => null);
      log.push({ pass, q: i + 1, picked: pick.t.replace(/^[A-D]/, '').slice(0, 50), fb, correct: (correctLabel || '').replace(/^[A-D]/, '').replace(/Correct$|Your answer$/, '').slice(0, 60) });
    }
    await page.click('#next'); // See results
    if (pass < 3) await page.click('#again');
  }
  res.practice.log = log;
  // consistency: for each question exactly one option value graded Correct across the 4 passes, and it is the one marked .correct
  for (let i = 1; i <= nQ; i++) {
    const L = log.filter(l => l.q === i); const rights = L.filter(l => l.fb === 'Correct');
    if (rights.length !== 1) fault('practice', 'not exactly one correct option', { q: i, L });
    rights.forEach(r => { if (!r.correct.startsWith(r.picked.slice(0, 20))) fault('practice', 'graded option differs from highlighted option', r); });
  }
  res.practice.keyed = [...new Set(log.filter(l => l.fb === 'Correct').map(l => l.q + ': ' + l.picked))];
  await browser.close();
  fs.writeFileSync(__dirname + '/stereo_ui_results.json', JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ labGrading: res.lab.grading, pairs: res.lab.pairs, orient: res.lab.jsmolOrientation, practiceKeyed: res.practice.keyed, faults: res.faults }, null, 1));
})();

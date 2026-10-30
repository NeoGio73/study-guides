// Science + generator checks for biochemistry/gluconeogenesis-workbench.html
// node gng_check.js -> gng_results.json
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8905/biochemistry/gluconeogenesis-workbench.html';
const res = { checks: {}, faults: [] };
const fault = (sec, msg, ex) => res.faults.push({ sec, msg, ex });
// Lehninger (Table 14-2 / Section 14.4): ΔG′° and erythrocyte ΔG, kJ/mol
const LEH = { hk: [-16.7, -33.4], pgi: [1.7], pfk: [-14.2, -22.2], ald: [23.8], gapdh: [6.3], pgk: [-18.5], pgm: [4.4], eno: [7.5], pk: [-31.4, -16.7], fbp: [-16.3], g6p: [-13.8] };

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })).newPage();
  page.on('pageerror', e => fault('page', 'pageerror', String(e)));
  await page.goto(URL); await page.waitForTimeout(800);

  /* step data vs Lehninger */
  const STEPS = await page.evaluate(() => STEPS);
  res.checks.steps = Object.fromEntries(Object.entries(LEH).map(([k, v]) => {
    const s = STEPS[k]; const ok = s.dg0 === v[0] && (v[1] == null || s.dg === v[1]);
    if (!ok) fault('map', 'ΔG value differs from Lehninger', { k, page: [s.dg0, s.dg], leh: v });
    return [k, { page: [s.dg0, s.dg ?? null], leh: v, ok }];
  }));
  if (STEPS.ald.dg0b !== 7.5) fault('map', 'TPI ΔG′°', STEPS.ald.dg0b);

  /* map: click every step, scrape info */
  await page.click('.rail button[data-tab="map"]');
  res.checks.mapInfo = await page.evaluate(() => [...document.querySelectorAll('#pm-svg g.step')].map(g => { g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return document.getElementById('pm-info').textContent.slice(0, 240); }));

  /* energy: K'eq calculator incl. extreme inputs; ΔG-in-cell calculator */
  await page.click('.rail button[data-tab="energy"]');
  const RT298 = 8.315 * 298 / 1000, RT310 = 8.315 * 310 / 1000;
  const kq = await page.evaluate(async (vals) => {
    const out = [];
    for (const v of vals) { const i = document.getElementById('kq-in'); i.value = v; i.dispatchEvent(new Event('input')); out.push([v, document.getElementById('kq-out').textContent, document.getElementById('kq-txt').textContent]); }
    return out;
  }, [31.4, 23.8, 0.9, -16.3, -13.8, 0, -0.0001, 0.4, 150, -150, 1000, -1000, 1800, -1800, 5000, -1e9]);
  res.checks.keq = kq.map(([v, o, t]) => {
    const K = Math.exp(-v / RT298); const bad = /NaN|Infinity|undefined|× 10⁻?$|× 10⁻ |× 10 /.test(o + ' ' + t);
    if (bad) fault('energy', 'K′eq calculator prints NaN/Infinity/garbled exponent for extreme ΔG′°', { input: v, out: o, txt: t.slice(0, 90) });
    return { v, out: o, K: K.toPrecision(3), txt: t.slice(0, 100), bad };
  });
  [0, -0.0001, 0.4].forEach(z => { const r = kq.find(x => x[0] === z); if (r && !/close to 1/.test(r[2])) fault('energy', 'no K≈1 message', r); });
  if (/runs forward easily/.test(kq.find(x => x[0] === 0)[2])) fault('energy', 'ΔG′° = 0 (K′eq = 1) is described as "runs forward easily"', kq.find(x => x[0] === 0)[2].slice(0, 120));
  const dgc = await page.evaluate(() => [...document.querySelectorAll('#dg-pre button')].map(b => { b.click(); return [b.textContent, [...document.querySelectorAll('#dg-stats .stat .v')].map(v => v.textContent)]; }));
  const DP = { Aldolase: [23.8, [0.031], [0.138, 0.0185]], 'FBPase-1': [-16.3, [0.031], [0.014, 1.0]], 'Glucose 6-phosphatase': [-13.8, [0.083], [5.0, 1.0]] };
  res.checks.dgCell = dgc.map(([lab, v]) => { const k = Object.keys(DP).find(k => lab.startsWith(k)); const [g0, s, p] = DP[k]; const Q = p.reduce((a, x) => a * x / 1000, 1) / s.reduce((a, x) => a * x / 1000, 1); const dg = g0 + RT310 * Math.log(Q); const ok = Math.abs(parseFloat(v[2]) - dg) < 0.06; if (!ok) fault('energy', 'ΔG calc', { lab, v, dg }); return { lab, page: v, indep: dg.toFixed(2), ok }; });

  /* ledger */
  await page.click('.rail button[data-tab="ledger"]');
  const led = await page.evaluate(() => [...document.querySelectorAll('#lg-start button')].map(b => { b.click(); document.getElementById('lg-all').click(); return [b.dataset.s, [...document.querySelectorAll('#lg-stats .stat .v')].map(v => v.textContent), document.getElementById('lg-eq').textContent]; }));
  const LEDX = { pyr: ['−4', '−2', '−2', '−6'], lac: ['−4', '−2', '0', '−6'], gol: ['−2', '0', '+2', '−2'] };
  res.checks.ledger = led.map(([s, v, eq]) => { const ok = JSON.stringify(v) === JSON.stringify(LEDX[s]); if (!ok) fault('ledger', 'ledger totals', { s, v, exp: LEDX[s] }); return { s, v, eq, ok }; });
  // element/charge balance of the three overall equations (count C,H,O,N,P with standard formulas at the charge level used by Lehninger is not attempted; check stoichiometric coefficients for nucleotides/Pi)
  res.checks.ledgerEqCoeffs = led.map(([s, , eq]) => ({ s, eq }));

  /* sources: answer every card correctly-per-own-key and incorrectly */
  await page.click('.rail button[data-tab="sources"]');
  const KEY = { Lactate: true, Palmitate: false, Alanine: true, Leucine: false, Glycerol: true, Ethanol: false, Aspartate: true, 'Acetyl-CoA': false, Glutamate: true, Lysine: false, 'Propionyl-CoA': true, Acetoacetate: false };
  const src = await page.evaluate(async (KEY) => {
    const out = [];
    for (let pass = 0; pass < 2; pass++) {
      for (const name of Object.keys(KEY)) {
        const card = [...document.querySelectorAll('#so-cards .pcard')].find(c => c.querySelector('h4').textContent === name);
        const btns = [...card.querySelectorAll('.acts button')]; if (!btns.length) continue;
        const want = pass === 0 ? KEY[name] : !KEY[name];
        btns[want ? 0 : 1].click();
        const c2 = [...document.querySelectorAll('#so-cards .pcard')].find(c => c.querySelector('h4').textContent === name);
        out.push([pass, name, c2.className, c2.querySelector('.why').textContent.slice(0, 60)]);
      }
      const so = [...document.querySelectorAll('#so-score .stat .v')].map(v => v.textContent);
      out.push(['score', pass, so.join('|')]);
      [...document.querySelectorAll('#so-score button')].find(b => b.textContent === 'Start over').click();
    }
    return out;
  }, KEY);
  res.checks.sources = src;
  src.filter(r => r[0] !== 'score').forEach(([pass, name, cls]) => { const right = /right/.test(cls); if (right !== (pass === 0)) fault('sources', 'precursor grading disagrees with Lehninger key', { name, pass, cls }); });

  /* regulation: 2000 random effector states, monotonic checks by finite differences on the page itself */
  await page.click('.rail button[data-tab="reg"]');
  const reg = await page.evaluate(() => {
    const ids = { f: 'rg-f26', a: 'rg-amp', c: 'rg-cit', ac: 'rg-acc' };
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
    const setPK = v => { const e = document.getElementById('rg-pk'); e.checked = v; e.dispatchEvent(new Event('change')); };
    const read = () => { const p = [...document.querySelectorAll('#rg-bars .pct')].map(x => parseFloat(x.textContent)); return { pfk: p[0], fbp: p[1], pk: p[2], pc: p[3], msg: document.getElementById('rg-txt').textContent }; };
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const viol = []; let n = 0; const msgs = {};
    for (let k = 0; k < 2000; k++) {
      const st = { f: Math.floor(rnd() * 101), a: Math.floor(rnd() * 101), c: Math.floor(rnd() * 101), ac: Math.floor(rnd() * 101), pk: rnd() < .5 };
      for (const [kk, id] of Object.entries(ids)) set(id, st[kk]); setPK(st.pk);
      const base = read(); n++;
      const m = base.msg.split('Substrate')[0]; msgs[m.slice(0, 40)] = (msgs[m.slice(0, 40)] || 0) + 1;
      // direction of each effector (Lehninger): F2,6BP +PFK -FBP; AMP +PFK -FBP; citrate -PFK; acetyl-CoA +PC -PK; PKA -PK
      const bump = (kk, d) => { const v = Math.max(0, Math.min(100, st[kk] + d)); set(ids[kk], v); const r = read(); set(ids[kk], st[kk]); return r; };
      const up = { f: bump('f', 10), a: bump('a', 10), c: bump('c', 10), ac: bump('ac', 10) };
      if (up.f.pfk < base.pfk || up.f.fbp > base.fbp) viol.push(['F26BP', st, base, up.f]);
      if (up.a.pfk < base.pfk || up.a.fbp > base.fbp) viol.push(['AMP', st, base, up.a]);
      if (up.c.pfk > base.pfk) viol.push(['citrate', st, base, up.c]);
      if (up.ac.pc < base.pc || up.ac.pk > base.pk) viol.push(['acetylCoA', st, base, up.ac]);
      // message consistency
      const d1 = base.pfk - base.fbp, d2 = base.pk - base.pc;
      if (/Both cycles point toward glucose/.test(base.msg) && !(d1 < 0 && d2 < 0)) viol.push(['msg-glucose', st, base]);
      if (/Both cycles point toward pyruvate/.test(base.msg) && !(d1 > 0 && d2 > 0)) viol.push(['msg-pyruvate', st, base]);
    }
    // presets
    const pres = [...document.querySelectorAll('#rg-pre button')].map(b => { b.click(); return [b.textContent, read()]; });
    return { n, viol: viol.slice(0, 10), nviol: viol.length, msgs, pres };
  });
  res.checks.regulation = reg;
  if (reg.nviol) fault('reg', 'effector direction or message inconsistency', reg.viol.slice(0, 3));

  /* fed/fasted: shares at every hour */
  await page.click('.rail button[data-tab="fast"]');
  const fd = await page.evaluate(() => { const out = []; const e = document.getElementById('fd-h'); for (let t = 0; t <= 48; t++) { e.value = t; e.dispatchEvent(new Event('input')); out.push([t, [...document.querySelectorAll('#fd-stats .stat .v')].map(v => parseInt(v.textContent)), document.querySelector('#fd-state button.on').dataset.s]); } return out; });
  res.checks.fasting = fd.filter(r => [0, 1, 2, 4, 6, 8, 12, 16, 20, 24, 30, 36, 48].includes(r[0]));
  const at24 = fd[24][1]; if (!(at24[2] > at24[1])) fault('fast', 'at 24 h glycogen still exceeds gluconeogenesis', at24);
  fd.forEach(([t, v]) => { const s = v.reduce((a, b) => a + b, 0); if (Math.abs(s - 100) > 1) fault('fast', 'shares do not sum to 100%', { t, v }); });

  /* cycles */
  await page.click('.rail button[data-tab="cycles"]');
  res.checks.cycles = await page.evaluate(() => { const e = document.getElementById('cy-g'); const out = []; for (const g of [5, 30, 90, 100]) { e.value = g; e.dispatchEvent(new Event('input')); out.push([g, document.getElementById('cy-g-o').textContent, [...document.querySelectorAll('#cy-stats .stat .v')].map(v => v.textContent)]); } return out; });
  res.checks.cycles.forEach(([g, o, v]) => { const mol = g / 180.16; const exp = [(2 * mol).toFixed(2), (6 * mol).toFixed(2), (4 * mol).toFixed(2)]; if (!v.every((x, i) => x.startsWith(exp[i]))) fault('cycles', 'Cori arithmetic', { g, v, exp }); });

  /* compartments: step through both routes */
  await page.click('.rail button[data-tab="cell"]');
  res.checks.compartments = await page.evaluate(() => [...document.querySelectorAll('#cm-route button')].map(b => { b.click(); const steps = []; for (let i = 0; i < 12; i++) { steps.push(document.getElementById('cm-txt').textContent.slice(0, 100)); const n = document.getElementById('cm-next'); if (n.disabled) break; n.click(); } return [b.dataset.r, steps]; }));

  /* cases: ethanol slider + all MCQ / quiz keys */
  await page.click('.rail button[data-tab="cases"]');
  res.checks.ethanol = await page.evaluate(() => { const e = document.getElementById('cs-nadh'); const out = []; for (const v of [-3.3, -3.1, -2.5, -2]) { e.value = v; e.dispatchEvent(new Event('input')); out.push([v, [...e.closest('.blk').querySelectorAll('.stat .v')].map(x => x.textContent)]); } return out; });
  const K = Math.exp(25.1 / RT298);
  res.checks.ethanolIndep = { Keq: K.toFixed(0), lpSober: (K * Math.pow(10, -3.1)).toFixed(1) };
  res.checks.quizKeys = await page.evaluate(() => Object.entries(QUIZ).flatMap(([k, arr]) => arr.map(q => ({ st: k, q: q.q, key: q.o[q.a] }))));
  await browser.close();
  fs.writeFileSync(__dirname + '/gng_results.json', JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ steps: Object.values(res.checks.steps).every(s => s.ok), keq: res.checks.keq.map(k => [k.v, k.out, k.bad]), dg: res.checks.dgCell, ledger: res.checks.ledger, reg: { n: reg.n, nviol: reg.nviol, msgs: reg.msgs, pres: reg.pres }, fasting: res.checks.fasting, ethanol: res.checks.ethanol, ethanolIndep: res.checks.ethanolIndep, faults: res.faults }, null, 1));
})();

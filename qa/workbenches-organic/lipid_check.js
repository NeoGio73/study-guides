// Science + generator checks for biochemistry/lipid-workbench.html, driven through the UI.
// node lipid_check.js -> lipid_results.json
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8905/biochemistry/lipid-workbench.html';
const res = { checks: {}, faults: [] };
const fault = (sec, msg, ex) => { if (res.faults.filter(f => f.msg === msg).length < 6) res.faults.push({ sec, msg, ex }); res.counts = res.counts || {}; res.counts[msg] = (res.counts[msg] || 0) + 1; };
const FA = ['myr', 'pal', 'ste', 'ole', 'ela', 'lin', 'aln', 'ara'];
const CIS = { ole: 1, lin: 1, aln: 1, ara: 1 };
const ACYL = { myr: 'myristoyl', pal: 'palmitoyl', ste: 'stearoyl', ole: 'oleoyl', ela: 'elaidoyl', lin: 'linoleoyl', aln: 'α-linolenoyl', ara: 'arachidonoyl' };
const TRI = { myr: 'trimyristin', pal: 'tripalmitin', ste: 'tristearin', ole: 'triolein', ela: 'trielaidin', lin: 'trilinolein', aln: 'trilinolenin', ara: 'triarachidonin' };
const HEAD = { etn: ['phosphatidylethanolamine', 0, 'phosphoethanolamine'], cho: ['phosphatidylcholine', 0, 'phosphocholine'], ser: ['phosphatidylserine', -1, 'phospho-L-serine'], gro: ['phosphatidylglycerol', -1, 'phospho-(1′-sn-glycerol)'] };
const qs = q => q > 0 ? '+' + q : q < 0 ? '−' + (-q) : '0';

function expectGly(sn1, sn2, sn3, head) {
  const P = sn3 === 'P'; const ac = []; if (sn1) ac.push([1, sn1]); if (sn2) ac.push([2, sn2]); if (sn3 && !P) ac.push([3, sn3]);
  const pre = ac.map(([p, k]) => `${p}-${ACYL[k]}`).join('-');
  if (!P) {
    if (!ac.length) return { name: 'Glycerol', q: 0, water: 'Dissolves; no aggregate' };
    if (ac.length === 1) return { name: 'Monoacylglycerol', q: 0, sys: pre + '-sn-glycerol', water: 'Micelles' };
    if (ac.length === 2) return { name: 'Diacylglycerol', q: 0, sys: pre + '-sn-glycerol', water: 'An oil droplet; no bilayer on its own' };
    const same = ac.every(a => a[1] === ac[0][1]); const cis = ac.filter(a => CIS[a[1]]).length;
    return { name: same ? `Triacylglycerol (${TRI[ac[0][1]]})` : 'Triacylglycerol', q: 0, sys: same ? `tri${ACYL[ac[0][1]]}glycerol` : pre + '-sn-glycerol', water: 'An oil droplet; no bilayer on its own', state: cis >= 2 ? 'liquid' : 'solid' };
  }
  const H = head ? HEAD[head] : null; const base = H ? H[0] : 'phosphatidic acid'; const tail = H ? H[2] : 'phosphate';
  const q = H ? H[1] : (ac.length ? -1 : -2); // PA and lyso-PA −1 (Lehninger); free sn-glycerol 3-phosphate −2
  if (ac.length === 2) return { name: base[0].toUpperCase() + base.slice(1), q, sys: `${pre}-sn-glycero-3-${tail}`, water: 'A bilayer (closes into a liposome)' };
  if (ac.length === 1) return { name: 'Lyso' + base, q, sys: `${pre}-sn-glycero-3-${tail}`, water: 'Micelles' };
  return { name: H ? `sn-Glycero-3-${tail}` : 'sn-Glycerol 3-phosphate', q, water: 'Dissolves; no aggregate' };
}
function expectSph(nacyl, head) {
  if (!head) return nacyl ? { name: 'Ceramide', q: 0, sys: `N-${ACYL[nacyl]}sphingosine`, water: 'An oil droplet; no bilayer on its own' } : { name: 'Sphingosine', q: 1, water: 'Micelles' };
  if (head === 'pc') return nacyl ? { name: 'Sphingomyelin', q: 0, sys: `N-${ACYL[nacyl]}sphingosine-1-phosphocholine`, water: 'A bilayer (closes into a liposome)' } : { name: 'Sphingosylphosphocholine', q: 1, water: 'Micelles' };
  const Sug = head === 'glc' ? 'Glucosyl' : 'Galactosyl', sug = head === 'glc' ? 'gluco' : 'galacto';
  return nacyl ? { name: Sug + 'ceramide', q: 0, sys: `1-O-β-D-${sug}pyranosyl-N-${ACYL[nacyl]}sphingosine`, water: 'A bilayer (closes into a liposome)' } : { name: Sug + 'sphingosine' + (head === 'gal' ? ' (psychosine)' : ''), q: 1, water: 'Micelles' };
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 1000 } })).newPage();
  page.on('pageerror', e => fault('page', 'pageerror', String(e)));
  await page.goto(URL); await page.waitForTimeout(800);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload(); await page.waitForTimeout(600);

  /* ---------- BUILD: every glycerol and sphingosine combination ---------- */
  const combos = [];
  const opts = [null, ...FA];
  for (const a of opts) for (const b of opts) { for (const c of opts) combos.push(['gly', a, b, c, null]); for (const h of [null, 'etn', 'cho', 'ser', 'gro']) combos.push(['gly', a, b, 'P', h]); }
  for (const n of opts) for (const h of [null, 'pc', 'glc', 'gal']) combos.push(['sph', n, h]);
  const built = await page.evaluate((combos) => {
    const q = s => document.querySelector(s);
    const pick = (kind, key) => { const c = q(`.palette .chip[data-kind="${kind}"][data-key="${key}"]`); const r = c.getBoundingClientRect(); const o = { bubbles: true, clientX: r.x + 5, clientY: r.y + 5, pointerId: 1 }; c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new PointerEvent('pointerup', o)); };
    const put = slot => q(`#slots .slot[data-slot="${slot}"]`).click();
    const clear = () => q('#clearB').click();
    const bb = b => { const btn = q(`#bbSeg button[data-bb="${b}"]`); if (!btn.classList.contains('on')) btn.click(); };
    const read = () => { const i = q('#info'); const facts = {}; const dts = [...i.querySelectorAll('dt')]; dts.forEach(dt => facts[dt.textContent] = dt.nextElementSibling.textContent); return { cls: i.querySelector('.cls').textContent, name: i.querySelector('h2').firstChild.textContent, code: (i.querySelector('h2 .code') || {}).textContent || '', sys: i.querySelector('.sys').textContent, q: i.querySelector('.charge b').textContent, facts, svgOK: !!q('#molBox svg') && !/NaN/.test(q('#molBox svg').outerHTML) }; };
    const out = [];
    for (const c of combos) {
      if (c[0] === 'gly') {
        bb('gly'); clear();
        const [, a, b, s3, h] = c;
        if (a) { pick('fa', a); put('sn1'); } if (b) { pick('fa', b); put('sn2'); }
        if (s3 === 'P') { pick('phos', 'phos'); put('sn3'); if (h) { pick('head', h); put('head'); } } else if (s3) { pick('fa', s3); put('sn3'); }
      } else { bb('sph'); clear(); const [, n, h] = c; if (n) { pick('fa', n); put('nacyl'); } if (h) { pick('shead', h); put('shead'); } }
      out.push([c, read()]);
    }
    const ch = [...document.querySelectorAll('#chList li')].map(li => li.className);
    return { out, ch };
  }, combos);
  let bBad = 0;
  for (const [c, r] of built.out) {
    const e = c[0] === 'gly' ? expectGly(c[1], c[2], c[3], c[4]) : expectSph(c[1], c[2]);
    const errs = [];
    if (r.name !== e.name) errs.push('name ' + r.name + ' vs ' + e.name);
    if (r.q !== qs(e.q)) errs.push('charge ' + r.q + ' vs ' + qs(e.q));
    if (e.sys && r.sys !== e.sys) errs.push('sys ' + r.sys + ' vs ' + e.sys);
    if (r.facts['In water'] !== e.water) errs.push('water ' + r.facts['In water'] + ' vs ' + e.water);
    if (e.state && !r.facts['At 25 °C'].toLowerCase().includes(e.state)) errs.push('state ' + r.facts['At 25 °C']);
    if (!r.svgOK) errs.push('svg');
    if (errs.length) { bBad++; fault('build', 'build mismatch', { c, errs }); }
  }
  res.checks.build = { combos: built.out.length, bad: bBad, challengesDone: built.ch.filter(x => x === 'done').length, challengeTotal: built.ch.length };
  // PA charge as displayed
  res.checks.PAcharge = built.out.filter(([c]) => c[0] === 'gly' && c[3] === 'P' && !c[4] && c[1] && c[2]).slice(0, 1).map(([c, r]) => ({ c, q: r.q, note: r.facts }));
  // TAG melting-state heuristic: list of combos the page calls liquid/solid with one cis chain
  res.checks.tagStates = built.out.filter(([c]) => c[0] === 'gly' && c[1] && c[2] && c[3] && c[3] !== 'P').slice(0, 0);

  /* ---------- CUT: hit-test geometry for every preset/bond, then 2000 quiz rounds ---------- */
  await page.click('.tab[data-tab="cut"]'); await page.waitForTimeout(300);
  const hit = await page.evaluate(() => {
    const sel = document.getElementById('cSel'); const out = [];
    for (const o of [...sel.options]) {
      sel.value = o.value; sel.dispatchEvent(new Event('change'));
      const hits = [...document.querySelectorAll('#cBox line.hit')];
      for (const h of hits) {
        const r = h.getBoundingClientRect(); const x1 = +h.getAttribute('x1'), x2 = +h.getAttribute('x2'), y1 = +h.getAttribute('y1'), y2 = +h.getAttribute('y2');
        const svg = h.ownerSVGElement; const pt = svg.createSVGPoint(); pt.x = (x1 + x2) / 2; pt.y = (y1 + y2) / 2; const sp = pt.matrixTransform(svg.getScreenCTM());
        const el = document.elementFromPoint(sp.x, sp.y);
        if (h.dataset.cut) out.push([o.value, h.dataset.what, h.dataset.cut, el === h ? 'ok' : (el && el.dataset ? 'stolen by ' + el.dataset.what + '/' + (el.dataset.cut || '') : 'none')]);
      }
    }
    return out;
  });
  res.checks.cutHitTest = hit;
  hit.forEach(h => { if (h[3] !== 'ok') fault('cut', 'cut-site bond midpoint is not clickable (another hit target is on top)', h); });

  const rounds = await page.evaluate(async () => {
    const q = s => document.querySelector(s); const out = []; const sel = q('#cSel');
    const opts = [...sel.options].map(o => o.value);
    let prevEnz = null, sameTwice = 0; const enzSeen = {};
    for (let k = 0; k < 2000; k++) {
      if (k % 50 === 0) { sel.value = opts[(k / 50) % opts.length]; sel.dispatchEvent(new Event('change')); }
      const enzName = q('#cPrompt .enzn').textContent; enzSeen[enzName] = (enzSeen[enzName] || 0) + 1;
      if (enzName === prevEnz) sameTwice++; prevEnz = enzName;
      const key = { 'Phospholipase A₁': 'A1', 'Phospholipase A₂': 'A2', 'Phospholipase C': 'C', 'Phospholipase D': 'D' }[enzName];
      // one wrong click first on odd rounds
      let wrongMsg = '';
      if (k % 2) { const wrong = [...document.querySelectorAll('#cBox line.hit')].filter(h => h.dataset.cut !== key); const w = wrong[k % wrong.length]; w.dispatchEvent(new MouseEvent('click', { bubbles: true })); wrongMsg = q('#cFeed h4').textContent + '|' + w.dataset.what + '|' + (w.dataset.cut || ''); }
      const right = q(`#cBox line.hit[data-cut="${key}"]`);
      right.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const prods = [...document.querySelectorAll('#cProd .prod')].map(p => [p.querySelector('h4').textContent, p.querySelector('.pn').textContent]);
      out.push({ sub: sel.value, key, wrongMsg, prods, score: q('#cScore').textContent });
      q('#cNext').click();
    }
    return { out, sameTwice, enzSeen };
  });
  const SUB = { popc: ['pal', 'ole', 'cho'], sapc: ['ste', 'ara', 'cho'], dppc: ['pal', 'pal', 'cho'], sops: ['ste', 'ole', 'ser'], pope: ['pal', 'ole', 'etn'], popg: ['pal', 'ole', 'gro'] };
  const FFAN = { myr: 'Myristate', pal: 'Palmitate', ste: 'Stearate', ole: 'Oleate', ela: 'Elaidate', lin: 'Linoleate', aln: 'Α-linolenate', ara: 'Arachidonate' };
  const PHQ = { etn: '−1', cho: '−1', ser: '−2', gro: '−2' }, ALC = { etn: ['Ethanolamine', '+1'], cho: ['Choline', '+1'], ser: ['Serine', '0'], gro: ['Glycerol', '0'] };
  let cBad = 0;
  rounds.out.forEach((r, i) => {
    const [s1, s2, h] = SUB[r.sub]; const H = HEAD[h]; const errs = [];
    if (r.prods.length !== 2) errs.push('not 2 products');
    const [p1, p2] = r.prods;
    if (r.key === 'A1') { if (p1[0] !== 'Lyso' + H[0] || !p1[1].startsWith(`2-${ACYL[s2]}-sn-glycero-3-`) || !p1[1].endsWith('net charge ' + qs(H[1])) || p2[0] !== FFAN[s1] || !p2[1].endsWith('net charge −1')) errs.push('A1 products'); }
    if (r.key === 'A2') { if (p1[0] !== 'Lyso' + H[0] || !p1[1].startsWith(`1-${ACYL[s1]}-sn-glycero-3-`) || p2[0] !== FFAN[s2]) errs.push('A2 products'); }
    if (r.key === 'C') { if (p1[0] !== 'Diacylglycerol' || !p1[1].endsWith('net charge 0') || p2[0] !== 'Phospho' + { etn: 'ethanolamine', cho: 'choline', ser: 'serine', gro: 'glycerol' }[h] || !p2[1].endsWith('net charge ' + PHQ[h])) errs.push('C products'); }
    if (r.key === 'D') { if (p1[0] !== 'Phosphatidic acid' || !p1[1].endsWith('net charge −1') || p2[0] !== ALC[h][0] || !p2[1].endsWith('net charge ' + ALC[h][1])) errs.push('D products'); }
    if (r.wrongMsg && !r.wrongMsg.startsWith('✕Not that bond')) errs.push('wrong click accepted: ' + r.wrongMsg);
    if (errs.length) { cBad++; fault('cut', 'cut round mismatch', { i, r, errs }); }
  });
  const lastScore = rounds.out[rounds.out.length - 1].score;
  res.checks.cut = { rounds: rounds.out.length, bad: cBad, sameEnzymeTwiceInARow: rounds.sameTwice, enzymeCounts: rounds.enzSeen, finalScore: lastScore, sampleWrong: rounds.out.filter(r => r.wrongMsg).slice(0, 6).map(r => r.wrongMsg), samplePA: rounds.out.find(r => r.key === 'D').prods };
  // first-try score should be exactly the even-numbered rounds (1000 of 2000)
  if (!/^1000 of 2000/.test(lastScore)) fault('cut', 'quiz score does not equal first-try count', lastScore);

  /* ---------- FLUIDITY sweep: 6 lipids × 91 T × 9 cholesterol ---------- */
  await page.click('.tab[data-tab="water"]'); await page.waitForTimeout(300);
  const fl = await page.evaluate(() => {
    const q = s => document.querySelector(s); const set = (id, v, ev = 'input') => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event(ev)); };
    const out = [];
    for (let k = 0; k < 6; k++) { set('fSel', k, 'change'); for (let c = 0; c <= 40; c += 5) { set('fC', c); for (let T = -20; T <= 70; T++) { set('fT', T); out.push([k, c, T, parseFloat(q('#fBar').style.left), q('#fPhase').textContent, q('#fText').textContent.slice(0, 50)]); } } }
    return { out, labels: [...q('#fSel').options].map(o => o.textContent) };
  });
  const TM = [41, 24, 55, -2, -17, 41];
  let fBad = 0; const fEx = [];
  for (let k = 0; k < 6; k++) for (let c = 0; c <= 40; c += 5) {
    const row = fl.out.filter(r => r[0] === k && r[1] === c);
    for (let i = 1; i < row.length; i++) if (row[i][3] < row[i - 1][3] - 1e-9) { fBad++; fEx.push(['non-monotonic in T', row[i]]); }
    if (c >= 25) row.forEach(r => { const want = [3, 4].includes(k) ? 'Fluid (liquid-disordered)' : 'Liquid-ordered'; if (r[4] !== want) { fBad++; fEx.push(['chol phase', r]); } });
    if (c === 0) row.forEach(r => { const T = r[2]; const want = T < TM[k] - 3 ? 'Gel' : T > TM[k] + 3 ? 'Fluid' : 'At the transition'; if (!r[4].startsWith(want)) { fBad++; fEx.push(['phase', r]); } });
  }
  // cholesterol flattens the temperature response
  const span = (k, c) => { const r = fl.out.filter(x => x[0] === k && x[1] === c).map(x => x[3]); return Math.max(...r) - Math.min(...r); };
  const spans = [0, 1, 2, 3, 4, 5].map(k => [0, 10, 20, 30, 40].map(c => +span(k, c).toFixed(1)));
  spans.forEach((s, k) => { for (let i = 1; i < s.length; i++) if (s[i] > s[i - 1] + 0.01) { fBad++; fEx.push(['chol does not flatten', k, s]); } });
  // at 37 °C, no cholesterol, fluidity ordering should follow Tm (lower Tm => more fluid)
  const at37 = [0, 1, 2, 3, 4, 5].map(k => fl.out.find(x => x[0] === k && x[1] === 0 && x[2] === 37)[3]);
  res.checks.fluidity = { states: fl.out.length, bad: fBad, ex: fEx.slice(0, 5), spansByChol: spans, at37NoChol: Object.fromEntries(fl.labels.map((l, k) => [l, at37[k]])), phasesAt37chol30: fl.out.filter(x => x[1] === 30 && x[2] === 37).map(x => [fl.labels[x[0]], x[4]]) };
  if (fBad) fault('fluidity', 'fluidity model inconsistency', fEx.slice(0, 3));

  /* ---------- WATER: each preset, right and wrong predictions ---------- */
  const wat = [];
  const nW = await page.$$eval('#wSel option', o => o.length);
  const ASM = { Micelles: 'micelle', 'A bilayer': 'bilayer', 'An oil droplet': 'oil', Dissolves: 'dissolve' };
  for (const guess of ['micelle', 'bilayer', 'oil', 'dissolve']) {
    await page.reload(); await page.waitForTimeout(500); await page.click('.tab[data-tab="water"]'); await page.waitForTimeout(300);
    for (let i = 0; i < nW; i++) {
      await page.selectOption('#wSel', String(i));
      await page.click('#wAdd'); await page.click(`#wPred button[data-p="${guess}"]`);
      await page.waitForTimeout(4400);
      const t = await page.textContent('#wRes'); const lab = await page.$eval('#wSel', s => s.options[s.selectedIndex].textContent);
      wat.push({ lab, guess, right: t.startsWith('Your prediction was right'), txt: t.slice(0, 90) });
    }
  }
  res.checks.water = wat;
  const EXPW = { 'Sodium palmitate (a soap)': 'micelle', 'Sodium oleate': 'micelle', '1-Palmitoyl-lysophosphatidylcholine': 'micelle', POPC: 'bilayer', 'Sphingomyelin (N-palmitoyl)': 'bilayer', Triolein: 'oil', 'Ceramide (N-palmitoyl)': 'oil', Phosphocholine: 'dissolve' };
  wat.forEach(w => { if (w.right !== (EXPW[w.lab] === w.guess)) fault('water', 'self-assembly grading', w); });
  await browser.close();
  fs.writeFileSync(__dirname + '/lipid_results.json', JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ build: res.checks.build, PA: res.checks.PAcharge, cut: res.checks.cut, hitTestProblems: hit.filter(h => h[3] !== 'ok'), fluid: { states: res.checks.fluidity.states, bad: fBad, spans, at37: res.checks.fluidity.at37NoChol, lo: res.checks.fluidity.phasesAt37chol30 }, faults: res.faults, counts: res.counts }, null, 1));
})();

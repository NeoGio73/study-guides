// Polymers & Surf Zone: slider labs vs the formulas the page states, plus the 12 "Check yourself"
// calculations at all three help levels. Usage: node polymers-labs.js -> polymers-results.json
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const { BASE, PAGES, seedScript, stubExternal } = require('./common');

const g = 9.81, RHO = 1025;
const r = (x, d) => Number(x.toFixed(d));
const nums = s => (String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/g) || []).map(Number);
// tolerance: one unit in the last displayed digit
const same = (shown, want, d) => Math.abs(shown - want) <= Math.pow(10, -d) * 1.0001 + 1e-12;

// my own implementations of the formulas stated on the page
const EXPECT = {
  swell: ({ sT: T, sD: D }) => { const L = g * T * T / (2 * Math.PI), C = g * T / (2 * Math.PI), Cg = C / 2; return { sL: [[L, 0]], sC: [[C, 1], [C * 2.23694, 0]], sCg: [[Cg, 1]], sBase: [[L / 2, 0]], sTime: [[D * 1000 / Cg / 3600, 0], [D * 1000 / Cg / 3600 / 24, 1]] }; },
  wind: ({ wU, wF }) => { const U = wU * 0.44704, F = wF * 1609.344; const x = g * F / (U * U); let H = 0.0016 * U * U / g * Math.sqrt(x); const Hf = 0.21 * U * U / g; const full = H >= Hf; if (full) H = Hf; return { wH: [[H, 1], [H * 3.28084, 0]], __full: full }; },
  brk: ({ bH: H0, bT: T, bS: run }) => { const L0 = g * T * T / (2 * Math.PI), Hb = 0.39 * Math.pow(g, 0.2) * Math.pow(T * H0 * H0, 0.4), db = Hb / 0.78, cb = Math.sqrt(g * db), xi = (1 / run) / Math.sqrt(H0 / L0); return { bHb: [[Hb, 1], [Hb * 3.28084, 1]], bDb: [[db, 1]], bCb: [[cb, 1], [cb * 2.23694, 0]], bXi: [[xi, 2]], __type: xi < 0.5 ? 'spilling' : xi <= 3.3 ? 'plunging' : 'surging' }; },
  board: ({ kL, kW, kV, kM, kS }) => { const L = kL * 0.3048, W = kW * 0.0254; const vh = 0.4 * Math.sqrt(g * L), Fr = kS / Math.sqrt(g * L); const Vsub = kM / 1.025; const I = 0.6 * L * W ** 3 / 12; const BM = I / (Vsub / 1000); return { kHull: [[vh, 2], [vh * 2.23694, 1]], kFr: [[Fr, 2]], kSub: Vsub / kV >= 1 ? 'sinks' : [[Vsub / kV * 100, 0]], kLpk: [[kV / kM, 2]], kBM: [[BM * 100, 0]], __reg: Fr < 0.4 ? 'displacement' : Fr < 1 ? 'transition' : 'planing' }; },
  fin: ({ fV: v, fA: a, fArea, fD, fR }) => { const A = fArea / 1e4, D = fD / 100; const AR = D * D / A; let CL = 2 * Math.PI * (a * Math.PI / 180) * AR / (AR + 2); if (a > 14) CL *= 0.6; const L = 0.5 * RHO * v * v * A * CL; return { fAR: [[AR, 2]], fCL: [[CL, 2]], fL: [[L, 0], [L / 4.44822, 0]], fM: [[L * 0.4 * D, 1]], fY: [[L * fR / 100, 0]] }; },
  tide: ({ tR: R, tB: B, tH: H, tT: t }) => { const h = R / 2 * (1 - Math.cos(2 * Math.PI * t / 12.42)), d = B + h; return { tNow: [[h, 1]], tD: [[d, 1]], tMax: [[0.78 * d, 1]] }; },
  caro: ({ cP, cR }) => { const p = cP / 100; const X = (1 + cR) / (1 + cR - 2 * cR * p); return { cX: [[X, 0]], cRU: [[X / 2, 0]], cM: [[X * 113.16, 0]], cMax: cR < 1 ? [[(1 + cR) / (1 - cR), 0]] : 'no limit' }; },
  suit: ({ wsD: d, wsT: TF }) => { const TC = (TF - 32) * 5 / 9; const q = 0.05 * 1.8 * Math.max(0, 32 - TC) / (d / 1000); return { wsQ: [[q, 0]], wsK: [[q * 3600 / 4184, 0]] }; },
};
const GRID = {
  swell: { sT: [4, 7, 10, 12.5, 16, 20], sD: [100, 1000, 2500] },
  wind: { wU: [5, 15, 30, 50, 80], wF: [10, 50, 150, 300, 800] },
  brk: { bH: [0.3, 1.2, 2.5, 4], bT: [5, 8, 11, 14, 18], bS: [5, 12, 30, 80] },
  board: { kL: [5, 9, 10.5, 14], kW: [18, 25, 32, 36], kV: [20, 68, 200, 350], kM: [40, 85, 140], kS: [0.5, 1.8, 6, 10] },
  fin: { fV: [1, 6, 12], fA: [0, 8, 14, 15, 20], fArea: [40, 100, 300], fD: [6, 11.5, 28], fR: [20, 50, 120] },
  tide: { tR: [1, 4, 7], tB: [1, 3, 10], tH: [1, 4, 10], tT: [0, 3.1, 6.2, 9, 12.4] },
  caro: { cP: [50, 90, 99, 99.5, 99.9], cR: [0.9, 0.98, 0.99, 0.995, 1] },
  suit: { wsD: [0.5, 2, 3, 5, 7], wsT: [50, 56, 62, 68, 76, 86] },
};
function* combos(grid) { const keys = Object.keys(grid); const idx = keys.map(() => 0); while (true) { yield Object.fromEntries(keys.map((k, i) => [k, grid[k][idx[i]]])); let j = 0; while (j < keys.length) { idx[j]++; if (idx[j] < grid[keys[j]].length) break; idx[j] = 0; j++; } if (j === keys.length) return; } }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(seedScript(7));
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await stubExternal(page);
  await page.goto(BASE + PAGES.poly, { waitUntil: 'load' });
  const res = { pageErrors: errs, labs: {}, faults: [], notes: [], practice: [] };
  for (const [lab, grid] of Object.entries(GRID)) {
    let n = 0, bad = 0; const ex = [];
    for (const c of combos(grid)) {
      const out = await page.evaluate(c => { for (const [id, v] of Object.entries(c)) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
        const ids = ['sL', 'sC', 'sCg', 'sBase', 'sTime', 'wH', 'wT', 'wP', 'wLim', 'bHb', 'bDb', 'bCb', 'bXi', 'bType', 'kHull', 'kFr', 'kReg', 'kSub', 'kLpk', 'kBM', 'fAR', 'fCL', 'fL', 'fM', 'fY', 'fSt', 'tStage', 'tNow', 'tD', 'tMax', 'tRes', 'cX', 'cRU', 'cM', 'cMax', 'cUse', 'wsQ', 'wsK', 'wsS'];
        const o = {}; ids.forEach(i => { const e = document.getElementById(i); if (e) o[i] = e.textContent; });
        // the slider values actually applied (the browser snaps to step/min/max)
        for (const id of Object.keys(c)) o['__' + id] = +document.getElementById(id).value; return o; }, c);
      const applied = Object.fromEntries(Object.keys(c).map(k => [k, out['__' + k]]));
      const exp = EXPECT[lab](applied); n++;
      const probs = [];
      for (const [id, spec] of Object.entries(exp)) {
        if (id.startsWith('__')) continue;
        const shown = out[id]; if (/NaN|Infinity|undefined|null/.test(shown)) { probs.push(id + ' shows ' + shown); continue; }
        if (typeof spec === 'string') { if (!shown.includes(spec)) probs.push(id + ' "' + shown + '" expected "' + spec + '"'); continue; }
        const got = nums(shown);
        spec.forEach(([want, d], k) => { if (got[k] === undefined || !same(got[k], r(want, d), d)) probs.push(id + '[' + k + '] shows ' + got[k] + ', formula gives ' + want.toFixed(d + 2)); });
      }
      if (exp.__type && !out.bType.includes(exp.__type)) probs.push('bType "' + out.bType + '" expected ' + exp.__type);
      if (exp.__reg && !out.kReg.includes(exp.__reg)) probs.push('kReg "' + out.kReg + '" expected ' + exp.__reg);
      if (probs.length) { bad++; if (ex.length < 6) ex.push({ inputs: applied, probs }); }
    }
    res.labs[lab] = { combos: n, mismatches: bad, examples: ex };
    console.log(lab, n, 'combos', bad, 'mismatches');
  }
  // wind lab: period jumps where the fetch-limited fit meets the fully developed cap
  const windT = await page.evaluate(() => { const out = []; const U = document.getElementById('wU'), F = document.getElementById('wF');
    U.value = 30; for (let f = 10; f <= 800; f += 10) { F.value = f; F.dispatchEvent(new Event('input', { bubbles: true })); out.push([f, document.getElementById('wH').textContent, document.getElementById('wT').textContent, document.getElementById('wLim').textContent]); } return out; });
  for (let i = 1; i < windT.length; i++) { const t0 = parseFloat(windT[i - 1][2]), t1 = parseFloat(windT[i][2]); if (windT[i - 1][3] !== windT[i][3]) res.notes.push({ lab: 'wind', at: '30 mph, fetch ' + windT[i - 1][0] + '→' + windT[i][0] + ' mi', H: windT[i - 1][1] + ' → ' + windT[i][1], T: windT[i - 1][2] + ' → ' + windT[i][2], jumpPct: ((t1 - t0) / t0 * 100).toFixed(1) }); }
  // Teahupo'o claim: "a 1:1 bottom gives an Iribarren number far into the plunging range"
  const xi11 = [[2, 14], [3, 16], [4, 18], [1.2, 11]].map(([H, T]) => { const L0 = g * T * T / (2 * Math.PI); return { H0: H, T, xi: +(1 / Math.sqrt(H / L0)).toFixed(1), xi_1to3: +((1 / 3) / Math.sqrt(H / L0)).toFixed(1) }; });
  res.notes.push({ lab: 'breaker / Teahupoo text', claim: '1:1 bottom gives ξ0 far into the plunging range (0.5–3.3)', computed: xi11, sliderMinSlope: '1:5' });

  // Check yourself calculations at each help level, typing the worked-solution answer
  const answers = ['9980', '22600', '18.7', '4.76', '18.0', '1.05', '2.45', '1.34', '52.8', '31.4', '2.1', '2.08'];
  const mine = [280000 / (2 * 12.011 + 4 * 1.008), 113.16 / (1 - 0.995), 9.81 * 12 / (2 * Math.PI), Math.sqrt(9.81 * 1.8 / 0.78), (15 + 14.7) * (55 + 273.15) / (25 + 273.15) - 14.7,
    (1 / 12) / Math.sqrt(1.2 / (9.81 * 121 / (2 * Math.PI))), 0.4 * Math.sqrt(9.81 * 12.5 * 0.3048), Math.pow(32 / 29, 3), (92 / 1.025) / 170 * 100, 0.5 * 1025 * 36 * 0.01 * 0.34 * 0.5, 4.2 / 2, Math.pow(2.5, 0.8)];
  const P = await page.evaluate(() => { const out = []; document.querySelectorAll('#probs .prob').forEach(d => out.push(d.querySelector('.pt').textContent)); return out; });
  for (const level of ['guided', 'hints', 'own']) {
    await page.click('button[data-level="' + level + '"]');
    for (let i = 0; i < answers.length; i++) {
      const inp = page.locator('#in' + i); await inp.fill(''); await inp.type(answers[i]);
      await page.click('button[data-chk="' + i + '"]');
      const fb = await page.textContent('#fb' + i);
      const a = await page.evaluate(i => null, i);
      res.practice.push({ level, i, title: P[i], typed: answers[i], feedback: fb, mine: +mine[i].toPrecision(5) });
      if (level === 'hints') { const hb = page.locator('.hintbtn[data-i="' + i + '"]'); await hb.click(); await hb.click(); const nh = await page.$$eval('#h' + i + ' > div', d => d.length); const hidden = await hb.isHidden(); if (nh !== 2 || !hidden) res.faults.push({ practice: i, problem: 'hints did not show 2 then hide', nh }); }
      if (level === 'own') { await page.click('button[data-sol="' + i + '"]'); const w = await page.textContent('#sol' + i); if (/NaN|undefined|Infinity/.test(w)) res.faults.push({ practice: i, problem: 'worked solution bad token' }); }
    }
  }
  // comma-formatted answer as shown in worked solution 1 (9,982) typed into the number input
  await page.click('button[data-level="own"]');
  for (const typed of ['9,982', '9982', '9.98e3', '22,632']) { const i = typed.startsWith('22') ? 1 : 0; const inp = page.locator('#in' + i); await inp.fill(''); await inp.pressSequentially(typed); const val = await inp.inputValue(); await page.click('button[data-chk="' + i + '"]'); res.practice.push({ commaTest: true, i, typed, inputValueSeenByPage: val, feedback: await page.textContent('#fb' + i) }); }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'polymers-results.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res.practice.filter(p => !/Correct/.test(p.feedback)), null, 0));
  console.log(JSON.stringify(res.notes, null, 0)); console.log('errors', errs);
})().catch(e => { console.error(e); process.exit(1); });

// Gases guide: interactive models. Set the controls, read the numbers the page displays, and compare them
// with the law each model illustrates, computed here from independently typed constants.
'use strict';
const L = require('./lib');
const I = require('./indep');
const K = c => c + I.T0;
const faults = [], checks = {};
const num = s => Number(String(s).replace(/,/g, '').replace(/−/g, '-').replace(/\s*×\s*10\^?(−|-)?(\d+)/, (m, sgn, e) => 'e' + (sgn ? '-' : '') + e).match(/-?[\d.]+(e-?\d+)?/)[0]);
function cmp(where, shown, want, relTol, extra){
  checks[where.split(':')[0]] = (checks[where.split(':')[0]] || 0) + 1;
  const ok = Math.abs(shown - want) <= relTol * Math.abs(want) + 1e-9;
  if(!ok) faults.push({where, shown, want, rel: (shown - want) / want, extra});
  return ok;
}
async function setRange(page, id, v){ await page.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event('input', {bubbles: true})); }, [id, v]); }
async function setText(page, id, v){ await page.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event('input', {bubbles: true})); }, [id, v]); }
async function click(page, sel){ await page.evaluate(sel => { const b = document.querySelector(sel); if(!b) throw new Error('no ' + sel); b.click(); }, sel); }
const stats = (page, sel) => page.evaluate(sel => Array.from(document.querySelectorAll(sel + ' .stat > div')).map(d => [d.querySelector('span').textContent, d.querySelector('b').textContent]), sel);
const text = (page, sel) => page.evaluate(sel => document.querySelector(sel).textContent, sel);

(async () => {
  const browser = await L.launch();
  const {ctx, page, errors} = await L.openPage(browser, L.GASES, {patch: L.patchGases});
  const go = id => page.evaluate(id => window.__G.go(id, false), id);
  const notes = [];

  // 1. Pressure: unit table, barometer, manometer
  await go('pres');
  for(const [v, u] of [['1.00', 'atm'], ['745', 'torr'], ['101.3', 'kPa'], ['30', 'psi'], ['2.5', 'bar'], ['99000', 'Pa'], ['1,250', 'mmHg']]){
    await setText(page, 'pr-val', v); await click(page, '[data-seg="unit"] button[data-v="' + u + '"]');
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#pr-out tbody tr')).map(tr => [tr.querySelector('b').textContent, tr.querySelectorAll('td')[1].textContent]));
    const atm = Number(v.replace(/,/g, '')) / I.ATM[u];
    rows.forEach(([unit, shown]) => cmp('pressure table: ' + v + ' ' + u + ' -> ' + unit, num(shown), atm * I.ATM[unit], 0.0012));
  }
  for(const p of [250, 253, 630, 695, 760, 800]){
    await setRange(page, 'pr-b', p); const t = await text(page, '#pr-baroout');
    const m = t.match(/which is (\d+) torr, ([\d.]+) atm or ([\d.,]+) kPa.*?would be 13\.6 times taller: ([\d.]+) m/);
    cmp('barometer atm: ' + p, +m[2], p / 760, 0.006); cmp('barometer kPa: ' + p, num(m[3]), p / 760 * 101.325, 0.006);
    cmp('barometer water column: ' + p, +m[4], p / 760 * 10.33, 0.01, 'mercury/water density ratio 13.55 at 20 °C');
  }
  for(const pa of ['745', '760', '772']) for(const h of [-300, -100, 0, 55, 300]){
    await click(page, '[data-seg="patm"] button[data-v="' + pa + '"]'); await setRange(page, 'pr-h', h);
    const t = await text(page, '#pr-manoout'); const m = t.match(/=\s*([\d,]+) torr\s*That is ([\d.]+) atm/);
    cmp('manometer: patm ' + pa + ' h ' + h, num(m[1]), +pa + h, 0); cmp('manometer atm: ' + pa + ' ' + h, +m[2], (+pa + h) / 760, 0.006);
  }

  // 2. Boyle: P × V constant, = nRT for 0.100 mol at 25 °C
  await go('boyle');
  const nRT = 0.100 * I.R * 298.15;
  for(let V = 1; V <= 6.0001; V += 0.1){
    await setRange(page, 'bo-V', V.toFixed(1)); const s = await stats(page, '#bo-read');
    const Vs = num(s[0][1]), Ps = num(s[1][1]), PV = num(s[2][1]);
    cmp('Boyle P: V=' + V.toFixed(1), Ps, nRT / Vs, 0.006); cmp('Boyle PV: V=' + V.toFixed(1), PV, nRT, 0.003);
    cmp('Boyle P1V1=P2V2 at displayed values: V=' + V.toFixed(1), Ps * Vs, nRT, 0.006);
    const g = await page.evaluate(() => { const t = document.querySelectorAll('#bo-gauge text'); return t[t.length - 1].textContent; }); cmp('Boyle gauge: V=' + V.toFixed(1), num(g), Ps, 0.0001);
  }

  // 3. Charles: V/T constant (kelvins), plus the "Celsius trap" panel
  await go('charles');
  for(let t = -170; t <= 330; t += 25){
    await setRange(page, 'ch-t', t); const s = await stats(page, '#ch-read');
    const Tk = num(s[1][1]), V = num(s[2][1]), VT = num(s[3][1]);
    cmp('Charles T(K): t=' + t, Tk, K(t), 1e-6); cmp('Charles V: t=' + t, V, 0.100 * I.R * K(t) / 1.00, 0.006); cmp('Charles V/T: t=' + t, VT, 0.100 * I.R * 1000, 0.003);
  }
  for(let t1 = 5; t1 <= 150; t1 += 5){
    await setRange(page, 'ch-t1', t1); const tx = await text(page, '#ch-trap');
    const f = K(2 * t1) / K(t1); const m = tx.match(/=\s*([\d.]+)What it means.*?grows by only ([\d.]+)%/);
    cmp('Charles trap ratio: t1=' + t1, +m[1], f, 0.005); cmp('Charles trap percent: t1=' + t1, +m[2], (f - 1) * 100, 0.05);
  }

  // 4. Gay-Lussac tank and Avogadro cylinder
  await go('gay');
  for(let t = -170; t <= 330; t += 25){
    await setRange(page, 'gl-t', t); const s = await stats(page, '#gl-read');
    cmp('Gay-Lussac P: t=' + t, num(s[1][1]), 0.100 * I.R * K(t) / 2.00, 0.006); cmp('Gay-Lussac P/T: t=' + t, num(s[2][1]), 0.100 * I.R / 2.00, 0.003);
  }
  for(const gas of ['He', 'N2', 'CO2']) for(const n of [0.05, 0.15, 0.3]){
    await click(page, '[data-chips="gas"] .chip[data-v="' + gas + '"]'); await setRange(page, 'av-n', n); const s = await stats(page, '#av-read');
    cmp('Avogadro V: ' + gas + ' n=' + n, num(s[1][1]), n * I.VM, 0.003); cmp('Avogadro particles: ' + n, num(s[3][1].replace(/ × 10(\d+)/, 'e$1')), n * 6.02214e23, 0.003);
    cmp('Avogadro mass: ' + gas + ' n=' + n, num(s[4][1]), n * I.MM(gas), 0.006);
  }

  // 5. Combined gas law solver
  await go('comb');
  const combCases = [['V2', '1.00', '5.00', '25', '0.500', '', '-20'], ['P2', '2.0', '10', '100', '', '4.0', '0'], ['T2', '1.5', '3.0', '27', '0.75', '9.0', ''], ['V2', '3', '0.5', '-50', '1', '', '200']];
  for(const [solve, p1, v1, t1, p2, v2, t2] of combCases){
    await click(page, '[data-seg="solve"] button[data-v="' + solve + '"]');
    for(const [id, v] of [['cb-p1', p1], ['cb-v1', v1], ['cb-t1', t1], ['cb-p2', p2], ['cb-v2', v2], ['cb-t2', t2]]) if(v !== '') await setText(page, id, v);
    const t = await text(page, '#cb-out');
    const T1 = K(+t1), T2 = t2 === '' ? null : K(+t2);
    if(solve === 'V2') cmp('combined V2 ' + [p1, v1, t1, p2, t2], num(t.match(/=([\d.,]+(?: × 10\d+)?) LPressure factor/)[1]), +v1 * +p1 / +p2 * T2 / T1, 0.006);
    if(solve === 'P2') cmp('combined P2 ' + [p1, v1, t1, v2, t2], num(t.match(/=\s*([\d.,]+) atm(?:Volume|$)/)[1]), +p1 * +v1 / +v2 * T2 / T1, 0.006);
    if(solve === 'T2'){ const m = t.match(/=\s*(−?[\d,]+) °C$/); cmp('combined T2 °C ' + [p1, v1, t1, p2, v2], num(m[1]), T1 * +p2 / +p1 * +v2 / +v1 - I.T0, 0, 'rounded to whole degrees'); }
  }

  // 6. Ideal gas law: every solve mode across slider settings; R lanes; molar volumes
  await go('ideal');
  const extremes = [];
  for(const solve of ['P', 'V', 'n', 'T']){
    await click(page, '[data-seg="solve"] button[data-v="' + solve + '"]');
    for(const [P, V, n, T] of [[1, 10, 0.4, 300], [0.25, 1, 2, 150], [5, 50, 0.05, 600], [0.25, 50, 2, 600], [5, 1, 0.05, 150], [2.5, 25, 1, 375]]){
      for(const [id, v] of [['id-P', P], ['id-V', V], ['id-n', n], ['id-T', T]]) await setRange(page, id, v);
      const shown = await page.evaluate(s => document.querySelector('#id-' + s + 'v').textContent, solve);
      const want = solve === 'P' ? n * I.R * T / V : solve === 'V' ? n * I.R * T / P : solve === 'n' ? P * V / (I.R * T) : P * V / (n * I.R);
      cmp('ideal solve ' + solve + ' at P=' + P + ' V=' + V + ' n=' + n + ' T=' + T, num(shown), want, 0.006);
      if(solve === 'T' && (want < 50 || want > 3000)) extremes.push('solve T gives ' + shown + ' (P=' + P + ' atm, V=' + V + ' L, n=' + n + ' mol)');
      if(solve === 'P' && want > 5) extremes.push('solve P gives ' + shown + ' but the gauge only reads to 5 atm (n=' + n + ', T=' + T + ', V=' + V + ')');
      if(solve === 'V' && want > 50) extremes.push('solve V gives ' + shown + ' but the cylinder is drawn full at 50 L');
    }
  }
  notes.push({model: 'ideal-gas explorer extremes', items: extremes});
  for(const ru of ['atm', 'torr', 'kPa']){ await click(page, '[data-seg="ru"] button[data-v="' + ru + '"]'); const t = await text(page, '#id-R'); cmp('R lane ' + ru, num(t.match(/= ([\d.]+) L\. All three/)[1]), I.VM, 0.0005); }
  for(const [k, tC, P] of [['stp', 0, 1], ['room', 25, 1], ['body', 37, 1], ['bar', 0, 1 / 1.01325], ['denver', 25, 0.829]]){
    await click(page, '[data-chips="mv"] .chip[data-v="' + k + '"]'); const t = await text(page, '#id-mv');
    cmp('molar volume ' + k, num(t.match(/=\s*([\d.]+) L\/mol/)[1]), I.R * K(tC) / P, 0.0006);
  }

  // 7. Density: ten-gas chart, the air comparison, the unknown-gas identifier
  await go('dens');
  const DG = ['H2', 'He', 'CH4', 'NH3', 'N2', 'O2', 'Ar', 'CO2', 'Cl2', 'SF6'];
  for(const [t, P] of [[25, 1], [-20, 2], [100, 0.5], [0, 1]]){
    await setRange(page, 'dn-t', t); await setRange(page, 'dn-P', P);
    for(const g of DG){
      await click(page, '[data-chips="gas"] .chip[data-v="' + g + '"]');
      const tx = await text(page, '#dn-out'); const m = tx.match(/=\s*([\d.]+) g\/L.*?Air at the same conditions: ([\d.]+) g\/L\. .*? is (less dense than air|denser than air)/);
      const d = P * I.MM(g) / (I.R * K(t)), da = P * 28.96 / (I.R * K(t));
      cmp('density ' + g + ' ' + t + '°C ' + P + 'atm', +m[1], d, 0.006); cmp('air density ' + t + ' ' + P, +m[2], da, 0.006);
      if((m[3] === 'less dense than air') !== (d < da)) faults.push({where: 'density claim ' + g, shown: m[3]});
    }
    const bars = await page.evaluate(() => Array.from(document.querySelectorAll('#dn-chart svg rect.hot')).map(r => r.getAttribute('data-tip')));
    bars.forEach((b, i) => cmp('density chart bar ' + DG[i] + ' ' + t + ' ' + P, num(b.replace(/<[^>]+>/g, '').replace(/&lt;\/?b&gt;/g, '')), P * I.MM(DG[i]) / (I.R * K(t)), 0.006));
  }
  for(const [m, V, t, P] of [['0.582', '250', '100', '752'], ['1.20', '500', '95', '745'], ['0.0', '250', '100', '752'], ['2.50', '125', '-300', '760'], ['0.350', '250', '25', '760']]){
    for(const [id, v] of [['dn-m', m], ['dn-V', V], ['dn-ut', t], ['dn-uP', P]]) await setText(page, id, v);
    const tx = await text(page, '#dn-unk');
    if(/Type a positive/.test(tx)){ checks['unknown-gas guard'] = (checks['unknown-gas guard'] || 0) + 1; continue; }
    const M = +m * I.R * K(+t) / (+P / 760 * +V / 1000);
    cmp('unknown gas M ' + [m, V, t, P], num(tx.match(/=\s*([\d.]+) g\/mol/)[1]), M, 0.006);
    notes.push({model: 'unknown-gas identifier', input: [m, V, t, P], text: tx.slice(tx.indexOf('g/mol') + 5, tx.length).slice(0, 160)});
  }

  // 8. Dalton: mixer, air, collecting over water
  await go('dalton');
  for(const [a, b, c] of [[0.4, 0.1, 0.2], [1, 1, 1], [0, 0, 0.05], [0.35, 0.65, 0]]){
    await setRange(page, 'da-a', a); await setRange(page, 'da-b', b); await setRange(page, 'da-c', c);
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#da-out tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent)));
    const ns = [a, b, c], tot = a + b + c, k = I.R * 298.15 / 10.0;
    rows.slice(0, 3).forEach((r, i) => { cmp('Dalton partial ' + i + ' ' + ns, num(r[3]), ns[i] * k, 0.006); cmp('Dalton x ' + i + ' ' + ns, num(r[2]), ns[i] / tot, 0.002); });
    cmp('Dalton total ' + ns, num(rows[3][3]), tot * k, 0.006);
    cmp('Dalton sum of displayed partials ' + ns, rows.slice(0, 3).reduce((s, r) => s + num(r[3]), 0), num(rows[3][3]), 0.01);
  }
  for(const [k, P] of [['sea', 760], ['denver', 630], ['everest', 253], ['dive', 3040]]){
    await click(page, '[data-chips="at"] .chip[data-v="' + k + '"]');
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#da-air tbody tr')).map(tr => tr.lastElementChild.querySelector('b').textContent));
    [0.78084, 0.20946, 0.00934].forEach((x, i) => cmp('air partial ' + k + ' ' + i, num(rows[i]), x * P, 0.006));
  }
  for(const t of ['15', '20', '25', '30', '35', '40']) for(const [P, V] of [['755', '245'], ['20', '100'], ['742.5', '1,000']]){
    await click(page, '[data-chips="wt"] .chip[data-v="' + t + '"]'); await setText(page, 'da-wP', P); await setText(page, 'da-wV', V);
    const tx = await text(page, '#da-water'); const p = num(P), v = num(V);
    if(p <= I.VPW[t] + 0.2){ if(!/greater than the vapor pressure/.test(tx)) faults.push({where: 'over-water guard ' + t + ' ' + P, shown: tx.slice(0, 100)}); else checks['over-water guard'] = (checks['over-water guard'] || 0) + 1; continue; }
    const m = tx.match(/=\s*([\d.]+) torrIn atm.*?=\s*([\d.]+(?: × 10−?\d+)?) mol/);
    if(p > 100) cmp('over water dry P ' + t + ' ' + P, num(m[1]), p - I.VPW[t], 0.0015, 'page table ' + t + ' °C');
    if(p > 100) cmp('over water n ' + t + ' ' + P + ' ' + V, num(m[2].replace(/ × 10−(\d+)/, 'e-$1')), (p - I.VPW[t]) / 760 * v / 1000 / (I.R * K(+t)), 0.006);
  }

  // 9. Stoichiometry: reaction calculator and the all-gas volume table
  await go('stoich');
  const RX = {caco3: ['CaCO3', 1, 'CO2', 1], kclo3: ['KClO3', 2, 'O2', 3], zn: ['Zn', 1, 'H2', 1], al: ['Al', 2, 'H2', 3], nan3: ['NaN3', 2, 'N2', 3], h2o2: ['H2O2', 2, 'O2', 1], cac2: ['CaC2', 1, 'C2H2', 1]};
  for(const rx in RX) for(const dir of ['g2L', 'L2g']){
    await click(page, '[data-chips="rx"] .chip[data-v="' + rx + '"]'); await click(page, '[data-seg="dir"] button[data-v="' + dir + '"]');
    for(const [amt, t, P] of [['5.00', '25', '1.00'], ['12.5', '-10', '0.85']]){
      await setText(page, 'st-amt', amt); await setText(page, 'st-t', t); await setText(page, 'st-P', P);
      const tx = await text(page, '#st-out'); const r = RX[rx];
      const want = dir === 'g2L' ? +amt / I.MM(r[0]) * r[3] / r[1] * I.R * K(+t) / +P : +P * +amt / (I.R * K(+t)) * r[1] / r[3] * I.MM(r[0]);
      const m = tx.match(/=\s*([\d.,]+(?: × 10\d+)?) (?:L|g) [A-Za-z0-9]+$/);
      cmp('stoich calc ' + rx + ' ' + dir + ' ' + [amt, t, P], num(m[1]), want, 0.006);
    }
  }
  const GR = {nh3: [['N2', 1], ['H2', 3], ['NH3', 2]], h2o: [['H2', 2], ['O2', 1], ['H2O', 2]], ch4: [['CH4', 1], ['O2', 2], ['CO2', 1], ['H2O', 2]], co: [['CO', 2], ['O2', 1], ['CO2', 2]], c3h8: [['C3H8', 1], ['O2', 5], ['CO2', 3], ['H2O', 4]]};
  for(const k in GR){
    await click(page, '[data-chips="grx"] .chip[data-v="' + k + '"]'); await setRange(page, 'st-gv', 2);
    const tx = await text(page, '#st-vol'); const sp = GR[k];
    const reac = sp.slice(0, 2).reduce((s, x) => s + x[1], 0), prod = sp.slice(2).reduce((s, x) => s + x[1], 0);
    const claim = /because the number of moles of gas changes in the reaction/.test(tx);
    if(claim && reac === prod) faults.push({where: 'gas-volume table text: ' + k, shown: tx.match(/Volumes of gases.*?reaction\./)[0], want: 'moles of gas do not change for this reaction (' + reac + ' → ' + prod + ')'});
    checks['gas-volume table'] = (checks['gas-volume table'] || 0) + 1;
  }

  // 10. Kinetic molecular theory: speeds, Graham race, before/after pictures
  await go('kmt');
  const SG = ['H2', 'He', 'CH4', 'N2', 'O2', 'CO2', 'Xe'];
  for(const T of [100, 300, 1000]){
    await setRange(page, 'km-T', T);
    for(const g1 of SG){
      await click(page, '[data-chips="g1"] .chip[data-v="' + g1 + '"]'); await click(page, '[data-chips="g2"] .chip[data-v="Xe"]');
      const s = await stats(page, '#km-read');
      cmp('urms ' + g1 + ' ' + T + 'K', num(s[0][1]), Math.sqrt(3 * I.RJ * T / (I.MM(g1) / 1000)), 0.006);
      cmp('KE ' + T, num(s[s.length - 1][1]), 1.5 * I.RJ * T / 1000, 0.006);
      if(g1 === 'H2' && T === 100) notes.push({model: 'speed distribution at 100 K', note: 'Xe (bp 165 K) and CO2 (sublimes 195 K) are offered at 100 K, where they are not gases at ordinary pressures'});
    }
  }
  for(const a of SG) for(const b of SG){
    await click(page, '[data-chips="e1"] .chip[data-v="' + a + '"]'); await click(page, '[data-chips="e2"] .chip[data-v="' + b + '"]');
    const tx = await text(page, '#km-graham'); const r = Math.sqrt(I.MM(b) / I.MM(a));
    cmp('Graham ratio ' + a + '/' + b, num(tx.match(/=\s*([\d.]+)(?:[A-Z]|The same)/)[1]), r, 0.006);
    if(a !== b){ const m = tx.match(/effuses ([\d.]+) times as fast as .*? takes ([\d.]+) s\./); cmp('Graham times-as-fast ' + a + '/' + b, +m[1], Math.max(r, 1 / r), 0.006); cmp('Graham 10 s ' + a + '/' + b, +m[2], 10 * Math.max(r, 1 / r), 0.006); }
  }
  const kl = await page.evaluate(() => window.__G.KMT_LAWS);
  const kmtRatios = {boyle: [kl.boyle.b.frac / kl.boyle.a.frac, 0.5], charles: [(kl.charles.b.speed / kl.charles.a.speed) ** 2, kl.charles.b.frac / kl.charles.a.frac], avo: [kl.avo.b.frac / kl.avo.a.frac, kl.avo.b.N / kl.avo.a.N], gay: [(kl.gay.b.speed / kl.gay.a.speed) ** 2, 'pressure ×2 implied']};
  notes.push({model: 'KMT before/after pictures (volume or T ratios)', ratios: kmtRatios});
  cmp('KMT Charles picture: T ratio from speeds vs V ratio', kmtRatios.charles[0], kmtRatios.charles[1], 0.01);

  // 11. Real gases: Z curve and van der Waals calculator
  await go('real');
  const vdwVm = (a, b, P, T) => { let lo = b * 1.000001, hi = Math.max(1000, 2 * I.R * T / P); for(let i = 0; i < 200; i++){ const v = (lo + hi) / 2; (I.R * T / (v - b) - a / (v * v) - P > 0) ? lo = v : hi = v; } return (lo + hi) / 2; };
  const pageVDW = await page.evaluate(() => window.__G.VDW);
  for(const g of ['He', 'H2', 'N2', 'CH4', 'CO2']) for(const T of [320, 400, 600, 800]) for(const P of [10, 100, 200, 400, 600]){
    await click(page, '[data-chips="zg"] .chip[data-v="' + g + '"]'); await setRange(page, 'rl-zT', T); await setRange(page, 'rl-zP', P);
    const tx = await text(page, '#rl-z'); const Z = num(tx.match(/PV\/RT = ([\d.]+)/)[1]);
    const [a, b] = pageVDW[g], v = vdwVm(a, b, P, T); cmp('Z (page constants) ' + g + ' ' + T + 'K ' + P + 'atm', Z, P * v / (I.R * T), 0.006);
    const [a2, b2] = I.VDW[g], v2 = vdwVm(a2, b2, P, T); checks['Z vs textbook constants'] = (checks['Z vs textbook constants'] || 0) + 1;
    if(Math.abs(P * v2 / (I.R * T) - Z) / Z > 0.01) notes.push({model: 'Z with textbook a,b differs by >1%', g, T, P, page: Z, mine: P * v2 / (I.R * T)});
    if((g === 'He' || g === 'H2')){ const pts = await page.evaluate(([g, T]) => window.__G.zCurve(g, T), [g, T]); const minZ = Math.min(...pts.map(p => p[1])); if(minZ < 1 - 1e-9) faults.push({where: 'He/H2 never-below-1 claim ' + g + ' ' + T, shown: minZ}); }
  }
  const belowTc = [];
  for(const g of ['He', 'H2', 'N2', 'O2', 'Ar', 'CH4', 'CO2', 'NH3', 'Cl2']) for(const [n, V, T] of [[1, 2, 300], [2, 1, 280], [0.25, 20, 600], [2, 1, 600], [1, 1, 300]]){
    await click(page, '[data-chips="g"] .chip[data-v="' + g + '"]'); await setRange(page, 'rl-n', n); await setRange(page, 'rl-V', V); await setRange(page, 'rl-T', T);
    const s = await stats(page, '#rl-vdw'); const [a, b] = pageVDW[g];
    cmp('vdW ideal ' + g + ' ' + [n, V, T], num(s[0][1]), n * I.R * T / V, 0.006); cmp('vdW P ' + g + ' ' + [n, V, T], num(s[1][1]), n * I.R * T / (V - n * b) - a * n * n / (V * V), 0.006);
    if(T < I.TC[g]){ const Pv = n * I.R * T / (V - n * b) - a * n * n / (V * V); belowTc.push(g + ' at ' + T + ' K (Tc ' + I.TC[g] + ' K), ' + n + ' mol in ' + V + ' L: page shows ' + s[1][1] + ' with no warning'); }
  }
  notes.push({model: 'van der Waals calculator below the critical temperature', items: belowTc});

  // 12. Mixed practice sorter: categories behind each problem
  await go('mix');
  const sortChk = await page.evaluate(() => { const G = window.__G, bad = []; for(let i = 0; i < 3000; i++){ const p = G.newGasSort(); if(!G.EQ_NAME[p.cat]) bad.push(p.cat); } return bad.length; });
  checks['sorter draws'] = 3000; if(sortChk) faults.push({where: 'sorter category missing', shown: sortChk});

  await ctx.close(); await browser.close();
  L.writeJSON('gases-models.json', {checks, faults, notes, pageErrors: errors});
  console.log('checks', JSON.stringify(checks));
  console.log('faults', faults.length); faults.slice(0, 40).forEach(f => console.log('  ', JSON.stringify(f).slice(0, 400)));
  console.log('notes'); notes.forEach(n => console.log('  ', JSON.stringify(n).slice(0, 700)));
  console.log('page errors', errors.length);
})();

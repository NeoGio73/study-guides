// Geometry + key checks for organic-chemistry/chair-lab.html.
// Captures the 3Dmol viewer, reads the atoms actually rendered, and recomputes axial/equatorial, face, cis/trans.
// node chair_check.js -> chair_results.json
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8905/organic-chemistry/chair-lab.html';
const res = { checks: {}, faults: [] };
const fault = (sec, msg, ex) => res.faults.push({ sec, msg, ex });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', e => fault('page', 'pageerror', String(e)));
  await page.addInitScript(() => {
    const wrap = v => { if (v && v.createViewer && !v.__w) { const o = v.createViewer; v.createViewer = function (...a) { const vw = o.apply(this, a); window.__viewer = vw; return vw; }; v.__w = 1; } return v; };
    for (const name of ['$3Dmol', '3Dmol']) { let val; Object.defineProperty(window, name, { configurable: true, get() { return val; }, set(v) { val = wrap(v); } }); }
  });
  await page.goto(URL); await page.waitForTimeout(1500);
  // createViewer is a getter-only export, so capture the viewer through GLViewer.prototype.render instead
  await page.evaluate(() => { const m = window.$3Dmol || window['3Dmol']; const o = m.GLViewer.prototype.render; m.GLViewer.prototype.render = function (...a) { window.__viewer = this; return o.apply(this, a); }; });
  await page.selectOption('#compound', '1'); await page.waitForTimeout(200);
  const hasViewer = await page.evaluate(() => !!window.__viewer);
  res.checks.viewerCaptured = hasViewer;
  const names = await page.$$eval('#compound option', o => o.map(x => x.textContent));
  const out = [];
  for (let ci = 0; ci < names.length; ci++) {
    await page.selectOption('#compound', String(ci));
    for (const chair of [0, 1]) {
      await page.click(chair ? '#chair-b' : '#chair-a'); await page.waitForTimeout(80);
      const r = await page.evaluate(() => {
        const atoms = window.__viewer.getModel().selectedAtoms({});
        const P = a => [a.x, a.y, a.z];
        const ring = atoms.slice(0, 6);
        const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), norm = a => Math.hypot(...a);
        // ring mean-plane normal (should be z)
        const bonds = []; const angles = [];
        for (let i = 0; i < 6; i++) { const a = P(ring[i]), b = P(ring[(i + 1) % 6]); bonds.push(norm(sub(a, b))); }
        for (let i = 0; i < 6; i++) { const a = P(ring[(i + 5) % 6]), b = P(ring[i]), c = P(ring[(i + 1) % 6]); const u = sub(a, b), v = sub(c, b); angles.push(Math.acos(dot(u, v) / norm(u) / norm(v)) * 180 / Math.PI); }
        const subs = [];
        ring.forEach((rc, i) => {
          const nb = rc.bonds.map(j => atoms[j]).filter(x => x.index > 5 || x.index === undefined ? true : false);
          const ext = rc.bonds.map(j => atoms[j]).filter(x => !ring.includes(x));
          ext.forEach(x => { const v = sub(P(x), P(rc)); const cosz = v[2] / norm(v); subs.push({ carbon: i + 1, elem: x.elem, chain: x.chain, axial: Math.abs(cosz) > 0.9, up: v[2] > 0, cosz: +cosz.toFixed(3) }); });
          // all tetrahedral angles at ring carbon
        });
        const tet = [];
        ring.forEach(rc => { const nbs = rc.bonds.map(j => atoms[j]); for (let a = 0; a < nbs.length; a++) for (let b = a + 1; b < nbs.length; b++) { const u = sub(P(nbs[a]), P(rc)), v = sub(P(nbs[b]), P(rc)); tet.push(Math.acos(dot(u, v) / norm(u) / norm(v)) * 180 / Math.PI); } });
        const rows = [...document.querySelectorAll('#orientations tr')].map(tr => [...tr.children].map(td => td.textContent));
        return { ringZ: ring.map(a => +a.z.toFixed(3)), bondMin: Math.min(...bonds), bondMax: Math.max(...bonds), angMin: Math.min(...angles), angMax: Math.max(...angles), tetMin: Math.min(...tet), tetMax: Math.max(...tet), subs: subs.filter(s => s.elem === 'C'), rows, rel: document.getElementById('relationship').textContent, stab: document.getElementById('stability').textContent, state: document.getElementById('current-state').textContent, nAtoms: atoms.length };
      });
      // independent interpretation
      const errs = [];
      if (r.bondMin < 1.53 || r.bondMax > 1.55) errs.push('ring C–C length');
      if (r.tetMin < 109 || r.tetMax > 110) errs.push('non-tetrahedral angle ' + r.tetMin.toFixed(1) + '–' + r.tetMax.toFixed(1));
      const subsC = r.subs; // substituent carbons attached to ring
      subsC.forEach((s, k) => {
        const row = r.rows[k]; if (!row) { errs.push('no table row'); return; }
        const face = row[1], pos = chair ? row[3] : row[2];
        if (face !== (s.up ? 'up' : 'down')) errs.push(`face C${s.carbon}: table ${face}, model ${s.up ? 'up' : 'down'}`);
        if (pos !== (s.axial ? 'axial' : 'equatorial')) errs.push(`position C${s.carbon}: table ${pos}, model ${s.axial ? 'axial' : 'equatorial'}`);
        if (!row[0].startsWith('C' + s.carbon)) errs.push('row carbon');
      });
      if (subsC.length === 2) { const cis = subsC[0].up === subsC[1].up; const name = names[ci]; if (name.startsWith('cis') !== cis) errs.push('name says ' + name.split('-')[0] + ' but model faces ' + (cis ? 'same' : 'opposite')); if (!r.rel.includes(cis ? 'cis' : 'trans')) errs.push('relationship text'); }
      out.push({ compound: names[ci], chair: chair ? 'B' : 'A', ringZ: r.ringZ, subs: subsC.map(s => `C${s.carbon} ${s.axial ? 'ax' : 'eq'} ${s.up ? 'up' : 'down'}`), rows: r.rows.map(x => x.join('/')), stab: r.stab, errs });
      if (errs.length) fault('chair', 'model/table mismatch', { compound: names[ci], chair, errs });
    }
    // flip check: ring z inverted, faces preserved, ax/eq swapped
    const A = out[out.length - 2], B = out[out.length - 1];
    if (!A.ringZ.every((z, i) => Math.abs(z + B.ringZ[i]) < 1e-3)) fault('chair', 'chair B is not the ring flip of chair A', A.compound);
  }
  res.checks.models = out;
  // 1,3-diaxial guides
  await page.check('#contacts');
  const guides = [];
  for (let ci = 0; ci < names.length; ci++) { await page.selectOption('#compound', String(ci)); for (const chair of [0, 1]) { await page.click(chair ? '#chair-b' : '#chair-a'); guides.push([names[ci], chair ? 'B' : 'A', await page.textContent('#contact-note')]); } }
  res.checks.guides = guides;
  // missions: click each option
  const ms = [];
  const nM = await page.$$eval('#mission option', o => o.length);
  for (let m = 0; m < nM; m++) {
    await page.selectOption('#mission', String(m));
    const nO = await page.$$eval('#choices input', i => i.length);
    const rr = [];
    for (let o = 0; o < nO; o++) { await page.check(`#choices input[value="${o}"]`); await page.click('#check'); rr.push([await page.textContent(`#choices label:nth-child(${o + 1}) span`), (await page.textContent('#feedback')).slice(0, 14)]); }
    const loaded = await page.evaluate(() => [document.getElementById('name').textContent, document.getElementById('current-state').textContent]);
    ms.push({ m, q: await page.textContent('#question'), results: rr, loaded });
  }
  res.checks.missions = ms;
  await browser.close();
  fs.writeFileSync(__dirname + '/chair_results.json', JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ viewer: hasViewer, models: out.map(o => [o.compound, o.chair, o.subs.join(', '), o.rows.join(' | '), o.errs.join(';')]), guides, missions: ms.map(x => [x.q, x.results.map(r => r[0] + ' => ' + r[1]), x.loaded[1]]), faults: res.faults }, null, 1));
})();

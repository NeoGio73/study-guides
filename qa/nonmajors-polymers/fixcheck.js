// Verifies each instructor-approved fix item on the edited guides, through the real pages.
// Usage: node fixcheck.js -> fix-check.json
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const { BASE, PAGES, seedScript, stubExternal } = require('./common');
const EXPORTS = { ph: 'genPH,mountPractice,state,render,parseNum,near', nuc: 'genEnergy,genNuc,genHalf,mountPractice,state,render,parseNum,near' };
const out = []; const ok = (item, what, pass, detail) => { out.push({ item, what, pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + item + ' ' + what + (detail ? ' :: ' + String(detail).slice(0, 140) : '')); };

async function open(browser, which, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 900 }, reducedMotion: 'reduce' }); await ctx.addInitScript(seedScript(4242));
  const page = await ctx.newPage(); await stubExternal(page);
  if (EXPORTS[which]) await page.route('**/' + PAGES[which], async route => { const resp = await route.fetch(); let body = await resp.text(); const m = 'render();\n})();'; const at = body.lastIndexOf(m); body = body.slice(0, at) + 'render();\nwindow.__G={' + EXPORTS[which] + '};\n})();' + body.slice(at + m.length); route.fulfill({ response: resp, body }); });
  await page.goto(BASE + PAGES[which]); return { ctx, page };
}
// type into a practice problem chosen by a predicate on its question text; returns feedback text
async function tryAnswer(page, c) {
  await page.evaluate(({ c, wantSrc }) => {
    const G = window.__G; const want = eval(wantSrc); G.state.tab = c.tab; G.render();
    let P = null; for (let i = 0; i < 300000 && !P; i++) { const x = eval('G.' + c.gen); if (want(x.q.replace(/<[^>]+>/g, ''))) P = x; }
    const S = G.state[c.S].prac; Object.assign(S, { P, mode: 'solo', misses: 0, hint: 0, done: false, partDone: [], sol: false }); G.mountPractice(c.box, S, () => P);
    window.__P = P;
  }, { c: { ...c, want: undefined }, wantSrc: c.want.toString() });
  for (let i = 0; i < c.typed.length; i++) await page.fill('#' + c.box + ' .pin[data-pi="' + i + '"]', c.typed[i]);
  await page.click('#' + c.box + ' button[type=submit]');
  return { fb: (await page.textContent('#' + c.box + ' [data-fb]')).trim(), solution: await page.evaluate(() => window.__P.solution.replace(/<sup>/g, '^').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) };
}
const accepted = fb => /Correct\.|All parts correct/.test(fb);

(async () => {
  const browser = await chromium.launch();
  // ---------- polarity-to-pH ----------
  let { ctx, page } = await open(browser, 'ph');
  const PH = [
    ['1', 'pH 13 [H+]: 0 rejected', { gen: "genPH('toH')", want: q => /has pH 13\./.test(q), typed: ['0'] }, false],
    ['1', 'pH 13 [H+]: 1e-11 (100x) rejected', { gen: "genPH('toH')", want: q => /has pH 13\./.test(q), typed: ['1e-11'] }, false],
    ['1', 'pH 13 [H+]: displayed 1x10^-13 accepted', { gen: "genPH('toH')", want: q => /has pH 13\./.test(q), typed: ['1x10^-13'] }, true],
    ['1', 'pH 2 [OH-]: 1e-11 (10x) rejected', { gen: "genPH('toOH')", want: q => /has pH 2\./.test(q), typed: ['1e-11'] }, false],
    ['1', 'pH 10.6 [H+]: 5e-11 (2x) rejected', { gen: "genPH('calcH')", want: q => /has pH 10\.6\./.test(q), typed: ['5e-11'] }, false],
    ['8', 'pH 4.9 [H+]: worked-solution bold 1.26x10^-5 accepted', { gen: "genPH('calcH')", want: q => /has pH 4\.9\./.test(q), typed: ['1.26x10^-5'] }, true],
    ['11', 'pH 7: "1 × 10^−7" accepted', { gen: "genPH('toH')", want: q => /has pH 7\./.test(q), typed: ['1 × 10^−7'] }, true],
    ['11', 'pH 7: "1×10−7" accepted', { gen: "genPH('toH')", want: q => /has pH 7\./.test(q), typed: ['1×10−7'] }, true],
    ['11', 'pH 7: "1*10^-7" accepted', { gen: "genPH('toH')", want: q => /has pH 7\./.test(q), typed: ['1*10^-7'] }, true],
  ];
  for (const [item, what, c, expAcc] of PH) { const r = await tryAnswer(page, { tab: 'ph', box: 'phprac', S: 'ph', ...c }); ok(item, what, accepted(r.fb) === expAcc, r.fb.slice(0, 90) + (item === '8' ? ' | ' + (r.solution.match(/so \[H\+\] = .{0,60}/) || [''])[0] : '')); }
  const inv = await page.evaluate(() => [window.__G.parseNum('2.5 mg'), window.__G.parseNum('abc'), window.__G.parseNum('1x10^')]);
  ok('11', 'unparsed input returns null', inv.every(v => v === null), JSON.stringify(inv));
  const r11 = await tryAnswer(page, { tab: 'ph', box: 'phprac', S: 'ph', gen: "genPH('toH')", want: q => /has pH 7\./.test(q), typed: ['1e-7 mol'] });
  ok('11', 'typed "1e-7 mol" asks for a number instead of grading a partial', /Enter a number/.test(r11.fb), r11.fb);
  // 31: NaOH label and delta labels
  await page.evaluate(() => { const G = window.__G; G.state.tab = 'ph'; G.render(); });
  await page.evaluate(() => { const s = document.getElementById('phr'); s.value = 13; s.dispatchEvent(new Event('input')); });
  let t = await page.textContent('#phout'); ok('31', 'slider pH 13 shows 0.4% (0.1 M) NaOH', /0\.4% \(0\.1 M\) sodium hydroxide/.test(t) && !/ 4% sodium/.test(t), t.match(/Around pH 13\.0:[^.]*/)?.[0]);
  const ex13 = await page.evaluate(() => { for (let i = 0; i < 20000; i++) { const P = window.__G.genPH(); const q = P.q.replace(/<[^>]+>/g, ''); if (/has pH 13 \(/.test(q)) return q; } return ''; });
  ok('31', '"times" problem labels pH 13 as 0.4% (0.1 M) NaOH', /pH 13 \(0\.4% \(0\.1 M\) sodium hydroxide\)/.test(ex13), ex13.slice(0, 120));
  // 41: wording at 6.9 / 7.1 and the 10^0 label
  await page.evaluate(() => { const s = document.getElementById('phr'); s.value = 6.9; s.dispatchEvent(new Event('input')); });
  t = await page.textContent('#phout'); ok('41', 'slider 6.9: "1.3 times more"', /1\.3 times more/.test(t), t.match(/this solution has [^.]*hydrogen ion/)?.[0]);
  await page.evaluate(() => { const s = document.getElementById('phr'); s.value = 0; s.dispatchEvent(new Event('input')); });
  t = await page.innerText('#phout'); ok('41', 'slider pH 0: [H+] label is 1 × 10^0, no 10−0', !/10\s*−\s*0\b/.test(t) && /1 × 10\s*0/.test(t), t.split('\n').slice(0, 6).join(' | '));
  const cls = await page.evaluate(() => { for (let i = 0; i < 50000; i++) { const P = window.__G.genPH('class'); if (/pH 7\.1\./.test(P.q)) return P.solution.replace(/<[^>]+>/g, ''); } return ''; });
  ok('41', 'classify pH 7.1 solution: "about 1.3 times less"', /about 1\.3 times less/.test(cls), cls.match(/\(about[^)]*\)/)?.[0]);
  // delta labels
  for (const [a, b, want] of [['C', 'S', false], ['C', 'H', false], ['O', 'H', true], ['H', 'I', false], ['N', 'O', true]]) {
    await page.evaluate(() => { const G = window.__G; G.state.tab = 'polar'; G.render(); });
    await page.selectOption('#enA', a); await page.selectOption('#enB', b);
    const pair = await page.textContent('#enout .bigpair'); ok('31', 'δ labels for ' + a + '–' + b + (want ? ' shown' : ' absent'), /δ/.test(pair) === want, pair);
  }
  // round 2 (pH guide): EPA action levels, H–I note, litmus, specific heat, hardness, fluoride
  const srcP = fs.readFileSync(path.join(__dirname, '../../', PAGES.ph), 'utf8');
  await page.evaluate(() => { const G = window.__G; G.state.tab = 'sol'; G.render(); });
  await page.selectOption('#ccont', 'lead'); await page.fill('#cval', '0.020'); await page.dispatchEvent('#cval', 'input');
  let ct = await page.innerText('#cout'); ok('R2', 'lead shown as EPA action level, LCRI 0.010 by 2027', /EPA action level for lead/i.test(ct) && /Above the action level/.test(ct) && /0\.010 mg\/L \(10 ppb\)/.test(ct) && /2027/.test(ct), ct.replace(/\s+/g, ' ').slice(0, 160));
  await page.selectOption('#ccont', 'arsenic'); ct = await page.innerText('#cout'); ok('R2', 'arsenic still a limit (MCL)', /EPA limit for arsenic/i.test(ct) && /maximum of/.test(ct));
  await page.selectOption('#ccont', 'copper'); ct = await page.innerText('#cout'); ok('R2', 'copper shown as action level', /EPA action level for copper/i.test(ct) && /not a legal limit/.test(ct));
  ok('R2', 'fluoride 0.7 mg/L since 2015', /0\.7 mg\/L \(0\.7 ppm\), the single level the U\.S\. Public Health Service has recommended since 2015/.test(srcP) && !/0\.7–1\.0 ppm/.test(srcP));
  ok('R2', 'hardness = Ca2+ and Mg2+ only', !/and iron ions/.test(srcP) && !/hard water” ions/.test(srcP));
  ok('R2', 'specific heat: five times rock, nine times iron', /about five times that of rock and about nine times that of iron/.test(srcP) && !/four times that of rock/.test(srcP));
  await page.evaluate(() => { const G = window.__G; G.state.tab = 'polar'; G.render(); });
  await page.selectOption('#enA', 'H'); await page.selectOption('#enB', 'I'); ct = await page.innerText('#enout');
  ok('R2', 'explorer H–I: nonpolar per course table + 0.46 note', /Nonpolar covalent/.test(ct) && /0\.46, so HI does have a small dipole/.test(ct));
  ok('R2', 'practice H–I solution carries the 0.46 note', /pr\.includes\('H'\)&&pr\.includes\('I'\)\?'With more precise values \(H 2\.20, I 2\.66\)/.test(srcP));
  await page.evaluate(() => { const G = window.__G; G.state.tab = 'ph'; G.render(); });
  for (const [v, want] of [[3, 'blue turns red'], [6.9, 'partway (purple)'], [8, 'partway (purple)'], [9, 'red turns blue']]) { await page.evaluate(v => { const s = document.getElementById('phr'); s.value = v; s.dispatchEvent(new Event('input')); }, v); const lt = await page.innerText('#phout'); ok('R2', 'litmus at pH ' + v + ': ' + want, lt.includes(want)); }
  const lit = await page.evaluate(() => { const r = {}; for (let i = 0; i < 60000; i++) { const P = window.__G.genPH(); const m = P.q.match(/^A solution has pH ([\d.]+)\.$/); if (!m) continue; const p = +m[1]; const o = P.parts[2].options.find(x => x.ok).v; const want = p < 4.5 ? 'turns red' : p <= 8.3 ? 'turns purple (partway)' : 'stays blue'; r[o === want ? 'ok' : 'bad'] = (r[o === want ? 'ok' : 'bad'] || 0) + 1; } return r; });
  ok('R2', 'classify problems: litmus key follows 4.5–8.3 range', !lit.bad && lit.ok > 1000, JSON.stringify(lit));
  await ctx.close();

  // ---------- nuclear and energy ----------
  ({ ctx, page } = await open(browser, 'nuc'));
  const NUC = [
    ['2', '5 W x 1 h at $0.12: cost $0.006 (10x) rejected', { want: q => /5 W runs for 1 hour\. .*\$0\.12/.test(q), typed: ['0.005', '$0.006'] }, false],
    ['2', '5 W x 1 h at $0.12: cost $0.00 rejected', { want: q => /5 W runs for 1 hour\. .*\$0\.12/.test(q), typed: ['0.005', '$0.00'] }, false],
    ['2', '5 W x 1 h at $0.12: displayed $0.0006 accepted', { want: q => /5 W runs for 1 hour\. .*\$0\.12/.test(q), typed: ['0.005', '$0.0006'] }, true],
    ['2', '14 W x 6 h at $0.12: displayed $0.0101 accepted', { want: q => /14 W runs for 6 hours\. .*\$0\.12/.test(q), typed: ['0.084', '$0.0101'] }, true],
    ['9', '5 W x 0.5 h: worked-solution kWh 0.0025 accepted', { want: q => /5 W runs for 0\.5 hours\. How much energy does it use\?$/.test(q), typed: ['0.0025'] }, true],
  ];
  for (const [item, what, c, expAcc] of NUC) { const r = await tryAnswer(page, { tab: 'energy', box: 'eprac', S: 'energy', gen: 'genEnergy()', ...c }); ok(item, what, accepted(r.fb) === expAcc, r.fb.slice(0, 80) + ' | ' + (r.solution.match(/Energy: .*?kWh/) || [''])[0] + ' ' + (r.solution.match(/Cost: [^.]*\.\d+/) || [''])[0]); }
  const sols = await page.evaluate(() => { const bad = []; for (let i = 0; i < 40000; i++) { const P = window.__G.genEnergy(); if (/\$0\.00\b/.test(P.solution) || /<b>\$0\.00</.test(P.solution)) bad.push(P.q.replace(/<[^>]+>/g, '')); } return bad.length; });
  ok('9', 'no "$0.00" in 40,000 energy worked solutions', sols === 0, sols);
  // 32: text
  const tabText = async tab => { await page.evaluate(t => { const G = window.__G; G.state.tab = t; G.render(); }, tab); return page.innerText('#view'); };
  t = await tabText('map'); await page.evaluate(() => { document.querySelector('.chain .node[data-id="fossil"]').click(); }); const mapF = await page.innerText('#mapdetail');
  ok('32', 'roadmap: fossil fuels about 80%', /about 80%/.test(mapF) && !/90%/.test(mapF), mapF.match(/supply[^.]*/)?.[0]);
  t = await tabText('fossil'); ok('32', 'fossil lede: about 80%', /supply about 80% of the energy/.test(t) && !/more than 90%/.test(t));
  t = await tabText('rad'); ok('32', 'radiation key ideas: about half background', /About half of the average American’s exposure is natural background/.test(t) && !/three-fourths of the average/.test(t));
  const src = fs.readFileSync(path.join(__dirname, '../../', PAGES.nuc), 'utf8');
  ok('32', 'review quiz keys "About 80%" and "About half"', /o:\['10%','50%','About 80%','100%'\],a:2/.test(src) && /o:\['One-tenth','About half','Three-fourths','All of it'\],a:1/.test(src));
  ok('32', 'key terms: about half / about 80%', /about half of average exposure/.test(src) && /about 80% of a modern society’s energy/.test(src) && !/more than 90% of a modern/.test(src));
  ok('32', 'Curie discovered radium in 1898', /Marie and Pierre Curie discovered radium in 1898/.test(src) && !/isolated radium/.test(src));
  // round 2 (nuclear guide)
  ok('R2', 'beta: a few millimeters of tissue', /penetrate a few millimeters of skin and tissue/.test(src));
  ok('R2', 'Manhattan Project begun in 1942', /Begun in 1942, three years after Einstein’s 1939 letter/.test(src) && !/Launched in 1939/.test(src));
  t = await tabText('fossil'); ok('R2', 'chart: 2005 vs 2025 with EIA sources', /2005 versus 2025/.test(t) && /Monthly Energy Review Table 7\.2a/.test(t) && /Natural gas\s*41%/.test(t) && /Coal\s*50%/.test(t) && !/2003|2017/.test(t), (t.match(/Percentages[^\n]*/) || [''])[0]);
  ok('R2', 'share problem uses 2025 EIA shares', /\['natural gas',41\],\['coal',17\],\['nuclear power',18\],\['hydroelectric dams',6\],\['wind',11\]/.test(src) && /'In 2025, about '/.test(src));
  ok('R2', 'reactor fuel about 3–5% everywhere', !/2\.5–3\.5/.test(src) && (src.match(/about 3–5% U|about 3–5% uranium/g) || []).length >= 4 && /o:\['0\.1%','3–5%','50%','100%'\],a:1/.test(src));
  ok('R2', 'US 94 reactors at 54 plants; France about two-thirds', /94 operating reactors at 54 plants \(EIA, March 2026\)/.test(src) && /94 reactors at 54 plants/.test(src) && /about two-thirds/.test(src) && !/104 plants|73%/.test(src));
  ok('R2', 'half-lives Na-24 14.96 h, Pu-238 87.7 y, Sr-90 28.8 y', /'14\.96 h'/.test(src) && /'87\.7 y'/.test(src) && /87\.7-year/.test(src) && /t:28\.8,/.test(src) && !/28\.5|14\.66|'86 y'|86-year/.test(src));
  ok('R3', 'tritium 12.32 y in all 4 places, no 12.26', (src.match(/12\.32/g) || []).length === 4 && !/12\.26/.test(src));
  ok('R3', 'U-238 4.47 billion y (4.468e9) in all 5 places, no 4.51', /t:4\.468e9/.test(src) && (src.match(/4\.47[- ]billion/g) || []).length === 4 && !/4\.51|4\.5-billion-year half-life|Uranium-238: 4\.5 billion/.test(src));
  const h3 = await page.evaluate(() => { const out = { n: 0, bad: 0 }; for (let i = 0; i < 60000; i++) { const P = window.__G.genHalf(); const q = (P.ctx || '').replace(/<[^>]+>/g, ''); if (!/^Tritium/.test(q)) continue; out.n++; if (!/half-life of 12\.32 years/.test(q)) out.bad++; } return out; });
  ok('R3', 'tritium half-life problems use 12.32 years', h3.n > 100 && h3.bad === 0, JSON.stringify(h3));
  await page.evaluate(() => { const G = window.__G; G.state.tab = 'half'; G.render(); });
  await page.selectOption('#hiso', 'U238'); await page.evaluate(() => { const s = document.getElementById('hn'); s.value = 2; s.dispatchEvent(new Event('input')); });
  const hs = await page.innerText('#hout'); ok('R3', 'simulator U-238, 2 half-lives = 8.94 billion years', /8\.94 billion years/.test(hs), hs.split('\n').slice(0, 3).join(' | '));
  ok('R2', 'iron-56 and nickel-62 most tightly bound', /Iron-56 and nickel-62 are the most tightly bound nuclei/.test(src) && !/Iron has the most tightly bound/.test(src));
  ok('R2', 'transuranium: traces of Np and Pu noted, no "every element"', (src.match(/traces of neptunium and plutonium/g) || []).length === 5 && !/every element (beyond|heavier than) uranium|Every element beyond/.test(src));
  await ctx.close();
  // 42: no sideways scroll on the Energy tab at 390 px
  ({ ctx, page } = await open(browser, 'nuc', { width: 390, height: 844 }));
  await page.evaluate(() => { const G = window.__G; G.state.tab = 'energy'; G.render(); });
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok('42', 'Energy tab at 390 px: scrollWidth ≤ clientWidth', sw[0] <= sw[1], sw.join(' / '));
  await ctx.close();

  // ---------- polymers ----------
  ({ ctx, page } = await open(browser, 'poly'));
  const eth = await page.locator('svg[aria-label="Structure of Ethylene"]').boundingBox();
  ok('43', 'ethylene drawn with labels (H2C=CH2), not a 31x4 bar', eth.width > 60 && eth.height > 12, JSON.stringify(eth));
  await page.locator('svg[aria-label="Structure of Ethylene"]').screenshot({ path: path.join(__dirname, 'fix-ethylene.png') });
  for (const lab of ['Structure of Poly(vinyl acetate) (PVAc)', 'Structure of the polymer in this question']) {
    const r = await page.evaluate(lab => { const svg = document.querySelector('svg[aria-label="' + lab + '"]'); const n = [...svg.querySelectorAll('text')].find(t => t.textContent === 'n').getBBox(); const hits = [...svg.querySelectorAll('path[class^="atom-"]')].filter(p => { const b = p.getBBox(); return !(b.x > n.x + n.width || b.x + b.width < n.x || b.y > n.y + n.height || b.y + b.height < n.y); }).length; return { n: [n.x, n.y, n.width, n.height].map(v => Math.round(v * 10) / 10), overlapsAtomLabels: hits }; }, lab);
    ok('43', 'PVAc n clear of atom labels (' + (lab.includes('question') ? 'practice' : 'A3 card') + ')', r.overlapsAtomLabels === 0, JSON.stringify(r));
  }
  await page.locator('svg[aria-label="Structure of Poly(vinyl acetate) (PVAc)"]').screenshot({ path: path.join(__dirname, 'fix-pvac.png') });
  const body = await page.innerText('body');
  ok('33', 'Teahupo’o: plane-beach caveat, no "far into the plunging range"', /fitted for waves on plane beaches/.test(body) && !/far into the plunging range/.test(body) && !/pushes ξ₀ high into the plunging range/.test(body));
  ok('43', 'Ponce Inlet (New Smyrna Beach)', /Ponce Inlet \(New Smyrna Beach\)/.test(body) && !/Ponce and New Smyrna inlets/.test(body));
  ok('43', 'maleic → trans (fumarate) note', /isomerizes to the trans \(fumarate\) unit/.test(body));
  ok('43', 'board lab label "Rider + board + gear mass"', /Rider \+ board \+ gear mass/.test(body));
  await ctx.close(); await browser.close();
  fs.writeFileSync(path.join(__dirname, 'fix-check.json'), JSON.stringify(out, null, 1));
  console.log(out.filter(x => x.pass).length + ' / ' + out.length + ' passed');
})().catch(e => { console.error(e); process.exit(1); });

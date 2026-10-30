// Verifies each instructor-approved fix item on the edited guides, through the real pages.
// Usage: node fixcheck.js -> fix-check.json
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const { BASE, PAGES, seedScript, stubExternal } = require('./common');
const EXPORTS = { ph: 'genPH,mountPractice,state,render,parseNum,near', nuc: 'genEnergy,genNuc,mountPractice,state,render,parseNum,near' };
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

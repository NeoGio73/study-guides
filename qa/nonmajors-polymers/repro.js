// Reproduces each grading fault through the real practice UI (typing into the inputs and pressing Check).
// Usage: node repro.js -> repro-results.json
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const { BASE, PAGES, seedScript, stubExternal } = require('./common');
const EXPORTS = { ph: 'genBond,genConc,genNeut,genPH,parseNum,near,mountPractice,state,render', nuc: 'genNuc,genHalf,genEnergy,genFuel,parseNum,near,mountPractice,state,render' };
const CASES = {
  ph: [
    { name: 'pH 13 [H+]: type 0', tab: 'ph', box: 'phprac', S: 'ph', gen: "genPH('toH')", want: q => /has pH 13\./.test(q), typed: ['0'] },
    { name: 'pH 13 [H+]: type 1e-11 (100x too big)', tab: 'ph', box: 'phprac', S: 'ph', gen: "genPH('toH')", want: q => /has pH 13\./.test(q), typed: ['1e-11'] },
    { name: 'pH 2 [OH-]: type 1e-11 (10x too big)', tab: 'ph', box: 'phprac', S: 'ph', gen: "genPH('toOH')", want: q => /has pH 2\./.test(q), typed: ['1e-11'] },
    { name: 'pH 10.6 [H+]: type 5e-11 (2x too big)', tab: 'ph', box: 'phprac', S: 'ph', gen: "genPH('calcH')", want: q => /has pH 10\.6\./.test(q), typed: ['5e-11'] },
    { name: 'pH 4.9 [H+]: type the worked solution value 1.3 x 10^-5', tab: 'ph', box: 'phprac', S: 'ph', gen: "genPH('calcH')", want: q => /has pH 4\.9\./.test(q), typed: ['1.3x10^-5'] },
    { name: 'pH 7 [H+]: type 1 × 10^−7 with a Unicode minus', tab: 'ph', box: 'phprac', S: 'ph', gen: "genPH('toH')", want: q => /has pH 7\./.test(q), typed: ['1 × 10^−7'] },
    { name: 'pH 7 [H+]: type 1*10^-7', tab: 'ph', box: 'phprac', S: 'ph', gen: "genPH('toH')", want: q => /has pH 7\./.test(q), typed: ['1*10^-7'] },
  ],
  nuc: [
    { name: '5 W x 0.5 h: type worked-solution kWh 0.003', tab: 'energy', box: 'eprac', S: 'energy', gen: 'genEnergy()', want: q => /5 W runs for 0\.5 hours\. How much energy does it use\?$/.test(q), typed: ['0.003'] },
    { name: '5 W x 1 h at $0.12: cost typed $0.006 (10x the right $0.0006)', tab: 'energy', box: 'eprac', S: 'energy', gen: 'genEnergy()', want: q => /5 W runs for 1 hour\. .*\$0\.12/.test(q), typed: ['0.005', '$0.006'] },
    { name: '5 W x 1 h at $0.12: cost typed $0.00', tab: 'energy', box: 'eprac', S: 'energy', gen: 'genEnergy()', want: q => /5 W runs for 1 hour\. .*\$0\.12/.test(q), typed: ['0.005', '$0.00'] },
  ],
};
(async () => {
  const browser = await chromium.launch(); const out = [];
  for (const which of ['ph', 'nuc']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(seedScript(99));
    const page = await ctx.newPage(); await stubExternal(page);
    await page.route('**/' + PAGES[which], async route => { const resp = await route.fetch(); let body = await resp.text(); const m = 'render();\n})();'; const at = body.lastIndexOf(m); body = body.slice(0, at) + 'render();\nwindow.__G={' + EXPORTS[which] + '};\n})();' + body.slice(at + m.length); route.fulfill({ response: resp, body }); });
    await page.goto(BASE + PAGES[which]);
    for (const c of CASES[which]) {
      const r = await page.evaluate(({ c, wantSrc }) => {
        const G = window.__G; const want = eval(wantSrc); G.state.tab = c.tab; G.render();
        let P; for (let i = 0; i < 200000; i++) { P = eval('G.' + c.gen); if (want(P.q.replace(/<[^>]+>/g, ''))) break; P = null; }
        if (!P) return { error: 'no matching problem' };
        const S = G.state[c.S].prac; Object.assign(S, { P, mode: 'solo', misses: 0, hint: 0, done: false, partDone: [], sol: false });
        G.mountPractice(c.box, S, () => P);
        return { q: P.q.replace(/<[^>]+>/g, ''), answer: P.parts.map(p => p.show.replace(/<sup>/g, '^').replace(/<[^>]+>/g, '')), solution: P.solution.replace(/<sup>/g, '^').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
      }, { c: { ...c, want: undefined }, wantSrc: c.want.toString() });
      for (let i = 0; i < c.typed.length; i++) await page.fill('#' + c.box + ' .pin[data-pi="' + i + '"]', c.typed[i]);
      await page.click('#' + c.box + ' button[type=submit]');
      r.feedback = (await page.textContent('#' + c.box + ' [data-fb]')).trim().slice(0, 160);
      r.name = c.name; r.typed = c.typed; out.push(r);
      console.log(c.name, '→', r.feedback.slice(0, 90));
    }
    await ctx.close();
  }
  await browser.close(); fs.writeFileSync(path.join(__dirname, 'repro-results.json'), JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });

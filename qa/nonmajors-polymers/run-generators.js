// Drives gen-harness.js in both non-majors guides.
// The guide HTML is served unchanged except for one injected line, inside its own script, that exports
// the generators and practice engine to window.__G (the file on disk is never modified).
// Usage: node run-generators.js [genPerType] [uiPerType]  -> writes generator-results.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { BASE, PAGES, seedScript, stubExternal } = require('./common');
const GEN_N = +(process.argv[2] || 20000), UI_N = +(process.argv[3] || 2000);
const EXPORTS = {
  ph: 'genBond,genConc,genNeut,genPH,parseNum,near,mountPractice,state,render,EN,METALS,ENAMES',
  nuc: 'genNuc,genHalf,genEnergy,genFuel,parseNum,near,mountPractice,state,render,SYM,ENAME',
};
const EXPECT = { bond: 1, conc: 7, neut: 1, ph: 7, nuc: 4, half: 6, energy: 7, fuel: 5 };
(async () => {
  const browser = await chromium.launch();
  const out = { settings: { GEN_N, UI_N, seed: 20261030, viewport: '390x844' } };
  for (const which of ['ph', 'nuc']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(seedScript(20261030));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await stubExternal(page);
    await page.route('**/' + PAGES[which], async route => {
      const resp = await route.fetch(); let body = await resp.text();
      const marker = 'render();\n})();';
      const at = body.lastIndexOf(marker);
      if (at < 0) throw new Error('marker not found in ' + which);
      body = body.slice(0, at) + 'render();\nwindow.__G={' + EXPORTS[which] + '};\n})();' + body.slice(at + marker.length);
      route.fulfill({ response: resp, body });
    });
    const load = async () => { await page.goto(BASE + PAGES[which], { waitUntil: 'load' }); await page.addScriptTag({ path: path.join(__dirname, 'gen-harness.js') }); };
    const merged = { perType: {}, counts: {}, faults: {}, notes: {}, extras: { phTimesLabels: {}, halfIso: {} }, parseVariants: null, timings: [] };
    const merge = (res) => {
      for (const [k, v] of Object.entries(res.perType)) { const prev = merged.perType[k] || {}; merged.perType[k] = Object.assign(prev, v, v.ui ? { ui: Object.assign(prev.ui || {}, v.ui) } : {}); }
      for (const [k, v] of Object.entries(res.counts)) merged.counts[k] = (merged.counts[k] || 0) + v;
      for (const bag of ['faults', 'notes']) for (const [k, v] of Object.entries(res[bag])) { const m = merged[bag][k] || (merged[bag][k] = { n: 0, examples: [] }); m.n += v.n; for (const e of v.examples) if (m.examples.length < 6) m.examples.push(e); }
      Object.assign(merged.extras.phTimesLabels, res.extras.phTimesLabels); Object.assign(merged.extras.halfIso, res.extras.halfIso); merged.parseVariants = res.parseVariants;
    };
    const names = which === 'ph' ? ['bond', 'conc', 'neut', 'ph'] : ['nuc', 'half', 'energy', 'fuel'];
    for (const nm of names) for (const job of [{ phase: 'gen' }, { phase: 'ui', modes: ['guided'] }, { phase: 'ui', modes: ['hint'] }, { phase: 'ui', modes: ['solo'] }]) {
      await load(); const t0 = Date.now();
      const res = await page.evaluate(([w, o]) => window.__HARNESS.run(w, o), [which, { genPerType: GEN_N, uiPerType: UI_N, expectTypes: EXPECT, overflowCheck: true, only: nm, ...job }]);
      merge(res); const secs = (Date.now() - t0) / 1000; merged.timings.push({ gen: nm, ...job, secs });
      console.log(which, nm, JSON.stringify(job), secs + 's', 'faults so far', Object.keys(merged.faults).length);
    }
    merged.pageErrors = errs; out[which] = merged;
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'generator-results.json'), JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });

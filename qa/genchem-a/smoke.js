// UI smoke test: every tab, every help level, hints, checks, worked solutions, next problem, roadmap buttons,
// and the virtual titration, at 1280x900 and 390x844. Records page/console errors, bad tokens in rendered text,
// and horizontal overflow. Usage: node smoke.js [problemsPerMode]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8901/general-chemistry/';
const PAGES = ['mole-and-molar-mass-study-guide.html', 'stoichiometry-study-guide.html',
  'solution-stoichiometry-study-guide.html', 'solutions-and-gases-study-guide.html'];
const VIEWS = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }];
const PER_MODE = +(process.argv[2] || 12);

// Runs in the page: bad tokens in visible text and attributes, and horizontal overflow.
function scanPage() {
  const BAD = /\bNaN\b|undefined|Infinity|\bnull\b|\[object Object\]/;
  const out = { bad: [], overflow: null, wide: [] };
  const txt = document.body.innerText;
  const m = txt.match(new RegExp('.{0,60}(' + BAD.source + ').{0,60}', 'g'));
  if (m) out.bad.push(...m.slice(0, 5));
  document.querySelectorAll('*').forEach(el => {
    for (const a of el.attributes) if (/^(aria-|title|alt|value)/.test(a.name) && BAD.test(a.value.replace(/NaN3/g, ''))) out.bad.push('attr ' + a.name + '=' + a.value.slice(0, 100));
  });
  const W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > W + 1) out.overflow = { scrollWidth: document.documentElement.scrollWidth, clientWidth: W };
  if (W < 600) document.querySelectorAll('#view *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > W + 1) {
      let p = el.parentElement, clipped = false;
      while (p) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX)) { clipped = true; break; } p = p.parentElement; }
      out.wide.push({ tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : ''), right: Math.round(r.right), text: (el.innerText || '').slice(0, 60), insideScroller: clipped });
    }
  });
  // keep only outermost offenders
  out.wide = out.wide.filter((w, i, a) => a.findIndex(o => o.tag === w.tag) === i).slice(0, 6);
  return out;
}

async function main() {
  const browser = await chromium.launch();
  const report = [];
  for (const view of VIEWS) {
    for (const pg of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height } });
      const page = await ctx.newPage();
      const R = { page: pg, view: view.name, pageErrors: [], consoleErrors: [], bad: [], overflow: [], clicks: 0, problemsSeen: 0, notes: [] };
      page.on('pageerror', e => R.pageErrors.push(String(e.message).slice(0, 300)));
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') R.consoleErrors.push(m.type() + ': ' + m.text().slice(0, 300)); });
      await page.goto(BASE + pg);
      const scan = async (where) => {
        const s = await page.evaluate(scanPage);
        if (s.bad.length) R.bad.push({ where, hits: s.bad });
        if (view.name === 'phone' && (s.overflow || s.wide.some(w => !w.insideScroller))) R.overflow.push({ where, overflow: s.overflow, wide: s.wide });
      };
      const click = async (sel, where) => {
        const el = await page.$(sel); if (!el) return false;
        if (!(await el.isEnabled())) { R.notes.push('disabled control skipped: ' + sel + ' at ' + (where || '?')); return false; }
        await el.click({ timeout: 5000 }); R.clicks++; if (where) await scan(where); return true;
      };
      R.click = click;
      await scan('roadmap');
      // Roadmap: every connector and every route button.
      for (const b of await page.$$('#view .conn')) { await b.click(); R.clicks++; }
      await scan('roadmap connectors');
      for (const b of await page.$$('#view button[data-path]')) { await b.click(); R.clicks++; await scan('roadmap path'); }
      const tabs = await page.$$eval('#tabs button[data-tab]', bs => bs.map(b => b.dataset.tab));
      for (const tab of tabs) {
        if (tab === 'map') continue;
        await click('#tabs button[data-tab="' + tab + '"]', 'tab ' + tab);
        if (tab === 'lab') { await labSmoke(page, R, scan); continue; }
        for (const mode of ['guided', 'hint', 'solo']) {
          await click('#view button[data-mode="' + mode + '"]', tab + '/' + mode);
          for (let k = 0; k < PER_MODE; k++) {
            R.problemsSeen++;
            const where = tab + '/' + mode + '#' + k;
            // hints
            if (mode === 'hint') { await click('#problem button[data-act="hint"]'); await click('#problem button[data-act="hint"]', where + ' hints'); }
            // empty check
            await click('#ans button[type="submit"]', where + ' empty check');
            // guided blanks: fill with junk, then check
            if (mode === 'guided') {
              const blanks = await page.$$('#help input.blank');
              for (const b of blanks) { await b.fill('1'); }
              if (blanks.length) await click('#ans button[type="submit"]', where + ' blanks');
            }
            // wrong answers twice, then the worked solution
            for (let miss = 0; miss < 2; miss++) {
              for (const inp of await page.$$('#ans input.pin:not([disabled])')) await inp.fill(miss ? 'abc' : '1');
              const radios = await page.$$('#ans .opt input:not([disabled])'); if (radios.length) { await radios[0].check({ force: true }); }
              await click('#ans button[type="submit"]', where + ' wrong ' + miss);
              if (miss === 0) { for (const inp of await page.$$('#ans input.pin:not([disabled])')) await inp.fill('1'); await click('#ans button[type="submit"]'); }
            }
            const sol = await click('#problem button[data-act="solution"]', where + ' solution');
            if (!sol) {
              const done = await page.$('#problem button[data-act="next"].primary');
              if (!done) R.notes.push('no worked-solution button after two misses at ' + where);
            }
            await click('#problem button[data-act="next"]', where + ' next');
          }
        }
      }
      await ctx.close();
      report.push(R);
      console.log(view.name, pg, 'clicks', R.clicks, 'problems', R.problemsSeen, 'pageErrors', R.pageErrors.length, 'console', R.consoleErrors.length, 'bad', R.bad.length, 'overflow', R.overflow.length, 'notes', R.notes.length);
    }
  }
  await browser.close();
  fs.writeFileSync(__dirname + '/results/smoke.json', JSON.stringify(report, null, 1));
}

async function labSmoke(page, R, scan) {
  const pc = async sel => { const ok = await R.click(sel); if (!ok) R.notes.push('lab: could not click ' + sel); return ok; };
  for (let run = 0; run < Math.max(3, PER_MODE / 2); run++) {
    R.problemsSeen++;
    await scan('lab start');
    // check before the endpoint
    await pc('#ans button[type="submit"]');
    const fbText = await page.$eval('#fb', e => e.innerText);
    if (!/colorless/.test(fbText)) R.notes.push('lab: check before endpoint did not say colorless: ' + fbText.slice(0, 80));
    // add until the endpoint color appears (as a student would: big steps, then drops)
    const status = () => page.$eval('#labstatus', e => e.innerText);
    let guard = 0;
    while (/colorless/.test(await status()) && guard++ < 60) { if (!(await pc('#view button[data-add="100"]'))) break; }
    guard = 0;
    while (/flashes/.test(await status()) && guard++ < 400) { if (!(await pc('#view button[data-add="5"]'))) break; }
    await scan('lab endpoint');
    if (!/faint pink/.test(await status())) R.notes.push('lab: drops did not stop at the faint-pink endpoint: ' + (await status()));
    // two wrong answers, then the worked solution
    for (let miss = 0; miss < 2; miss++) {
      for (const inp of await page.$$('#ans input.pin:not([disabled])')) await inp.fill('1');
      await pc('#ans button[type="submit"]');
    }
    await scan('lab wrong');
    const sol = await page.$('#problem button[data-act="solution"]');
    if (sol) { await sol.click(); R.clicks++; await scan('lab solution'); } else R.notes.push('lab: no worked-solution button after two misses');
    // restart and overshoot
    await pc('#view button[data-act="next"]');
    await pc('#view button[data-act="restart"]');
    for (let i = 0; i < 9; i++) { const b = await page.$('#view button[data-add="500"]:not([disabled])'); if (b) { await b.click(); R.clicks++; } }
    for (const a of ['100', '10', '5']) { const b = await page.$('#view button[data-add="' + a + '"]:not([disabled])'); if (b) { await b.click(); R.clicks++; } }
    await scan('lab overshoot');
    await pc('#view button[data-act="next"]');
  }
}

main().catch(e => { console.error(e); process.exit(1); });

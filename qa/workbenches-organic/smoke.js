// Smoke test for the six audited pages at 1280x900 and 390x844.
// Usage: node smoke.js   (server must be running: python3 -m http.server 8905 from the repo root)
// Writes smoke_results.json next to this script.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8905/';
const PAGES = [
  { path: 'biochemistry/lipid-workbench.html', tabs: '.tab[data-tab]' },
  { path: 'biochemistry/dna-workbench.html', tabs: '.rail button[data-tab]' },
  { path: 'biochemistry/gluconeogenesis-workbench.html', tabs: '.rail button[data-tab]' },
  { path: 'organic-chemistry/chair-lab.html', tabs: null },
  { path: 'organic-chemistry/stereochemistry-lab.html', tabs: null },
  { path: 'organic-chemistry/stereochemistry-practice.html', tabs: null },
];
const VIEWPORTS = [{ width: 1280, height: 900 }, { width: 390, height: 844 }];
const BAD = /\bNaN\b|\bundefined\b|\bInfinity\b|\bnull\b|\[object Object\]/;

async function scan(page, where) {
  return page.evaluate((where) => {
    const BAD = /\bNaN\b|\bundefined\b|\bInfinity\b|\bnull\b|\[object Object\]/;
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const p = n.parentElement; if (!p || p.closest('script,style,noscript,pre')) continue;
      const vis = p.checkVisibility ? p.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
      if (!vis && /Jmol|JSmol/.test(n.textContent)) continue; // JSmol's hidden internal debug log

      const t = n.textContent; if (BAD.test(t)) hits.push({ where, kind: 'text', text: t.trim().slice(0, 160), el: p.tagName + (p.id ? '#' + p.id : '') });
    }
    document.querySelectorAll('svg *').forEach(el => {
      for (const a of el.attributes) if (/NaN|undefined|Infinity/.test(a.value)) { hits.push({ where, kind: 'attr', text: el.tagName + ' ' + a.name + '=' + a.value.slice(0, 80) }); break; }
    });
    document.querySelectorAll('input,output').forEach(el => { const v = el.value ?? el.textContent; if (v && BAD.test(String(v))) hits.push({ where, kind: 'value', text: el.id + '=' + v }); });
    return hits;
  }, where);
}
async function overflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement, W = de.clientWidth;
    const res = { scrollWidth: de.scrollWidth, clientWidth: W, offenders: [] };
    if (de.scrollWidth > W + 1) {
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect(); if (!r.width) return;
        // skip things inside horizontal scrollers
        let p = el.parentElement, inScroller = false;
        while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth - 1 || /(auto|scroll|hidden)/.test(s.overflowX)) { inScroller = true; break; } p = p.parentElement; }
        if (!inScroller && r.right > W + 1) res.offenders.push({ el: el.tagName + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''), right: Math.round(r.right) });
      });
      res.offenders = res.offenders.slice(0, 12);
    }
    return res;
  });
}
async function exercise(page, rootSel, where, log) {
  // click every visible, enabled button in root (one pass, capped), sliders to min/mid/max, toggle checkboxes, all select options
  const out = { clicks: 0, sliders: 0, checks: 0, selects: 0, hits: [] };
  const root = rootSel || 'body';
  const sel = await page.$$(root + ' select');
  for (const s of sel) {
    if (!(await s.isVisible())) continue;
    const vals = await s.evaluate(e => [...e.options].map(o => o.value));
    for (const v of vals) { try { await s.selectOption(v); out.selects++; await page.waitForTimeout(60); out.hits.push(...await scan(page, where + ' select=' + v)); } catch (e) { } }
  }
  const ranges = await page.$$(root + ' input[type=range]');
  for (const r of ranges) {
    if (!(await r.isVisible())) continue;
    const [mn, mx] = await r.evaluate(e => [+e.min, +e.max]);
    for (const v of [mn, (mn + mx) / 2, mx]) {
      await r.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
      out.sliders++; await page.waitForTimeout(30);
      out.hits.push(...await scan(page, where + ' range ' + (await r.evaluate(e => e.id)) + '=' + v));
    }
  }
  const cbs = await page.$$(root + ' input[type=checkbox]');
  for (const c of cbs) { if (!(await c.isVisible())) continue; try { await c.click({ timeout: 1500 }); await page.waitForTimeout(40); await c.click({ timeout: 1500 }); out.checks++; } catch (e) { } }
  for (let i = 0; i < 160; i++) {
    const btns = await page.$$(root + ' button:not([disabled]), ' + root + ' [role=button]');
    if (i >= btns.length) break;
    const b = btns[i];
    try {
      if (!(await b.isVisible())) continue;
      const label = (await b.evaluate(e => (e.textContent || e.getAttribute('aria-label') || ''))).trim().slice(0, 40);
      if (/^Next:|Start a new attempt/.test(label)) continue;
      await b.click({ timeout: 1500 }); out.clicks++;
      await page.waitForTimeout(50);
      const h = await scan(page, where + ' after click "' + label + '"'); if (h.length) out.hits.push(...h);
    } catch (e) { log.push('click fail ' + where + ': ' + e.message.split('\n')[0]); }
  }
  return out;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results = [];
  for (const P of PAGES) for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const R = { page: P.path, viewport: vp.width + 'x' + vp.height, pageErrors: [], consoleErrors: [], failedRequests: [], offsite: [], textHits: [], overflow: [], counts: {}, log: [] };
    page.on('pageerror', e => R.pageErrors.push(String(e.message || e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') R.consoleErrors.push(m.text().slice(0, 300)); });
    page.on('requestfailed', r => R.failedRequests.push(r.url().slice(0, 160) + ' ' + (r.failure() || {}).errorText));
    page.on('response', r => { if (r.status() >= 400) R.failedRequests.push(r.status() + ' ' + r.url().slice(0, 160)); });
    page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:') && !/fonts\.(googleapis|gstatic)\.com/.test(u)) R.offsite.push(u.slice(0, 160)); });
    await page.goto(BASE + P.path, { waitUntil: 'load' });
    await page.waitForTimeout(P.path.includes('stereo') ? 6000 : 1500);
    R.textHits.push(...await scan(page, 'initial'));
    R.overflow.push({ where: 'initial', ...(await overflow(page)) });
    const tabs = P.tabs ? await page.$$eval(P.tabs, els => els.map(e => e.dataset.tab)) : [null];
    for (const t of tabs) {
      let root = 'body';
      if (t) {
        await page.click(`${P.tabs.split('[')[0]}[data-tab="${t}"]`);
        await page.waitForTimeout(400);
        root = P.path.includes('lipid') ? `#p-${t}` : `section[data-station="${t}"]`;
      }
      const ex = await exercise(page, root, t || 'page', R.log);
      R.counts[t || 'page'] = { clicks: ex.clicks, sliders: ex.sliders, checks: ex.checks, selects: ex.selects };
      R.textHits.push(...ex.hits);
      R.overflow.push({ where: t || 'page', ...(await overflow(page)) });
    }
    // dedupe text hits
    const seen = new Set(); R.textHits = R.textHits.filter(h => { const k = h.kind + h.text; if (seen.has(k)) return false; seen.add(k); return true; });
    R.overflow = R.overflow.filter(o => o.scrollWidth > o.clientWidth + 1);
    R.pageErrors = [...new Set(R.pageErrors)]; R.consoleErrors = [...new Set(R.consoleErrors)]; R.failedRequests = [...new Set(R.failedRequests)]; R.offsite = [...new Set(R.offsite)];
    results.push(R);
    console.log(P.path, R.viewport, 'pageErrors', R.pageErrors.length, 'console', R.consoleErrors.length, 'failed', R.failedRequests.length, 'offsite', R.offsite.length, 'textHits', R.textHits.length, 'overflow', R.overflow.length, JSON.stringify(R.counts));
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(__dirname + '/smoke_results.json', JSON.stringify(results, null, 1));
})();

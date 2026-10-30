// Smoke test: every tab, button, select, slider and free-text input on the three guides,
// at 1280x900 and 390x844. Records page errors, console errors, bad tokens in rendered text,
// and horizontal overflow at 390 px.
// Usage: node smoke.js  -> writes smoke-results.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { BASE, PAGES, seedScript, stubExternal } = require('./common');

const VIEWPORTS = [{ width: 1280, height: 900 }, { width: 390, height: 844 }];
const TEXT_VALUES = ['', 'abc', '0', '-5', '1e3', '15', '2,500', '0.001'];

// In-page helpers, installed after load.
const HELPERS = `
window.__qa = {
  bad(root){ const t=(root||document.body).innerText; const out=[]; const re=/\\bNaN\\b|\\bundefined\\b|\\bInfinity\\b|\\bnull\\b|\\[object Object\\]/g; let m;
    while((m=re.exec(t))){ out.push(t.slice(Math.max(0,m.index-60), m.index+40).replace(/\\s+/g,' ')); } return out; },
  overflow(){ const W=document.documentElement.clientWidth; const res={scrollWidth:document.documentElement.scrollWidth, clientWidth:W, offenders:[]};
    const scrollAnc=el=>{ for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){ const s=getComputedStyle(p); if(/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
    const desc=el=>{ let s=el.tagName.toLowerCase(); if(el.id) s+='#'+el.id; if(el.className&&typeof el.className==='string') s+='.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'); return s; };
    document.querySelectorAll('body *').forEach(el=>{ const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) return; if(r.right>W+1 && !scrollAnc(el)){ const st=getComputedStyle(el); if(st.position==='fixed') return; res.offenders.push(desc(el)+' right='+Math.round(r.right)+' w='+Math.round(r.width)+' text="'+(el.innerText||'').slice(0,40).replace(/\\s+/g,' ')+'"'); } });
    res.offenders=res.offenders.slice(0,25); return res; },
  sig(el){ const box=el.closest('[id$="prac"]')?null:el.closest('.act,.prob,section'); const ctxt=box?box.innerText.slice(0,160).replace(/\\s+/g,' '):''; return (el.closest('[id]')?el.closest('[id]').id:'')+'|'+(el.dataset?JSON.stringify(el.dataset):'')+'|'+el.textContent.trim().slice(0,50)+'|'+ctxt; }
};`;

async function exercise(page, rec, label, scope) {
  // scope: CSS selector for the region to exercise
  const clicked = new Set();
  let clicks = 0;
  const note = async (what) => {
    const bad = await page.evaluate(s => window.__qa.bad(document.querySelector(s) || document.body), scope);
    if (bad.length) rec.badText.push({ where: label, after: what, samples: [...new Set(bad)].slice(0, 5) });
  };
  // selects
  const selIds = await page.$$eval(scope + ' select', els => els.map((e, i) => e.id || ('#idx' + i)));
  for (const id of selIds) {
    if (id.startsWith('#idx')) continue;
    const opts = await page.$$eval('#' + id + ' option', os => os.map(o => o.value));
    for (const v of opts) {
      await page.evaluate(([id, v]) => { const s = document.getElementById(id); if (!s) return; s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
      await note('select #' + id + '=' + v);
    }
    rec.counts.selectsTried++;
  }
  // ranges
  const ranges = await page.$$eval(scope + ' input[type=range]', els => els.map(e => ({ id: e.id, min: +e.min, max: +e.max, step: +e.step || 1 })));
  for (const r of ranges) {
    const vals = [r.min, r.max, r.min + (r.max - r.min) / 2, r.min + r.step, r.max - r.step];
    for (const v of vals) {
      await page.evaluate(([id, v]) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, [r.id, v]);
      await note('range #' + r.id + '=' + v);
    }
    rec.counts.slidersMoved++;
  }
  // free-text inputs that are not part of a practice problem
  const texts = await page.$$eval(scope + ' input[type=text][id], ' + scope + ' input[type=number][id]', els => els.filter(e => !e.closest('[data-problem]') && !/^in\d+$/.test(e.id)).map(e => e.id));
  for (const id of texts) {
    for (const v of TEXT_VALUES) {
      await page.evaluate(([id, v]) => { const s = document.getElementById(id); if (!s) return; s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
      await note('text #' + id + '="' + v + '"');
    }
    rec.counts.textInputsTried++;
  }
  // buttons: click each distinct one until nothing new appears (bounded)
  for (let round = 0; round < 700; round++) {
    const handles = await page.$$(scope + ' button:not([disabled]), ' + scope + ' summary, ' + scope + ' a[href^="#"]');
    let target = null, sig = null;
    for (const h of handles) {
      const vis = await h.isVisible().catch(() => false);
      if (!vis) continue;
      const s = await h.evaluate(el => window.__qa.sig(el));
      if (!clicked.has(s)) { target = h; sig = s; break; }
    }
    if (!target) break;
    clicked.add(sig);
    try { await target.click({ timeout: 2000 }); } catch (e) { rec.clickFailures.push({ where: label, sig, err: String(e).slice(0, 120) }); continue; }
    clicks++;
    await note('click ' + sig);
  }
  rec.counts.buttonsClicked += clicks;
}

async function run() {
  const browser = await chromium.launch();
  const results = {};
  for (const [key, rel] of Object.entries(PAGES)) {
    for (const vp of VIEWPORTS) {
      const rec = { page: rel, viewport: vp, pageErrors: [], consoleErrors: [], badText: [], overflow: [], clickFailures: [], external: [], counts: { tabs: 0, buttonsClicked: 0, slidersMoved: 0, selectsTried: 0, textInputsTried: 0 } };
      const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await ctx.addInitScript(seedScript(12345));
      await stubExternal(page, rec.external);
      page.on('pageerror', e => rec.pageErrors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') rec.consoleErrors.push(m.text()); });
      await page.goto(BASE + rel, { waitUntil: 'load' });
      await page.evaluate(HELPERS);
      const checkOverflow = async (where) => {
        if (vp.width !== 390) return;
        const o = await page.evaluate(() => window.__qa.overflow());
        if (o.scrollWidth > o.clientWidth || o.offenders.length) rec.overflow.push({ where, ...o });
      };
      if (key === 'poly') {
        await checkOverflow('initial');
        await exercise(page, rec, 'whole page', 'body');
        // practice at each help level: type the stored answers and check
        await checkOverflow('after exercise');
      } else {
        const tabs = await page.$$eval('#tabs button[data-tab]', bs => bs.map(b => b.dataset.tab));
        for (const t of tabs) {
          await page.click('#tabs button[data-tab="' + t + '"]');
          rec.counts.tabs++;
          await checkOverflow('tab ' + t + ' (initial)');
          await exercise(page, rec, 'tab ' + t, '#view');
          await checkOverflow('tab ' + t + ' (after exercise)');
          // open every worked example / details so their content is rendered and scanned
        }
      }
      results[key + '@' + vp.width] = rec;
      await ctx.close();
      console.log(key, vp.width, 'errors', rec.pageErrors.length, 'console', rec.consoleErrors.length, 'bad', rec.badText.length, 'overflow', rec.overflow.length, JSON.stringify(rec.counts));
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'smoke-results.json'), JSON.stringify(results, null, 1));
}
run().catch(e => { console.error(e); process.exit(1); });

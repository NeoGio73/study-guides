// Smoke test: every tab, every reachable control, two viewports.
// Records page errors, console errors, bad tokens in rendered text/markup, and horizontal overflow.
// Usage: node smoke.js [carbs|lipids]   (default both). Writes smoke-results.json.
'use strict';
const fs = require('fs');
const path = require('path');
const { openGuide, chromium } = require('./harness');

const BAD_TEXT = /\bNaN\b|\bundefined\b|\bInfinity\b|\bnull\b|\[object Object\]/;
const BAD_ATTR = /="[^"]*(NaN|undefined|Infinity)[^"]*"/;

async function scan(page, where){
  return await page.evaluate(({where, badText, badAttr}) => {
    const out = [];
    const view = document.querySelector('#view');
    const txt = view.innerText;
    const re = new RegExp(badText, 'g'); let m;
    while((m = re.exec(txt))){ out.push({where, kind: 'text', ctx: txt.slice(Math.max(0, m.index - 60), m.index + 40).replace(/\s+/g, ' ')}); if(out.length > 20) break; }
    // SVG text content and attributes
    const html = view.innerHTML;
    const re2 = new RegExp(badAttr, 'g');
    while((m = re2.exec(html))){ out.push({where, kind: 'attr', ctx: html.slice(Math.max(0, m.index - 80), m.index + 60)}); if(out.length > 40) break; }
    return out;
  }, {where, badText: BAD_TEXT.source, badAttr: BAD_ATTR.source});
}

async function overflow(page, where){
  return await page.evaluate(where => {
    const vw = document.documentElement.clientWidth;
    const res = {where, pageScrollWidth: document.documentElement.scrollWidth, clientWidth: vw, offenders: []};
    if(document.documentElement.scrollWidth > vw + 1){
      // find elements sticking out that are not inside a horizontally scrolling container
      const all = document.querySelectorAll('#view *, #tabs, header *');
      for(const el of all){
        const r = el.getBoundingClientRect();
        if(r.right > vw + 1 && r.width > 0){
          let p = el.parentElement, inScroll = false;
          while(p && p !== document.body){ const cs = getComputedStyle(p); if((cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') && p.clientWidth < p.scrollWidth + 1){ inScroll = true; break; } p = p.parentElement; }
          if(!inScroll){ res.offenders.push({tag: el.tagName, cls: el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className, id: el.id, right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 60)}); if(res.offenders.length > 12) break; }
        }
      }
    }
    return res;
  }, where);
}

// click every reachable control in the current tab, re-querying after every click
async function exerciseTab(page, tab){
  return await page.evaluate(async (tab) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const view = document.querySelector('#view');
    const SEL = 'button:not([data-go]):not([disabled]), [role="button"], .hit, .famb, summary, label.opt input';
    let clicks = 0, i = 0;
    const seen = new Set();
    const key = el => el.tagName + '|' + (el.id || '') + '|' + (el.dataset ? JSON.stringify(el.dataset) : '') + '|' + (el.textContent || '').trim().slice(0, 40) + '|' + (el.getAttribute('data-i') || '');
    const errs = [];
    while(clicks < 1500){
      const list = Array.from(view.querySelectorAll(SEL)).filter(el => !el.closest('[data-quiz]') || el.matches('button'));
      if(i >= list.length) break;
      const el = list[i++];
      const k = key(el);
      if(seen.has(k) && !el.closest('[data-quiz]')) continue;
      seen.add(k);
      try{ el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1})); }catch(e){ errs.push(String(e)); }
      clicks++;
      if(clicks % 25 === 0) await sleep(5);
    }
    // sliders: min, max, middle
    const ranges = Array.from(view.querySelectorAll('input[type=range]'));
    for(const r of ranges){
      if(r.disabled) continue;
      const min = +r.min, max = +r.max, step = +(r.step || 1);
      const vals = [min, max, Math.round((min + max) / 2 / step) * step];
      for(let v = min; v <= max; v += step * Math.max(1, Math.round((max - min) / step / 12))) vals.push(v);
      for(const v of vals){ r.value = v; r.dispatchEvent(new Event('input', {bubbles: true})); clicks++; }
    }
    // selects: every option
    for(const s of Array.from(view.querySelectorAll('select'))){
      for(let k = 0; k < s.options.length; k++){ s.selectedIndex = k; s.dispatchEvent(new Event('change', {bubbles: true})); clicks++; }
    }
    await sleep(80);
    return {tab, clicks, errs};
  }, tab);
}

// random monkey clicking: explores combinations of builder states; checks bad tokens as it goes
async function monkeyTab(page, tab, n, seed){
  return await page.evaluate(async ({tab, n, seed, badText, badAttr}) => {
    let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const view = document.querySelector('#view');
    const SEL = 'button:not([data-go]):not([disabled]), [role="button"], .hit, .famb, label.opt input:not([disabled]), select, input[type=range]:not([disabled])';
    const bad = []; let clicks = 0;
    const reT = new RegExp(badText), reA = new RegExp(badAttr);
    for(let k = 0; k < n; k++){
      const list = Array.from(view.querySelectorAll(SEL));
      if(!list.length) break;
      const el = list[Math.floor(rnd() * list.length)];
      try{
        if(el.tagName === 'SELECT'){ el.selectedIndex = Math.floor(rnd() * el.options.length); el.dispatchEvent(new Event('change', {bubbles: true})); }
        else if(el.type === 'range'){ const min = +el.min, max = +el.max, st = +(el.step || 1); el.value = min + Math.round(rnd() * (max - min) / st) * st; el.dispatchEvent(new Event('input', {bubbles: true})); }
        else el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}));
      }catch(e){ bad.push({where: tab + ':monkey', kind: 'exception', ctx: String(e)}); }
      clicks++;
      if(k % 20 === 19){
        await sleep(2);
        const t = view.innerText, m = reT.exec(t); if(m) bad.push({where: tab + ':monkey#' + k, kind: 'text', ctx: t.slice(Math.max(0, m.index - 60), m.index + 40)});
        const h = view.innerHTML, m2 = reA.exec(h); if(m2) bad.push({where: tab + ':monkey#' + k, kind: 'attr', ctx: h.slice(Math.max(0, m2.index - 80), m2.index + 60)});
        if(bad.length > 10) break;
      }
    }
    return {tab, clicks, bad};
  }, {tab, n, seed, badText: BAD_TEXT.source, badAttr: BAD_ATTR.source});
}

async function run(kind, viewport, browser){
  const g = await openGuide(kind, {viewport, browser, reducedMotion: process.env.RM ? 'reduce' : 'no-preference'});
  const { page, errors } = g;
  const tabs = await page.$$eval('#tabs button[data-tab]', bs => bs.map(b => b.dataset.tab));
  const result = {kind, viewport, tabs, perTab: [], bad: [], overflow: [], errors: null};
  for(const t of tabs){
    await page.evaluate(t => { document.querySelector('#tabs button[data-tab="' + t + '"]').click(); }, t);
    await page.waitForTimeout(150);
    result.overflow.push(await overflow(page, t + ':initial'));
    result.bad.push(...await scan(page, t + ':initial'));
    const ex = await exerciseTab(page, t);
    await page.waitForTimeout(1300);   // let animations and timers (TLC, mutarotation) finish
    result.bad.push(...await scan(page, t + ':after-clicks'));
    result.overflow.push(await overflow(page, t + ':after-clicks'));
    result.perTab.push(ex);
    for(let round = 0; round < (process.env.RM ? 1 : 3); round++){
      const mk = await monkeyTab(page, t, 400, 1234 + round * 77 + t.length);
      ex.clicks += mk.clicks; result.bad.push(...mk.bad);
      await page.waitForTimeout(400);
    }
    result.bad.push(...await scan(page, t + ':after-monkey'));
    result.overflow.push(await overflow(page, t + ':after-monkey'));
  }
  // hash navigation
  for(const t of tabs.slice(0, 3)){ await page.goto(page.url().split('#')[0] + '#' + t); await page.waitForTimeout(100); }
  result.errors = errors.slice();
  result.overflow = result.overflow.filter(o => o.pageScrollWidth > o.clientWidth + 1);
  await g.context.close();
  return result;
}

(async () => {
  const kinds = process.argv[2] ? [process.argv[2]] : ['carbs', 'lipids'];
  const browser = await chromium.launch();
  const all = [];
  for(const k of kinds){
    for(const vp of [{width: 1280, height: 900}, {width: 390, height: 844}]){
      const r = await run(k, vp, browser);
      all.push(r);
      console.log(k, vp.width, 'tabs', r.tabs.length, 'clicks', r.perTab.reduce((a, b) => a + b.clicks, 0), 'errors', r.errors.length, 'bad', r.bad.length, 'overflow', r.overflow.length);
      r.errors.slice(0, 10).forEach(e => console.log('  ERR', e.type, e.text.slice(0, 200)));
      r.bad.slice(0, 10).forEach(b => console.log('  BAD', b.where, b.kind, b.ctx.slice(0, 160)));
      r.overflow.slice(0, 10).forEach(o => console.log('  OVF', o.where, o.pageScrollWidth, JSON.stringify(o.offenders.slice(0, 3))));
    }
  }
  await browser.close();
  const out = path.join(__dirname, 'smoke-results' + (process.env.RM ? '-reduced-motion' : '') + (process.argv[2] ? '-' + process.argv[2] : '') + '.json');
  fs.writeFileSync(out, JSON.stringify(all, null, 1));
  console.log('wrote', out);
})();

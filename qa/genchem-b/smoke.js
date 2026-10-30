// Smoke test: every tab, every button, every slider, every select, odd values in explorer text fields,
// at 1280x900 and 390x844. Records page errors, console errors, bad rendered text and horizontal overflow.
'use strict';
const L = require('./lib');

const BAD_ATTR = /="[^"]*\b(NaN|undefined|Infinity)\b[^"]*"/;

async function scan(page, where, issues, seen){
  const r = await page.evaluate(() => {
    const v = document.querySelector('#view'), nav = document.querySelector('#tabs');
    const txt = (nav ? nav.textContent : '') + '\n' + (v ? v.textContent : '');
    const html = v ? v.innerHTML : '';
    const iw = window.innerWidth, sw = document.scrollingElement.scrollWidth;
    const off = [];
    if(sw > iw + 1){
      // elements sticking out past the viewport that are not inside a sideways-scrolling box
      document.querySelectorAll('body *').forEach(el => {
        const b = el.getBoundingClientRect(); if(b.right <= iw + 1 || b.width === 0) return;
        let p = el.parentElement, clipped = false;
        while(p && p !== document.body){ const ox = getComputedStyle(p).overflowX; if(ox === 'auto' || ox === 'scroll' || ox === 'hidden'){ clipped = true; break; } p = p.parentElement; }
        if(!clipped) off.push((el.tagName + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '')) + ' right=' + Math.round(b.right));
      });
    }
    return {txt, html, iw, sw, off: off.slice(0, 8)};
  });
  const m = r.txt.match(/.{0,60}(\bNaN(?![₀-₉0-9A-Za-z])|\bundefined\b|\bInfinity\b|\bnull\b|\[object Object\]).{0,60}/);
  if(m) add(issues, seen, {where, kind: 'bad-text', sample: m[0].replace(/\s+/g, ' ')});
  const a = r.html.match(BAD_ATTR);
  if(a) add(issues, seen, {where, kind: 'bad-attr', sample: r.html.substr(Math.max(0, a.index - 80), 200)});
  if(r.sw > r.iw + 1) add(issues, seen, {where, kind: 'h-overflow', sample: 'scrollWidth ' + r.sw + ' > ' + r.iw + ': ' + r.off.join(', ')});
}
function add(issues, seen, it){ const k = it.where.split(' :: ')[0] + '|' + it.kind + '|' + it.sample.slice(0, 120); if(seen.has(k)) return; seen.add(k); issues.push(it); }

async function exerciseTab(page, label, issues, seen, counts, isCalor){
  await scan(page, label + ' :: open', issues, seen);
  // open every <details>
  await page.evaluate(() => document.querySelectorAll('#view details').forEach(d => { d.open = true; d.dispatchEvent(new Event('toggle')); }));
  await scan(page, label + ' :: details', issues, seen);
  // sliders: min, max, middle, a quarter of the way
  const sliders = await page.evaluate(() => Array.from(document.querySelectorAll('#view input[type=range]')).map(s => ({id: s.id, min: +s.min, max: +s.max, step: +s.step || 1})));
  for(const s of sliders){
    for(const f of [0, 1, 0.5, 0.25, 0.8]){
      const v = s.min + Math.round((s.max - s.min) * f / s.step) * s.step;
      await page.evaluate(([id, v]) => { const el = document.getElementById(id); if(!el) return; el.value = String(v); el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }, [s.id, +v.toFixed(6)]);
      counts.sliderMoves++;
      await scan(page, label + ' :: slider ' + s.id + '=' + (+v.toFixed(6)), issues, seen);
    }
  }
  // selects: every option
  const sels = await page.evaluate(() => Array.from(document.querySelectorAll('#view select')).map(s => ({id: s.id, opts: Array.from(s.options).map(o => o.value)})));
  for(const s of sels) for(const o of s.opts){
    await page.evaluate(([id, o]) => { const el = document.getElementById(id); el.value = o; el.dispatchEvent(new Event('change', {bubbles: true})); el.dispatchEvent(new Event('input', {bubbles: true})); }, [s.id, o]);
    counts.selects++;
    await scan(page, label + ' :: select ' + s.id + '=' + o, issues, seen);
  }
  // explorer text fields (not practice answer boxes): odd values, then restore
  const fields = await page.evaluate(() => Array.from(document.querySelectorAll('#view input.num[id]')).map(i => ({id: i.id, v: i.value})));
  for(const f of fields){
    for(const v of ['', '0', '-5', 'abc', '1e30', '0.0001', '-273', '1,250', f.v]){
      await page.evaluate(([id, v]) => { const el = document.getElementById(id); if(!el || el.disabled) return; el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); }, [f.id, v]);
      counts.fieldEntries++;
      await scan(page, label + ' :: field ' + f.id + '="' + v + '"', issues, seen);
    }
  }
  // every button, re-queried after each click because pages re-render
  const clicked = new Set();
  for(let round = 0; round < 3; round++){
    const n = await page.evaluate(() => document.querySelectorAll('#view button').length);
    for(let i = 0; i < n && clicked.size < 400; i++){
      const info = await page.evaluate(i => {
        const b = document.querySelectorAll('#view button')[i]; if(!b) return null;
        const key = (b.dataset ? JSON.stringify(Object.assign({}, b.dataset)) : '') + '|' + b.textContent.trim().slice(0, 40);
        if(b.disabled || b.hasAttribute('data-go') || b.offsetParent === null) return {skip: true, key};
        return {skip: false, key};
      }, i);
      if(!info || info.skip) continue;
      if(clicked.has(info.key) && !/Next|New|Check|Skip|scoop|hint|Hint|setup|Show/.test(info.key)) continue;
      clicked.add(info.key + (clicked.has(info.key) ? '#' + i + round : ''));
      await page.evaluate(i => { const b = document.querySelectorAll('#view button')[i]; if(b) b.click(); }, i);
      counts.clicks++;
      if(isCalor) await page.waitForTimeout(20);
      await scan(page, label + ' :: click ' + info.key, issues, seen);
    }
  }
  // practice boxes: empty, junk, a number, then check
  const pins = await page.evaluate(() => Array.from(document.querySelectorAll('#view .pin, #view input.blank')).filter(i => !i.disabled).length);
  for(const v of ['abc', '12', '-0', '1e400', '3.01 x 10^23']){
    await page.evaluate(v => { document.querySelectorAll('#view .pin, #view input.blank').forEach(i => { if(!i.disabled) i.value = v; });
      const f = document.querySelector('#view form'); if(f) f.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true})); }, v);
    counts.submits++;
    await scan(page, label + ' :: submit "' + v + '" in ' + pins + ' boxes', issues, seen);
  }
}

async function runPage(browser, url, name, vp, isCalor){
  const issues = [], seen = new Set(), counts = {tabs: 0, clicks: 0, sliderMoves: 0, selects: 0, fieldEntries: 0, submits: 0};
  const {ctx, page, errors} = await L.openPage(browser, url, {viewport: vp, seed: 12345});
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('#tabs button[data-tab]')).map(b => b.dataset.tab));
  for(const t of tabs){
    await page.evaluate(t => document.querySelector('#tabs button[data-tab="' + t + '"]').click(), t);
    await page.waitForTimeout(80);
    counts.tabs++;
    await exerciseTab(page, name + ' ' + vp.width + ' ' + t, issues, seen, counts, isCalor);
  }
  // the lab needs time to pass: walk one experiment of each kind through the procedure
  if(isCalor){
    for(const exp of ['metal', 'neut', 'salt']){
      await page.evaluate(() => document.querySelector('#tabs button[data-tab="lab"]').click());
      await page.evaluate(exp => { const b = document.querySelector('#view button[data-exp="' + exp + '"]'); if(b) b.click(); }, exp);
      for(let k = 0; k < 40; k++){
        const did = await page.evaluate(() => { const b = document.querySelector('#stepbtns button:not([disabled])'); if(!b) return null; const t = b.textContent; b.click(); return t; });
        if(did && /Heat/.test(did)) await page.waitForTimeout(2500);
        if(did && /Start/.test(did)) await page.waitForTimeout(3300);
        if(did && /(Transfer|Pour|Add the solid)/.test(did)) await page.waitForTimeout(6000);
        if(did && /Record/.test(did)) break;
        if(!did) await page.waitForTimeout(300);
        counts.clicks++;
      }
      await scan(page, name + ' ' + vp.width + ' lab-run-' + exp, issues, seen);
      await page.evaluate(() => { document.querySelectorAll('#labparts .pin').forEach(i => { i.value = '1'; }); const f = document.querySelector('#ans'); if(f) f.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true})); });
      await scan(page, name + ' ' + vp.width + ' lab-run-' + exp + ' submit', issues, seen);
    }
  }
  await ctx.close();
  return {name, viewport: vp.width + 'x' + vp.height, counts, errors, issues};
}

(async () => {
  const browser = await L.launch();
  const out = [];
  for(const vp of [{width: 1280, height: 900}, {width: 390, height: 844}]){
    out.push(await runPage(browser, L.GASES, 'gases', vp, false));
    out.push(await runPage(browser, L.CALOR, 'calorimetry', vp, true));
  }
  await browser.close();
  L.writeJSON('smoke-results.json', out);
  for(const r of out){
    console.log('\n== ' + r.name + ' ' + r.viewport + ' ' + JSON.stringify(r.counts));
    console.log('errors:', r.errors.length); r.errors.slice(0, 10).forEach(e => console.log('  ', e.type, e.text.slice(0, 300)));
    console.log('issues:', r.issues.length); r.issues.slice(0, 40).forEach(i => console.log('  ', i.kind, '|', i.where, '|', i.sample.slice(0, 260)));
  }
})();

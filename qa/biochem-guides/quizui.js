// Drives every practice block through the real page UI: answers each drawn question with its own key
// (the displayed answer for numeric items), checks that the page marks it correct, also checks that a
// wrong answer is not accepted and that "Show answer" text is clean. Usage: node quizui.js [questionsPerSection]
'use strict';
const fs = require('fs');
const path = require('path');
const { openGuide, chromium } = require('./harness');

async function driveSection(page, id, M){
  return await page.evaluate(async ({id, M}) => {
    const T = window.__T, sleep = ms => new Promise(r => setTimeout(r, ms));
    const box = () => document.querySelector('[data-quiz="' + id + '"] .problem');
    const res = {id, asked: 0, ok: 0, failures: [], wrongAccepted: [], showAnswerBad: [], kinds: {}};
    const strip = s => String(s).replace(/<[^>]+>/g, '');
    for(let n = 0; n < M; n++){
      const S = T.quiz[id], Q = S.Q;
      res.kinds[Q.k] = (res.kinds[Q.k] || 0) + 1;
      const b = box();
      // a deliberately wrong attempt first (every other question), which must not be accepted
      const tryWrong = n % 2 === 1;
      if(tryWrong){
        if(Q.k === 'num'){
          const inp = b.querySelector('.pin'); inp.value = String(Q.a * 1.37 + 3.1); b.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
          if(S.done) res.wrongAccepted.push({q: strip(Q.q).slice(0, 120), typed: inp.value});
        } else if(Q.k === 'mc'){
          const wi = Q.opts.findIndex(o => o !== Q.c);
          const inp = b.querySelector('input[value="' + wi + '"]'); if(inp){ inp.checked = true; b.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})); }
          if(S.done && S.solved && S.streak) {} // finishing after 2 misses is allowed only on 2-option items
          if(S.done && Q.opts.length > 2) res.wrongAccepted.push({q: strip(Q.q).slice(0, 120), typed: strip(Q.opts[wi])});
        }
      }
      if(!S.done){
        const bb = box();
        if(Q.k === 'mc'){
          const ci = Q.opts.indexOf(Q.c);
          const inp = bb.querySelector('input[value="' + ci + '"]');
          if(!inp || inp.disabled){ res.failures.push({q: strip(Q.q).slice(0, 140), why: 'correct option missing or disabled'}); }
          else { inp.checked = true; bb.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})); }
        } else if(Q.k === 'num'){
          const shown = Q.show != null ? Q.show : T.fmt(Q.a, Q.dp);
          const inp = bb.querySelector('.pin'); inp.value = strip(shown); bb.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
        } else if(Q.k === 'fa'){
          const inp = bb.querySelector('.pin'); inp.value = T.faShort(Q.c, Q.d, false); bb.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
        } else if(Q.k === 'order'){
          // bubble sort through the move-down buttons
          let guard = 0, swapped = true;
          while(swapped && guard < 200){ swapped = false;
            for(let j = 0; j < Q.cur.length - 1; j++){
              if(Q.cur[j].r > Q.cur[j + 1].r){ const btn = box().querySelector('button[data-mv="1"][data-i="' + j + '"]'); btn.dispatchEvent(new MouseEvent('click', {bubbles: true})); swapped = true; guard++; }
            }
          }
          box().querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
        }
      }
      await sleep(0);
      const fb = box().querySelector('.fb');
      res.asked++;
      const good = fb && fb.classList.contains('ok');
      if(good) res.ok++;
      else if(!(tryWrong && S.done)) res.failures.push({k: Q.k, q: strip(Q.q).slice(0, 160), key: Q.k === 'num' ? (Q.show || Q.a) : strip(Q.c || ''), fb: fb ? strip(fb.innerHTML).slice(0, 200) : 'no feedback'});
      if(/undefined|NaN|\[object/.test(fb ? fb.innerText : '')) res.showAnswerBad.push({q: strip(Q.q).slice(0, 100), fb: fb.innerText.slice(0, 160)});
      // next question
      const next = box().querySelector('[data-act="next"]');
      if(!next){ res.failures.push({q: strip(Q.q).slice(0, 100), why: 'no Next button after answering'}); break; }
      next.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      // every 7th question: use "Show answer" after a miss on a numeric item, and check the text
      const S2 = T.quiz[id], Q2 = S2.Q;
      if(n % 7 === 3 && Q2.k === 'num'){
        const b2 = box(); b2.querySelector('.pin').value = '-99999'; b2.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
        const sh = box().querySelector('[data-act="show"]');
        if(sh){ sh.dispatchEvent(new MouseEvent('click', {bubbles: true})); const t = box().querySelector('.fb').innerText; if(/undefined|NaN|\[object/.test(t)) res.showAnswerBad.push({q: strip(Q2.q).slice(0, 100), fb: t.slice(0, 160)}); box().querySelector('[data-act="next"]').dispatchEvent(new MouseEvent('click', {bubbles: true})); }
      }
    }
    return res;
  }, {id, M});
}

(async () => {
  const M = +(process.argv[2] || 400);
  const browser = await chromium.launch();
  const all = {};
  for(const kind of ['carbs', 'lipids']){
    const g = await openGuide(kind, {browser});
    const tabs = await g.page.$$eval('#tabs button[data-tab]', bs => bs.map(b => b.dataset.tab));
    all[kind] = [];
    for(const t of tabs){
      if(t === 'map') continue;
      await g.page.evaluate(t => document.querySelector('#tabs button[data-tab="' + t + '"]').click(), t);
      await g.page.waitForTimeout(120);
      const has = await g.page.$('[data-quiz="' + t + '"]');
      if(!has){ all[kind].push({id: t, note: 'no practice block'}); continue; }
      const r = await driveSection(g.page, t, M);
      all[kind].push(r);
      console.log(kind, t, 'asked', r.asked, 'ok', r.ok, 'fail', r.failures.length, 'wrongAccepted', r.wrongAccepted.length, 'showBad', r.showAnswerBad.length, JSON.stringify(r.kinds));
      r.failures.slice(0, 5).forEach(f => console.log('   FAIL', JSON.stringify(f).slice(0, 300)));
      r.wrongAccepted.slice(0, 3).forEach(f => console.log('   WRONG-ACCEPTED', JSON.stringify(f).slice(0, 300)));
    }
    console.log(kind, 'page errors:', g.errors.length, g.errors.slice(0, 3));
    all[kind + '_errors'] = g.errors;
    await g.context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'quizui-results.json'), JSON.stringify(all, null, 1));
})();

// Heat-of-solution lab: keep pressing "Add a scoop" until the button goes away, 300 times; report the largest mass reached.
'use strict';
const L = require('./lib');
(async () => {
  const browser = await L.launch(); const {ctx, page, errors} = await L.openPage(browser, L.CALOR, {seed: 8080});
  await page.evaluate(() => document.querySelector('#tabs button[data-tab="lab"]').click());
  await page.evaluate(() => document.querySelector('#view button[data-exp="salt"]').click());
  const r = await page.evaluate(() => { const masses = [];
    for(let k = 0; k < 300; k++){
      document.querySelector('#actions [data-act="new"]').click();
      const w = Array.from(document.querySelectorAll('#stepbtns button')).find(b => /Add 50\.0 mL/.test(b.textContent)); w.click();
      let b; while((b = Array.from(document.querySelectorAll('#stepbtns button')).find(x => /Add a scoop/.test(x.textContent)))) b.click();
      const use = Array.from(document.querySelectorAll('#stepbtns button')).find(x => /^Use /.test(x.textContent)); masses.push(Number(use.textContent.match(/[\d.]+/)[0]));
    }
    return {runs: masses.length, max: Math.max(...masses), min: Math.min(...masses), over10: masses.filter(m => m > 10).length}; });
  console.log('scoop check', JSON.stringify(r), 'page errors', errors.length);
  L.writeJSON('calor-scoop.json', Object.assign(r, {pageErrors: errors}));
  await ctx.close(); await browser.close();
})();

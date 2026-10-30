// Reproduces horizontal page overflow at 390 px in the fatty acid builder.
'use strict';
const { openGuide, chromium } = require('./harness');
(async () => {
  const browser = await chromium.launch();
  const g = await openGuide('lipids', {browser, viewport: {width: 390, height: 844}, hash: '#fa'});
  const res = await g.page.evaluate(async () => {
    const out = [];
    const sw = () => document.documentElement.scrollWidth;
    const chips = Array.from(document.querySelectorAll('#fa-presets .chip'));
    for(const c of chips){ c.click(); await new Promise(r => setTimeout(r, 20)); out.push([c.textContent.trim(), 'cis', sw(), document.querySelector('#fa-kv dd:nth-of-type(3)').textContent]);
      document.querySelector('[data-seg="geo"] button[data-v="trans"]').click(); await new Promise(r => setTimeout(r, 20)); out.push([c.textContent.trim(), 'trans', sw(), document.querySelector('#fa-kv dd:nth-of-type(3)').textContent]);
      document.querySelector('[data-seg="geo"] button[data-v="cis"]').click(); }
    return out.filter(r => r[2] > 391);
  });
  console.log(JSON.stringify(res, null, 1));
  await g.page.evaluate(() => { Array.from(document.querySelectorAll('#fa-presets .chip')).find(c => /DHA/.test(c.textContent)).click(); document.querySelector('[data-seg="geo"] button[data-v="trans"]').click(); document.querySelector('#fa-kv').scrollIntoView(); });
  await g.page.screenshot({path: __dirname + '/overflow390-fa.png'});
  await browser.close();
})();

// Sanity check for the overflow detector, plus phone screenshots of the widest setups.
'use strict';
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:8901/general-chemistry/stoichiometry-study-guide.html');
  const sw = () => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  console.log('before', await sw());
  await page.evaluate(() => { const d = document.createElement('div'); d.style.width = '600px'; d.textContent = 'x'; d.id = 'probe'; document.querySelector('#view').appendChild(d); });
  console.log('with 600px probe', await sw());
  await page.evaluate(() => document.getElementById('probe').remove());
  // widest setups: density mL->mL (stoich), gas stoichiometry (solutions and gases)
  await page.click('#tabs button[data-tab="density"]');
  for (let i = 0; i < 40; i++) { const t = await page.$eval('#problem .q', e => e.innerText); if (/milliliters of liquid .* from .* mL of liquid|milliliters of liquid .* produce .* mL of liquid/.test(t)) break; await page.click('#problem button[data-act="next"]'); }
  console.log('density', await sw());
  await page.screenshot({ path: __dirname + '/results/phone-density.png', fullPage: true });
  await page.goto('http://localhost:8901/general-chemistry/solutions-and-gases-study-guide.html');
  await page.click('#tabs button[data-tab="gasstoich"]');
  console.log('gasstoich', await sw());
  await page.screenshot({ path: __dirname + '/results/phone-gasstoich.png', fullPage: true });
  await page.goto('http://localhost:8901/general-chemistry/solution-stoichiometry-study-guide.html');
  await page.click('#tabs button[data-tab="lab"]');
  console.log('lab', await sw());
  await page.screenshot({ path: __dirname + '/results/phone-lab.png', fullPage: true });
  await b.close();
})();

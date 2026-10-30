// Shared helpers for the QA scripts in this folder.
// Nothing here edits a guide file: instrumentation is injected only into the HTTP response.
const BASE = 'http://localhost:8903/';
const PAGES = {
  ph: 'chemistry-for-nonmajors/polarity-to-ph-study-guide.html',
  nuc: 'chemistry-for-nonmajors/nuclear-chemistry-and-energy-study-guide.html',
  poly: 'organic-chemistry/polymers-surf-zone.html',
};

// Seeded Math.random (mulberry32) so every run is reproducible.
function seedScript(seed) {
  return `(() => { let a = ${seed >>> 0};
    Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    window.__reseed = s => { a = s >>> 0; }; })();`;
}

// Google Fonts are external; answer them with empty CSS so they do not add network noise.
async function stubExternal(page, log) {
  await page.route(/^https?:\/\/(?!localhost)/, route => {
    if (log) log.push(route.request().url());
    const u = route.request().url();
    if (/fonts\.googleapis/.test(u)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.fulfill({ status: 204, body: '' });
  });
}

const BAD_RE = /\bNaN\b|\bundefined\b|\bInfinity\b|\bnull\b|\[object Object\]/g;

module.exports = { BASE, PAGES, seedScript, stubExternal, BAD_RE };

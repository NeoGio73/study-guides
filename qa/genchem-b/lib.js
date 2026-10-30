// Shared helpers for the genchem-b QA scripts (gases + calorimetry guides).
// The guide files are never modified: instrumentation is injected into the HTML
// response in flight with page.route, so only the test browser sees it.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8902/general-chemistry/';
const GASES = BASE + 'gases-study-guide.html';
const CALOR = BASE + 'calorimetry-and-hess-law-study-guide.html';
const OUT = __dirname;

// Seeded Math.random (mulberry32), installed before any page script runs.
const seedScript = seed => `(() => { let a = ${seed >>> 0};
  Math.random = function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

// Expose the gases guide's closure-scoped internals on window.__G.
function patchGases(body){
  const expose = 'window.__G = {BANK, quiz, SECTIONS, parseNum, numH, sig, sciH, isSci, VP_WATER, VDW, vdwP, vdwVm, zCurve, molarMass, ' +
    'R, R_J, R_TORR, T0, VM_STP, PUNITS, PUH, urms, maxwell, grahamRatio, GASRX, RXNS, gasStoich, newGasSort, SORT_SRC, EQ_NAME, ' +
    'BOYLE_K, CH_K, GL_K, DAL_K, MV_COND, R_CHOICE, AIR_AT, AIR, M_AIR, DENS_GASES, UNKNOWNS, EL, KMT_LAWS, state, go, render};\n';
  const marker = '/* ---------- start ---------- */';
  if(body.indexOf(marker) < 0) throw new Error('gases start marker not found');
  body = body.replace(marker, expose + marker);
  const nq = 'function numQ(o){';
  if(body.indexOf(nq) < 0) throw new Error('numQ not found');
  // keep the unfiltered slip list so we can see slips that numQ dropped because they fall inside the tolerance
  body = body.replace(nq, nq + ' window.__lastRaw = (o.traps || []).map(t => [t[0], t[1]]);');
  return body;
}
// Keep the calorimetry guide's unfiltered error lists (clean() drops ones inside 2 %).
function patchCalor(body){
  const c = 'const clean = (errors, ans, minAbs) => errors.filter(';
  if(body.indexOf(c) < 0) throw new Error('clean() not found');
  body = body.replace(c, 'const clean = (errors, ans, minAbs) => { (window.__raw = window.__raw || []).push({errors: errors.map(e => ({value: e.value, msg: e.msg})), ans}); return __clean0(errors, ans, minAbs); };\nconst __clean0 = (errors, ans, minAbs) => errors.filter(');
  return body;
}

async function launch(){ return chromium.launch(); }

// Opens a page with optional patching, seeding and console/page-error capture.
async function openPage(browser, url, opt){
  opt = opt || {};
  const ctx = await browser.newContext({viewport: opt.viewport || {width: 1280, height: 900}, reducedMotion: opt.reducedMotion || 'no-preference'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push({type: 'pageerror', text: String(e && e.stack || e)}));
  page.on('console', m => { if(m.type() === 'error') errors.push({type: 'console.error', text: m.text()}); });
  if(opt.seed != null) await page.addInitScript(seedScript(opt.seed));
  if(opt.patch){
    await page.route('**/*.html', async route => {
      const resp = await route.fetch();
      let body = await resp.text();
      body = opt.patch(body);
      await route.fulfill({response: resp, body, headers: Object.assign({}, resp.headers(), {'content-type': 'text/html; charset=utf-8'})});
    });
  }
  await page.goto(url + (opt.hash ? '#' + opt.hash : ''), {waitUntil: 'load'});
  await page.waitForTimeout(150);
  return {ctx, page, errors};
}

const BAD_TEXT = /NaN|undefined|Infinity|\bnull\b|\[object Object\]/;
function writeJSON(name, obj){ fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1)); }

// Plain-text version of an HTML fragment, as a student would read or copy it.
const strip = h => String(h).replace(/<sup>(.*?)<\/sup>/g, '$1').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Same, but with exponents written the way the guides tell students to type them (10^5).
const stripCaret = h => String(h).replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');

module.exports = {BASE, GASES, CALOR, OUT, seedScript, patchGases, patchCalor, launch, openPage, BAD_TEXT, writeJSON, strip, stripCaret};

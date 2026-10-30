// Shared test harness for the biochemistry study guides.
// Serves the guide through Playwright with a small in-memory injection that exposes
// internal objects (BANK, quiz state, data tables, pure functions) as window.__T.
// The guide files on disk are never modified.
'use strict';
const { chromium } = require('playwright');

const BASE = 'http://localhost:8904/biochemistry/';
const GUIDES = {
  carbs: 'carbohydrates-study-guide.html',
  lipids: 'lipids-study-guide.html'
};
const EXPOSE = {
  carbs: ['ALDO','KETO','COMMON','sugarName','cfgOf','sugarClass','relate','epimerAt','flipCfg','nCarbons','fischerSVG','haworthPyr','haworthFur','chairSVG','sym',
    'disName','disKnown','disSVG','DIS_KNOWN','RES','POLY','GAGS','GAGCH','nonreducingEnds','branchPercent','bambooRate','monoReadout','REDTEST','DERIVS','MUTA','mutaRot','mutaBeta',
    'INV','invRot','MTYPE','MF','treeSVG','BR','HBA','RING_SUGARS','MONO_PRESETS','SYM','BANK','SECTIONS','quiz','state','go','fmt','faShort','checkShort'],
  lipids: ['FA','FA_TABLE','faFind','faShort','faAtlas','faOmega','faSysName','parseShort','checkShort','faSVG','faGeom','tagName','tagChiral','tagCount','TAG_FAS',
    'acdIsozymes','betaOx','atpYield','faSynth','LIPO','LIPO_PARTS','APOS','HEADS','SHEADS','lipidResult','PLASES','SPH_STEPS','fluidity','memWords','fasCount','fasAt','FAS_END',
    'BOX_PRESETS','tagSVG','plaseSVG','fasSVG','beadsSVG','MEM_PRESETS','TLC','LMAPS','KET','ACCS','FA_AFTER','ROUTES','TAGCYC','CHOCELL','CHO_STAGES','ML_PRESETS','memState','faState','boxState','fasState','BANK','SECTIONS','quiz','state','go','fmt']
};
const MARK = '/* ---------- start ---------- */';

function injection(kind){
  const lines = EXPOSE[kind].map(n => 'try{ window.__T.' + n + ' = ' + n + '; }catch(e){ window.__T.__missing.push("' + n + '"); }');
  return 'window.__T = {__missing: []};\n' + lines.join('\n') + '\nwindow.__T.setRNG = f => { RNG = f; };\n';
}

async function openGuide(kind, opts){
  opts = opts || {};
  const browser = opts.browser || await chromium.launch();
  const context = await browser.newContext({viewport: opts.viewport || {width: 1280, height: 900}, reducedMotion: opts.reducedMotion || 'no-preference'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push({type: 'pageerror', text: String(e && e.message || e)}));
  page.on('console', m => { if(m.type() === 'error') errors.push({type: 'console', text: m.text()}); });
  if(opts.expose !== false){
    await page.route('**/' + GUIDES[kind], async route => {
      const resp = await route.fetch();
      let body = await resp.text();
      if(body.indexOf(MARK) < 0) throw new Error('start marker not found in ' + kind);
      body = body.replace(MARK, injection(kind) + MARK);
      await route.fulfill({response: resp, body: body, headers: Object.assign({}, resp.headers(), {'content-type': 'text/html; charset=utf-8'})});
    });
  }
  await page.goto(BASE + GUIDES[kind] + (opts.hash || ''));
  await page.waitForSelector('#tabs button');
  return {browser, context, page, errors, ownBrowser: !opts.browser};
}

module.exports = { openGuide, GUIDES, BASE, chromium };

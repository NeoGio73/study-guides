// Renders the structure drawings into gallery images for visual review, and measures the bond angles
// at every drawn carbonyl carbon. Output: drawings-<guide>-<n>.png and drawings-results.json
'use strict';
const fs = require('fs');
const path = require('path');
const { openGuide, chromium } = require('./harness');

async function gallery(page, items, file){
  await page.evaluate(items => {
    // keep the page stylesheet (colors are CSS custom properties): render inside the app container
    document.querySelector('.app').style.maxWidth = '1260px';
    document.querySelector('#view').innerHTML = '<div id="gal" style="display:flex;flex-wrap:wrap;gap:14px;padding:12px;background:var(--bg);color:var(--ink);width:1240px"></div>';
    const g = document.getElementById('gal');
    items.forEach(([label, code]) => { const d = document.createElement('div'); d.style.cssText = 'border:1px solid #ccc;padding:6px;font:12px sans-serif';
      let svg; try{ svg = (new Function('T', 'return ' + code))(window.__T); if(svg && svg.svg) svg = svg.svg; }catch(e){ svg = '<b>ERROR ' + e.message + '</b>'; }
      d.innerHTML = '<div style="font-weight:700;margin-bottom:4px">' + label + '</div>' + svg; g.appendChild(d); });
  }, items);
  await page.waitForTimeout(200);
  const el = await page.$('#gal');
  await el.screenshot({path: file});
}

(async () => {
  const browser = await chromium.launch();
  const out = {};
  // ---------- carbohydrates
  {
    const g = await openGuide('carbs', {browser, viewport: {width: 1280, height: 900}});
    const items = [];
    [['glucose', 'RLRR'], ['mannose', 'LLRR'], ['galactose', 'RLLR'], ['L-galactose', 'LRRL']].forEach(([n, c]) => ['a', 'b'].forEach(a => items.push([(a === 'a' ? 'α' : 'β') + '-' + n + ' pyranose', 'T.haworthPyr("' + c + '","' + a + '")'])));
    ['fructose', 'ribose', 'deoxyribose'].forEach(n => ['a', 'b'].forEach(a => items.push([(a === 'a' ? 'α' : 'β') + '-' + n + ' furanose', 'T.haworthFur("' + n + '","' + a + '")'])));
    Object.keys({glcn: 1, glcnac: 1, fuc: 1, glca: 1, gluconate: 1, lactone: 1, g6p: 1, sorbitol: 1, sia: 1}).forEach(k => items.push(['derivative ' + k, 'T.DERIVS.' + k + '.draw()']));
    await gallery(g.page, items, path.join(__dirname, 'drawings-carbs-1.png'));
    const items2 = [];
    [['a', '4C1'], ['b', '4C1'], ['a', '1C4'], ['b', '1C4']].forEach(([a, f]) => items2.push(['chair ' + a + ' ' + f, 'T.chairSVG("' + a + '","' + f + '")']));
    [['maltose', '{a:"Glc",an:"a",to:4,b:"Glc"}'], ['lactose', '{a:"Gal",an:"b",to:4,b:"Glc"}'], ['sucrose', '{a:"Glc",an:"a",to:"anom",b:"Fru",bn:"b"}'], ['trehalose', '{a:"Glc",an:"a",to:"anom",b:"Glc",bn:"a"}'],
     ['cellobiose', '{a:"Glc",an:"b",to:4,b:"Glc"}'], ['isomaltose', '{a:"Glc",an:"a",to:6,b:"Glc"}'], ['Fru β2→4 Glc', '{a:"Fru",an:"b",to:4,b:"Glc"}'], ['Glc α1→2 Man', '{a:"Glc",an:"a",to:2,b:"Man"}'], ['Glc α1→3 Glc', '{a:"Glc",an:"a",to:3,b:"Glc"}'], ['Gal β1→3 Gal', '{a:"Gal",an:"b",to:3,b:"Gal"}'], ['Gal β1→2 Glc', '{a:"Gal",an:"b",to:2,b:"Glc"}'], ['Fru β2↔1α Glc', '{a:"Fru",an:"b",to:"anom",b:"Glc",bn:"a"}'], ['Glc α1↔1β Glc', '{a:"Glc",an:"a",to:"anom",b:"Glc",bn:"b"}']].forEach(([n, d]) => items2.push([n, 'T.disSVG(' + d + ')']));
    items2.push(['Fischer D-glucose', 'T.fischerSVG("aldo","RLRR",{ref:true})'], ['Fischer D-fructose', 'T.fischerSVG("keto","LRR",{ref:true})'], ['tree glycogen 8', 'T.treeSVG("glycogen",8)'], ['tree amylopectin 4', 'T.treeSVG("amylopectin",4)']);
    await gallery(g.page, items2, path.join(__dirname, 'drawings-carbs-2.png'));
    await g.context.close();
  }
  // ---------- lipids
  {
    const g = await openGuide('lipids', {browser, viewport: {width: 1280, height: 900}});
    const items = [['triacylglycerol', 'T.tagSVG([T.TAG_FAS[2], T.TAG_FAS[5], T.TAG_FAS[3]])'], ['phospholipase', 'T.plaseSVG("A2", "pc")'], ['FAS p=0', 'T.fasSVG(0)'], ['FAS cycle 1 step 1', 'T.fasSVG(1)'], ['FAS step 2', 'T.fasSVG(2)'], ['FAS step 3', 'T.fasSVG(3)'], ['FAS step 5', 'T.fasSVG(5)'], ['beta-ox 15:0 done', 'T.beadsSVG(15, [], 6)'], ['beta-ox 16:0 k=2', 'T.beadsSVG(16, [], 2)'],
      ['palmitic 16:0', 'T.faSVG(16,[])'], ['oleic 18:1 cis', 'T.faSVG(18,[9])'], ['elaidic 18:1 trans', 'T.faSVG(18,[9],{trans:[9]})'], ['linoleic 18:2', 'T.faSVG(18,[9,12])'], ['arachidonic 20:4', 'T.faSVG(20,[5,8,11,14])'], ['DHA 22:6', 'T.faSVG(22,[4,7,10,13,16,19])'],
      ['conjugated 18:2(9,11)', 'T.faSVG(18,[9,11])']
    ];
    await gallery(g.page, items, path.join(__dirname, 'drawings-lipids-1.png'));
    // the remaining drawings are only reachable through the page: take section screenshots
    await g.context.close();
    const g2 = await openGuide('lipids', {browser, viewport: {width: 1280, height: 900}, expose: false, hash: '#fa'});
    const shot = async (sel, file) => { const el = await g2.page.$(sel); if(el){ await el.scrollIntoViewIfNeeded(); await el.screenshot({path: path.join(__dirname, file)}); } };
    await shot('#tag-draw', 'drawings-lipids-tag.png');
    await g2.page.evaluate(() => document.querySelector('#tabs [data-tab="ml"]').click()); await g2.page.waitForTimeout(200);
    await g2.page.evaluate(() => { const b = document.querySelector('#pl-draw [data-pl="A2"]'); b.dispatchEvent(new MouseEvent('click', {bubbles: true})); });
    await shot('#pl-draw', 'drawings-lipids-plase.png');
    await shot('#sph-draw', 'drawings-lipids-sph.png');
    await g2.page.evaluate(() => document.querySelector('#tabs [data-tab="fas"]').click()); await g2.page.waitForTimeout(200);
    await g2.page.evaluate(() => { document.querySelector('#fas-next').click(); });
    await shot('#fas-draw', 'drawings-lipids-fas-step1.png');
    await g2.page.evaluate(() => document.querySelector('#tabs [data-tab="box"]').click()); await g2.page.waitForTimeout(200);
    await g2.page.evaluate(() => { const c = Array.from(document.querySelectorAll('#box-presets .chip')).find(b => /15:0/.test(b.textContent)); c.click(); document.querySelector('#box-all').click(); });
    await shot('#box-draw', 'drawings-lipids-box-15.png');
    await g2.context.close();
  }
  // ---------- bond angles at drawn carbonyl carbons, measured from the SVG the page itself produces
  const g3 = await openGuide('carbs', {browser});
  const lac = await g3.page.evaluate(() => window.__T.DERIVS.lactone.draw());
  const fisch = await g3.page.evaluate(() => window.__T.fischerSVG('keto', 'LRR', {}));
  await g3.context.close();
  const g4 = await openGuide('lipids', {browser});
  const L = await g4.page.evaluate(() => { const T = window.__T; return {tag: T.tagSVG([T.TAG_FAS[2], T.TAG_FAS[5], T.TAG_FAS[3]]), plase: T.plaseSVG(null, 'pc'), fas1: T.fasSVG(1), fa: T.faSVG(16, [])}; });
  await g4.context.close();
  // collect bonds (lines and polyline segments) that start within r px of the carbon; merge double-bond pairs; report angles
  function measure(svg, cx, cy, r){
    const segs = [];
    (svg.match(/<line [^>]*>/g) || []).forEach(t => { const a = n => +((t.match(new RegExp(' ' + n + '="([-0-9.]+)"')) || [])[1]); segs.push([a('x1'), a('y1'), a('x2'), a('y2')]); });
    (svg.match(/<polyline [^>]*points="([^"]+)"/g) || []).forEach(t => { const pts = t.match(/points="([^"]+)"/)[1].trim().split(/\s+/).map(p => p.split(',').map(Number)); for(let i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]); });
    const dirs = [];
    segs.forEach(([x1, y1, x2, y2]) => { const d1 = Math.hypot(x1 - cx, y1 - cy), d2 = Math.hypot(x2 - cx, y2 - cy); let fx, fy;
      let nx, ny;
      if(d1 <= r && d2 > d1 + 3){ nx = x1; ny = y1; fx = x2; fy = y2; } else if(d2 <= r && d1 > d2 + 3){ nx = x2; ny = y2; fx = x1; fy = y1; } else return;
      dirs.push(Math.atan2(-(fy - ny), fx - nx) * 180 / Math.PI); });   // direction of the bond line itself (the two lines of a C=O are parallel)
    const cl = []; dirs.forEach(d => { const c = cl.find(c => Math.abs(((d - c.d + 540) % 360) - 180) < 12); if(c){ c.n++; } else cl.push({d, n: 1}); });
    const ds = cl.map(c => (c.d + 360) % 360).sort((a, b) => a - b);
    const ang = ds.map((d, i) => +(((i < ds.length - 1 ? ds[i + 1] : ds[0] + 360) - d)).toFixed(1));
    return {bondDirections: ds.map(d => +d.toFixed(1)), anglesBetweenNeighbours: ang};
  }
  out.carbonylAngles = {
    'carbs D-glucono-delta-lactone C-1': measure(lac, 186.6, 98, 10),
    'lipids fatty acid COOH C-1 (faSVG)': measure(L.fa, 46, 40, 4),
    'lipids triacylglycerol ester C, row C-1 (tagSVG)': measure(L.tag, 104, 34, 4),
    'lipids triacylglycerol ester C, row C-2 (tagSVG)': measure(L.tag, 104, 86, 4),
    'lipids phospholipase ester C at C-1 (plaseSVG)': measure(L.plase, 130.25, 32, 4),
    'lipids phospholipase ester C at C-2 (plaseSVG)': measure(L.plase, 130.25, 90, 4),
    'lipids fatty acid synthase beta-keto C, cycle 1 step 1 (fasSVG)': measure(L.fas1, 188, 54 - 14.43, 10)
  };
  fs.writeFileSync(path.join(__dirname, 'drawings-results.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();

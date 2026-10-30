// Confirms each fix requested on 2026-10-30 (instructor items 26-29, 46, 47) in the running pages.
// Usage: node verify-fixes.js -> verify-fixes-results.json, verify-*.png
'use strict';
const fs = require('fs');
const path = require('path');
const { openGuide, chromium } = require('./harness');

(async () => {
  const browser = await chromium.launch();
  const res = {};
  const put = (k, pass, detail) => { res[k] = {pass: !!pass, detail}; console.log((pass ? 'PASS ' : 'FAIL ') + k + '  ' + JSON.stringify(detail).slice(0, 220)); };
  // ---------------- carbohydrates
  {
    const g = await openGuide('carbs', {browser});
    const P = g.page;
    const r = await P.evaluate(async () => {
      const T = window.__T, out = {}, sleep = ms => new Promise(r => setTimeout(r, ms));
      T.go('mono'); const txt = document.querySelector('#view').innerText;
      out.poly = (txt.match(/polysaccharides \(more than[^)]*\)/) || [''])[0];
      out.arabinose = (txt.match(/Most of the hexoses[^\n]*/) || [''])[0];
      // compare readout case
      document.querySelector('#cmp-a .chip[data-v="RLRR"]').click(); document.querySelector('#cmp-b .chip[data-v="LLRR"]').click();
      out.cmpEpimer = document.querySelector('#cmp-out').innerText;
      document.querySelector('#cmp-b .chip[data-v="LRLL"]').click(); out.cmpEnant = document.querySelector('#cmp-out').innerText;
      // generated questions: names lower case mid-sentence
      const qs = new Set(); for(let i = 0; i < 4000; i++){ T.BANK.mono.slice(2, 4).forEach(f => qs.add(f().q)); T.BANK.deriv[0] && qs.add(T.BANK.deriv[0]().q); }
      out.capsMidSentence = Array.from(qs).filter(q => / (of|are|Is|and) (D|L)-[A-Z]|Is (Methyl|N-Acetyl|Maltose|Lactose|Sucrose|Trehalose)/.test(q)).slice(0, 5);
      out.sampleQs = Array.from(qs).filter(q => /epimer of|How are|reducing sugar/.test(q)).slice(0, 4);
      // mutarotation end point
      T.go('ring'); document.querySelector('#muta-t').value = 50; document.querySelector('#muta-t').dispatchEvent(new Event('input', {bubbles: true}));
      out.muta50 = {rot: document.querySelector('#muta-rot').textContent, a: document.querySelector('#muta-a').textContent, b: document.querySelector('#muta-b').textContent};
      out.mutaNote = (document.querySelector('#view').innerText.match(/The starting values[^\n]*/) || [''])[0];
      out.eqFromComposition = +(0.36 * 112 + 0.64 * 19).toFixed(1);
      // methylation generator
      const per = []; for(let i = 0; i < 3000; i++){ const Q = T.BANK.lab[2](); per.push(Q.a); }
      out.methylResiduesPerBranch = [Math.min(...per).toFixed(1), Math.max(...per).toFixed(1)];
      return out;
    });
    put('C3 polysaccharides "more than 20 or so"', /more than 20 or so/.test(r.poly), r.poly);
    put('C6 arabinose sentence', /pentose L-arabinose/.test(r.arabinose), r.arabinose);
    put('C7 lower-case names mid-sentence', !r.capsMidSentence.length && /and D-mannose/.test(r.cmpEpimer) && /D-glucose and L-glucose/.test(r.cmpEnant), {offenders: r.capsMidSentence, samples: r.sampleQs, cmp: r.cmpEpimer.slice(0, 80)});
    put('C4 mutarotation self-consistent', r.muta50.rot === '+52°' && r.muta50.a === '36%' && r.muta50.b === '64%' && Math.abs(r.eqFromComposition - 52) < 1 && /36% α and 64% β/.test(r.mutaNote), r);
    put('C5 methylation branch frequency within 24-30', +r.methylResiduesPerBranch[0] >= 24 && +r.methylResiduesPerBranch[1] <= 30, r.methylResiduesPerBranch);
    // drawings for C1/C2/C8 (faces are checked exhaustively in models.js)
    await P.evaluate(() => { const T = window.__T; document.querySelector('#view').innerHTML = '<div id="gal" style="display:flex;flex-wrap:wrap;gap:8px;width:1240px">' +
      ['{a:"Glc",an:"a",to:"anom",b:"Fru",bn:"b"}', '{a:"Glc",an:"a",to:"anom",b:"Glc",bn:"a"}', '{a:"Glc",an:"a",to:3,b:"Glc"}', '{a:"Gal",an:"b",to:3,b:"Gal"}', '{a:"Man",an:"a",to:2,b:"Man"}', '{a:"Glc",an:"a",to:2,b:"Glc"}', '{a:"Gal",an:"b",to:4,b:"Glc"}', '{a:"Glc",an:"a",to:4,b:"Gal"}']
        .map(d => '<div style="border:1px solid #ccc;font:11px sans-serif">' + d + T.disSVG(eval('(' + d + ')')) + '</div>').join('') + '</div>'; });
    await (await P.$('#gal')).screenshot({path: path.join(__dirname, 'verify-disaccharides.png')});
    // labels clear of the bond path (C8): distance from each acceptor number label to the polyline
    const lab = await P.evaluate(() => { const T = window.__T, out = [];
      ['Glc', 'Gal', 'Man'].forEach(b => [2, 3].forEach(to => { const svg = T.disSVG({a: 'Glc', an: 'a', to, b}), doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const pts = doc.querySelector('polyline').getAttribute('points').trim().split(' ').map(q => q.split(',').map(Number));
        const t = Array.from(doc.querySelectorAll('text')).find(x => x.textContent === String(to)), tx = +t.getAttribute('x'), ty = +t.getAttribute('y') - 4;
        let dmin = 1e9; for(let i = 1; i < pts.length; i++){ const [x1, y1] = pts[i - 1], [x2, y2] = pts[i]; const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2, u = Math.max(0, Math.min(1, ((tx - x1) * (x2 - x1) + (ty - y1) * (y2 - y1)) / (L2 || 1))); dmin = Math.min(dmin, Math.hypot(tx - (x1 + u * (x2 - x1)), ty - (y1 + u * (y2 - y1)))); }
        out.push({acceptor: b + ' C-' + to, labelToBondPx: +dmin.toFixed(1)}); })); return out; });
    put('C8 C-2/C-3 labels clear of the bond', lab.every(l => l.labelToBondPx >= 8), lab);
    await g.context.close();
  }
  // ---------------- lipids
  {
    const g = await openGuide('lipids', {browser});
    const P = g.page;
    const r = await P.evaluate(async () => {
      const T = window.__T, out = {}, sleep = ms => new Promise(r => setTimeout(r, ms));
      // 26: phosphatidic acid
      T.go('ml'); out.keyFact = (document.querySelector('#view').innerText.match(/Net charge at pH 7:[^\n]*/) || [''])[0];
      const pa = Array.from(document.querySelectorAll('#ml-presets .chip')).find(c => c.textContent === 'Phosphatidylcholine'); pa.click();
      document.querySelector('[data-seg="head"] button[data-v="h"]').click(); out.paReadout = document.querySelector('#ml-out').innerText.replace(/\s+/g, ' ');
      out.allMinus2 = (document.documentElement.innerHTML.match(/phosphatidic acid[^<]{0,12}−2/gi) || []).length;
      // lyso names (47 / L7)
      const set = (k, v) => { const b = document.querySelector('[data-seg="' + k + '"] button[data-v="' + v + '"]'); if(b) b.click(); };
      set('head', 'pip2'); set('c2', 'oh'); out.lysoPIP2 = document.querySelector('#ml-out h4').textContent;
      set('head', 'cho'); set('c1', 'alkyl'); out.lysoPAF = document.querySelector('#ml-out h4').textContent;
      set('c1', 'alkenyl'); set('head', 'eth'); out.lysoPls = document.querySelector('#ml-out h4').textContent;
      // 29: bacterial challenges
      T.go('mem'); document.querySelector('[data-goal="cold"]').click();
      out.cold = {chol: document.querySelector('#ms-chol').value, disabled: document.querySelector('#ms-chol').disabled};
      document.querySelector('#ms-chol').value = 40; document.querySelector('#ms-chol').dispatchEvent(new Event('input', {bubbles: true}));   // a programmatic event on a disabled slider
      out.coldAfterForcedInput = document.querySelector('#mo-chol').textContent;
      document.querySelector('[data-goal="hot"]').click(); out.hot = {chol: document.querySelector('#ms-chol').value, disabled: document.querySelector('#ms-chol').disabled};
      const pm = Array.from(document.querySelectorAll('#mem-presets .chip')).find(c => c.textContent === 'Plasma membrane'); pm.click();
      out.plasma = {state: document.querySelector('#mem-out h4').textContent, needle: document.querySelector('#mem-needle').style.left, cholEnabled: !document.querySelector('#ms-chol').disabled};
      // carbon count, chylomicron size
      T.go('cho'); out.carbonCount = (document.querySelector('#view').innerText.match(/Follow the carbon count[^.]*\./) || [''])[0];
      document.querySelector('#lp-chart [data-lp="chylo"]').dispatchEvent(new MouseEvent('click', {bubbles: true})); out.chyloSize = (document.querySelector('#lp-out').innerText.match(/Diameter\s*([^\n]*)/) || [])[1];
      // beta-oxidation label
      T.go('box'); document.querySelector('#box-all').click();
      const svg = document.querySelector('#box-draw svg'), t = Array.from(svg.querySelectorAll('text')).find(x => x.textContent === 'acetyl-CoA'); out.acetylLabelX = +t.getBBox().x.toFixed(1);
      // shorthand checker and natural pattern
      out.checker = ['C18:2(Δ9,12)', '18:2(Δ⁹,¹²)', 'c18:2 (9,12)', '18:2(Δ9,12)', '18:2(Δ10,13)'].map(x => x + ' -> ' + T.checkShort(x, 18, [9, 12]).ok);
      T.go('fa'); const lin = Array.from(document.querySelectorAll('#fa-presets .chip')).find(c => /^Linoleic/.test(c.textContent)); lin.click();
      document.querySelector('[data-seg="geo"] button[data-v="trans"]').click(); out.transType = document.querySelector('#fa-kv').innerText.replace(/\s+/g, ' ').match(/Type (.*?) Melting/)[1];
      document.querySelector('[data-seg="geo"] button[data-v="cis"]').click(); out.cisType = document.querySelector('#fa-kv').innerText.replace(/\s+/g, ' ').match(/Type (.*?) Melting/)[1];
      out.icosa = (document.documentElement.innerHTML.match(/(^|[^Ee])[Ii]cosa/g) || []).length + ' Icosa- in page; table: ' + T.FA_TABLE.find(f => f.c === 20 && f.d.length === 4).sys;
      return out;
    });
    put('26 phosphatidic acid -1 with consistent footnote', /phosphatidic acid −1\*/.test(r.keyFact) && /Net charge at pH 7 −1\*/.test(r.paReadout) && /phosphatidic acid is counted as −1/.test(r.paReadout) && r.allMinus2 === 0, {keyFact: r.keyFact.slice(0, 260), readout: r.paReadout.slice(0, 260)});
    put('29 cholesterol locked at 0 in both challenges', r.cold.chol === '0' && r.cold.disabled && r.hot.chol === '0' && r.hot.disabled && r.plasma.cholEnabled, r);
    put('47/L5 plasma-membrane preset in the middle zone', /Between the two extremes/.test(r.plasma.state), r.plasma);
    put('47/L7 assembler names', !/PIP/.test(r.lysoPIP2) && /Lyso-PAF/.test(r.lysoPAF) && /lysoplasmalogen/.test(r.lysoPls), [r.lysoPIP2, r.lysoPAF, r.lysoPls]);
    put('47/L9 chylomicron size stated once', r.chyloSize === '100 to 500 nm', r.chyloSize);
    put('47/L10 carbon-count sentence', /2, 4, 6, 6, 5, 10, 15, 30, 27/.test(r.carbonCount), r.carbonCount);
    put('47/L3 acetyl-CoA label not clipped', r.acetylLabelX >= 0, r.acetylLabelX);
    put('47/L12 shorthand checker', r.checker.slice(0, 4).every(x => /true$/.test(x)) && /false$/.test(r.checker[4]), r.checker);
    put('47/L13 natural pattern only for cis; one spelling', !/natural pattern/.test(r.transType) && /natural pattern/.test(r.cisType) && /^0 Icosa/.test(r.icosa), {trans: r.transType, cis: r.cisType, icosa: r.icosa});
    await g.context.close();
    // L4: 390 px overflow with long trans names
    const g2 = await openGuide('lipids', {browser, viewport: {width: 390, height: 844}, hash: '#fa'});
    const ov = await g2.page.evaluate(async () => { const out = [];
      for(const c of Array.from(document.querySelectorAll('#fa-presets .chip'))){ c.click(); for(const geo of ['cis', 'trans']){ document.querySelector('[data-seg="geo"] button[data-v="' + geo + '"]').click(); await new Promise(r => setTimeout(r, 10)); out.push(document.documentElement.scrollWidth); } }
      // a six-double-bond trans chain of 26 carbons
      document.querySelector('[data-clear]').click(); for(let i = 0; i < 12; i++) document.querySelector('[data-len="1"]').click();
      for(const p of [3, 6, 9, 12, 15, 18]){ const h = document.querySelector('#fa-draw .hit[data-i="' + p + '"]'); h.dispatchEvent(new MouseEvent('click', {bubbles: true})); }
      document.querySelector('[data-seg="geo"] button[data-v="trans"]').click(); out.push(document.documentElement.scrollWidth);
      return Math.max(...out); });
    await g2.page.evaluate(() => document.querySelector('#fa-kv').scrollIntoView());
    await g2.page.screenshot({path: path.join(__dirname, 'verify-390-fa.png')});
    put('47/L4 long trans names wrap at 390 px', ov <= 390, {maxScrollWidth: ov});
    await g2.context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'verify-fixes-results.json'), JSON.stringify(res, null, 1));
})();

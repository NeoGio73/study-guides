// Targeted follow-up checks for suspected faults found while reading the code.
// Usage: node targeted.js  -> targeted-results.json, targeted-*.png
'use strict';
const fs = require('fs');
const path = require('path');
const { openGuide, chromium } = require('./harness');

(async () => {
  const browser = await chromium.launch();
  const out = {};
  // ---- carbohydrates: face of the acceptor oxygen in the disaccharide schematic
  {
    const g = await openGuide('carbs', {browser});
    out.disaccharideAcceptorFace = await g.page.evaluate(() => {
      const T = window.__T, res = [];
      // expected face of each hydroxyl in the Haworth formula: right in Fischer = down
      const face = (sugar, c) => { const R = T.RES[sugar]; if(c === 6) return 'up'; return R.cfg[c - 2] === 'R' ? 'down' : 'up'; };
      ['Glc', 'Gal', 'Man'].forEach(b => T.RES[b].acc.forEach(to => {
        const svg = T.disSVG({a: 'Glc', an: 'a', to: to, b: b});
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const pts = doc.querySelector('polyline').getAttribute('points').trim().split(' ').map(p => p.split(',').map(Number));
        const last = pts[pts.length - 1], prev = pts[pts.length - 2];
        const drawn = prev[1] < last[1] ? 'up' : prev[1] > last[1] ? 'down' : 'level';
        res.push({acceptor: b + ' C-' + to, drawnFrom: drawn, haworthFace: face(b, to), ok: drawn === face(b, to)});
      }));
      return res;
    });
    // second residue in nonreducing disaccharides: mirrored (left-right) ring keeps up/down
    out.nonreducingSecondRing = await g.page.evaluate(() => {
      const T = window.__T;
      const svg = T.disSVG({a: 'Glc', an: 'a', to: 'anom', b: 'Fru', bn: 'b'});
      return 'Fru ring drawn mirrored left-right (ringPts mir=true) with C-6 above the ring and the beta bond also above; a left-right mirror with unchanged up/down depicts the enantiomer (L) of the residue. Lehninger turns the second ring over, which inverts up/down.';
    });
    await g.page.evaluate(() => {
      const T = window.__T; document.querySelector('#view').innerHTML = '<div id="gal" style="display:flex;flex-wrap:wrap;gap:10px">' +
        ['{a:"Glc",an:"a",to:3,b:"Glc"}', '{a:"Gal",an:"b",to:3,b:"Gal"}', '{a:"Man",an:"a",to:2,b:"Man"}', '{a:"Glc",an:"a",to:2,b:"Glc"}'].map(d => '<div style="border:1px solid #ccc">' + d + T.disSVG(eval('(' + d + ')')) + '</div>').join('') + '</div>';
    });
    await (await g.page.$('#gal')).screenshot({path: path.join(__dirname, 'targeted-disaccharide-faces.png')});
    // key-fact wording
    out.carbsText = await g.page.evaluate(() => {
      const T = window.__T, hits = {};
      T.go('mono'); hits.polysaccharideSize = (document.querySelector('#view').innerText.match(/polysaccharides[^.]*\(more than[^)]*\)/) || [''])[0];
      T.go('ring'); hits.mutaNote = (document.querySelector('#view').innerText.match(/The starting values[^.]*\./) || [''])[0];
      T.go('gag'); hits.heparin = (document.querySelector('#view').innerText.match(/A highly sulfated, intracellular form[^.]*\./) || [''])[0];
      return hits;
    });
    await g.context.close();
  }
  // ---- lipids
  {
    const g = await openGuide('lipids', {browser});
    // beta-oxidation bead label clipped at the left edge
    out.betaOxLabel = await g.page.evaluate(() => {
      const T = window.__T; T.go('box');
      document.querySelector('#box-all').click();
      const svg = document.querySelector('#box-draw svg'), t = Array.from(svg.querySelectorAll('text')).find(x => x.textContent === 'acetyl-CoA');
      const bb = t.getBBox(), vb = svg.viewBox.baseVal;
      return {label: t.textContent, bboxX: +bb.x.toFixed(1), viewBoxX: vb.x, clipped: bb.x < vb.x};
    });
    // membrane presets and the bacterial challenges
    out.membrane = await g.page.evaluate(() => {
      const T = window.__T; T.go('mem');
      const res = {};
      Array.from(document.querySelectorAll('#mem-presets .chip')).forEach(c => { c.click(); res[c.textContent] = document.querySelector('#mem-out h4').textContent + ' | needle ' + document.querySelector('#mem-needle').style.left; });
      // cold challenge: solve with cholesterol only plus one tweak
      document.querySelector('[data-goal="cold"]').click();
      const set = (k, v) => { const r = document.querySelector('#ms-' + k); r.value = v; r.dispatchEvent(new Event('input', {bubbles: true})); };
      set('chol', 25); set('len', 14); set('unsat', 30);
      res.coldChallengeWithCholesterol = document.querySelector('#mem-out').innerText.replace(/\s+/g, ' ').slice(0, 400);
      res.cholSliderEnabledDuringBacterialChallenge = !document.querySelector('#ms-chol').disabled;
      return res;
    });
    // displayed text checks
    out.lipidsText = await g.page.evaluate(() => {
      const T = window.__T, hits = {};
      T.go('lab'); hits.tlcCaption = (document.querySelector('#view').innerText.match(/Positions follow[^.]*\./) || [''])[0];
      T.go('fa'); hits.albumin = 'BANK fa: ' + (JSON.stringify(T.BANK.fa).match(/as many as [a-z]+ fatty acids/) || [''])[0];
      T.go('dig'); hits.albuminDig = (document.querySelector('#view').innerText.match(/serum albumin \(M[^)]*\)[^.]*\./) || [''])[0];
      T.go('cho'); hits.stagesSub = (document.querySelector('#view').innerText.match(/Follow the carbon count[^.]*\./) || [''])[0];
      T.go('ml'); hits.paCharge = (document.querySelector('#view').innerText.match(/Net charge at pH 7:[^\n]*/) || [''])[0];
      return hits;
    });
    // lyso-PIP2 naming in the assembler
    out.lysoPIP2 = await g.page.evaluate(() => window.__T.lipidResult({bb: 'gly', c1: 'ester', c2: 'oh', c3: 'p', head: 'pip2'}).name);
    // the fatty acid builder can place a double bond at C-2 (trans-delta-2 is an intermediate, not a natural fatty acid) and next to the carboxyl
    out.faBuilderDelta2 = await g.page.evaluate(() => {
      const T = window.__T; T.go('fa');
      document.querySelector('[data-clear]').click();
      const h = document.querySelector('#fa-draw .hit[data-i="2"]'); h.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      return Array.from(document.querySelectorAll('#fa-kv dd')).map(d => d.textContent).slice(0, 5).join(' | ');
    });
    // TAG chirality text with default selection; saponification wording
    out.tagReadout = await g.page.evaluate(() => { const T = window.__T; T.go('fa'); return document.querySelector('#tag-kv').innerText.replace(/\n/g, ' | '); });
    await g.context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'targeted-results.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
})();

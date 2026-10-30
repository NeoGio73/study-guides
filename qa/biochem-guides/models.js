// Builders and models: exhaustive checks of the pure functions behind the explorers, against
// independent expectations written here from first principles / Lehninger.
// Usage: node models.js   -> models-results.json
'use strict';
const fs = require('fs');
const path = require('path');
const { openGuide, chromium } = require('./harness');

async function carbs(page){
  return await page.evaluate(() => {
    const T = window.__T, out = {checks: 0, problems: [], notes: []};
    const P = (m, x) => { out.problems.push(x ? m + ' :: ' + JSON.stringify(x).slice(0, 300) : m); };
    const ok = (c, m, x) => { out.checks++; if(!c) P(m, x); };
    // ---- independent tables: Fischer configurations, hydroxyl right (R) or left (L), from the carbon next to the carbonyl down
    const EA = {glyceraldehyde: 'R', erythrose: 'RR', threose: 'LR', ribose: 'RRR', arabinose: 'LRR', xylose: 'RLR', lyxose: 'LLR',
      allose: 'RRRR', altrose: 'LRRR', glucose: 'RLRR', mannose: 'LLRR', gulose: 'RRLR', idose: 'LRLR', galactose: 'RLLR', talose: 'LLLR'};
    const EK = {dihydroxyacetone: '', erythrulose: 'R', ribulose: 'RR', xylulose: 'LR', psicose: 'RRR', fructose: 'LRR', sorbose: 'RLR', tagatose: 'LLR'};
    const size = {3: 'triose', 4: 'tetrose', 5: 'pentose', 6: 'hexose'};
    const flip = s => s.split('').map(c => c === 'R' ? 'L' : 'R').join('');
    const all = n => { const r = ['']; for(let i = 0; i < n; i++){ const t = r.splice(0); t.forEach(x => { r.push(x + 'R', x + 'L'); }); } return r; };
    // every configuration of every length, both families
    [['aldo', EA, 1, 4, 2], ['keto', EK, 0, 3, 3]].forEach(([kind, E, lo, hi, add]) => {
      for(let n = lo; n <= hi; n++){
        all(n).forEach(cfg => {
          const nm = T.sugarName(kind, cfg);
          if(n === 0){ ok(nm.base === 'dihydroxyacetone' && nm.series === '', 'DHA naming', nm); return; }
          const D = cfg[n - 1] === 'R', dcfg = D ? cfg : flip(cfg);
          const exp = Object.keys(E).find(k => E[k] === dcfg);
          ok(nm.base === exp, 'name for ' + kind + ' ' + cfg, {got: nm.base, exp});
          ok(nm.series === (D ? 'D' : 'L'), 'series for ' + kind + ' ' + cfg, nm);
          ok(T.sugarClass(kind, cfg) === kind + size[n + add], 'class for ' + kind + ' ' + cfg, T.sugarClass(kind, cfg));
          const R = T.monoReadout(kind, cfg);
          ok(R.ref === n + add - 1, 'reference carbon (D/L) for ' + kind + ' ' + cfg, R.ref);
          // relationships with every other configuration of the same length
          all(n).forEach(c2 => {
            const r = T.relate(kind, cfg, c2), diff = [];
            for(let i = 0; i < n; i++) if(cfg[i] !== c2[i]) diff.push(i + (kind === 'aldo' ? 2 : 3));
            const exp = !diff.length ? 'same' : diff.length === n ? 'enantiomers' : diff.length === 1 ? 'epimers' : 'diastereomers';
            ok(r.rel === exp && JSON.stringify(r.at) === JSON.stringify(diff), 'relate ' + kind + ' ' + cfg + ' vs ' + c2, {got: r, exp});
          });
          // epimerAt round trip
          for(let c = 0; c < n; c++){ const e = T.epimerAt(kind, cfg, c + (kind === 'aldo' ? 2 : 3)); ok(e !== cfg && T.epimerAt(kind, e, c + (kind === 'aldo' ? 2 : 3)) === cfg, 'epimerAt round trip', {cfg, c}); }
        });
      }
    });
    // C-2 epimers by name (Lehninger examples)
    ok(T.relate('aldo', EA.glucose, EA.mannose).rel === 'epimers' && T.relate('aldo', EA.glucose, EA.mannose).at[0] === 2, 'glucose/mannose C-2 epimers');
    ok(T.relate('aldo', EA.glucose, EA.galactose).at[0] === 4, 'glucose/galactose C-4 epimers');
    ok(T.relate('aldo', EA.glucose, flip(EA.idose)).rel === 'epimers' && T.relate('aldo', EA.glucose, flip(EA.idose)).at[0] === 5, 'L-idose is the C-5 epimer of D-glucose');
    // ---- Haworth formulas: parse the SVG and read which way each group points
    const parse = svg => new DOMParser().parseFromString(svg, 'image/svg+xml');
    function readHaworth(svg, V){
      const doc = parse(svg), groups = {};
      Array.from(doc.querySelectorAll('text')).forEach(t => {
        const fs = +t.getAttribute('font-size'), x = +t.getAttribute('x'), y = +t.getAttribute('y'), txt = t.textContent.trim(), anchor = t.getAttribute('text-anchor');
        if(fs === 9.5 || txt === 'O' && fs === 13) return;       // carbon numbers and the ring O
        let best = null, bd = 1e9;
        Object.keys(V).forEach(k => { const v = V[k]; const xx = anchor === 'start' ? x + 6 : x; if(Math.abs(xx - v.x) > 12) return; const d = Math.abs(y - v.y); if(d < bd){ bd = d; best = k; } });
        if(best === null || bd > 45) return;
        const up = y < V[best].y;
        groups[best] = groups[best] || {}; groups[best][up ? 'up' : 'down'] = txt;
      });
      return groups;
    }
    const VP = {4: {x: 40, y: 98}, 5: {x: 84, y: 52}, 1: {x: 204, y: 98}, 2: {x: 160, y: 144}, 3: {x: 84, y: 144}};
    const pyrs = {glucose: 'RLRR', mannose: 'LLRR', galactose: 'RLLR', 'L-galactose': 'LRRL', allose: 'RRRR', talose: 'LLLR', gulose: 'RRLR', idose: 'LRLR', altrose: 'LRRR'};
    Object.keys(pyrs).forEach(name => { const cfg = pyrs[name];
      ['a', 'b'].forEach(an => {
        const g = readHaworth(T.haworthPyr(cfg, an), VP), D = cfg[3] === 'R';
        [2, 3, 4].forEach((c, i) => { const expUp = cfg[i] === 'L'; ok((g[c] || {})[expUp ? 'up' : 'down'] === 'OH', name + ' ' + an + ' C-' + c + ' OH should be ' + (expUp ? 'up' : 'down'), g[c]); });
        ok((g[5] || {})[D ? 'up' : 'down'] === 'CH2OH', name + ' C-6 should point ' + (D ? 'up' : 'down'), g[5]);
        const anomUp = an === 'b' ? D : !D;     // beta: cis to C-6
        ok((g[1] || {})[anomUp ? 'up' : 'down'] === 'OH', name + ' ' + an + ' anomeric OH should be ' + (anomUp ? 'up' : 'down'), g[1]);
      });
    });
    const VF = {2: {x: 208, y: 90}, 3: {x: 166, y: 150}, 4: {x: 84, y: 150}, 5: {x: 42, y: 90}};
    ['a', 'b'].forEach(an => {
      const g = readHaworth(T.haworthFur('fructose', an), VF);
      ok((g[2] || {})[an === 'b' ? 'up' : 'down'] === 'OH', 'fructofuranose ' + an + ' anomeric OH', g[2]);
      ok((g[2] || {})[an === 'b' ? 'down' : 'up'] === 'CH2OH', 'fructofuranose ' + an + ' C-1', g[2]);
      ok((g[3] || {}).up === 'OH' && (g[4] || {}).down === 'OH' && (g[5] || {}).up === 'CH2OH', 'fructofuranose C-3 up, C-4 down, C-6 up', g);
      const VR = {1: {x: 208, y: 90}, 2: {x: 166, y: 150}, 3: {x: 84, y: 150}, 4: {x: 42, y: 90}};
      const r = readHaworth(T.haworthFur('ribose', an), VR);
      ok((r[1] || {})[an === 'b' ? 'up' : 'down'] === 'OH' && (r[2] || {}).down === 'OH' && (r[3] || {}).down === 'OH' && (r[4] || {}).up === 'CH2OH', 'ribofuranose ' + an, r);
      const d = readHaworth(T.haworthFur('deoxyribose', an), VR);
      ok((d[2] || {}).up === 'H' && (d[2] || {}).down === 'H', '2-deoxyribose C-2 has two H', d[2]);
    });
    // derivatives drawn from haworthPyr
    Object.keys(T.DERIVS).forEach(k => { const svg = T.DERIVS[k].draw(); ok(!/NaN|undefined/.test(svg), 'derivative drawing ' + k + ' has bad numbers'); });
    const fuc = readHaworth(T.DERIVS.fuc.draw(), VP);
    ok((fuc[5] || {}).down === 'CH3' && (fuc[1] || {}).down === 'OH', 'beta-L-fucose: CH3 down, anomeric OH down (cis to C-6)', fuc);
    const lac = readHaworth(T.DERIVS.glcnac.draw(), VP); ok((lac[2] || {}).down === 'NHCOCH3', 'GlcNAc: N-acetyl on C-2, down', lac[2]);
    // the lactone C-1: all three bond angles 120 degrees
    {
      const doc = parse(T.DERIVS.lactone.draw()), lines = Array.from(doc.querySelectorAll('line')).map(l => ['x1', 'y1', 'x2', 'y2'].map(a => +l.getAttribute(a)));
      // ring bonds touching C-1: find C-1 position = the vertex shared by the two ring lines that are not at the original x=204
      const ring = lines.slice(0, 6), pts = {};
      ring.forEach(L => { [[L[0], L[1]], [L[2], L[3]]].forEach(p => { const k = p.join(','); pts[k] = (pts[k] || 0) + 1; }); });
      const c1 = Object.keys(pts).map(k => k.split(',').map(Number)).find(p => p[1] === 98 && p[0] > 150);
      const nb = []; ring.forEach(L => { if(L[0] === c1[0] && L[1] === c1[1]) nb.push([L[2], L[3]]); else if(L[2] === c1[0] && L[3] === c1[1]) nb.push([L[0], L[1]]); });
      const ang = (a, b) => { const v1 = [a[0] - c1[0], a[1] - c1[1]], v2 = [b[0] - c1[0], b[1] - c1[1]]; return Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / Math.hypot(...v1) / Math.hypot(...v2)) * 180 / Math.PI; };
      const co = [c1[0] + 30, c1[1]];   // C=O drawn horizontally to the right
      out.lactoneAngles = [ang(nb[0], nb[1]), ang(nb[0], co), ang(nb[1], co)].map(a => +a.toFixed(1));
      ok(out.lactoneAngles.every(a => Math.abs(a - 120) < 1.5), 'lactone C-1 angles should be 120', out.lactoneAngles);
    }
    // chairs: axial count
    const ax = {a4C1: 1, b4C1: 0, a1C4: 4, b1C4: 5};
    Object.keys(ax).forEach(k => { const c = T.chairSVG(k[0], k.slice(1)); ok(c.axial === ax[k], 'chair ' + k + ' axial count', c.axial); ok(!/NaN/.test(c.svg), 'chair svg NaN'); });
    // ---- disaccharide builder: every combination
    const res = Object.keys(T.RES); let nDi = 0;
    res.forEach(a => ['a', 'b'].forEach(an => res.forEach(b => {
      const tos = T.RES[b].acc.concat(['anom']);
      tos.forEach(to => (to === 'anom' ? ['a', 'b'] : ['a']).forEach(bn => {
        const D = {a, an, to, b, bn}, N = T.disName(D); nDi++;
        ok(N.reducing === (to !== 'anom'), 'reducing flag ' + JSON.stringify(D), N);
        const A = T.RES[a], B = T.RES[b], g = {a: 'α', b: 'β'};
        const expAbbr = to === 'anom' ? a + '(' + g[an] + A.anom + '↔' + B.anom + g[bn] + ')' + b : a + '(' + g[an] + A.anom + '→' + to + ')' + b;
        ok(N.abbr === expAbbr, 'abbreviation ' + JSON.stringify(D), {got: N.abbr, exp: expAbbr});
        const svg = T.disSVG(D); ok(!/NaN|undefined/.test(svg), 'disaccharide drawing NaN ' + JSON.stringify(D));
        // faces: donor alpha down / beta up; acceptor from its Haworth face; a residue bonded through its anomeric carbon is turned 180 degrees in the plane
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), pts = doc.querySelector('polyline').getAttribute('points').trim().split(' ').map(q => q.split(',').map(Number));
        const donorDown = pts[1][1] > pts[0][1]; ok(donorDown === (an === 'a'), 'donor face ' + JSON.stringify(D));
        const last = pts[pts.length - 1], prev = pts[pts.length - 2], fromAbove = prev[1] < last[1];
        let expAbove;
        if(to === 'anom') expAbove = bn === 'a';                        // turned ring: alpha points up
        else if(to === 6) expAbove = true;
        else expAbove = B.cfg[to - 2] === 'L';                          // left in Fischer = up in Haworth
        ok(fromAbove === expAbove, 'acceptor face ' + JSON.stringify(D), {fromAbove, expAbove});
        const dots = Array.from(doc.querySelectorAll('circle')).filter(c => c.getAttribute('r') === '2.6').map(c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
        const bDots = dots.filter(d => d[0] > 215), ringY = 106;
        // C-6 of the second residue: above the ring normally, below it when the ring is turned
        const c6 = B.ring === 'pyr' ? bDots[0] : bDots.find(d => Math.abs(d[0] - (to === 'anom' ? 366 : 274)) < 1);
        if(c6) ok((c6[1] > ringY) === (to === 'anom'), 'second-residue C-6 side ' + JSON.stringify(D), c6);
      }));
    })));
    out.disaccharideCombos = nDi;
    const known = [[{a: 'Glc', an: 'a', to: 4, b: 'Glc'}, 'Maltose', true], [{a: 'Gal', an: 'b', to: 4, b: 'Glc'}, 'Lactose', true], [{a: 'Glc', an: 'a', to: 'anom', b: 'Fru', bn: 'b'}, 'Sucrose', false],
      [{a: 'Fru', an: 'b', to: 'anom', b: 'Glc', bn: 'a'}, 'Sucrose', false], [{a: 'Glc', an: 'a', to: 'anom', b: 'Glc', bn: 'a'}, 'Trehalose', false], [{a: 'Glc', an: 'b', to: 6, b: 'Glc'}, 'Gentiobiose', true]];
    known.forEach(([D, name, red]) => { const K = T.disKnown(D), N = T.disName(D); ok(K && K.name === name && N.reducing === red, 'known disaccharide ' + name, {K: K && K.name, red: N.reducing}); });
    ok(!T.disKnown({a: 'Glc', an: 'b', to: 'anom', b: 'Fru', bn: 'b'}) || T.disKnown({a: 'Glc', an: 'b', to: 'anom', b: 'Fru', bn: 'b'}).name !== 'Sucrose', 'beta-Glc-beta-Fru must not be called sucrose');
    ok(!T.disKnown({a: 'Glc', an: 'a', to: 'anom', b: 'Glc', bn: 'b'}) || T.disKnown({a: 'Glc', an: 'a', to: 'anom', b: 'Glc', bn: 'b'}).name !== 'Trehalose', 'alpha,beta-trehalose must not be called trehalose');
    // ---- polysaccharide tree: nonreducing ends drawn = n + 1
    ['amylopectin', 'glycogen'].forEach(p => { for(let n = 0; n <= 14; n++){ const svg = T.treeSVG(p, n), tips = (svg.match(/fill:var\(--accent\)/g) || []).length; ok(tips === n + 1, p + ' with ' + n + ' branches draws ' + tips + ' nonreducing ends'); ok(!/NaN/.test(svg), 'tree NaN'); } });
    // ---- numbers
    out.invert = {start: T.invRot(0), end: +T.invRot(100).toFixed(2), zeroAtPct: +(66.4 / (66.4 - T.INV.f * (T.INV.glc + T.INV.fru))).toFixed(3)};
    out.muta = {eqRotationFromComposition: +(0.38 * 112 + 0.62 * 19).toFixed(1), modelEq: T.MUTA.eq, consistentFractionAlpha: +((52 - 19) / (112 - 19)).toFixed(3)};
    ok(T.nonreducingEnds(5) === 6, 'n+1 ends');
    const bp = T.branchPercent(324, 10.3); out.branchPercentExample = bp;
    ok(Math.abs(T.bambooRate(0.3) - 6944.4) < 1, 'bamboo 0.3 m/day', T.bambooRate(0.3));
    // methylation fragment
    const cnt = {end: 0, chain: 0, branch: 0}; T.MF.forEach(r => cnt[r[2]]++); ok(cnt.end === 2 && cnt.chain === 7 && cnt.branch === 1, 'methylation fragment counts', cnt);
    // glycosaminoglycan charges
    Object.keys(T.GAGS).forEach(k => ok(T.GAGCH[k][0] + T.GAGCH[k][1] === T.GAGS[k].charge, 'GAG charge sum ' + k));
    return out;
  });
}

async function lipids(page){
  return await page.evaluate(() => {
    const T = window.__T, out = {checks: 0, problems: [], notes: [], samples: {}};
    const P = (m, x) => out.problems.push(x !== undefined ? m + ' :: ' + JSON.stringify(x).slice(0, 300) : m);
    const ok = (c, m, x) => { out.checks++; if(!c) P(m, x); };
    // ---- fatty acid names, shorthand and omega for every length and many double-bond sets
    const stems = {4: 'butan', 5: 'pentan', 6: 'hexan', 7: 'heptan', 8: 'octan', 9: 'nonan', 10: 'decan', 11: 'undecan', 12: 'dodecan', 13: 'tridecan', 14: 'tetradecan', 15: 'pentadecan', 16: 'hexadecan', 17: 'heptadecan', 18: 'octadecan', 19: 'nonadecan', 20: 'eicosan', 21: 'heneicosan', 22: 'docosan', 23: 'tricosan', 24: 'tetracosan', 25: 'pentacosan', 26: 'hexacosan'};
    let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    let nFA = 0;
    for(let c = 4; c <= 26; c++){
      for(let trial = 0; trial < 300; trial++){
        const d = []; const k = Math.floor(rnd() * 7);
        for(let t = 0; t < 40 && d.length < k; t++){ const p = 2 + Math.floor(rnd() * Math.max(1, c - 3)); if(p <= c - 2 && d.indexOf(p) < 0 && d.indexOf(p - 1) < 0 && d.indexOf(p + 1) < 0) d.push(p); }
        d.sort((a, b) => a - b); nFA++;
        const sh = T.faShort(c, d, false);
        ok(sh === c + ':' + d.length + (d.length ? '(Δ' + d.join(',') + ')' : ''), 'shorthand', sh);
        ok(T.checkShort(sh, c, d).ok, 'checker rejects its own shorthand ' + sh);
        if(d.length){
          ok(T.faOmega(c, d) === c - d[d.length - 1], 'omega', [c, d]);
          ok(!T.checkShort(c + ':' + d.length + '(Δ' + d.map(x => c - x).sort((a, b) => a - b).join(',') + ')', c, d).ok || sameSet(d, d.map(x => c - x).sort((a, b) => a - b)), 'checker accepts omega-numbered positions', [c, d]);
        }
        const name = T.faSysName(c, d, []), hit = T.faFind(c, d);
        if(!hit){
          if(!d.length) ok(name === 'n-' + stems[c].charAt(0).toUpperCase() + stems[c].slice(1) + 'oic acid', 'saturated systematic name', name);
          else {
            const mult = ['', '', 'di', 'tri', 'tetra', 'penta', 'hexa'][d.length], st = stems[c].replace(/an$/, '');
            const body = st + (d.length > 1 ? 'a' + mult : '') + 'enoic acid';
            const exp = d.map(() => 'cis-').join(',') + d.join(',') + '-' + body.charAt(0).toUpperCase() + body.slice(1);
            ok(name === exp, 'unsaturated systematic name', {got: name, exp});
          }
        }
        const tn = T.faSysName(c, d, d.slice()); ok(!d.length || tn.indexOf('cis') < 0, 'trans name still says cis', tn);
        const svg = T.faSVG(c, d, {click: true}); ok(!/NaN|undefined/.test(svg), 'fatty acid drawing NaN', [c, d]);
      }
    }
    function sameSet(a, b){ return a.length === b.length && a.every((x, i) => x === b[i]); }
    out.fattyAcidCombos = nFA;
    // table entries: names from Lehninger Table 10-1 and melting point trends
    const TBL = T.FA_TABLE.map(f => ({sh: T.faShort(f.c, f.d), name: f.name, sys: T.faSysName(f.c, f.d, []), mp: f.mp, omega: T.faOmega(f.c, f.d)}));
    out.samples.table = TBL;
    const sat = T.FA_TABLE.filter(f => !f.d.length).sort((a, b) => a.c - b.c);
    ok(sat.every((f, i) => !i || f.mp > sat[i - 1].mp), 'saturated melting points rise with length');
    const c18 = T.FA_TABLE.filter(f => f.c === 18).sort((a, b) => a.d.length - b.d.length);
    ok(c18.every((f, i) => !i || f.mp < c18[i - 1].mp), '18-carbon melting points fall with each double bond', c18.map(f => f.mp));
    // known omega classes
    [[18, [9], 9], [16, [9], 7], [18, [9, 12], 6], [18, [9, 12, 15], 3], [20, [5, 8, 11, 14], 6], [20, [5, 8, 11, 14, 17], 3], [22, [4, 7, 10, 13, 16, 19], 3]].forEach(([c, d, w]) => ok(T.faOmega(c, d) === w, 'omega ' + c + ':' + d, T.faOmega(c, d)));
    // shorthand checker on common spellings
    [['18:2(Δ9,12)', true], ['18:2 (9,12)', true], ['18:2;9,12', true], ['18:2 d9,12', true], ['18:2(Δ9,Δ12)', true], ['18:2 cis,cis-9,12', true], ['18:2(Δ10,13)', false], ['18:2(Δ6,9)', false], ['18:1(Δ9)', false], ['C18:2(Δ9,12)', true], ['18:2(Δ⁹,¹²)', true]].forEach(([inp, exp]) => {
      const r = T.checkShort(inp, 18, [9, 12]); out.samples['checkShort ' + inp] = r.ok + (r.msg ? ' / ' + r.msg.slice(0, 80) : '');
      if(exp !== null) ok(r.ok === exp, 'checkShort ' + inp, r);
    });
    // ---- triacylglycerol names
    const TF = T.TAG_FAS; let nTag = 0;
    TF.forEach(a => TF.forEach(b => TF.forEach(c => { const n = T.tagName([a, b, c]); nTag++; ok(!/undefined/.test(n), 'TAG name undefined', n); ok(T.tagChiral([a, b, c]) === (a !== c), 'TAG chirality'); })));
    out.tagCombos = nTag;
    out.samples.tagNames = [T.tagName([TF[2], TF[5], TF[2]]), T.tagName([TF[2], TF[2], TF[5]]), T.tagName([TF[3], TF[6], TF[2]]), T.tagName([TF[2], TF[2], TF[2]])];
    ok(T.tagCount(2) === 6, 'TAGs from 2 fatty acids (C-1 = C-3)', T.tagCount(2));
    // ---- membrane lipid assembler: every combination
    const opts = {bb: ['gly', 'sph'], c1: ['ester', 'alkyl', 'alkenyl'], c2: ['fa', 'acetyl', 'oh'], c3: ['fa', 'p', 'sugar'], head: Object.keys(T.HEADS), sugar: ['gal', 'digal', 'sulfo'], shead: Object.keys(T.SHEADS)};
    const names = {};
    opts.bb.forEach(bb => opts.c1.forEach(c1 => opts.c2.forEach(c2 => opts.c3.forEach(c3 => opts.head.forEach(head => opts.sugar.forEach(sugar => opts.shead.forEach(shead => {
      const r = T.lipidResult({bb, c1, c2, c3, head, sugar, shead}); ok(r && r.name && !/undefined/.test(JSON.stringify(r)), 'lipidResult undefined', {bb, c1, c2, c3, head});
      const key = bb === 'sph' ? 'sph/' + shead : [c1, c2, c3, c3 === 'p' ? head : c3 === 'sugar' ? sugar : ''].join('/');
      names[key] = r.name + ' | ' + r.charge;
    })))))));
    out.samples.lipidAssembler = names;
    // expected identities
    const L = o => T.lipidResult(Object.assign({bb: 'gly', c1: 'ester', c2: 'fa', c3: 'p', head: 'cho', sugar: 'gal', shead: 'pc'}, o));
    ok(L({}).name === 'Phosphatidylcholine' && L({}).charge === '0', 'PC');
    ok(L({head: 'ser'}).charge === '−1' && L({head: 'pip2'}).charge.replace('*', '') === '−4' && L({head: 'pg'}).name === 'Cardiolipin', 'charges');
    ok(L({c1: 'alkyl', c2: 'acetyl'}).name === 'Platelet-activating factor', 'PAF');
    ok(/plasmalogen/i.test(L({c1: 'alkenyl', head: 'eth'}).name), 'plasmalogen');
    ok(/Lyso/.test(L({c2: 'oh'}).name), 'lysophospholipid');
    out.samples.oddButReal = {lysoPAF: L({c1: 'alkyl', c2: 'oh'}).name, alkylDiacylglycerol: L({c1: 'alkyl', c3: 'fa'}).name, lysoplasmalogen: L({c1: 'alkenyl', c2: 'oh'}).name, PA: L({head: 'h'}).name + ' ' + L({head: 'h'}).charge};
    ['lysoPAF', 'alkylDiacylglycerol', 'lysoplasmalogen'].forEach(k => ok(!/Not a common/.test(out.samples.oddButReal[k]), k + ' named', out.samples.oddButReal[k]));
    ok(L({c2: 'oh', c3: 'fa'}).name === 'A 1,3-diacylglycerol', '1,3-diacylglycerol', L({c2: 'oh', c3: 'fa'}).name);
    ok(L({head: 'h'}).charge === '−1*', 'phosphatidic acid -1 (Lehninger)', L({head: 'h'}).charge);
    ok(!/\(PIP/.test(L({c2: 'oh', head: 'pip2'}).name), 'lyso-PIP2 name', L({c2: 'oh', head: 'pip2'}).name);
    ok(L({c2: 'oh', head: 'pg'}).name === 'Monolysocardiolipin', 'monolysocardiolipin', L({c2: 'oh', head: 'pg'}).name);
    ok(T.FA_TABLE.every(f => !/Icosa/.test(f.sys)) && T.faSysName(20, [5, 8, 11, 14], []).indexOf('Eicosa') >= 0 && T.faSysName(20, [5, 8, 11, 14, 17], []).indexOf('Eicosa') >= 0, 'one spelling, Eicosa-');
    ok(T.LIPO[0].size === '100 to 500 nm', 'chylomicron size stated once', T.LIPO[0].size);
    // phospholipase products
    out.samples.phospholipases = {};
    Object.keys(T.PLASES).forEach(k => ['pc', 'pip2'].forEach(h => { out.samples.phospholipases[k + '/' + h] = T.PLASES[k].prod(h); }));
    // ---- beta oxidation against an independent count
    function indep(c, d){
      // passes, FADH2, NADH, acetyl, propionyl, NADPH by the textbook rules
      const passes = c % 2 ? (c - 3) / 2 : c / 2 - 1;
      const odd = d.filter(p => p % 2 === 1).length, even = d.filter(p => p % 2 === 0).length;
      return {passes, fadh2: passes - odd, nadh: passes, acetyl: c % 2 ? (c - 3) / 2 : c / 2, propionyl: c % 2 ? 1 : 0, nadph: even};
    }
    const cases = [];
    for(let c = 4; c <= 26; c++) cases.push([c, []]);
    T.BOX_PRESETS.forEach(p => cases.push([p[0], p[1]]));
    [[16, [9]], [18, [6, 9, 12]], [20, [8, 11, 14]], [22, [4, 7, 10, 13, 16, 19]], [20, [5, 8, 11, 14, 17]], [18, [9, 12, 15]], [24, [15]], [22, [13]]].forEach(x => cases.push(x));
    out.samples.betaOx = {};
    cases.forEach(([c, d]) => {
      const r = T.betaOx(c, d), e = indep(c, d), a = T.atpYield(r);
      ok(r.passes.length === e.passes && r.fadh2 === e.fadh2 && r.nadh === e.nadh && r.acetyl === e.acetyl && r.propionyl === e.propionyl && r.nadph === e.nadph, 'beta oxidation counts ' + c + ':' + d, {got: {p: r.passes.length, f: r.fadh2, n: r.nadh, a: r.acetyl, pr: r.propionyl, nadph: r.nadph}, exp: e});
      const expNet = 1.5 * e.fadh2 + 2.5 * e.nadh + 10 * e.acetyl - 2;
      ok(Math.abs(a.net - expNet) < 1e-9, 'ATP ' + c + ':' + d, {got: a.net, exp: expNet});
      out.samples.betaOx[T.faShort(c, d)] = {passes: r.passes.length, FADH2: r.fadh2, NADH: r.nadh, acetylCoA: r.acetyl, propionyl: r.propionyl, NADPH: r.nadph, netATP: a.net, netATPifNADPHcounted: a.net - 2.5 * r.nadph};
    });
    ok(T.atpYield(T.betaOx(16, [])).net === 106 && T.atpYield(T.betaOx(16, [])).gross === 108, 'palmitate 106 net, 108 gross');
    // isozyme ranges (Lehninger: VLCAD 12-18, MCAD 4-14, SCAD 4-8)
    for(let n = 4; n <= 26; n++){ const r = T.acdIsozymes(n), e = []; if(n >= 12 && n <= 18) e.push('VLCAD'); if(n >= 4 && n <= 14) e.push('MCAD'); if(n <= 8) e.push('SCAD'); ok(JSON.stringify(r) === JSON.stringify(e), 'isozymes ' + n, r); }
    // ---- fatty acid synthesis stoichiometry
    const s16 = T.faSynth(16); ok(s16.acetyl === 8 && s16.malonyl === 7 && s16.atp === 7 && s16.nadph === 14 && s16.co2 === 7 && s16.water === 6 && s16.cycles === 7, 'palmitate synthesis', s16);
    const ledger = []; for(let p = 0; p <= T.FAS_END; p++){ const k = T.fasCount(p), a = T.fasAt(p); ledger.push(Object.assign({p, cycle: a.c, step: a.st}, k)); }
    out.samples.fasLedger = ledger.filter(r => r.step === 0 || r.step === 1 || r.step === 2 || r.step === 4 || r.step === 5).slice(0, 12).concat(ledger.slice(-3));
    const end = ledger[ledger.length - 1]; ok(end.malonyl === 7 && end.nadph === 14 && end.co2 === 7 && end.cycles === 7 && end.len === 16 && end.done, 'ledger at palmitate', end);
    ledger.forEach((r, i) => { if(i){ const q = ledger[i - 1]; ok(r.malonyl >= q.malonyl && r.nadph >= q.nadph && r.co2 >= q.co2 && r.cycles >= q.cycles, 'ledger monotonic at p=' + r.p, {r, q}); } });
    ledger.forEach(r => { if(r.p){ const expN = 2 * (r.cycle - 1) + (r.step >= 2 ? 1 : 0) + (r.step >= 4 ? 1 : 0); ok(r.nadph === expN, 'NADPH at cycle ' + r.cycle + ' step ' + r.step, r); } });
    // ---- lipoproteins
    out.samples.lipo = T.LIPO.map(l => ({name: l.name, dens: l.dens, size: l.size, sum: l.comp.reduce((a, b) => a + b, 0), comp: l.comp}));
    ok(T.LIPO.map(l => l.comp[0]).every((v, i, a) => !i || v > a[i - 1]), 'protein fraction rises with density');
    ok(T.LIPO.map(l => l.comp[4]).every((v, i, a) => !i || v < a[i - 1]), 'triacylglycerol fraction falls with density');
    // ---- membrane fluidity model: directions and presets
    const F = o => T.fluidity(Object.assign({T: 37, len: 18, unsat: 50, chol: 0}, o));
    ok(F({T: 40}) > F({T: 30}), 'warmer is more fluid'); ok(F({len: 14}) > F({len: 22}), 'shorter is more fluid'); ok(F({unsat: 80}) > F({unsat: 20}), 'more unsaturated is more fluid');
    ok(Math.abs(F({chol: 50}) - 50) < Math.abs(F({chol: 0}) - 50), 'cholesterol pulls toward the middle');
    out.samples.memPresets = {};
    [['Saturated lipids only', {T: 37, len: 18, unsat: 0, chol: 0}], ['One unsaturated chain per lipid', {T: 37, len: 18, unsat: 50, chol: 0}], ['Plasma membrane', {T: 37, len: 18, unsat: 50, chol: 35}], ['A lipid raft', {T: 37, len: 22, unsat: 0, chol: 40}], ['Short chains', {T: 37, len: 12, unsat: 0, chol: 0}]].forEach(([n, o]) => {
      const f = T.fluidity(o); out.samples.memPresets[n] = {F: +f.toFixed(1), state: T.memWords(f).state.replace(/<[^>]+>/g, '')};
    });
    // the page's own presets
    T.MEM_PRESETS.forEach(([n, o]) => { const f = T.fluidity(o); out.samples.memPresets['page: ' + n] = {F: +f.toFixed(1), state: T.memWords(f).state.replace(/<[^>]+>/g, '')}; });
    const pm = T.MEM_PRESETS.find(p => p[0] === 'Plasma membrane'); ok(T.fluidity(pm[1]) >= 40 && T.fluidity(pm[1]) <= 60, 'plasma membrane preset inside the middle zone', T.fluidity(pm[1]));
    // the challenges are solvable without cholesterol
    const solv = goal => { let n = 0; for(let unsat = 0; unsat <= 100; unsat += 10) for(let len = 12; len <= 24; len += 2){ const f = T.fluidity({T: goal, len, unsat, chol: 0}); if(f >= 40 && f <= 60) n++; } return n; };
    out.samples.challengeSolutionsWithoutCholesterol = {cold10C: solv(10), hot45C: solv(45)};
    ok(solv(10) > 0 && solv(45) > 0, 'challenges solvable with cholesterol locked at 0');
    // challenge solutions that use cholesterol (bacteria make no sterols)
    const cold = []; for(let chol = 0; chol <= 50; chol += 5) for(let unsat = 0; unsat <= 100; unsat += 10) for(let len = 12; len <= 24; len += 2){ const f = T.fluidity({T: 10, len, unsat, chol}); if(f >= 40 && f <= 60 && chol > 0 && T.fluidity({T: 10, len, unsat, chol: 0}) < 40) cold.push({len, unsat, chol}); }
    out.samples.coldChallengeSolvedOnlyWithCholesterol = cold.length + ' combinations, e.g. ' + JSON.stringify(cold.slice(0, 3));
    return out;
  });
}

(async () => {
  const browser = await chromium.launch();
  const results = {};
  for(const [kind, fn] of [['carbs', carbs], ['lipids', lipids]]){
    const g = await openGuide(kind, {browser});
    const r = await fn(g.page);
    r.pageErrors = g.errors;
    results[kind] = r;
    console.log(kind, 'checks', r.checks, 'problems', r.problems.length);
    r.problems.slice(0, 30).forEach(p => console.log('   ', p));
    await g.context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'models-results.json'), JSON.stringify(results, null, 1));
  console.log(JSON.stringify({carbsLactone: results.carbs.lactoneAngles, invert: results.carbs.invert, muta: results.carbs.muta, mem: results.lipids.samples.memPresets, cold: results.lipids.samples.coldChallengeSolvedOnlyWithCholesterol}, null, 1));
})();

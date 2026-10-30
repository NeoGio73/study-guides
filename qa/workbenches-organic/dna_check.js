// Science + generator checks for biochemistry/dna-workbench.html, driven through the page UI.
// node dna_check.js  -> dna_results.json
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8905/biochemistry/dna-workbench.html';
const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
const comp = s => s.split('').map(c => COMP[c]).join('');
const rc = s => comp(s).split('').reverse().join('');
const CODON = {}; { const b = 'TCAG', aa = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG'; let k = 0; for (const x of b) for (const y of b) for (const z of b) CODON[x + y + z] = aa[k++]; }
const tr = s => { let o = ''; for (let i = 0; i + 2 < s.length; i += 3) o += CODON[s.slice(i, i + 3)]; return o; };
const HBB_PROT = 'MVHLTPEEKSAVTALWGKVNVDEVGGEALGR'; // UniProt P68871, Met + residues 1-30
const res = { checks: {}, faults: [] };
const fault = (sec, msg, ex) => res.faults.push({ sec, msg, ex });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', e => fault('page', 'pageerror', String(e)));
  await page.goto(URL); await page.waitForTimeout(800);
  const G = await page.evaluate(() => ({ GENE, HBS, MUT }));
  res.checks.texts = await page.evaluate(() => ({ exon: (document.body.innerHTML.match(/exon 1/g) || []).length, keyIdea: [...document.querySelectorAll('section[data-station="pcr"] .ideas li')][0].textContent, template: document.querySelector('section[data-station="pcr"] .bench-title').textContent, tape: document.querySelector('.tape-label').textContent }));
  if (res.checks.texts.exon) fault('gene', '"exon 1" still present', res.checks.texts.exon);
  if (!/reverse primer is the reverse complement of the top strand at the far end, so it anneals to the top strand/.test(res.checks.texts.keyIdea)) fault('pcr', 'key idea text', res.checks.texts.keyIdea);
  res.checks.gene = { len: G.GENE.length, protein: tr(G.GENE), matchesHBB: tr(G.GENE) === HBB_PROT, codon6: G.GENE.slice(18, 21), hbsCodon6: G.HBS.slice(18, 21), hbsAA6: tr(G.HBS)[6] };
  if (tr(G.GENE) !== HBB_PROT) fault('gene', 'GENE does not translate to HBB 1-30', tr(G.GENE));

  /* ---- 1 strand builder: 2000 random 12-mers ---- */
  await page.click('.rail button[data-tab="strand"]');
  const sb = await page.evaluate(() => {
    const out = { n: 0, bad: [] };
    for (let k = 0; k < 2000; k++) {
      document.querySelector('#sb-rand').click();
      const d = document.querySelector('#sb-duplex');
      const top = [...d.querySelectorAll('.nt-btn')].map(e => e.textContent).join('');
      const bot = [...d.querySelectorAll('.comp')].map(e => e.textContent).join('');
      const ends = [...d.querySelectorAll('.end')].map(e => e.textContent).join(',');
      const bonds = [...d.querySelectorAll('.bond')].map(e => e.querySelectorAll('i').length);
      const stat = [...document.querySelectorAll('#sb-stats .stat .v')].map(e => e.textContent);
      out.n++;
      out.bad.length < 5 && out.bad.push(null) && out.bad.pop();
      out.rows = out.rows || [];
      if (k < 2000) out.rows.push([top, bot, ends, bonds.join(''), stat.join('|')]);
    }
    return out;
  });
  let sbBad = 0;
  for (const [top, bot, ends, bonds, stat] of sb.rows) {
    const gc = (top.match(/[GC]/g) || []).length, hb = [...top].reduce((a, c) => a + (/[GC]/.test(c) ? 3 : 2), 0);
    const ok = bot === comp(top) && ends === "5′,3′,3′,5′" && bonds === [...top].map(c => /[GC]/.test(c) ? 3 : 2).join('') && stat === `${top.length} bp|${Math.round(100 * gc / top.length)}%|${hb}`;
    if (!ok) { sbBad++; if (sbBad < 4) fault('strand', 'complement/orientation/stat mismatch', { top, bot, ends, stat }); }
  }
  res.checks.strand = { draws: sb.rows.length, bad: sbBad };

  /* ---- 3 melting ---- */
  await page.click('.rail button[data-tab="melt"]');
  const melt = await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
    const rows = [];
    for (let g = 20; g <= 80; g += 5) for (let na = 0; na <= 100; na += 10) {
      set('mt-gc', g); set('mt-na', na); set('mt-temp', 70);
      const tm = +document.querySelector('#mt-stats .stat .v').firstChild.textContent;
      const naTxt = document.getElementById('mt-na-o').textContent;
      const nGC = [...document.querySelectorAll('#mt-ladder .mcol .hb')].filter(e => e.children.length === 3).length;
      rows.push([g, na, tm, naTxt, nGC]);
    }
    return rows;
  });
  let mBad = 0; const mEx = [];
  for (const [g, na, tm, naTxt, nGC] of melt) {
    const Na = Math.pow(10, -2 + 2 * na / 100), exp = 81.5 + 16.6 * Math.log10(Na) + 0.41 * g;
    if (Math.abs(exp - tm) > 0.06) { mBad++; mEx.push({ g, na, tm, exp }); }
    if (nGC !== Math.round(20 * g / 100) && Math.abs(nGC - 20 * g / 100) > 0.51) { mBad++; mEx.push({ g, nGC }); }
  }
  res.checks.melt = { states: melt.length, bad: mBad, ex: mEx.slice(0, 3), tmAt50GC015M: 81.5 + 16.6 * Math.log10(0.15) + 0.41 * 50, maxTm: Math.max(...melt.map(r => r[2])), minTm: Math.min(...melt.map(r => r[2])) };

  /* ---- 4 PCR: all primer positions x mistake x 4 annealing temps ---- */
  await page.click('.rail button[data-tab="pcr"]');
  const pcr = await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
    const rows = [];
    for (const mistake of [false, true]) {
      const m = document.getElementById('pcr-mistake'); if (m.checked !== mistake) { m.checked = mistake; m.dispatchEvent(new Event('change')); }
      for (let f = 1; f <= 25; f++) for (let r = 70; r <= 93; r++) for (const ta of (mistake ? [55] : [40, 52, 58, 64])) {
        set('pcr-f', f); set('pcr-r', r); set('pcr-ta', ta); set('pcr-n', 30);
        const cells = [...document.querySelectorAll('#pcr-ptbl tbody tr')].map(tr => [...tr.children].map(td => td.textContent));
        document.getElementById('pcr-run').click();
        const stats = [...document.querySelectorAll('#pcr-stats .stat .v')].map(e => e.textContent);
        const verdict = document.getElementById('pcr-verdict').textContent;
        const bands = document.querySelectorAll('#pcr-gel g').length;
        rows.push({ f, r, ta, mistake, fwd: cells[0][1], tf: cells[0][2], rev: cells[1][1], tr: cells[1][2], stats, verdict, bands });
      }
    }
    return rows;
  });
  let pBad = 0; const pEx = []; const kinds = {};
  const ptm = p => 64.9 + 41 * ((p.match(/[GC]/g) || []).length - 16.4) / p.length;
  for (const R of pcr) {
    const fwd = G.GENE.slice(R.f - 1, R.f + 19), site = G.GENE.slice(R.r - 20, R.r), rev = R.mistake ? site : rc(site);
    const len = R.r - R.f + 1;
    const errs = [];
    if (R.fwd !== fwd) errs.push('fwd seq');
    if (R.rev !== rev) errs.push('rev seq');
    if (R.tf !== ptm(fwd).toFixed(1) + '°' || R.tr !== ptm(rev).toFixed(1) + '°') errs.push('tm');
    const tmin = Math.min(ptm(fwd), ptm(rev)), d = R.ta - tmin;
    const kind = R.mistake ? 'same' : d > 5 ? 'hot' : d > 2 ? 'weak' : d >= -8 ? 'good' : 'cold';
    kinds[kind] = (kinds[kind] || 0) + 1;
    const prod = R.stats[2];
    if ((kind === 'same' || kind === 'hot') ? !prod.startsWith('—') : !prod.startsWith(String(len))) errs.push('product len ' + prod);
    const want = { same: 'No band', hot: 'No product', weak: 'Faint band', good: 'Clean product', cold: 'Extra bands' }[kind];
    if (!R.verdict.startsWith(want) && !(kind !== 'same' && kind !== 'hot' && R.verdict.startsWith('Faint band'))) errs.push('verdict ' + R.verdict.slice(0, 40));
    // does the reverse primer, written 5'->3', anneal to the top strand (i.e. equal revcomp of top strand site)?
    if (!R.mistake && rc(R.rev) !== site) errs.push('rev not complementary to top strand');
    if (errs.length) { pBad++; if (pEx.length < 5) pEx.push({ ...R, errs }); }
  }
  res.checks.pcr = { runs: pcr.length, bad: pBad, outcomeCounts: kinds, ex: pEx };
  // default settings tm values for report
  res.checks.pcr.defaults = (() => { const f = G.GENE.slice(2, 22), r = rc(G.GENE.slice(66, 86)); return { fwd: f, rev: r, tf: ptm(f).toFixed(1), tr: ptm(r).toFixed(1), len: 84 }; })();

  /* ---- 5 digest: all enzyme subsets, prediction checker and gel ---- */
  await page.click('.rail button[data-tab="digest"]');
  const SITES = await page.evaluate(() => PTEACH.sites);
  const fragsIndep = (len, cuts) => { const p = [...new Set(cuts)].sort((a, b) => a - b); if (!p.length) return []; if (p.length === 1) return [len]; const o = []; for (let i = 1; i < p.length; i++) o.push(p[i] - p[i - 1]); o.push(len - p[p.length - 1] + p[0]); return o.sort((a, b) => b - a); };
  const names = Object.keys(SITES); const dg = [];
  for (let mask = 1; mask < 16; mask++) {
    const on = names.filter((_, i) => mask & (1 << i));
    const r = await page.evaluate(async ({ on, names }) => {
      for (const n of names) { const cb = document.getElementById('dg-' + n); if (cb.checked !== on.includes(n)) { cb.checked = on.includes(n); cb.dispatchEvent(new Event('change')); } }
      return true;
    }, { on, names });
    const exp = fragsIndep(4000, on.flatMap(n => SITES[n]));
    const msgs = {};
    for (const [lab, pred] of [['exact', exp.join(', ')], ['visibleOnly', exp.filter(x => x >= 100).join(', ')], ['wrongCount', [...exp, 7].join(', ')], ['commaThousands', exp.map(x => x.toLocaleString('en-US')).join(', ')]]) {
      await page.fill('#dg-pred', pred); await page.click('#dg-check');
      msgs[lab] = await page.textContent('#dg-msg');
    }
    await page.click('#dg-run');
    const runMsg = await page.textContent('#dg-msg');
    const nBands = await page.evaluate(() => document.querySelectorAll('#dg-gel > g').length);
    const ladder = 14, uncut = 2;
    const expBands = new Set(exp.filter(x => x >= 100)).size;
    const sum = exp.reduce((a, b) => a + b, 0);
    const okRun = exp.every(x => runMsg.includes(x.toLocaleString('en-US') + ' bp')) && (nBands - ladder - uncut) === expBands;
    const okExact = msgs.exact.startsWith('Correct') && msgs.commaThousands.startsWith('Correct');
    const hasTiny = exp.some(x => x < 100);
    const okVis = hasTiny ? msgs.visibleOnly.startsWith('Almost') : msgs.visibleOnly.startsWith('Correct');
    dg.push({ on: on.join('+'), exp, sum, okRun, okExact, okVis, wrongCount: msgs.wrongCount.slice(0, 60), nBands: nBands - ladder - uncut, expBands });
    if (!okRun || !okExact || !okVis || sum !== 4000) fault('digest', 'digest check failed', dg[dg.length - 1]);
  }
  res.checks.digest = dg;
  // enzyme sites/overhangs
  const ENZ = await page.evaluate(() => ENZ);
  const REF = { EcoRI: ['GAATTC', 1, 'AATT', "5′"], BamHI: ['GGATCC', 1, 'GATC', "5′"], HindIII: ['AAGCTT', 1, 'AGCT', "5′"], PstI: ['CTGCAG', 5, 'TGCA', "3′"] };
  res.checks.enzymes = ENZ.map(e => {
    const top = e.top.replace('^', ''), cut = e.top.indexOf('^'); const R = REF[e.n];
    const botStr = e.bot.replace('^', ''), bcut = e.bot.indexOf('^');
    const okTop = top === R[0] && cut === R[1]; const okBot = botStr === comp(top) && bcut === top.length - R[1];
    const ov = cut < top.length / 2 ? top.slice(cut, top.length - cut) : top.slice(top.length - cut, cut);
    const okEnd = e.end.includes(R[3]) && e.end.includes(R[2]) && ov === R[2];
    if (!(okTop && okBot && okEnd)) fault('digest', 'enzyme site/overhang wrong', e);
    return { n: e.n, okTop, okBot, okEnd };
  });
  // mystery plasmid
  const mys = await page.evaluate(() => [...document.querySelectorAll('#mys-opts .mopt')].map((b, i) => { b.click(); return [b.getAttribute('aria-label'), b.className, document.querySelector('#mys-msg').textContent]; }));
  res.checks.mystery = mys.map(m => ({ label: m[0], right: /right/.test(m[1]), msg: m[2].slice(0, 120) }));

  /* ---- 6 cloning ---- */
  await page.click('.rail button[data-tab="clone"]');
  const cl = await page.evaluate(() => {
    const out = {};
    for (const id of ['EH', 'E', 'BH']) {
      const r = document.getElementById('cl-' + id); r.checked = true; r.dispatchEvent(new Event('change'));
      document.getElementById('cl-go').click();
      const cols = [...document.querySelectorAll('#cl-plate .colony')];
      const msgs = {};
      cols.forEach(c => { c.dispatchEvent(new MouseEvent('click', { bubbles: true })); const t = document.getElementById('cl-pick').textContent; const k = c.getAttribute('aria-label').split(' ')[0] + '|' + t.slice(0, 18); msgs[k] = (msgs[k] || 0) + 1; });
      out[id] = { n: cols.length, summary: document.getElementById('cl-lig').textContent.slice(0, 200), msgs };
    }
    return out;
  });
  res.checks.cloning = cl;
  for (const [id, v] of Object.entries(cl)) for (const k of Object.keys(v.msgs)) {
    const [colour, msg] = k.split('|');
    if (colour === 'Blue' && !msg.startsWith('Empty vector')) fault('clone', 'blue colony mislabeled', { id, k });
    if (colour === 'White' && msg.startsWith('Empty vector')) fault('clone', 'white colony called empty', { id, k });
    if (id === 'EH' && msg.startsWith('Insert backward')) fault('clone', 'directional cloning gave backward insert', { id, k });
  }

  /* ---- 7 Sanger ---- */
  await page.click('.rail button[data-tab="sanger"]');
  const READ = G.GENE.slice(9, 33);
  const sq = [];
  for (const [s, gt] of [[0, 'AS'], [1, 'SS'], [2, 'AA']]) {
    await page.click(`#sq-samples button[data-s="${s}"]`);
    const exp = READ.split('').map((b, i) => i === 10 ? (gt === 'AA' ? 'A' : gt === 'SS' ? 'T' : 'W') : b).join('');
    await page.fill('#sq-read', exp);
    const fb = await page.textContent('#sq-readfb');
    const gts = {};
    for (const g of ['AA', 'AS', 'SS']) { await page.click(`#sq-gt button[data-g="${g}"]`); gts[g] = (await page.textContent('#sq-gtfb')).slice(0, 12); }
    // gel view: lanes and order
    await page.click('#sq-view button[data-v="gel"]');
    const lanes = await page.evaluate(() => [...document.querySelectorAll('#sq-svg rect[rx="1.5"]')].map(r => [+r.getAttribute('x'), +r.getAttribute('y'), +r.getAttribute('opacity')]));
    await page.click('#sq-view button[data-v="trace"]');
    // reconstruct read from gel: lane x -> base, sort by y descending (bottom first)
    const laneOf = x => ['A', 'C', 'G', 'T'][Math.round((x + 28 - 243) / 85)];
    const byY = {}; lanes.forEach(([x, y, o]) => { (byY[y] = byY[y] || []).push(laneOf(x)); });
    const gelRead = Object.keys(byY).map(Number).sort((a, b) => b - a).map(y => byY[y].length > 1 ? 'W' : byY[y][0]).join('');
    sq.push({ gt, fb, gts, gelRead, exp, gelMatches: gelRead === exp });
    if (!fb.startsWith('All 24 bases read correctly')) fault('sanger', 'expected read not accepted', { gt, fb });
    if (gelRead !== exp) fault('sanger', 'gel ladder does not read 5′→3′ bottom-to-top', { gt, gelRead, exp });
    for (const g of ['AA', 'AS', 'SS']) if ((gts[g].startsWith('Correct')) !== (g === gt)) fault('sanger', 'genotype grading', { gt, g, fb: gts[g] });
  }
  res.checks.sanger = sq;
  // codon labels: READ starts at base 10 = codon 3
  res.checks.sanger_codon_window = { READ, codon3: G.GENE.slice(9, 12), codon10: G.GENE.slice(30, 33), het: 19 - 9 };

  /* ---- 8 CRISPR ---- */
  await page.click('.rail button[data-tab="crispr"]');
  const cr = { A: [], S: [] }; let crBad = 0;
  for (const allele of ['S', 'A']) {
    await page.click(`#cr-allele button[data-a="${allele}"]`);
    const q = allele === 'S' ? G.HBS : G.GENE;
    const nP = await page.$$eval('#cr-pams .pambtn', b => b.length);
    // independent PAM enumeration
    const indep = [];
    for (let j = 20; j + 2 < q.length; j++) if (q[j + 1] === 'G' && q[j + 2] === 'G') indep.push({ strand: '+', pam: q.slice(j, j + 3), guide: q.slice(j - 20, j).replace(/T/g, 'U'), cutAfter1based: j - 3 });
    for (let p = 0; p + 22 < q.length; p++) if (q[p] === 'C' && q[p + 1] === 'C') indep.push({ strand: '-', pam: rc(q.slice(p, p + 3)), guide: rc(q.slice(p + 3, p + 23)).replace(/T/g, 'U'), cutAfter1based: p + 6 });
    if (indep.length !== nP) fault('crispr', 'PAM count differs', { allele, page: nP, indep: indep.length });
    for (let i = 0; i < nP; i++) {
      await page.click(`#cr-pams .pambtn >> nth=${i}`);
      const g = await page.evaluate(() => ({ guide: document.querySelector('#cr-guide .guide').textContent, txt: document.querySelector('#cr-guide p').textContent, btn: document.querySelector('#cr-pams .pambtn.on').textContent }));
      const m = g.txt.match(/PAM 5′-(\w+)-3′ on the (top|bottom) strand\. Cas9 cuts between positions (\d+) and (\d+), (\d+) bp/);
      const strand = m[2] === 'top' ? '+' : '-';
      const match = indep.find(x => x.strand === strand && x.guide === g.guide && x.pam === m[1]);
      const ok = !!match && +m[3] === match.cutAfter1based && +m[4] === match.cutAfter1based + 1 && /GG$/.test(m[1]);
      // distance from cut to codon-6 middle base (1-based position 20): number of bases between cut and mutation, inclusive of the mutation
      const cutL = +m[3]; const dist = cutL >= 20 ? cutL - 20 + 1 : 20 - cutL;
      // guide must equal the protospacer on PAM strand and be complementary to the other strand
      // NHEJ: 6 variants
      await page.click('#cr-nhej');
      const nh = [];
      for (let k = 0; k < 6; k++) {
        const o = await page.evaluate(() => ({ chip: document.querySelector('#cr-out .chip').textContent, txt: document.querySelector('#cr-out p').textContent, seq: document.querySelector('#cr-out .edit-seq').textContent, chg: document.querySelectorAll('#cr-out .prot')[1].querySelectorAll('.chg').length }));
        const edited = o.seq.replace(/\[−[ACGT]+\]/, '');
        const indel = edited.length - q.length;
        const shift = indel % 3 !== 0;
        const prot = tr(edited); const stop = prot.indexOf('*');
        const says = o.txt;
        let e = '';
        if (shift !== /Frameshift/.test(says)) e += 'frame-msg ';
        if (shift && stop > 0 && !says.includes(`codon ${stop}`)) e += 'stop-index ';
        if (!shift && stop > 0) e += `in-frame indel creates stop at codon ${stop} but message says "mostly intact" `;
        if (!shift) { const before = tr(q), dd = (q.length - edited.length) / 3; let best = 1e9; for (let j = 0; j <= prot.length; j++) { let m = 0; for (let z = 0; z < prot.length; z++) if ((z < j ? before[z] : before[z + dd]) !== prot[z]) m++; best = Math.min(best, m); } if (o.chg !== best) e += `in-frame deletion highlights ${o.chg} residues, aligned mismatches ${best} `; }
        nh.push({ chip: o.chip, indel, stop, e });
        if (e) crBad++;
        await page.click('#cr-out button.btn');
      }
      // HDR
      await page.click('#cr-hdr');
      const hd = await page.evaluate(() => document.querySelector('#cr-out').textContent.slice(0, 400));
      const hdrOK = allele === 'A' ? hd.includes('No change') : dist > 10 ? hd.includes('Too far') : hd.includes('Corrected');
      const claims2bp = /only 2 bp from the mutation/.test(hd);
      if (!ok || !hdrOK) { crBad++; fault('crispr', 'PAM/guide/cut/HDR mismatch', { allele, i, g, m: m && m.slice(1), match, dist, hd: hd.slice(0, 80) }); }
      if (claims2bp && dist !== 2) fault('crispr', 'HDR text hard-codes "only 2 bp" but this cut is ' + dist + ' bp away', { allele, pam: m[1], strand: m[2], cut: m[3] });
      cr[allele].push({ pam: m[1], strand: m[2], cut: +m[3], distShown: +m[5], dist, ok, hdr: hd.slice(0, 30), claims2bp, nhej: nh.map(x => x.chip + (x.e ? ' !' + x.e : '')) });
    }
  }
  res.checks.crispr = { ...cr, bad: crBad };

  /* ---- 9 casebook + all check-yourself quizzes: click every option ---- */
  await page.click('.rail button[data-tab="cases"]');
  // MstII case: all 27 genotype combos
  const mst = await page.evaluate(() => {
    const sels = [...document.querySelectorAll('#cases .gtype select')]; const btn = [...document.querySelectorAll('#cases button')].find(b => b.textContent === 'Check genotypes');
    const out = []; const G = ['AA', 'AS', 'SS'];
    for (const a of G) for (const b of G) for (const c of G) { sels[0].value = a; sels[1].value = b; sels[2].value = c; btn.click(); out.push([a + b + c, btn.parentElement.nextSibling.textContent.slice(0, 22)]); }
    return out;
  });
  const mstOK = mst.filter(x => x[1].startsWith('All three correct')).map(x => x[0]);
  res.checks.mstII = { allThreeCorrectFor: mstOK, expected: 'ASAASS' };
  if (mstOK.length !== 1 || mstOK[0] !== 'ASAASS') fault('cases', 'MstII grading', mstOK);
  const quiz = await page.evaluate(() => {
    const out = [];
    const all = [...QUIZ.strand, ...QUIZ.helix, ...QUIZ.melt, ...QUIZ.pcr, ...QUIZ.digest, ...QUIZ.clone, ...QUIZ.sanger, ...QUIZ.crispr].map(q => ({ q: q.q, key: q.o[q.a] }));
    return all;
  });
  res.checks.quizKeys = quiz;
  await browser.close();
  fs.writeFileSync(__dirname + '/dna_results.json', JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ gene: res.checks.gene, strand: res.checks.strand, melt: res.checks.melt, pcr: { runs: res.checks.pcr.runs, bad: res.checks.pcr.bad, kinds: res.checks.pcr.outcomeCounts, ex: res.checks.pcr.ex.slice(0, 2), def: res.checks.pcr.defaults }, crisprBad: crBad, faults: res.faults.slice(0, 20) }, null, 1));
})();

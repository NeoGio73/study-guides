// Through the real page UI, at every help level: type the page's own displayed answer (and, in Guided setup,
// the blank values) into the inputs, press Check, and confirm the page says Correct. Also types one listed slip
// first and confirms its message is what appears. Captures each generated problem by wrapping the global
// makeProblem/makeLab functions. Usage: node ui-grade.js [problemsPerTabPerMode] [width]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8901/general-chemistry/';
const PAGES = ['mole-and-molar-mass-study-guide.html', 'stoichiometry-study-guide.html',
  'solution-stoichiometry-study-guide.html', 'solutions-and-gases-study-guide.html'];
const K = +(process.argv[2] || 60);
const WIDTH = +(process.argv[3] || 1280);

// Runs inside the page.
function drive(args) {
  const { tab, mode, K } = args;
  const out = { tab, mode, n: 0, ok: 0, fails: [], slipChecks: 0, slipFails: [], blankChecks: 0, blankFails: [] };
  const $ = s => document.querySelector(s);
  const txt = h => String(h).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const eNote = h => txt(String(h).replace(/\s*×\s*10<sup>([−-]?\d+)<\/sup>/g, (m, e) => 'e' + e.replace('−', '-')));
  const sig = (v, n) => { const s = Number(v).toPrecision(n); if (s.indexOf('e') < 0) return s; const [m, e] = s.split('e'); return m + 'e' + Number(e); };
  const typeFor = (p, v) => p.sf ? sig(v, p.sf) : (p.tolAbs !== undefined && p.tolRel === 0 ? Number(v).toFixed(2) : sig(v, 4));
  const submit = () => $('#ans button[type="submit"]').click();
  $('#tabs button[data-tab="' + tab + '"]').click();
  $('#view button[data-mode="' + mode + '"]').click();
  for (let i = 0; i < K; i++) {
    const P = window.__last; out.n++;
    const q = txt(P.question).slice(0, 200);
    if (mode === 'hint') { const h = $('#problem button[data-act="hint"]'); if (h) h.click(); const h2 = $('#problem button[data-act="hint"]'); if (h2) h2.click(); }
    // 1. one listed slip, typed into the first numeric part
    const pi = P.parts.findIndex(p => p.type !== 'choice' && p.errors && p.errors.length);
    if (pi >= 0 && i % 2 === 0) {
      const e = P.parts[pi].errors[i % P.parts[pi].errors.length];
      $('#pin' + pi).value = typeFor(P.parts[pi], e.value);
      submit();
      out.slipChecks++;
      const fb = $('#fb').innerText.replace(/\s+/g, ' ');
      // another listed slip with the same number may legitimately win; record only when neither shows
      const want = txt(e.msg);
      if (fb.indexOf(want.slice(0, 50)) < 0) {
        const typed = $('#pin' + pi).value;
        out.slipFails.push({ q, typed, expected: want.slice(0, 120), shown: fb.slice(0, 160) });
      }
      if (P.parts[pi].type !== 'choice') { $('#pin' + pi).value = ''; }
    }
    // 2. the displayed answers
    P.parts.forEach((p, k) => {
      if (p.type === 'choice') { const r = $('#ans input[name="p' + k + '"][value="' + p.answer + '"]'); if (r && !r.disabled) r.checked = true; }
      else { const el = $('#pin' + k); if (!el.disabled) el.value = (i % 2 ? eNote(p.show) : txt(p.show)); }
    });
    // 3. in Guided setup, the blanks (4 significant figures of the wanted value)
    if (mode === 'guided' && P.blanks) {
      Object.keys(P.blanks).forEach(k => { const el = $('#help input[data-k="' + k + '"]'); if (el) el.value = sig(P.blanks[k].want, 4); });
    }
    submit();
    const fb = $('#fb');
    if (/\bok\b/.test(fb.className)) out.ok++;
    else out.fails.push({ q, typed: P.parts.map((p, k) => p.type === 'choice' ? p.answer : ($('#pin' + k) || {}).value), fb: fb.innerText.slice(0, 200) });
    if (mode === 'guided' && P.blanks) {
      document.querySelectorAll('#help input.blank').forEach(el => {
        out.blankChecks++;
        if (!el.classList.contains('ok')) out.blankFails.push({ q, key: el.dataset.k, typed: el.value, want: P.blanks[el.dataset.k] && P.blanks[el.dataset.k].want });
      });
    }
    $('#problem button[data-act="next"]').click();
  }
  out.fails = out.fails.slice(0, 5); out.slipFails = out.slipFails.slice(0, 8); out.blankFails = out.blankFails.slice(0, 5);
  return out;
}

// Virtual titration: press the buttons to the first drop past equivalence, read the buret, type the answers.
function driveLab(args) {
  const out = { tab: 'lab', n: 0, ok: 0, fails: [], early: 0 };
  const $ = s => document.querySelector(s);
  const txt = h => String(h).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  $('#tabs button[data-tab="lab"]').click();
  for (let i = 0; i < args.K; i++) {
    const L = window.__lastLab; out.n++;
    let need = Math.ceil(L.Veq * 100 / 5 - 1e-9) * 5;
    for (const step of [500, 100, 10, 5]) while (need >= step) { $('#view button[data-add="' + step + '"]').click(); need -= step; }
    const status = $('#labstatus').innerText;
    if (!/faint pink/.test(status)) out.fails.push({ why: 'endpoint color not shown', status });
    const init = parseFloat($('.readouts b').innerText), cur = parseFloat($('#rd').innerText);
    const vDel = (cur - init).toFixed(2);
    const parts = labParts(L, Math.round((cur - init) * 100));
    $('#pin0').value = vDel; $('#pin1').value = txt(parts[1].show);
    $('#ans button[type="submit"]').click();
    const fb = $('#fb');
    if (/\bok\b/.test(fb.className)) out.ok++; else out.fails.push({ acid: L.acid.f, vDel, M: txt(parts[1].show), fb: fb.innerText.slice(0, 200) });
    if (!/excellent/.test(fb.innerText)) out.early++;
    $('#view button[data-act="next"]').click();
  }
  out.fails = out.fails.slice(0, 5);
  return out;
}

async function main() {
  const browser = await chromium.launch();
  const all = [];
  for (const pg of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message)));
    await page.goto(BASE + pg);
    await page.evaluate(() => {
      const mp = window.makeProblem; window.makeProblem = function (k, p) { const P = mp(k, p); window.__last = P; return P; };
      if (window.makeLab) { const ml = window.makeLab; window.makeLab = function (p) { const L = ml(p); window.__lastLab = L; return L; }; }
    });
    const tabs = await page.$$eval('#tabs button[data-tab]', bs => bs.map(b => b.dataset.tab).filter(t => t !== 'map'));
    const res = { page: pg, pageErrors: errs, runs: [] };
    for (const tab of tabs) {
      if (tab === 'lab') { res.runs.push(await page.evaluate(driveLab, { K })); continue; }
      for (const mode of ['guided', 'hint', 'solo']) res.runs.push(await page.evaluate(drive, { tab, mode, K }));
    }
    for (const r of res.runs) console.log(pg.replace('-study-guide.html', ''), r.tab, r.mode || '', 'n=' + r.n, 'ok=' + r.ok,
      'slipChecks=' + (r.slipChecks || 0), 'slipFails=' + ((r.slipFails || []).length), 'blankChecks=' + (r.blankChecks || 0), 'blankFails=' + ((r.blankFails || []).length));
    if (errs.length) console.log('PAGE ERRORS', errs);
    all.push(res);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(__dirname + '/results/ui-grade.json', JSON.stringify(all, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });

// Independent checker for the glycolysis study guide generators.
// Reference data below is written from scratch (Lehninger values given by the instructor), not copied from the page.
'use strict';
const P = require('./page.js');
const N = Number(process.argv[2] || 5000);

const R = 8.315; // J/(mol K)
const strip = s => String(s == null ? '' : s).replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const toNum = s => { // parse a displayed value like "−1.23 × 10^−5" or "+4.5 kJ/mol"
  s = strip(s).replace(/[−–]/g, '-').replace(/kJ\/mol|ATP/g, '').trim();
  const m = s.match(/^([+-]?\d*\.?\d+)(?:\s*×\s*10\^([+-]?\d+))?/);
  if (!m) return NaN;
  return Number(m[1]) * Math.pow(10, m[2] ? Number(m[2]) : 0);
};

// ---------- my reference tables ----------
const INTER = ['glucose', 'glucose 6-phosphate', 'fructose 6-phosphate', 'fructose 1,6-bisphosphate', 'glyceraldehyde 3-phosphate',
  '1,3-bisphosphoglycerate', '3-phosphoglycerate', '2-phosphoglycerate', 'phosphoenolpyruvate', 'pyruvate'];
const REF = {
  1: { enz: 'hexokinase', s: 'glucose', p: ['glucose 6-phosphate'], type: 'phosphoryl transfer from ATP', car: 'ATP is consumed', irr: true, dG: -16.7 },
  2: { enz: 'phosphohexose isomerase', s: 'glucose 6-phosphate', p: ['fructose 6-phosphate'], type: 'isomerization', car: 'none of these', irr: false, dG: 1.7 },
  3: { enz: 'phosphofructokinase-1', s: 'fructose 6-phosphate', p: ['fructose 1,6-bisphosphate'], type: 'phosphoryl transfer from ATP', car: 'ATP is consumed', irr: true, dG: -14.2 },
  4: { enz: 'aldolase', s: 'fructose 1,6-bisphosphate', p: ['dihydroxyacetone phosphate', 'glyceraldehyde 3-phosphate'], type: 'aldol cleavage', car: 'none of these', irr: false, dG: 23.8 },
  5: { enz: 'triose phosphate isomerase', s: 'dihydroxyacetone phosphate', p: ['glyceraldehyde 3-phosphate'], type: 'isomerization', car: 'none of these', irr: false, dG: 7.5 },
  6: { enz: 'glyceraldehyde 3-phosphate dehydrogenase', s: 'glyceraldehyde 3-phosphate', p: ['1,3-bisphosphoglycerate'], type: 'oxidation coupled to phosphorylation', car: 'NADH is produced', irr: false, dG: 6.3 },
  7: { enz: 'phosphoglycerate kinase', s: '1,3-bisphosphoglycerate', p: ['3-phosphoglycerate'], type: 'phosphoryl transfer to ADP', car: 'ATP is produced', irr: false, dG: -18.5 },
  8: { enz: 'phosphoglycerate mutase', s: '3-phosphoglycerate', p: ['2-phosphoglycerate'], type: 'phosphoryl shift within the molecule', car: 'none of these', irr: false, dG: 4.4 },
  9: { enz: 'enolase', s: '2-phosphoglycerate', p: ['phosphoenolpyruvate'], type: 'dehydration', car: 'none of these', irr: false, dG: 7.5 },
  10: { enz: 'pyruvate kinase', s: 'phosphoenolpyruvate', p: ['pyruvate'], type: 'phosphoryl transfer to ADP', car: 'ATP is produced', irr: true, dG: -31.4 },
};
const ENZORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => REF[n].enz);
const byEnz = e => Object.keys(REF).map(Number).find(n => REF[n].enz === e);

// Fischer projections from my own knowledge: rows top to bottom. ['L','R'] for a stereocentre/side groups, or 'TERM' text.
// Text tokens the page's SVG emits per row: terminal => [label(,P)], else ['C', left, right(,P)].
const FISCH = {
  'glucose': [['H', '=O'], ['H', 'OH'], ['HO', 'H'], ['H', 'OH'], ['H', 'OH'], 'CH2OH'],
  'glucose 6-phosphate': [['H', '=O'], ['H', 'OH'], ['HO', 'H'], ['H', 'OH'], ['H', 'OH'], 'CH2OP'],
  'fructose 6-phosphate': ['CH2OH', [null, '=O'], ['HO', 'H'], ['H', 'OH'], ['H', 'OH'], 'CH2OP'],
  'fructose 1,6-bisphosphate': ['CH2OP', [null, '=O'], ['HO', 'H'], ['H', 'OH'], ['H', 'OH'], 'CH2OP'],
  'dihydroxyacetone phosphate': ['CH2OP', [null, '=O'], 'CH2OH'],
  'glyceraldehyde 3-phosphate': [['H', '=O'], ['H', 'OH'], 'CH2OP'],
  '1,3-bisphosphoglycerate': [['O=', 'OP'], ['H', 'OH'], 'CH2OP'],
  '3-phosphoglycerate': [['O=', 'O-'], ['H', 'OH'], 'CH2OP'],
  '2-phosphoglycerate': [['O=', 'O-'], ['H', 'OP'], 'CH2OH'],
  'phosphoenolpyruvate': [['O=', 'O-'], [null, 'OP', 'db'], 'CH2'],
  'pyruvate': [['O=', 'O-'], [null, '=O'], 'CH3'],
};
function expectTokens(name, flip) {
  const rows = FISCH[name].slice(); if (flip) rows.reverse();
  const out = [];
  const g = s => { // group text => tokens
    s = s.replace('=', '');
    const hasP = /P$/.test(s) && s !== 'P';
    const t = hasP ? s.slice(0, -1) : s;
    out.push(t.replace(/2/g, '₂').replace(/3/g, '₃').replace('O-', 'O⁻'));
    if (hasP) out.push('P');
  };
  rows.forEach(r => {
    if (typeof r === 'string') { g(r); return; }
    out.push('C');
    if (r[0]) out.push(r[0].replace('=', ''));
    if (r[1]) g(r[1]);
  });
  return out.join('|');
}
const SAYR = { 'CH2OH': 'CH₂OH', 'CH2OP': 'CH₂O–phosphate', 'CH2': 'CH₂', 'CH3': 'CH₃', 'O=': 'double-bonded O', '=O': 'double-bonded O', 'OP': 'O–phosphate', 'O-': 'O⁻', 'HO': 'OH', 'H': 'H', 'OH': 'OH' };
function expectDesc(name, flip) {
  const rows = FISCH[name].slice(); if (flip) rows.reverse(); const n = rows.length;
  return 'Fischer projection, top to bottom: ' + rows.map((r, i) => {
    const c = flip ? n - i : i + 1;
    if (typeof r === 'string') return 'C-' + c + ': ' + SAYR[r];
    const t = [r[0] ? SAYR[r[0]] + ' on the left' : '', r[1] ? SAYR[r[1]] + ' on the right' : ''].filter(Boolean).join(', ') + (r[2] === 'db' ? ', double bond to C-' + (flip ? c - 1 : c + 1) : '');
    return 'C-' + c + ': ' + t;
  }).join('; ') + '.';
}
function numAt(svg, cy) { const re = /<text x="[\d.]+" y="([\d.]+)" font-size="11" text-anchor="end"[^>]*>(\d)<\/text>/g; let m; while ((m = re.exec(svg))) if (Math.abs(Number(m[1]) - (cy + 5)) < 0.01) return Number(m[2]); return null; }
function checkSvgLabels(kind, Pb) {
  const html = [Pb.figure, Pb.guided, (Pb.hints || []).join(''), Pb.solution].join('');
  svgList(html).forEach(svg => {
    const lab = (svg.match(/aria-label="([^"]*)"/) || [])[1] || '';
    const id = identify(svg)[0];
    if (!id) { fault(kind, 'unidentifiable structure SVG', Pb); return; }
    const flip = / \(flipped\)$/.test(id), nm = id.replace(' (flipped)', '');
    const want = expectDesc(nm, flip);
    if (lab.indexOf(want) < 0) fault(kind, 'aria-label does not describe ' + id + ': ' + lab.slice(0, 160) + ' || want ' + want, Pb);
    const circ = (svg.match(/<circle cx="[\d.]+" cy="([\d.]+)" r="12"/g) || []).map(c => Number(c.match(/cy="([\d.]+)"/)[1]));
    circ.forEach(cy => { const k = numAt(svg, cy); if (k != null && lab.indexOf('Highlighted: C-' + k) < 0) fault(kind, 'highlight not in aria-label', Pb); });
    note('svg labels checked', 1);
  });
}
// tokens of an SVG emitted by the page (text elements only, excluding carbon numbers and captions)
function svgList(html) { return (String(html).match(/<svg[\s\S]*?<\/svg>/g) || []); }
function svgTokens(svg) {
  const t = []; const re = /<text([^>]*)>([^<]*)<\/text>/g; let m;
  while ((m = re.exec(svg))) { if (/font-size="11"/.test(m[1])) continue; t.push(m[2]); }
  return t.join('|');
}
function identify(svg) { // which molecule does this SVG draw?
  const tok = svgTokens(svg);
  const hits = [];
  for (const nm of Object.keys(FISCH)) { if (expectTokens(nm) === tok) hits.push(nm); if (expectTokens(nm, true) === tok) hits.push(nm + ' (flipped)'); }
  return hits;
}

// Energy entries (per molecule): inv, made, nadh
const ENTRYREF = [
  [/^glucose$/, 2, 4, 2], [/^glucose 6-phosphate$/, 1, 4, 2], [/^fructose 1,6-bisphosphate$/, 0, 4, 2],
  [/^glyceraldehyde 3-phosphate$/, 0, 2, 1], [/^dihydroxyacetone phosphate$/, 0, 2, 1],
  [/glycogen by phosphorolysis/, 1, 4, 2], [/^fructose in muscle/, 2, 4, 2], [/^galactose$/, 2, 4, 2], [/^mannose$/, 2, 4, 2], [/^glycerol$/, 1, 2, 2]
];
// Free-energy stoichiometry for Q (products / reactants), using the page's short names in the prompt
const QREF = {
  1: [['G6P', 'ADP'], ['glucose', 'ATP']], 2: [['F6P'], ['G6P']], 3: [['F1,6BP', 'ADP'], ['F6P', 'ATP']], 4: [['DHAP', 'G3P'], ['F1,6BP']],
  5: [['G3P'], ['DHAP']], 7: [['3-PG', 'ATP'], ['1,3-BPG', 'ADP']], 8: [['2-PG'], ['3-PG']], 9: [['PEP'], ['2-PG']], 10: [['pyruvate', 'ATP'], ['PEP', 'ADP']]
};
const SUMREF = { 'step 1 of glycolysis': [13.8, -30.5, -16.7], 'step 3 of glycolysis': [16.3, -30.5, -14.2], 'step 10 of glycolysis': [-61.9, 30.5, -31.4], 'the combined reaction of steps 6 and 7': [6.3, -18.5, -12.2] };

const REGREF = [ // [enz regex, signal regex, effect, kinds accepted]
  [/^phosphofructokinase-1$/, /ATP/, 'inhibits', ['allosteric']],
  [/^phosphofructokinase-1$/, /AMP/, 'activates', ['allosteric']],
  [/^phosphofructokinase-1$/, /ADP/, 'activates', ['allosteric']],
  [/^phosphofructokinase-1$/, /citrate/, 'inhibits', ['allosteric']],
  [/^phosphofructokinase-1$/, /2,6-bisphosphate/, 'activates', ['allosteric']],
  [/^phosphofructokinase-1$/, /alanine/, 'has no direct effect', ['no regulation']],
  [/^hexokinase in muscle$/, /glucose 6-phosphate/, 'inhibits', ['product inhibition', 'allosteric']],
  [/^hexokinase in muscle$/, /citrate/, 'has no direct effect', ['no regulation']],
  [/glucokinase/, /glucose 6-phosphate/, 'has no direct effect', ['no regulation']],
  [/^pyruvate kinase$/, /1,6-bisphosphate/, 'activates', ['feedforward']],
  [/^pyruvate kinase$/, /ATP/, 'inhibits', ['allosteric', 'product inhibition']],
  [/^pyruvate kinase$/, /alanine/, 'inhibits', ['allosteric']],
  [/^pyruvate kinase$/, /acetyl-CoA/, 'inhibits', ['allosteric']],
  [/^pyruvate kinase in the liver$/, /glucagon/, 'inhibits', ['covalent']],
];
const FATEREF = [[/sprint/, 'lactate', /^lactate dehydrogenase$/], [/red blood cell/, 'lactate', /^lactate dehydrogenase$/],
  [/yeast/, 'ethanol and CO₂', /pyruvate decarboxylase.*alcohol dehydrogenase/], [/heart/, 'acetyl-CoA and CO₂', /pyruvate dehydrogenase/],
  [/liver cell under aerobic/, 'acetyl-CoA and CO₂', /pyruvate dehydrogenase/]];
const FQREF = [[/convert pyruvate to lactate or ethanol/, /NAD⁺/], [/net change in NAD/, /^None/], [/pyruvate decarboxylase need/, /Thiamine pyrophosphate/],
  [/released as CO₂/, /^C-3 and C-4/], [/ferments glucose to lactate/, /net of 2 ATP/], [/reduces pyruvate to lactate/, /^Lactate dehydrogenase, using NADH/]];
const MECHQREF = [ // question regex -> correct answer regex (my own expectations)
  [/close around glucose/, /keeps water out/], [/true substrate/, /^MgATP/], [/intermediate in the reaction catalyzed by phosphohexose/, /enediol/i],
  [/kind of catalysis does phosphohexose/, /acid-base/], [/hydroxyl of fructose 6-phosphate is phosphorylated/, /C-1/], [/committed step/, /no fate other than glycolysis/],
  [/covalent intermediate forms between aldolase/, /Schiff base/], [/Schiff base help break/, /electron sink/], [/leaves aldolase first/, /^Glyceraldehyde 3-phosphate/],
  [/same kind of intermediate/, /enediol/i], [/CH₂O-phosphate carbon is C-1/, /^C-3/], [/after the oxidation/, /thioester/], [/phosphoryl group added in this step come from/, /Inorganic phosphate/],
  [/Iodoacetate/, /Cys/], [/thioester rather than/, /keeps the energy/], [/substrate-level phosphorylation\. What/, /directly from a substrate to ADP/],
  [/Which phosphoryl group of 1,3-bisphosphoglycerate/, /C-1/], [/intermediate in the phosphoglycerate mutase/, /^2,3-Bisphosphoglycerate/],
  [/same one that was on C-3/, /^No\. The one on C-2 came from the enzyme/], [/enolase reaction accomplish/, /high phosphoryl group transfer potential/],
  [/role of Mg²⁺ in enolase/, /enolate/], [/Fluoride inhibits/, /Mg²⁺/], [/so strongly favorable/, /enol/], [/ions does pyruvate kinase need/, /K⁺ and Mg²⁺/]];
const MECHSEQ = { // keywords that must appear in this order
  1: [/induced fit/, /MgATP/, /attacks the γ-phosph/, /released/],
  2: [/ring .*opens/, /removes the proton from C-2/, /enediol/, /returned to C-1/, /ring closes/],
  4: [/Schiff base/, /C-3 and C-4 breaks/, /enamine is protonated/, /hydrolyzes/],
  6: [/thiohemiacetal/, /hydride/i, /NADH leaves/, /phosphate attacks/, /released/],
  8: [/already attached to an active-site His/, /from the His to the hydroxyl on C-2/, /2,3-Bisphosphoglycerate/, /C-3 is transferred to the same His/, /released/],
  9: [/Mg²⁺ ions bind/, /Lys .*removes the proton from C-2/, /enolate/, /Glu donates a proton to the hydroxyl on C-3/, /released/]
};
const BLOCKREF = [[/^Iodoacetate/, 'glyceraldehyde 3-phosphate dehydrogenase', /glyceraldehyde 3-phosphate.*dihydroxyacetone phosphate.*fructose 1,6-bisphosphate/, '−2'],
  [/^Fluoride/, 'enolase', /2-phosphoglycerate and 3-phosphoglycerate/, '0'], [/^Arsenate/, 'glyceraldehyde 3-phosphate dehydrogenase', /nothing builds up/, '0'],
  [/phosphofructokinase-1 that does not work/, 'phosphofructokinase-1', /glucose 6-phosphate and fructose 6-phosphate/, '−1'],
  [/pyruvate kinase with very low/, 'pyruvate kinase', /phosphoenolpyruvate/, '0'], [/triose phosphate isomerase with very low/, 'triose phosphate isomerase', /^dihydroxyacetone phosphate$/, '0'],
  [/2-deoxyglucose/, 'phosphohexose isomerase', /2-deoxyglucose 6-phosphate/, '−1']];
const CARBREF = [[/glucose does hexokinase/, 6, 6], [/fructose 6-phosphate does phosphofructokinase/, 1, 6], [/C-3 and which other/, 4, 6], [/oxidized by glyceraldehyde/, 1, 3],
  [/transferred to ADP/, 1, 3], [/product of phosphoglycerate mutase/, 2, 3], [/loses its hydroxyl/, 3, 3], [/carries the carbonyl/, 2, 6]];
const CHANGEREF = { 1: /added to C-6/, 2: /from C-1 to C-2/, 3: /added to C-1/, 4: /C-3 and C-4/, 5: /ketone became an aldehyde/, 6: /oxidized/, 7: /on C-1 was removed/, 8: /now on C-2/, 9: /water was removed/, 10: /on C-2 was removed/ };

// ---------- bookkeeping ----------
const faults = {}; const counts = {}; const notes = {};
function fault(kind, msg, P) { const k = kind + ': ' + msg; if (!faults[k]) faults[k] = { n: 0, ex: P ? strip(P.question).slice(0, 220) : '' }; faults[k].n++; }
function note(k, v) { (notes[k] = notes[k] || []).push(v); }

function genericChecks(kind, Pb) {
  checkSvgLabels(kind, Pb);
  const txt = [Pb.ctx, Pb.question, Pb.figure, Pb.guided, (Pb.hints || []).join(''), Pb.solution].concat(Pb.parts.map(p => (p.label || '') + '|' + (p.options || []).join('|') + '|' + (p.show || '')));
  const all = txt.join(' ');
  if (/NaN|Infinity|undefined|\bnull\b|\[object/.test(all)) fault(kind, 'NaN/Infinity/undefined in text: ' + (all.match(/.{30}(NaN|Infinity|undefined|\bnull\b|\[object).{30}/) || [''])[0], Pb);
  if (!strip(Pb.question)) fault(kind, 'empty prompt', Pb);
  if (!Pb.parts || !Pb.parts.length) fault(kind, 'no parts', Pb);
  if (!(Pb.hints && Pb.hints.length === 2)) fault(kind, 'hints length ' + (Pb.hints || []).length, Pb);
  Pb.parts.forEach((p, i) => {
    if (p.type === 'choice') {
      const o = p.options;
      if (new Set(o).size !== o.length) fault(kind, 'duplicate options: ' + o.join(' / '), Pb);
      if (o.filter(x => x === p.answer).length !== 1) fault(kind, 'answer not exactly once in options', Pb);
      (p.also || []).forEach(a => { if (o.indexOf(a) < 0) fault(kind, 'also-answer not in options', Pb); });
      if (P.gradePart(p, p.answer).status !== 'correct') fault(kind, 'checker rejects own answer', Pb);
      o.forEach(x => { if (x !== p.answer && !(p.also || []).includes(x)) { const g = P.gradePart(p, x); if (g.status !== 'wrong' || !g.msg) fault(kind, 'checker does not reject wrong option / no message', Pb); } });
      if (o.length < 2) fault(kind, 'fewer than 2 options', Pb);
    } else if (p.type === 'seq') {
      if (p.items.length !== p.answer.length || p.items.slice().sort().join() !== p.answer.slice().sort().join()) fault(kind, 'seq items not a permutation', Pb);
      if (p.items.every((x, j) => x === p.answer[j])) fault(kind, 'seq already in order', Pb);
      if (new Set(p.answer).size !== p.answer.length) fault(kind, 'seq duplicate items', Pb);
      if (P.gradePart(p, p.answer).status !== 'correct') fault(kind, 'seq checker rejects own answer', Pb);
      if (P.gradePart(p, p.items).status === 'correct') fault(kind, 'seq checker accepts scrambled', Pb);
    } else if (p.type === 'num') {
      if (!isFinite(p.answer)) fault(kind, 'non-finite numeric answer', Pb);
      if (P.gradePart(p, String(p.answer)).status !== 'correct') fault(kind, 'checker rejects own exact answer', Pb);
      const shown = toNum(p.show);
      if (!isFinite(shown)) fault(kind, 'show string not numeric: ' + p.show, Pb);
      else if (P.gradePart(p, String(shown)).status !== 'correct') fault(kind, 'checker rejects its own displayed answer "' + strip(p.show) + '" (ans ' + p.answer + ')', Pb);
      const tol = Math.max((p.tolRel === undefined ? 0.01 : p.tolRel) * Math.abs(p.answer), p.tolAbs || 0);
      const wrongs = [p.answer + 4 * tol + 1e-9, p.answer - 4 * tol - 1e-9, p.answer * 1.25 + (p.answer >= 0 ? 1 : -1), p.answer === 0 ? 5 : p.answer * 0.7];
      wrongs.forEach(w => { const g = P.gradePart(p, String(w)); if (g.status === 'correct') fault(kind, 'checker accepts clearly wrong value (' + p.label + ')', Pb); });
      // tolerance relative to display precision
      note('tol/|ans| ' + kind + ' ' + p.label.slice(0, 20), tol / Math.max(Math.abs(p.answer), 1e-12));
      if (p.answer !== 0 && Math.abs(p.answer) > 0.5 && P.gradePart(p, String(-p.answer)).status === 'correct') fault(kind, 'checker accepts sign-flipped answer', Pb);
      (p.errors || []).forEach(e => { if (!isFinite(e.value)) fault(kind, 'non-finite error value', Pb); });
      if (P.gradePart(p, 'abc').status !== 'invalid') fault(kind, 'non-number not flagged invalid', Pb);
    } else fault(kind, 'unknown part type ' + p.type, Pb);
  });
}
const ansOf = (Pb, re) => { const p = Pb.parts.find(x => re.test(x.label)); return p; };

function checkOne(kind, Pb) {
  counts[kind] = (counts[kind] || 0) + 1;
  genericChecks(kind, Pb);
  const q = strip(Pb.question);
  if (kind === 'order') {
    const p = Pb.parts[0];
    if (p.type === 'seq') {
      const list = /intermediate/.test(p.label) ? INTER : ENZORDER;
      const sorted = p.items.slice().sort((a, b) => list.indexOf(a) - list.indexOf(b));
      if (sorted.some(x => list.indexOf(x) < 0)) fault(kind, 'seq item not in reference list', Pb);
      const st = list.indexOf(sorted[0]);
      if (sorted.some((x, j) => list.indexOf(x) !== st + j)) fault(kind, 'seq items not consecutive', Pb);
      if (sorted.join('|') !== p.answer.join('|')) fault(kind, 'seq answer differs from reference order', Pb);
      // does the guided clue list them in the answer order?
      const clueOrder = (Pb.guided.match(/<li><b>([^<:]+):<\/b>/g) || []).map(s => s.replace(/<li><b>|:<\/b>/g, ''));
      if (clueOrder.join('|') === p.answer.join('|')) fault(kind, 'guided clue lists items in answer order', Pb);
      if (clueOrder.slice().sort().join('|') !== p.answer.slice().sort().join('|')) fault(kind, 'guided clue items differ from the question items', Pb);
      return;
    }
    let exp; let m;
    if ((m = q.match(/immediately after (.+) on the way/))) exp = INTER[INTER.indexOf(m[1]) + 1];
    else if ((m = q.match(/immediately before (.+)\?/))) exp = INTER[INTER.indexOf(m[1]) - 1];
    else if ((m = q.match(/product of the (.+?) reaction/))) { const n = byEnz(m[1]); exp = REF[n].p[REF[n].p.length - 1]; if (/other than/.test(q) && p.options.includes('dihydroxyacetone phosphate')) fault(kind, 'aldolase: DHAP offered as option', Pb); if (!/other than/.test(q) && REF[n].p.length > 1) fault(kind, 'two-product step without exclusion', Pb); }
    else if ((m = q.match(/substrate of (.+)\?/))) exp = REF[byEnz(m[1])].s;
    else fault(kind, 'unparsed order question: ' + q, Pb);
    if (exp !== p.answer) fault(kind, 'order answer ' + p.answer + ' != expected ' + exp, Pb);
    // second correct option?  e.g. "before G3P" would also allow DHAP
    return;
  }
  if (kind === 'enzyme') {
    const [sTxt, pTxt] = q.split(' → ');
    const s = sTxt.charAt(0).toLowerCase() + sTxt.slice(1);
    const n = Object.keys(REF).map(Number).find(k => REF[k].s === s && REF[k].p.join(' + ') === pTxt);
    if (!n) { fault(kind, 'cannot identify step from ' + q, Pb); return; }
    const r = REF[n];
    if (ansOf(Pb, /Which enzyme/).answer !== r.enz) fault(kind, 'enzyme wrong step ' + n, Pb);
    if (ansOf(Pb, /type of reaction/).answer !== r.type) fault(kind, 'type wrong step ' + n, Pb);
    if (ansOf(Pb, /ATP or NADH/).answer !== r.car) fault(kind, 'carrier wrong step ' + n, Pb);
    if (ansOf(Pb, /irreversible/).answer !== (r.irr ? 'yes' : 'no')) fault(kind, 'irreversibility wrong step ' + n, Pb);
    if (!new RegExp('ΔG′° = ' + (r.dG > 0 ? '\\+' : '−') + Math.abs(r.dG).toFixed(1)).test(strip(Pb.solution))) fault(kind, 'solution ΔG′° mismatch step ' + n, Pb);
    // figure molecules
    const ids = svgList(Pb.guided).map(identify);
    const want = [r.s].concat(r.p);
    const got = ids.map(h => (h[0] || '?').replace(' (flipped)', ''));
    if (got.join('|') !== want.join('|')) fault(kind, 'guided figure molecules ' + got.join(',') + ' != ' + want.join(','), Pb);
    return;
  }
  if (kind === 'structure') {
    const p0 = Pb.parts[0];
    if (/Which intermediate is this/.test(p0.label)) {
      const ids = identify(svgList(Pb.figure)[0]);
      if (ids.indexOf(p0.answer) < 0) fault(kind, 'figure does not match answer ' + p0.answer + ' (looks like ' + ids.join(',') + ')', Pb);
      if (/Structure of|<text[^>]*font-size="11"[^>]*>[a-zA-Z]/.test(Pb.figure.replace(/aria-label="[^"]*"/, '')) || new RegExp('aria-label="[^"]*' + p0.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(Pb.figure)) fault(kind, 'identify figure leaks the name', Pb);
      // ambiguity: does another option draw the same?
      return;
    }
    if (/What changed/.test(p0.label)) {
      const ids = svgList(Pb.figure).map(identify).map(h => (h[0] || '?').replace(' (flipped)', ''));
      const n = Object.keys(REF).map(Number).find(k => [REF[k].s].concat(REF[k].p).join('|') === ids.join('|'));
      if (!n) { fault(kind, 'change figure not a step: ' + ids.join(','), Pb); return; }
      if (!CHANGEREF[n].test(p0.answer)) fault(kind, 'change answer wrong for step ' + n + ': ' + p0.answer, Pb);
      if (p0.options.filter(o => CHANGEREF[n].test(o)).length !== 1) fault(kind, 'change: >1 option matches step ' + n, Pb);
      if (Pb.parts[1].answer !== REF[n].enz) fault(kind, 'change enzyme wrong step ' + n, Pb);
      if (/aria-label="Structure"/.test(Pb.figure)) fault(kind, 'change figure alt is just "Structure"', Pb);
      return;
    }
    const c = CARBREF.find(x => x[0].test(q));
    if (!c) { fault(kind, 'unparsed carbon q ' + q, Pb); return; }
    if (p0.answer !== 'C-' + c[1]) fault(kind, 'carbon answer ' + p0.answer + ' expected C-' + c[1], Pb);
    if (p0.options.length !== c[2]) fault(kind, 'carbon options count ' + p0.options.length, Pb);
    return;
  }
  if (kind === 'mechanism') {
    const p = Pb.parts[0];
    const n = Number((Pb.ctx.match(/^Step (\d+)/) || [])[1]);
    if (!REF[n] || !new RegExp(REF[n].enz).test(strip(Pb.ctx + ' ' + p.label + ' ' + Pb.question + ' ' + Pb.solution))) { /* ok */ }
    if (p.type === 'seq') {
      const kw = MECHSEQ[n];
      if (!kw) { fault(kind, 'unexpected seq for step ' + n, Pb); return; }
      if (kw.length !== p.answer.length) fault(kind, 'seq length mismatch step ' + n, Pb);
      kw.forEach((re, j) => { if (!re.test(p.answer[j])) fault(kind, 'mechanism step ' + n + ' event ' + (j + 1) + ' unexpected: ' + p.answer[j], Pb); });
    } else {
      const ref = MECHQREF.find(x => x[0].test(q));
      if (!ref) { fault(kind, 'unmapped mech question ' + q, Pb); return; }
      if (!ref[1].test(p.answer)) fault(kind, 'mech answer unexpected: ' + p.answer, Pb);
      if (p.options.filter(o => ref[1].test(o)).length > 1) note('mechanism: more than one option matches my answer key for: ' + q + ' :: ' + p.options.filter(o => ref[1].test(o)).join(' || '), 1);
    }
    // the reaction figure must be the right step
    const ids = svgList(Pb.figure).map(identify).map(h => (h[0] || '?').replace(' (flipped)', ''));
    if (ids.join('|') !== [REF[n].s].concat(REF[n].p).join('|')) fault(kind, 'mechanism figure mismatch step ' + n, Pb);
    return;
  }
  if (kind === 'energy') {
    const m = q.match(/^(\d+) molecules of (.+?) are converted/);
    const n = Number(m[1]); const e = ENTRYREF.find(x => x[0].test(m[2]));
    if (!e) { fault(kind, 'unknown entry ' + m[2], Pb); return; }
    const want = { 'ATP invested': n * e[1], 'ATP produced': n * e[2], 'Net ATP': n * (e[2] - e[1]), 'NADH produced': n * e[3] };
    Pb.parts.forEach(p => { if (want[p.label] !== p.answer) fault(kind, p.label + ' ' + p.answer + ' != ' + want[p.label] + ' for ' + m[2], Pb); });
    const B = Pb.blanks; if (B.i.want !== e[1] || B.m.want !== e[2] || B.h.want !== e[3]) fault(kind, 'guided blanks wrong for ' + m[2], Pb);
    return;
  }
  if (kind === 'free') {
    if (/Add these two reactions/.test(q)) {
      const key = (q.match(/to get (.+?)\.$/) || [])[1];
      if (/^step/.test(key) && !/thermodynamic bookkeeping/.test(Pb.ctx)) fault(kind, 'kinase sum without bookkeeping sentence', Pb);
      if (/together/.test(q)) fault(kind, 'old wording', Pb);
      const ref = SUMREF[key]; if (!ref) { fault(kind, 'unknown sum ' + key, Pb); return; }
      const vals = (strip(Pb.figure).match(/ΔG′° = ([+−]\d+\.\d) kJ\/mol/g) || []).map(s => toNum(s.replace('ΔG′° = ', '')));
      if (Math.abs(vals[0] - ref[0]) > 1e-9 || Math.abs(vals[1] - ref[1]) > 1e-9) fault(kind, 'sum component values ' + vals + ' differ from reference ' + ref, Pb);
      const p = Pb.parts[0];
      if (Math.abs(p.answer - (ref[0] + ref[1])) > 1e-9) fault(kind, 'sum answer wrong', Pb);
      if (Math.abs(ref[0] + ref[1] - ref[2]) > 1e-9) fault(kind, 'sum does not equal step value', Pb);
      if (Pb.parts[1].answer !== ((ref[0] + ref[1]) < 0 ? 'yes' : 'no')) fault(kind, 'favorable wrong', Pb);
      return;
    }
    const n = Number((Pb.ctx.match(/^Step (\d+)/) || [])[1]); const r = REF[n];
    const dgStated = toNum((q.match(/ΔG′° = ([+−]\d+\.\d) kJ\/mol/) || [])[1]);
    if (Math.abs(dgStated - r.dG) > 1e-9) fault(kind, 'stated ΔG′° ' + dgStated + ' for step ' + n + ' differs from reference ' + r.dG, Pb);
    if (/equilibrium constant/.test(q)) {
      if (!/25 °C \(298 K\)/.test(q)) fault(kind, 'Keq: temperature not stated', Pb);
      const K = Math.exp(-r.dG * 1000 / (R * 298));
      const p = Pb.parts[0];
      if (Math.abs(p.answer / K - 1) > 0.02) fault(kind, 'Keq answer far from exact (' + p.answer + ' vs ' + K + ')', Pb);
      if (P.gradePart(p, String(K)).status !== 'correct') fault(kind, 'Keq: exact-RT answer rejected', Pb);
      { const sol = strip(Pb.solution).replace(/−/g, '-');
        const mm = sol.match(/÷ 2\.48 = (-?[\d.]+) K′eq = e\^(-?[\d.]+) = ([\d.]+(?: × 10\^-?\d+)?)/);
        if (!mm) fault(kind, 'Keq solution not parsed: ' + sol.slice(0, 120), Pb);
        else { const x = Number((-r.dG / 2.48).toFixed(2)); const shownK = toNum(mm[3]);
          if (Number(mm[1]) !== x || Number(mm[2]) !== x) fault(kind, 'Keq exponent line does not reproduce: ' + mm[1] + ' vs ' + x, Pb);
          if (Number(Math.exp(x).toPrecision(2)) !== Number(shownK.toPrecision(2))) fault(kind, 'Keq K line does not reproduce', Pb);
          if (Math.abs(toNum(p.show) - shownK) > 1e-12 * Math.abs(shownK)) fault(kind, 'Keq show differs from solution', Pb); } }
      // student path: RT=2.48 rounded, answer to 2 and 3 s.f.
      const Ks = Math.exp(-r.dG / 2.48);
      [2, 3].forEach(sf => { const v = Number(Ks.toPrecision(sf)); if (P.gradePart(p, String(v)).status !== 'correct') fault(kind, 'Keq: student value with RT=2.48 to ' + sf + ' s.f. (' + v + ') rejected, step ' + n, Pb); });
      const Kx = Number(K.toPrecision(2)); if (P.gradePart(p, String(Kx)).status !== 'correct') fault(kind, 'Keq 2 s.f. exact rejected', Pb);
      if (Pb.parts[1].answer !== (K > 1 ? 'products' : 'reactants')) fault(kind, 'Keq side wrong', Pb);
      if (Math.abs(Pb.blanks.x.want - (-r.dG * 1000 / (R * 298))) > 0.02 * Math.abs(r.dG * 1000 / (R * 298))) fault(kind, 'Keq blank wrong', Pb);
      note('keq step', n);
      return;
    }
    // ΔG = ΔG'° + RT ln Q at 37 °C
    if (!/37 °C/.test(q) || !/T = 310 K/.test(q) || !/R = 8\.315/.test(q)) fault(kind, 'temperature/R not stated', Pb);
    const conc = {}; const re = /\[([^\]]+)\] = ([\d.]+(?:e[+-]?\d+)?) µM/g; let m;
    while ((m = re.exec(q))) conc[m[1]] = Number(m[2]);
    const st = QREF[n]; if (!st) { fault(kind, 'unexpected step for ΔG problem ' + n, Pb); return; }
    const need = st[0].concat(st[1]);
    if (need.some(k => !(conc[k] > 0))) { fault(kind, 'missing/invalid concentration for ' + need.filter(k => !(conc[k] > 0)).join(','), Pb); return; }
    if (Object.keys(conc).length !== need.length) fault(kind, 'extra concentrations given: ' + Object.keys(conc).join(','), Pb);
    const M = k => conc[k] * 1e-6; // mol/L
    const Q = st[0].reduce((a, k) => a * M(k), 1) / st[1].reduce((a, k) => a * M(k), 1);
    const RT = R * 310 / 1000;
    const dG = r.dG + RT * Math.log(Q);
    const pQ = Pb.parts[0], pG = Pb.parts[1], pD = Pb.parts[2];
    if (Math.abs(pQ.answer / Q - 1) > 1e-9) fault(kind, 'Q wrong step ' + n + ': page ' + pQ.answer + ' mine ' + Q, Pb);
    note('|page ΔG − exact ΔG|', Math.abs(pG.answer - dG));
    if (Math.abs(pG.answer - dG) > 0.1) fault(kind, 'ΔG far from exact step ' + n + ': page ' + pG.answer + ' mine ' + dG, Pb);
    { const ex = Number(dG.toFixed(1)); if (P.gradePart(pG, String(ex)).status !== 'correct') fault(kind, 'exact-RT student ΔG rejected (' + ex + ' vs page ' + pG.answer + ')', Pb); }
    if (pD.answer !== (dG < 0 ? 'forward, toward the products' : 'reverse, toward the reactants')) fault(kind, 'direction wrong', Pb);
    if (Math.abs(toNum(pQ.show) / Q - 1) > 0.006) fault(kind, 'Q display not 3 s.f. of answer', Pb);
    if (toNum(pG.show) !== Number(pG.answer.toFixed(1)) || Math.abs(toNum(pG.show) - dG) > 0.1) fault(kind, 'ΔG display mismatch', Pb);
    // student path: RT=2.58, Q rounded to 3 s.f., ΔG rounded to 1 dp
    const Qs = Number(Q.toPrecision(3)); const dGs = Number((r.dG + 2.58 * Math.log(Qs)).toFixed(1));
    if (P.gradePart(pQ, String(Qs)).status !== 'correct') fault(kind, 'student Q to 3 s.f. rejected', Pb);
    if (P.gradePart(pG, String(dGs)).status !== 'correct') fault(kind, 'student ΔG with RT = 2.58 and Q to 3 s.f. rejected (' + dGs + ' vs ' + dG.toFixed(2) + ')', Pb);
    // student who ignores the µM→M conversion in a 1:1 or 2:2 ratio gets the same; in the split case must be flagged
    if (n === 4) { const Qbad = Q * 1e6; if (P.gradePart(pQ, String(Qbad)).status === 'correct') fault(kind, 'split: µM Q accepted', Pb); }
    // guided blank
    if (Math.abs(Pb.blanks.rt.want - RT * Math.log(Q)) > 0.1) fault(kind, 'RT ln Q blank wrong', Pb);
    // solution consistency: "2.58 kJ/mol × ln(Q) = X" — does 2.58 × ln(shown Q) reproduce X to 2 dp?
    const sol = strip(Pb.solution);
    const mm = sol.match(/RT ln Q\. 2\.58 kJ\/mol × ln\(([^)]+)\) = ([+−][\d.]+) kJ\/mol/);
    if (!mm) fault(kind, 'ΔG solution not parsed', Pb);
    else { const shownQ = toNum(mm[1]), shownX = toNum(mm[2]);
      if (Number((2.58 * Math.log(shownQ)).toFixed(2)) !== shownX) fault(kind, 'RT ln Q line does not reproduce: 2.58×ln(' + shownQ + ') vs ' + shownX, Pb);
      const fin = sol.match(/\) = ([+−][\d.]+) kJ\/mol Negative|\) = ([+−][\d.]+) kJ\/mol Positive/);
      const f = toNum(fin ? (fin[1] || fin[2]) : 'x');
      if (Number((r.dG + shownX).toFixed(1)) !== f) fault(kind, 'final ΔG line does not reproduce: ' + r.dG + ' + ' + shownX + ' vs ' + f, Pb);
      if (toNum(pG.show) !== f) fault(kind, 'ΔG show differs from solution', Pb); }
    // plausibility
    need.forEach(k => { note('conc ' + k, conc[k]); if (conc[k] < 0.05 || conc[k] > 20000) fault(kind, 'implausible concentration ' + k + ' = ' + conc[k] + ' µM', Pb); });
    note('dG step ' + n, dG);
    return;
  }
  if (kind === 'regulation') {
    const m = q.match(/^How does (.+) affect (.+)\?$/);
    const ref = REGREF.find(x => x[0].test(m[2]) && x[1].test(m[1]));
    if (!ref) { fault(kind, 'unmapped regulation ' + q, Pb); return; }
    if (Pb.parts[0].answer !== ref[2]) fault(kind, 'effect wrong: ' + q + ' page ' + Pb.parts[0].answer, Pb);
    const kp = Pb.parts[1]; const accepted = [kp.answer].concat(kp.also || []);
    ref[3].forEach(k => { if (!accepted.some(a => a.indexOf(k) >= 0)) fault(kind, 'kind not accepted: ' + k + ' for ' + q, Pb); });
    accepted.forEach(a => { if (!ref[3].some(k => a.indexOf(k) >= 0)) fault(kind, 'extra kind accepted: ' + a + ' for ' + q, Pb); });
    return;
  }
  if (kind === 'fates') {
    const p0 = Pb.parts[0];
    if (/^What happens to pyruvate in/.test(q)) {
      const f = FATEREF.find(x => x[0].test(q));
      if (p0.answer !== f[1]) fault(kind, 'fate product wrong ' + q, Pb);
      if (!f[2].test(Pb.parts[1].answer)) fault(kind, 'fate enzyme wrong ' + q, Pb);
      if (f[1] === 'acetyl-CoA and CO₂') { const st = strip(Pb.solution); if (!/pyruvate \+ CoA \+ NAD⁺ → acetyl-CoA \+ CO₂ \+ NADH/.test(st) || !/TPP/.test(st) || !/lipoate/.test(st) || !/FAD/.test(st)) fault(kind, 'PDH reaction/cofactors missing', Pb); else note('fates: PDH line shown', 1); }
      return;
    }
    const m = q.match(/^(\d+) molecules of glucose are fermented to (ethanol|lactate)/);
    if (m) {
      const n = Number(m[1]), y = m[2] === 'ethanol';
      const want = y ? { 'Ethanol produced': 2 * n, 'CO₂ released': 2 * n, 'Net ATP': 2 * n, 'Net NADH': 0 } : { 'Lactate produced': 2 * n, 'Net ATP': 2 * n, 'Net NADH': 0 };
      if (Pb.parts.length !== Object.keys(want).length) fault(kind, 'count parts', Pb);
      Pb.parts.forEach(p => { if (want[p.label] !== p.answer) fault(kind, 'count ' + p.label + ' ' + p.answer, Pb); });
      return;
    }
    const ref = FQREF.find(x => x[0].test(q));
    if (!ref) { fault(kind, 'unmapped fates q ' + q, Pb); return; }
    if (!ref[1].test(p0.answer)) fault(kind, 'fates why answer ' + p0.answer, Pb);
    return;
  }
  if (kind === 'tracer') {
    const c = Number(q.match(/C-(\d) of glucose/)[1]);
    const tri = c <= 3 ? 'dihydroxyacetone phosphate' : 'glyceraldehyde 3-phosphate';
    const pos = [3, 4].includes(c) ? 0 : [2, 5].includes(c) ? 1 : 2;
    if (Pb.parts[0].answer !== tri) fault(kind, 'triose wrong c=' + c, Pb);
    if (!new RegExp(['^C-1, the carboxyl', '^C-2, the carbonyl', '^C-3, the methyl'][pos]).test(Pb.parts[1].answer)) fault(kind, 'pyruvate position wrong c=' + c, Pb);
    if (Pb.parts[2]) {
      const a = Pb.parts[2].answer;
      if (/lactate/.test(Pb.parts[2].label) && !new RegExp(['^C-1, the carboxyl', '^C-2, the carbon that carries the hydroxyl', '^C-3, the methyl'][pos]).test(a)) fault(kind, 'lactate pos wrong c=' + c, Pb);
      if (/Yeast/.test(Pb.parts[2].label) && !new RegExp(['^CO₂', 'CH₂OH', 'CH₃'][pos]).test(a)) fault(kind, 'ethanol pos wrong c=' + c, Pb);
    }
    // highlighted carbon in figure is c
    const svg = svgList(Pb.figure)[0]; const hi = (svg.match(/fill="#ffd591"/g) || []).length; if (hi !== 1) fault(kind, 'tracer figure highlight count ' + hi, Pb);
    // solution trace figure: check highlights per molecule
    const sv = svgList(Pb.solution);
    sv.forEach(s => {
      const nm = (identify(s)[0] || '?');
      const ys = []; const re = /<circle cx="[\d.]+" cy="([\d.]+)" r="12" fill="#ffd591"/g; let mm; while ((mm = re.exec(s))) ys.push(Number(mm[1]));
      const row = ys.length === 1 ? numAt(s, ys[0]) - 1 : -1;
      const myRow = { 'glucose': c - 1, 'fructose 1,6-bisphosphate': c - 1, 'dihydroxyacetone phosphate': c - 1, 'glyceraldehyde 3-phosphate': c >= 4 ? c - 4 : 3 - c, 'pyruvate': pos }[nm];
      if (myRow === undefined) fault(kind, 'unknown molecule in trace figure', Pb); else if (row !== myRow) fault(kind, 'trace figure highlight wrong row in ' + nm + ' c=' + c + ' (page row ' + row + ', expected ' + myRow + ')', Pb);
    });
    return;
  }
  if (kind === 'block') {
    const ref = BLOCKREF.find(x => x[0].test(q));
    if (!ref) { fault(kind, 'unmapped block ' + q, Pb); return; }
    if (Pb.parts[0].answer !== ref[1]) fault(kind, 'block enzyme wrong ' + q, Pb);
    if (!ref[2].test(Pb.parts[1].answer)) fault(kind, 'block buildup wrong ' + q, Pb);
    if (Pb.parts[2].answer !== ref[3]) fault(kind, 'block ATP wrong ' + q + ' page ' + Pb.parts[2].answer, Pb);
    if (/2-deoxyglucose/.test(q)) { const st = strip(Pb.solution); if (/G6P|F6P|glucose →/.test(st.replace('2-deoxyglucose →', '')) || !/2-deoxyglucose 6-phosphate/.test(st)) fault(kind, '2-DG strip names wrong species: ' + st.slice(-120), Pb); }
    // a distractor for buildup that is also true?
    return;
  }
}

const KINDS = ['order', 'enzyme', 'structure', 'mechanism', 'energy', 'free', 'regulation', 'fates', 'tracer', 'block'];
const typeCount = {};
for (const kind of KINDS) {
  let prev = null;
  for (let i = 0; i < N; i++) {
    let Pb;
    try { Pb = P.makeProblem(kind, prev); } catch (e) { fault(kind, 'generator threw: ' + e.message); continue; }
    const tk = kind + ':' + (Pb.type || (Pb.parts[0] && Pb.parts[0].type)) + (kind === 'mechanism' ? ':' + Pb.parts[0].type : '');
    typeCount[tk] = (typeCount[tk] || 0) + 1;
    try { checkOne(kind, Pb); } catch (e) { fault(kind, 'checker threw: ' + e.message + ' ' + e.stack.split('\n')[1], Pb); }
    prev = Pb;
  }
}
console.log('draws per generator:', N);
console.log('counts', counts);
console.log('subtypes', typeCount);
console.log('\nFAULTS:'); Object.keys(faults).forEach(k => console.log(' [' + faults[k].n + '] ' + k + (faults[k].ex ? '\n      e.g. ' + faults[k].ex : '')));
console.log('\nNOTES:');
Object.keys(notes).forEach(k => { const v = notes[k]; if (typeof v[0] === 'number') { const s = v.slice().sort((a, b) => a - b); console.log(' ' + k + ': n=' + v.length + ' min=' + s[0].toFixed(3) + ' max=' + s[s.length - 1].toFixed(3)); } else console.log(' ' + k + ': ' + v.length); });

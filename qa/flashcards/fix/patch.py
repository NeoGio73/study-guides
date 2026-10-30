"""Apply the approved fixes to the two flashcard decks (in place)."""
import json, re, sys

BASE = '/path/to/study-guides/organic-chemistry/flashcards/'

def sub1(s, old, new, label):
    n = s.count(old)
    assert n == 1, f'{label}: expected 1 occurrence, found {n}'
    return s.replace(old, new)

CODE = [
    # light-theme text colours for review / known (>= 4.5:1 on desk and surface)
    ('--accent:#2F5D8C; --known:#2F8063; --review:#C47A1C; --new:#B9B1A2;',
     '--accent:#2F5D8C; --known:#21664D; --review:#8A5010; --new:#B9B1A2;', 'light tokens'),
    ('.grade.dim{opacity:.35}', '.grade.dim{opacity:.75}', 'grade dim'),
    ('color:var(--ink-soft);opacity:.7}', 'color:var(--ink-soft);opacity:.85}', 'side label'),
    ('.wrap{max-width:820px;margin:0 auto;padding:22px 16px 40px}',
     '.wrap{max-width:820px;margin:0 auto;padding:22px 16px 40px;overflow-x:clip}', 'wrap clip'),
    ('<main class="stage" id="stage" aria-live="polite"></main>',
     '<main class="stage" id="stage"></main>\n  <div class="sr" id="live" aria-live="polite"></div>', 'live region'),
    ("const stage = $('#stage');", "const stage = $('#stage');\nconst live = $('#live');", 'live const'),
    ("""sel.innerHTML = '<option value="all">All sections ('+DATA.cards.length+' cards)</option>' +
  DATA.sections.map(([k,n]) => `<option value="${k}">${n} (${DATA.cards.filter(c=>c.sec===k).length})</option>`).join('');
sel.value = store.prefs.sec;""",
     """function fillSec(){
  const cs = DATA.cards.filter(c => store.prefs.enrich||!c.enrich);
  sel.innerHTML = '<option value="all">All sections ('+cs.length+' cards)</option>' +
    DATA.sections.map(([k,n]) => `<option value="${k}">${n} (${cs.filter(c=>c.sec===k).length})</option>`).join('');
  sel.value = store.prefs.sec;
}
fillSec();""", 'section counts'),
    ("$('#enrich').onclick = () => { store.prefs.enrich = !store.prefs.enrich; save(); syncToolbar(); build(); };",
     "$('#enrich').onclick = () => { store.prefs.enrich = !store.prefs.enrich; save(); syncToolbar(); fillSec(); build(); };", 'enrich refill'),
    ('<figure class="mol" role="img" aria-label="${m.name}">', '<figure class="mol" role="img" aria-label="${it[3]||m.name}">', 'alt override'),
    ('<div class="qbox" aria-label="product to predict">?</div>', '<div class="qbox" role="img" aria-label="product to predict">?</div>', 'qbox role'),
    ("""<div class="body${c.sf.length?'':' textonly'}"><div class="prompt">""",
     """<div class="body${c.sf.length?'':' textonly'}" id="q-${c.id}"><div class="prompt">""", 'front body id'),
    ("""<div class="body${c.sb.length||c.model?'':' textonly'}"><div class="answer">""",
     """<div class="body${c.sb.length||c.model?'':' textonly'}" id="a-${c.id}"><div class="answer">""", 'back body id'),
    ("""    el.className = 'card'; el.tabIndex = 0; el.setAttribute('role','button');
    el.innerHTML = cardHTML(c);
    el.setAttribute('aria-label', `Card ${idx+1} of ${list.length}, question side. Press Space to flip.`);""",
     """    el.className = 'card'; el.tabIndex = 0; el.setAttribute('role','group'); el.setAttribute('aria-roledescription','flashcard');
    el.innerHTML = cardHTML(c);
    el.setAttribute('aria-label', `Card ${idx+1} of ${list.length}, question side`);
    el.setAttribute('aria-describedby', 'q-'+c.id);""", 'card role'),
    ("""  $('#flip').disabled = idx>=list.length;
  updateGrade();
}""",
     """  $('#flip').disabled = idx>=list.length;
  updateGrade();
  if(list.length && idx<list.length) announce(`Card ${idx+1} of ${list.length}. Question: ${faceText(el.querySelector('.front .body'))}`);
  else announce(el.querySelector('h2').textContent+'. '+el.querySelector('.stats').textContent);
}""", 'announce on render'),
    ("""function current(){ return stage.querySelector('.card:not(.leaving)'); }""",
     """function current(){ return stage.querySelector('.card:not(.leaving)'); }
function faceText(b){
  const c = b.cloneNode(true);
  c.querySelectorAll('[role=img]').forEach(f => f.replaceWith(' '+f.getAttribute('aria-label')+' '));
  c.querySelectorAll('.arr').forEach(a => { const l = [...a.querySelectorAll('.lbl')].map(x=>x.textContent.trim()).filter(Boolean).join(', '); a.replaceWith(l ? ` (arrow: ${l}) ` : ' (arrow) '); });
  return c.textContent.replace(/\\s+/g,' ').trim();
}
function announce(t){ live.textContent = ''; setTimeout(() => { live.textContent = t; }, 60); }""", 'faceText'),
    ("""  el.setAttribute('aria-label', `Card ${idx+1} of ${list.length}, ${flipped?'answer':'question'} side.`);""",
     """  el.setAttribute('aria-label', `Card ${idx+1} of ${list.length}, ${flipped?'answer':'question'} side`);
  el.setAttribute('aria-describedby', (flipped?'a-':'q-')+list[idx].id);
  announce((flipped?'Answer: ':'Question: ')+faceText(el.querySelector(flipped?'.back .body':'.front .body')));""", 'flip announce'),
    ('<b style="color:#2F8063">', '<b style="color:#21664D">', 'end card known'),
    ('<b style="color:#C47A1C">', '<b style="color:#8A5010">', 'end card review'),
]

def patch(fn, edit_data):
    s = open(BASE + fn).read()
    i = s.find('const DATA = ') + len('const DATA = '); j = s.find('\n', i)
    line = s[i:j]; assert line.endswith(';')
    d = json.loads(line[:-1])
    assert json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';' == line
    edit_data(d)
    s = s[:i] + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';' + s[j:]
    for old, new, label in CODE:
        s = sub1(s, old, new, f'{fn} {label}')
    open(BASE + fn, 'w').write(s)
    print('patched', fn)

def card(d, cid):
    return next(c for c in d['cards'] if c['id'] == cid)

def edit08(d):
    c = card(d, 'c049')
    old = '<b>I<sub>2</sub></b> addition is endothermic:'
    assert old in c['back']
    c['back'] = c['back'].replace(old, '<b>I<sub>2</sub></b> addition is thermodynamically unfavorable and readily reversible:')
    regen = json.load(open('/path/to/study-guides/qa/flashcards/fix/regen08.json'))
    assert set(regen) == set(d['mols'])
    for k, svg in regen.items():
        old_svg = d['mols'][k]['svg']
        assert svg.split('width=')[0] == old_svg.split('width=')[0], k   # same header style
        d['mols'][k]['svg'] = svg

def edit09(d):
    c = card(d, 'c022')
    assert c['note'] == 'Acetone: over 99% keto. Cyclohexanone: about 98.8% keto, 1.2% enol.'
    c['note'] = 'Cyclohexanone contains only about 0.0001% of its enol tautomer at room temperature; acetone contains even less.'
    c = card(d, 'c031')
    old = 'deactivated (“poisoned”) with <b>quinoline</b>.'
    assert old in c['back']
    c['back'] = c['back'].replace(old, 'deactivated (“poisoned”) with <b>lead acetate</b> and <b>quinoline</b>.')
    alts = {'c004': ('pentyne2', 'Alkyne to name, condensed formula CH₃C≡CCH₂CH₃'),
            'c005': ('mp2', 'Alkyne to name, condensed formula CH₃C≡CCH(CH₃)₂'),
            'c006': ('dmh', 'Alkyne to name, condensed formula (CH₃)₂CHC≡CCH(CH₃)₂')}
    for cid, (key, alt) in alts.items():
        c = card(d, cid)
        assert c['sf'] == [['m', key, False]]
        c['sf'] = [['m', key, False, alt]]

if __name__ == '__main__':
    patch('ch08-alkenes.html', edit08)
    patch('ch09-alkynes.html', edit09)

import re, math, json, sys, random
from playwright.sync_api import sync_playwright

URL = 'file:///path/to/study-guides/biochemistry/glycolysis-study-guide.html'
OUT = '/path/to/study-guides/qa/glycolysis/'
NPROB = int(sys.argv[1]) if len(sys.argv) > 1 else 6
random.seed(7)

INTER = ['glucose', 'glucose 6-phosphate', 'fructose 6-phosphate', 'fructose 1,6-bisphosphate', 'glyceraldehyde 3-phosphate',
         '1,3-bisphosphoglycerate', '3-phosphoglycerate', '2-phosphoglycerate', 'phosphoenolpyruvate', 'pyruvate']
ENZ = ['hexokinase', 'phosphohexose isomerase', 'phosphofructokinase-1', 'aldolase', 'triose phosphate isomerase',
       'glyceraldehyde 3-phosphate dehydrogenase', 'phosphoglycerate kinase', 'phosphoglycerate mutase', 'enolase', 'pyruvate kinase']
CO = [0, 3, 0, 3, 3, 2, 1, 3, 3, 1]
DG = {1: -16.7, 2: 1.7, 3: -14.2, 4: 23.8, 5: 7.5, 6: 6.3, 7: -18.5, 8: 4.4, 9: 7.5, 10: -31.4}
QREF = {1: (['G6P', 'ADP'], ['glucose', 'ATP']), 2: (['F6P'], ['G6P']), 3: (['F1,6BP', 'ADP'], ['F6P', 'ATP']), 4: (['DHAP', 'G3P'], ['F1,6BP']),
        5: (['G3P'], ['DHAP']), 7: (['3-PG', 'ATP'], ['1,3-BPG', 'ADP']), 8: (['2-PG'], ['3-PG']), 9: (['PEP'], ['2-PG']), 10: (['pyruvate', 'ATP'], ['PEP', 'ADP'])}
ENTRY = [(r'^glucose$', 2, 4, 2), (r'^glucose 6-phosphate$', 1, 4, 2), (r'^fructose 1,6-bisphosphate$', 0, 4, 2), (r'^glyceraldehyde 3-phosphate$', 0, 2, 1),
         (r'^dihydroxyacetone phosphate$', 0, 2, 1), (r'glycogen', 1, 4, 2), (r'^fructose in muscle', 2, 4, 2), (r'^galactose$', 2, 4, 2), (r'^mannose$', 2, 4, 2), (r'^glycerol$', 1, 2, 2)]
MECHSEQ = {
    1: [r'induced fit', r'MgATP', r'attacks the γ-phosph', r'released'],
    2: [r'ring .*opens', r'removes the proton from C-2', r'enediol', r'returned to C-1', r'ring closes'],
    4: [r'^The carbonyl on C-2', r'C-3 and C-4 breaks', r'enamine is protonated', r'hydrolyzes'],
    6: [r'thiohemiacetal', r'(?i)hydride', r'NADH leaves', r'phosphate attacks', r'released'],
    8: [r'already attached to an active-site His', r'from the His to the hydroxyl on C-2', r'2,3-Bisphosphoglycerate', r'C-3 is transferred to the same His', r'released'],
    9: [r'Mg²⁺ ions bind', r'Lys .*removes the proton from C-2', r'enolate', r'Glu donates a proton to the hydroxyl on C-3', r'released']}

def num(s):
    s = s.replace('−', '-')
    return float(s)

log = {'errors': [], 'overflow': [], 'clip': [], 'svg_overlap': [], 'stuck': [], 'focus': [], 'misc': []}

def check_layout(pg, where):
    r = pg.evaluate("""() => {
      const out={docW:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth, wide:[], clip:[]};
      const W=window.innerWidth;
      document.querySelectorAll('#view *, #tabs *').forEach(el=>{
        const b=el.getBoundingClientRect(); if(!b.width) return;
        if(b.right>W+0.5 || b.left<-0.5) out.wide.push((el.tagName+'.'+el.className.baseVal!==undefined?el.tagName:el.tagName+'.'+el.className)+' '+Math.round(b.left)+'..'+Math.round(b.right)+' '+(el.textContent||'').slice(0,40));
        if(['BUTTON','LABEL','SPAN','TD','TH','P','B','SMALL'].includes(el.tagName)){
          const cs=getComputedStyle(el);
          if((cs.overflow!=='visible' || cs.textOverflow==='ellipsis') && el.scrollWidth>el.clientWidth+1) out.clip.push(el.tagName+'.'+el.className+' '+(el.textContent||'').slice(0,40));
        }
      });
      // sibling overlap among step cards, tabs, options, enzyme buttons
      const groups=['#tabs button','.pstep','.opt span','.enzbtn','.seg button','.paths .btn','.seq li','.actions .btn'];
      out.overlap=[];
      groups.forEach(sel=>{ const els=[...document.querySelectorAll(sel)].filter(e=>e.offsetParent); for(let i=0;i<els.length;i++) for(let j=i+1;j<els.length;j++){
        const a=els[i].getBoundingClientRect(), c=els[j].getBoundingClientRect();
        const ox=Math.min(a.right,c.right)-Math.max(a.left,c.left), oy=Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top);
        if(ox>1 && oy>1) out.overlap.push(sel+' '+els[i].textContent.slice(0,25)+' / '+els[j].textContent.slice(0,25)); } });
      // text overlap inside Fischer SVGs
      out.svg=[];
      document.querySelectorAll('svg.fis').forEach(svg=>{
        const ts=[...svg.querySelectorAll('text')].map(t=>({t:t.textContent, b:t.getBBox()}));
        for(let i=0;i<ts.length;i++) for(let j=i+1;j<ts.length;j++){
          const a=ts[i].b, c=ts[j].b;
          const ox=Math.min(a.x+a.width,c.x+c.width)-Math.max(a.x,c.x), oy=Math.min(a.y+a.height,c.y+c.height)-Math.max(a.y,c.y);
          if(ox>1.5 && oy>3) out.svg.push(svg.getAttribute('aria-label')+': "'+ts[i].t+'" overlaps "'+ts[j].t+'" ('+ox.toFixed(1)+'x'+oy.toFixed(1)+')');
        }
        const vb=svg.viewBox.baseVal; ts.forEach(x=>{ if(x.b.x<-0.5||x.b.x+x.b.width>vb.width+0.5) out.svg.push(svg.getAttribute('aria-label')+': "'+x.t+'" outside viewBox ('+x.b.x.toFixed(1)+'..'+(x.b.x+x.b.width).toFixed(1)+' of '+vb.width+')'); });
      });
      return out;}""")
    if r['docW'] > r['cw']: log['overflow'].append(f"{where}: page scrollWidth {r['docW']} > {r['cw']}")
    for w in r['wide'][:3]: log['overflow'].append(f"{where}: element beyond viewport: {w}")
    for c in r['clip'][:3]: log['clip'].append(f"{where}: {c}")
    for o in r['overlap'][:3]: log['clip'].append(f"{where}: overlap {o}")
    for s in r['svg']: log['svg_overlap'].append(s)

def problem_info(pg):
    return pg.evaluate("""() => {
      const P=document.querySelector('#problem'); if(!P) return null;
      const parts=[...document.querySelectorAll('#ans ol.parts > li, #ans .ansrow')].map((li,i)=>{
        if(li.classList.contains('ansrow')) return {type:'num', label:li.querySelector('label').textContent, i:0};
        const lab=li.querySelector('.plab').textContent;
        if(li.querySelector('ol.seq')) return {type:'seq', label:lab, items:[...li.querySelectorAll('.seqtxt')].map(x=>x.textContent)};
        if(li.querySelector('.choice')) return {type:'choice', label:lab, options:[...li.querySelectorAll('.opt span')].map(x=>x.textContent)};
        return {type:'num', label:lab};
      });
      return {ctx:(P.querySelector('.ctx')||{}).textContent, q:(P.querySelector('.q')||{}).textContent,
              rxns:[...P.querySelectorAll('.rxns div')].map(d=>d.textContent), parts};
    }""")

def solve_num(info, label):
    q, ctx = info['q'], info['ctx'] or ''
    m = re.match(r'(\d+) molecules of (.+?) are converted', q)
    if m:
        n = int(m.group(1)); e = next(x for x in ENTRY if re.search(x[0], m.group(2)))
        return {'ATP invested': n*e[1], 'ATP produced': n*e[2], 'Net ATP': n*(e[2]-e[1]), 'NADH produced': n*e[3]}[label]
    m = re.match(r'(\d+) molecules of glucose are fermented', q)
    if m:
        n = int(m.group(1)); return {'Ethanol produced': 2*n, 'CO₂ released': 2*n, 'Lactate produced': 2*n, 'Net ATP': 2*n, 'Net NADH': 0}[label]
    if 'Add these two reactions' in q:
        vals = [num(re.search(r'= ([+−]\d+\.\d)', r).group(1)) for r in info['rxns'][:2]]
        return round(vals[0]+vals[1], 1)
    n = int(re.match(r'Step (\d+)', ctx).group(1))
    if 'equilibrium constant' in q:
        return float('%.3g' % math.exp(-DG[n]*1000/(8.315*298)))
    conc = {k: float(v) for k, v in re.findall(r'\[([^\]]+)\] = ([\d.]+) µM', q)}
    top, bot = QREF[n]
    Q = 1.0
    for k in top: Q *= conc[k]*1e-6
    for k in bot: Q /= conc[k]*1e-6
    if label.startswith('Q'): return float('%.3g' % Q)
    return round(DG[n] + 8.315*310/1000*math.log(Q), 1)

def seq_answer(info, part):
    items = part['items']
    if 'intermediate' in part['label']: return sorted(items, key=INTER.index)
    if 'enzymes' in part['label'] and 'mechanism' not in part['label']: return sorted(items, key=ENZ.index)
    n = int(re.match(r'Step (\d+)', info['ctx']).group(1))
    kw = MECHSEQ[n]
    return sorted(items, key=lambda t: next(i for i, r in enumerate(kw) if re.search(r, t)))

def set_seq(pg, i, target):
    for pos, want in enumerate(target):
        for _ in range(12):
            cur = pg.eval_on_selector_all(f'#ps{i} .seqtxt', 'els=>els.map(e=>e.textContent)')
            j = cur.index(want)
            if j == pos: break
            pg.click(f'#ps{i} [data-seq="{i}:{j}:-1"]')

def pick(pg, i, j):
    pg.evaluate("([i,j])=>{const el=document.querySelector('#ans input[name=\"p'+i+'\"][value=\"'+j+'\"]'); if(el && !el.disabled) el.closest('label').click();}", [i, j])

def submit(pg):
    pg.click('#ans button[type=submit]')

def pm_ok(pg, i):
    return 'ok' in (pg.get_attribute(f'#pm{i}', 'class') or '')

def work_problem(pg, kind, mode, k, where):
    info = problem_info(pg)
    if not info or not info['q'].strip(): log['misc'].append(f'{where}: empty prompt'); return
    # exercise: empty check, invalid input, hints
    submit(pg)
    if mode == 'hint':
        for _ in range(2):
            if pg.query_selector('#actions [data-act=hint]'): pg.click('#actions [data-act=hint]')
    parts = info['parts']
    giveup = (k % 4 == 3)
    # guided blanks: type something
    for inp in pg.query_selector_all('#help input[data-k]'):
        inp.fill(random.choice(['1', '-2.5', '']))
    if giveup:
        # two wrong attempts then reveal
        for attempt in range(2):
            for i, p in enumerate(parts):
                if p['type'] == 'num':
                    if pg.is_enabled(f'#pin{i}'): pg.fill(f'#pin{i}', '987654')
                elif p['type'] == 'choice':
                    pick(pg, i, attempt % len(p["options"]))
                elif p['type'] == 'seq':
                    btn = pg.query_selector(f'#ps{i} .mv:not([disabled])')
                    if btn: btn.click()
            submit(pg)
            if pg.query_selector('#actions [data-act=next].primary'): return 'solved-by-luck'
        b = pg.query_selector('#actions [data-act=solution]')
        if not b: log['stuck'].append(f'{where}: no solution button after 2 misses'); return
        b.click(); return 'revealed'
    # invalid numeric input first
    for i, p in enumerate(parts):
        if p['type'] == 'num':
            pg.fill(f'#pin{i}', 'abc'); submit(pg)
            fb = pg.inner_text('#fb')
            if 'number' not in fb: log['misc'].append(f'{where}: invalid input message not shown: {fb[:80]}')
            break
    for i, p in enumerate(parts):
        if p['type'] == 'num':
            v = solve_num(info, p['label'].replace('(a) ', '').replace('(b) ', '').replace('(c) ', '').replace('(d) ', '').strip())
            pg.fill(f'#pin{i}', ('%g' % v) if abs(v) < 1e5 else ('%.3e' % v))
        elif p['type'] == 'seq':
            set_seq(pg, i, seq_answer(info, p))
    submit(pg)
    for i, p in enumerate(parts):
        if p['type'] in ('num', 'seq') and not pm_ok(pg, i):
            log['stuck'].append(f"{where}: my answer to {p['type']} part {i} not accepted: {info['q'][:120]} | {pg.inner_text('#fb')[:150]}")
    for i, p in enumerate(parts):
        if p['type'] != 'choice' or pm_ok(pg, i): continue
        for j in range(len(p['options'])):
            pick(pg, i, j)
            submit(pg)
            if pm_ok(pg, i): break
        else:
            log['stuck'].append(f'{where}: no option accepted for part {i}')
    if not pg.query_selector('#actions [data-act=next].primary'):
        log['stuck'].append(f"{where}: problem not complete after answering: {info['q'][:100]} | {pg.inner_text('#fb')[:150]}")
    # open the worked solution
    d = pg.query_selector('#sol details summary')
    if d: d.click()
    return 'solved'

def run(width, height):
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': width, 'height': height})
        pg.on('pageerror', lambda e: log['errors'].append(f'{width}px pageerror: {e}'))
        pg.on('console', lambda m: log['errors'].append(f'{width}px console {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.goto(URL); pg.wait_for_timeout(200)
        W = f'{width}px'
        check_layout(pg, W + ' roadmap')
        pg.screenshot(path=f'{OUT}shot_{width}_map.png', full_page=True)
        # Roadmap: filters and steps
        for f in pg.query_selector_all('button[data-filter]'):
            f.click(); check_layout(pg, W + ' roadmap filter')
        for n in range(1, 11):
            pg.click(f'button[data-step="{n}"]'); check_layout(pg, f'{W} roadmap step {n}')
            if n in (4, 5, 6): pg.screenshot(path=f'{OUT}shot_{width}_map_step{n}.png', full_page=True)
        pg.click('button[data-step="10"]')  # deselect
        tabs = pg.eval_on_selector_all('#tabs button', 'els=>els.map(e=>e.dataset.tab)')
        for t in tabs:
            pg.click(f'#tabs button[data-tab="{t}"]'); pg.wait_for_timeout(50)
            check_layout(pg, f'{W} tab {t}')
            pg.screenshot(path=f'{OUT}shot_{width}_{t}.png', full_page=True)
            if t == 'map': continue
            if t == 'lab':
                for tool in ['run', 'tracer', 'block']:
                    pg.click(f'#toolseg button[data-tool="{tool}"]'); check_layout(pg, f'{W} lab {tool}')
                    pg.screenshot(path=f'{OUT}shot_{width}_lab_{tool}.png', full_page=True)
                    if tool == 'run':
                        for rep in range(2):
                            for st in range(10):
                                # one wrong enzyme pick, then the right one
                                btns = pg.query_selector_all('#runask button[data-enz]:not([disabled])')
                                names = [x.inner_text().replace('✓ ', '') for x in btns]
                                wrong = [x for x, nm in zip(btns, names) if nm != ENZ[st]]
                                if wrong and st % 3 == 0: wrong[0].click()
                                btns = pg.query_selector_all('#runask button[data-enz]:not([disabled])')
                                ok = [x for x in btns if x.inner_text().replace('✓ ', '') == ENZ[st]]
                                if not ok: log['stuck'].append(f'{W} run: enzyme {ENZ[st]} not offered'); break
                                ok[0].click()
                                if st % 4 == 1: pg.click(f'#runask button[data-eff="{(CO[st]+1) % 4}"]')
                                pg.click(f'#runask button[data-eff="{CO[st]}"]')
                                check_layout(pg, f'{W} run step {st+1}')
                            led = pg.inner_text('#runledger')
                            if not re.search(r'ATP used\s+2.*ATP made\s+4.*Net ATP\s+\+2.*NADH made\s+2', led.replace('\n', ' ').replace('\t', ' ')):
                                log['misc'].append(f'{W} run ledger at end: {led!r}')
                            if rep == 0: pg.screenshot(path=f'{OUT}shot_{width}_lab_run_done.png', full_page=True)
                            pg.click('#cross'); pg.click('[data-act="restart"]')
                    else:
                        kind = tool
                        for mode in ['guided', 'hint', 'solo']:
                            pg.click(f'#modeseg button[data-mode="{mode}"]')
                            for k in range(NPROB):
                                if tool == 'tracer' and k < 6: pg.click(f'#extra button[data-c="{k+1}"]')
                                work_problem(pg, kind, mode, k, f'{W} {tool} {mode} #{k}')
                                check_layout(pg, f'{W} {tool} {mode}')
                                lv = pg.query_selector('#fb [data-act=levelup]')
                                if lv and k == 1: lv.click()
                                else: pg.click('#actions [data-act=next]')
                continue
            for mode in ['guided', 'hint', 'solo']:
                pg.click(f'#modeseg button[data-mode="{mode}"]')
                for k in range(NPROB):
                    res = work_problem(pg, t, mode, k, f'{W} {t} {mode} #{k}')
                    check_layout(pg, f'{W} {t} {mode}')
                    if k == 0 and mode == 'guided': pg.screenshot(path=f'{OUT}shot_{width}_{t}_solved.png', full_page=True)
                    lv = pg.query_selector('#fb [data-act=levelup]')
                    if lv and k == 2 and mode != 'solo':
                        lv.click()   # switches mode and draws a new problem
                        pg.click(f'#modeseg button[data-mode="{mode}"]')
                    else:
                        pg.click('#actions [data-act=next]')
            # mode change mid-problem
            pg.click('#modeseg button[data-mode="guided"]'); pg.click('#modeseg button[data-mode="solo"]')
        b.close()

if __name__ == '__main__':
    run(1280, 900)
    run(390, 844)
    for k, v in log.items():
        uniq = list(dict.fromkeys(v))
        print(f'== {k}: {len(v)} ({len(uniq)} unique)')
        for x in uniq[:25]: print('   ', x)

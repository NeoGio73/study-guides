from playwright.sync_api import sync_playwright
URL='file:///path/to/study-guides/biochemistry/glycolysis-study-guide.html'
CONTRAST_JS = """() => {
  const lum=c=>{const m=c.match(/[\\d.]+/g).map(Number); const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}; return [0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2]), m[3]===undefined?1:m[3]];};
  const parse=c=>c.match(/[\\d.]+/g).map(Number);
  const bgOf=el=>{ let e=el; while(e){ const b=getComputedStyle(e).backgroundColor; const p=parse(b); if(p.length<4 || p[3]>0.5) return b; e=e.parentElement;} return 'rgb(255,255,255)'; };
  const opOf=el=>{ let o=1,e=el; while(e){ o*=Number(getComputedStyle(e).opacity); e=e.parentElement;} return o; };
  const out=[]; const seen=new Set();
  const walker=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while((n=walker.nextNode())){
    if(!n.textContent.trim()) continue; const el=n.parentElement; if(!el || seen.has(el)) continue; seen.add(el);
    if(!el.getClientRects().length) continue; if(el.closest('svg')) continue; if(el.closest('.vh')) continue;
    const cs=getComputedStyle(el); const fg=parse(cs.color), bg=parse(bgOf(el)); const op=opOf(el);
    const mix=(a,b,t)=>a*t+b*(1-t);
    const fgc=[0,1,2].map(i=>mix(fg[i],bg[i],op*(fg[3]===undefined?1:fg[3])));
    const L=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)};
    const l1=0.2126*L(fgc[0])+0.7152*L(fgc[1])+0.0722*L(fgc[2]), l2=0.2126*L(bg[0])+0.7152*L(bg[1])+0.0722*L(bg[2]);
    const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const size=parseFloat(cs.fontSize), bold=Number(cs.fontWeight)>=700; const large= size>=24 || (bold && size>=18.66);
    if(ratio < (large?3:4.5)) out.push(ratio.toFixed(2)+' '+el.tagName+'.'+el.className+' op='+op.toFixed(2)+' size='+size+' "'+n.textContent.trim().slice(0,30)+'" fg='+cs.color+' bg='+bgOf(el));
  }
  return out; }"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900})
    pg.goto(URL)
    # 1. focus after activating a tab with the keyboard
    pg.focus('#tabs button[data-tab="order"]'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    print('focus after Enter on tab:', pg.evaluate("document.activeElement.tagName+' '+(document.activeElement.dataset.tab||'')+' '+document.activeElement.textContent.slice(0,30)"))
    pg.keyboard.press('Tab')
    print('next Tab goes to:', pg.evaluate("document.activeElement.tagName+' '+document.activeElement.textContent.slice(0,40)"))
    # 2. Tab order reaches every control on several views
    for tab in ['map','order','mechanism','free','lab']:
        pg.click(f'#tabs button[data-tab="{tab}"]')
        if tab=='mechanism':
            # make sure a seq problem might be visible; just count
            pass
        pg.evaluate("document.activeElement && document.activeElement.blur()")
        pg.evaluate("window.scrollTo(0,0)")
        total=pg.evaluate("[...document.querySelectorAll('button:not([disabled]), input:not([disabled]), summary, [tabindex]')].filter(e=>e.getClientRects().length).length")
        reached=set()
        pg.focus('body')
        for i in range(400):
            pg.keyboard.press('Tab')
            k=pg.evaluate("(()=>{const a=document.activeElement; if(!a||a===document.body) return null; const all=[...document.querySelectorAll('button, input, summary, [tabindex]')]; return all.indexOf(a)+':'+a.tagName+(a.type?'/'+a.type:'');})()")
            if k is None: break
            if k in reached and i>5: 
                if len(reached)>=total: break
            reached.add(k)
        radios=pg.evaluate("[...document.querySelectorAll('input[type=radio]:not([disabled])')].filter(e=>e.getClientRects().length).length")
        groups=pg.evaluate("new Set([...document.querySelectorAll('input[type=radio]:not([disabled])')].map(e=>e.name)).size")
        print(f'{tab}: focusable visible={total} reached by Tab={len(reached)} (radios {radios} in {groups} groups; one stop per group expected)')
    # 3. text alternatives
    pg.click('#tabs button[data-tab="map"]'); pg.click('button[data-step="4"]')
    print('svg labels (roadmap step 4):', pg.eval_on_selector_all('svg', 'e=>e.map(s=>s.getAttribute("role")+":"+s.getAttribute("aria-label"))'))
    print('tablist/tabpanel:', pg.evaluate("[document.querySelector('[role=tablist]').outerHTML.slice(0,0), [...document.querySelectorAll('[role=tab]')].some(t=>t.hasAttribute('aria-controls')), document.querySelector('[role=tabpanel]').getAttribute('aria-labelledby')]"))
    print('detail live region size (chars):', pg.evaluate("document.querySelector('#detail').textContent.length"))
    # 4. contrast, several views at both widths
    issues=set()
    for tab in ['map','order','enzyme','structure','mechanism','energy','free','regulation','fates','lab']:
        pg.click(f'#tabs button[data-tab="{tab}"]')
        if tab=='free': pg.click('details.ref summary')
        for x in pg.evaluate(CONTRAST_JS): issues.add(tab+': '+x)
    pg.click('#tabs button[data-tab="map"]'); pg.click('button[data-filter="nadh"]')
    for x in pg.evaluate(CONTRAST_JS): issues.add('map(filter on): '+x)
    print('contrast issues:'); [print('  ',x) for x in sorted(issues)[:40]]
    b.close()

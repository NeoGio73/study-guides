from playwright.sync_api import sync_playwright
URL='file:///path/to/study-guides/biochemistry/glycolysis-study-guide.html'
with sync_playwright() as p:
    b=p.chromium.launch()
    for W in (1280,390):
        pg=b.new_page(viewport={'width':W,'height':900}); pg.goto(URL)
        for tab in ['map','order','enzyme','structure','mechanism','energy','free','regulation','fates','lab']:
            pg.click(f'#tabs button[data-tab="{tab}"]')
            total=pg.evaluate("""(()=>{const els=[...document.querySelectorAll('button:not([disabled]), input:not([disabled]), summary')].filter(e=>e.getClientRects().length);
                const radios=els.filter(e=>e.type==='radio'); const groups=new Set(radios.map(r=>r.name)).size; return els.length-radios.length+groups;})()""")
            pg.focus('#tabs button[data-tab="map"]'); seen=set(); n=0
            for i in range(300):
                k=pg.evaluate("(()=>{const a=document.activeElement; if(!a||a===document.body) return null; const all=[...document.querySelectorAll('button, input, summary')]; return a.type==='radio' ? 'radio:'+a.name : String(all.indexOf(a));})()")
                if k is None or k in seen: break
                seen.add(k); pg.keyboard.press('Tab')
            print(W, tab, 'Tab stops expected', total, 'reached', len(seen))
        pg.close()
    b.close()

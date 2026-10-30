from playwright.sync_api import sync_playwright
import re
URL='file:///path/to/study-guides/biochemistry/glycolysis-study-guide.html'
with sync_playwright() as p:
    b=p.chromium.launch()
    for W in (1280,390):
        pg=b.new_page(viewport={'width':W,'height':900})
        pg.goto(URL)
        # keyboard: every tab, Enter and Space
        bad=[]
        for t in pg.eval_on_selector_all('#tabs button','e=>e.map(x=>x.dataset.tab)'):
            pg.focus(f'#tabs button[data-tab="{t}"]'); pg.keyboard.press('Enter' if t!='free' else ' ')
            a=pg.evaluate("[document.activeElement.dataset.tab||document.activeElement.tagName, document.activeElement.getAttribute('aria-selected'), document.activeElement.id, document.activeElement.getAttribute('aria-controls'), document.querySelector('#view').getAttribute('aria-labelledby')]")
            if a[0]!=t or a[1]!='true' or a[3]!='view' or a[4]!=a[2]: bad.append((t,a))
            pg.keyboard.press('Shift+Tab' if t!='map' else 'Tab')  # focus moves to a neighbour, not to the page start
            nb=pg.evaluate("document.activeElement.closest('#tabs')?'tabs':document.activeElement.tagName")
            if nb not in ('tabs','BUTTON'): bad.append((t,'neighbour',nb))
        print(W,'tab focus problems:',bad)
        pg.focus('#tabs button[data-tab="lab"]'); pg.keyboard.press('Enter')
        tb=[]
        for tool in ['tracer','block','run','tracer']:
            pg.focus(f'#toolseg button[data-tool="{tool}"]'); pg.keyboard.press('Enter')
            a=pg.evaluate("[document.activeElement.dataset.tool, document.activeElement.getAttribute('aria-pressed')]")
            if a!=[tool,'true']: tb.append((tool,a))
        print(W,'tool focus problems:',tb)
        # dimmed cards contrast (computed colours, no opacity)
        pg.click('#tabs button[data-tab="map"]')
        res=[]
        for f in ['use','make','nadh','irr','iso']:
            pg.click(f'button[data-filter="{f}"]'); pg.wait_for_timeout(250)
            res+=pg.evaluate("""()=>{const L=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}; const lum=c=>{const m=c.match(/[\\d.]+/g).map(Number);return 0.2126*L(m[0])+0.7152*L(m[1])+0.0722*L(m[2]);};
              const out=[]; document.querySelectorAll('.pstep.dim').forEach(card=>{ const op=Number(getComputedStyle(card).opacity); const bg=lum(getComputedStyle(card).backgroundColor);
                card.querySelectorAll('b,small,.pn,.bdg').forEach(e=>{ const f=lum(getComputedStyle(e).color); out.push(op<1?0:(Math.max(f,bg)+0.05)/(Math.min(f,bg)+0.05)); }); }); return out;}""")
        print(W,'dimmed-card text contrast: n=%d min=%.2f'%(len(res),min(res)))
        # contrast of all text, all tabs
        b.close() if False else None
        # every structure SVG has a description label
        labs=[]
        for t in ['order','enzyme','structure','mechanism','lab']:
            pg.click(f'#tabs button[data-tab="{t}"]'); pg.click('#modeseg button[data-mode="guided"]') if t!='lab' else None
            labs+=pg.eval_on_selector_all('svg.fis','e=>e.map(s=>s.getAttribute("aria-label"))')
        pg.click('#tabs button[data-tab="map"]'); pg.click('button[data-step="4"]')
        labs+=pg.eval_on_selector_all('svg.fis','e=>e.map(s=>s.getAttribute("aria-label"))')
        print(W,'svg labels: %d, all with per-carbon description: %s'%(len(labs), all('Fischer projection, top to bottom: C-1' in l or 'top to bottom: C-3' in l for l in labs)))
        print('   e.g.', labs[-1])
        pg.close()
    b.close()

import re
from playwright.sync_api import sync_playwright
from contrast import cr, blend
BASE='file:///path/to/study-guides/organic-chemistry/flashcards/'
def rgb(s):
    v=[float(x) for x in re.findall(r'[\d.]+',s)]; return tuple(c/255 for c in v[:3])
with sync_playwright() as p:
    b=p.chromium.launch()
    for deck in ['ch08-alkenes.html','ch09-alkynes.html']:
        pg=b.new_page(viewport={'width':390,'height':900},reduced_motion='reduce'); pg.goto(BASE+deck); pg.wait_for_timeout(400)
        print('==',deck)
        print(' live on load:',pg.inner_text('#live')[:90])
        pg.evaluate("idx=list.findIndex(c=>c.model); render(0)"); pg.wait_for_timeout(150)
        cid=pg.evaluate('list[idx].id')
        print(' describedby (front):',pg.get_attribute('#stage .card','aria-describedby'), '| role', pg.get_attribute('#stage .card','role'))
        pg.click('#flip'); pg.wait_for_timeout(300)
        print(' after flip describedby:',pg.get_attribute('#stage .card','aria-describedby'),'| live:',pg.inner_text('#live')[:160])
        pg.evaluate("idx=list.findIndex(c=>c.sf.some(x=>x[0]==='a'&&x[1])); render(0)"); pg.wait_for_timeout(150)
        print(' scheme card live:',pg.inner_text('#live')[:160])
        if 'ch09' in deck:
            for cid in ['c004','c005','c006']:
                pg.evaluate(f"idx=list.findIndex(c=>c.id==='{cid}'); render(0)"); pg.wait_for_timeout(100)
                print(' ',cid,'front alt:',pg.get_attribute('#stage .card .front figure.mol','aria-label'))
        # contrast from computed styles (light)
        pg.evaluate("idx=0; render(0)"); pg.evaluate("store.status[list[0].id]='r'; store.status[list[1].id]='k'; progress()")
        desk=rgb(pg.evaluate("getComputedStyle(document.body).backgroundColor"))
        for sel in ['#btnRev','#btnGot']:
            col=rgb(pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).color")); bg=rgb(pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).backgroundColor"))
            op=float(pg.evaluate("getComputedStyle(document.querySelector('#grade')).opacity"))
            print(f'  {sel}: full {cr(col,bg):.2f}:1, dimmed (opacity {op}) {cr(blend(col,desk,op),blend(bg,desk,op)):.2f}:1')
        for sel in ['.legend .k','.legend .r']:
            col=rgb(pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).color"))
            print(f'  legend {sel}: {cr(col,desk):.2f}:1 on desk, {cr(col,(0xE1/255,0xDA/255,0xCB/255)):.2f}:1 on desk-2')
        # dropdown with enrichment off
        pg.click('#enrich'); pg.wait_for_timeout(100)
        print('  dropdown (enrichment off):',pg.evaluate("document.querySelector('#sec option').textContent"),'list',pg.evaluate('list.length'))
        pg.click('#enrich'); pg.close()
        # transitions overflow (full motion) at 390
        pg=b.new_page(viewport={'width':390,'height':800}); pg.goto(BASE+deck); pg.wait_for_timeout(300)
        mx=0
        for key in ['ArrowRight','ArrowRight','ArrowLeft','ArrowRight']:
            pg.keyboard.press(key)
            for t in range(10): mx=max(mx,pg.evaluate('document.documentElement.scrollWidth')); pg.wait_for_timeout(30)
        print('  max scrollWidth during slide animations at 390:',mx)
        pg.close()
    b.close()

from playwright.sync_api import sync_playwright
URL='file:///path/to/study-guides/biochemistry/glycolysis-study-guide.html'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append('console '+m.type+': '+m.text) if m.type in('error','warning') else None)
    pg.goto(URL); pg.wait_for_timeout(300)
    print(pg.evaluate("typeof STEPS+' '+typeof makeProblem+' '+(typeof state)"))
    print(pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]"))
    print(errs)
    b.close()

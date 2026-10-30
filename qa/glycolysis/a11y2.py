from playwright.sync_api import sync_playwright
URL='file:///path/to/study-guides/biochemistry/glycolysis-study-guide.html'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900})
    pg.goto(URL)
    pg.click('button[data-filter="nadh"]')
    print(pg.eval_on_selector_all('.pstep', 'els=>els.map(e=>e.className+" op="+getComputedStyle(e).opacity+" color="+getComputedStyle(e.querySelector("small")).color+" bg="+getComputedStyle(e).backgroundColor)')[:3])
    # focus after switching lab tool with keyboard
    pg.click('#tabs button[data-tab="lab"]')
    pg.focus('#toolseg button[data-tool="tracer"]'); pg.keyboard.press('Enter')
    print('after tool switch:', pg.evaluate("document.activeElement.tagName"))
    pg.focus('#modeseg button[data-mode="solo"]'); pg.keyboard.press('Enter')
    print('after mode switch:', pg.evaluate("document.activeElement.tagName+' '+document.activeElement.textContent"))
    pg.focus('#extra button[data-c="3"]'); pg.keyboard.press('Enter')
    print('after carbon pick:', pg.evaluate("document.activeElement.tagName+' '+document.activeElement.textContent"))
    # check answers -> focus
    pg.click('#tabs button[data-tab="enzyme"]')
    pg.focus('#ans button[type=submit]'); pg.keyboard.press('Enter')
    print('after check (empty):', pg.evaluate("document.activeElement.tagName+' '+document.activeElement.textContent"))
    # numeric input aria
    pg.click('#tabs button[data-tab="energy"]')
    print('energy inputs:', pg.eval_on_selector_all('#ans input', 'e=>e.map(i=>i.id+" label="+(i.labels&&i.labels[0]?i.labels[0].textContent:"-"))'))
    print('guided blanks:', pg.eval_on_selector_all('#help input', 'e=>e.map(i=>i.getAttribute("aria-label"))'))
    # hidden-from-AT marks
    print('pmark aria-hidden:', pg.eval_on_selector_all('.pmark', 'e=>e.map(x=>x.getAttribute("aria-hidden"))')[:2])
    # dG table at 390
    pg.set_viewport_size({'width':390,'height':844})
    pg.click('#tabs button[data-tab="free"]'); pg.click('details.ref summary')
    pg.locator('details.ref').screenshot(path='c_dgtable390.png')
    print('doc width at 390 with table open:', pg.evaluate("[document.documentElement.scrollWidth, innerWidth]"))
    b.close()

from playwright.sync_api import sync_playwright
URL='file:///path/to/study-guides/biochemistry/glycolysis-study-guide.html'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1000,'height':800}, device_scale_factor=2)
    pg.goto(URL)
    pg.evaluate("""()=>{ const keys=Object.keys(MOL); document.body.innerHTML='<div id=g style="display:flex;flex-wrap:wrap;gap:12px;padding:10px;background:#fff">'+keys.map(k=>fischer(k,{num:true,cap:true})).join('')+fischer('DHAP',{num:true,cap:true,flip:true})+'</div>'; }""")
    pg.locator('#g').screenshot(path='gallery.png')
    b.close()

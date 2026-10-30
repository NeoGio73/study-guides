from playwright.sync_api import sync_playwright
URL='file:///path/to/study-guides/biochemistry/glycolysis-study-guide.html'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900})
    pg.goto(URL); pg.click('button[data-filter="nadh"]'); pg.wait_for_timeout(500)
    r=pg.evaluate("""()=>{const e=document.querySelector('.pstep.dim'); const op=Number(getComputedStyle(e).opacity);
      const L=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}; const lum=c=>0.2126*L(c[0])+0.7152*L(c[1])+0.0722*L(c[2]);
      const bg=[255,241,220].map(v=>v*op+255*(1-op)); const res={op};
      [['small',[27,36,48]],['b',[122,67,0]]].forEach(([k,c])=>{ const fg=c.map(v=>v*op+255*(1-op)); const l1=lum(fg),l2=lum(bg); res[k]=((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)).toFixed(2); });
      return res;}""")
    print('dimmed card contrast:', r)
    b.close()

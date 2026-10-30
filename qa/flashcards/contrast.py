def hx(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16)/255 for i in (0,2,4))
def lum(c):
    f=lambda v: v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    r,g,b=map(f,c); return 0.2126*r+0.7152*g+0.0722*b
def blend(fg,bg,a): return tuple(a*f+(1-a)*b for f,b in zip(fg,bg))
def cr(fg,bg):
    l1,l2=lum(fg),lum(bg); return (max(l1,l2)+0.05)/(min(l1,l2)+0.05)
L=dict(desk='#E9E3D6',surface='#F6F2E9',paper='#FFFDF8',back='#F2F7F3',muted='#5E6573',soft='#4C5361',accent='#2F5D8C',known='#2F8063',review='#C47A1C')
pairs=[('muted on desk (legend/count/footer)',L['muted'],L['desk'],1),
('muted on surface (unpressed seg buttons)',L['muted'],L['surface'],1),
('side label .7 opacity on paper',L['soft'],L['paper'],.7),
('figcaption on paper',L['soft'],L['paper'],1),
('legend "to review" #C47A1C on desk',L['review'],L['desk'],1),
('legend "got it" #2F8063 on desk',L['known'],L['desk'],1),
('Review again btn text on surface',L['review'],L['surface'],1),
('Got it btn text on surface',L['known'],L['surface'],1),
('Review again btn dimmed .35 (before flip)',L['review'],L['surface'],.35),
('Got it btn dimmed .35',L['known'],L['surface'],.35),
('Puzzle badge',' #A15C0C'.strip(),L['paper'],1),('Concept badge','#6A4BA0',L['paper'],1),('Term badge','#2F5D8C',L['paper'],1),('Reagent badge','#1D7A78',L['paper'],1),('Big picture badge','#B23A48',L['paper'],1),('Synthesis badge','#8A3F8F',L['paper'],1),
('Enrichment badge','#7a5d2b','#fff4dc',1),
('qbox ? glyph','#9aa0aa',L['paper'],1),
('reset link accent on desk',L['accent'],L['desk'],1),
('DARK muted on desk','#A0A7B3','#14171D',1),('DARK review btn','#E6A54F','#1E232C',1),('DARK got btn','#5BC29A','#1E232C',1),('DARK accent link','#8DB6E2','#14171D',1),
('DARK review btn dimmed .35','#E6A54F','#1E232C',.35),
]
for name,fg,bg,a in pairs:
    f=blend(hx(fg),hx(bg),a); print(f'{cr(f,hx(bg)):5.2f}  {name}')

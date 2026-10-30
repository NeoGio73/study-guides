import json,sys,os
from PIL import Image, ImageDraw
deck,fn,suffix,per=sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4])
d=json.load(open(fn))
ids=[c['id'] for c in d['cards'] if c['sf'] or c['sb'] or c['model']]
if len(sys.argv)>5: ids=[i for i in ids if i in sys.argv[5].split(',')]
os.makedirs('sheets',exist_ok=True)
rows=[]
for cid in ids:
    f=Image.open(f'shots/{deck}_{cid}_f{suffix}.png'); b=Image.open(f'shots/{deck}_{cid}_b{suffix}.png')
    W=f.width+b.width+10; H=max(f.height,b.height)
    im=Image.new('RGB',(W,H),'white'); im.paste(f,(0,0)); im.paste(b,(f.width+10,0))
    rows.append(im)
for n in range(0,len(rows),per):
    grp=rows[n:n+per]
    W=max(r.width for r in grp); H=sum(r.height for r in grp)+8*len(grp)
    sheet=Image.new('RGB',(W,H),'#888'); y=0
    for r in grp: sheet.paste(r,(0,y)); y+=r.height+8
    sc=min(1.0, 1600/W)
    if sc<1: sheet=sheet.resize((int(W*sc),int(H*sc)))
    sheet.save(f'sheets/{deck}{suffix}_{n//per:02d}.png')
print(len(ids),'cards ->',(len(rows)+per-1)//per,'sheets')

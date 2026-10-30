import json,re,sys,html
def strip(s):
    s=re.sub(r'<sub>(.*?)</sub>',r'_\1',s); s=re.sub(r'<sup>(.*?)</sup>',r'^\1',s)
    s=re.sub(r'<[^>]+>','',s); return html.unescape(s)
def toks(d,items):
    out=[]
    for it in items:
        t=it[0]
        if t=='m': out.append('['+it[1]+':'+d['mols'][it[1]]['name']+('' if it[2] else ' (nocap)')+']')
        elif t=='a': out.append('--'+strip(it[1] or '')+' / '+strip(it[2] or '')+'-->')
        elif t=='p': out.append('+')
        elif t=='q': out.append('?')
        elif t=='t': out.append('"'+strip(it[1])+'"')
    return ' '.join(out)
d=json.load(open(sys.argv[1]))
secs=dict(d['sections'])
n={}
for c in d['cards']:
    n[c['sec']]=n.get(c['sec'],0)+1
    print(f"#{c['id']} [{c['sec']} {n[c['sec']]}] {c['kind']}{' ENRICH' if c['enrich'] else ''}")
    print('  F:',strip(c['front']))
    if c['sf']: print('  SF:',toks(d,c['sf']))
    if c['back']: print('  B:',strip(c['back']))
    if c['sb']: print('  SB:',toks(d,c['sb']))
    if c['note']: print('  N:',strip(c['note']))
    if c['model']:
        m=d['models'][c['model']]; print('  3D:',c['model'], m.get('cap'), m.get('labels'))

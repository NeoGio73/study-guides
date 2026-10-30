"""Regenerate the ch08 structure SVGs at the ch09 drawing scale.
Layout and wedging are taken from the existing ch08 drawings (so each picture keeps
its orientation and stereo depiction); RDKit then redraws them with the ch09 settings
(default bond length, fixedFontSize 13, padding 0.12, same atom palette).
Writes regen08.json {key: svg}."""
import sys, json, math, re
from collections import defaultdict
sys.path.insert(0, '/path/to/study-guides/qa/flashcards')
from svg2mol import parse, lines_of, pts, COL
from rdkit import Chem
from rdkit.Chem import rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D
from rdkit import RDLogger; RDLogger.DisableLog('rdApp.*')

PAL = {6: '#1E2330', 8: '#CC2121', 35: '#9E3814', 17: '#19842D', 7: '#263FBF', 1: '#1E2330'}

def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))

def style(svg):
    svg = re.sub(r"<\?xml[^>]*\?>", '', svg).replace('<!-- END OF HEADER -->', '')
    svg = re.sub(r"<rect[^>]*/>", '', svg).replace('\n', '')
    svg = re.sub(r"\s*xml:space='preserve'", '', svg)
    svg = re.sub(r"(width|height)='(\d+)px'", r"\1='\2'", svg)
    return svg.strip()

def draw(m, molblock_wedging=False):
    d = rdMolDraw2D.MolDraw2DSVG(-1, -1)
    o = d.drawOptions()
    o.fixedFontSize = 13
    o.padding = 0.12
    o.clearBackground = False
    o.updateAtomPalette({k: hexrgb(v) for k, v in PAL.items()})
    if molblock_wedging:
        o.useMolBlockWedging = True
    d.DrawMolecule(m)
    d.FinishDrawing()
    return style(d.GetDrawingText())

def layout(svg):
    """atom positions (px) of the original drawing: exact for unlabelled atoms at bond
    ends, extrapolated along the drawn bond for labelled atoms and hashed-bond ends"""
    bonds, labels = parse(svg)
    exact = defaultdict(list); geo = {}; info = {}
    for key, paths in bonds.items():
        idx, i, j = key
        filled = [p for p in paths if 'fill:none' not in p[1]]
        thin = [p for p in paths if 'stroke-width:1.0px' in p[1] and 'fill:none' in p[1]]
        if filled:
            P = pts(filled[0][0]); wide = ((P[1][0] + P[2][0]) / 2, (P[1][1] + P[2][1]) / 2)
            if i not in labels: exact[i].append(P[0])
            if j not in labels: exact[j].append(wide)
            geo[key] = (P[0], wide); info[key] = (1, 'wedge')
        elif len(thin) >= 3:
            mids = []
            for d, _ in thin:
                P = pts(d); mids.append(((P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2))
            geo[key] = (mids[0], mids[-1]); info[key] = (1, 'hash')
        else:
            segs = [(pts(d)[0], pts(d)[-1]) for d, _ in paths if len(pts(d)) >= 2]
            L = lines_of(segs)
            lens = [math.dist(a, b) for a, b in L]; mx = max(lens)
            main = [l for l, ln in zip(L, lens) if ln > 0.97 * mx]
            s = (sum(l[0][0] for l in main) / len(main), sum(l[0][1] for l in main) / len(main))
            e = (sum(l[1][0] for l in main) / len(main), sum(l[1][1] for l in main) / len(main))
            if i not in labels: exact[i].append(s)
            if j not in labels: exact[j].append(e)
            geo[key] = (s, e); info[key] = (len(L), 'plain')
    pos = {a: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for a, v in exact.items()}
    natoms = 1 + max([max(k[1], k[2]) for k in bonds] + list(labels) + [0])
    bl = [math.dist(pos[i], pos[j]) for (_, i, j) in bonds if i in pos and j in pos]
    BL = sorted(bl)[len(bl) // 2] if bl else 18.0
    for _ in range(natoms):
        for a in range(natoms):
            if a in pos: continue
            est = []
            for (idx, i, j), (s, e) in geo.items():
                if a not in (i, j): continue
                b = j if a == i else i
                if b not in pos: continue
                v = (s[0] - e[0], s[1] - e[1]) if a == i else (e[0] - s[0], e[1] - s[1])
                n = math.hypot(*v) or 1
                est.append((pos[b][0] + v[0] / n * BL, pos[b][1] + v[1] / n * BL))
            if est:
                pos[a] = (sum(p[0] for p in est) / len(est), sum(p[1] for p in est) / len(est))
    return natoms, pos, info, labels, BL

def rebuild_mol(svg, overrides=None):
    natoms, pos, info, labels, BL = layout(svg)
    bonds, _ = parse(svg)
    elem = {}
    for a in range(natoms):
        if a in labels:
            e = None
            for _, f in labels[a]:
                if f in COL: e = COL[f]; break
            elem[a] = e or '?'
        else:
            elem[a] = 'C'
    elem.update(overrides or {})
    lines = ['', '  regen08', '', f"{natoms:3d}{len(info):3d}  0  0  0  0  0  0  0  0999 V2000"]
    for a in range(natoms):
        x, y = pos[a][0] / BL * 1.5, -pos[a][1] / BL * 1.5
        lines.append(f"{x:10.4f}{y:10.4f}{0:10.4f} {elem[a]:<3} 0  0  0  0  0  0  0  0  0  0  0  0")
    for (idx, i, j), (order, kind) in sorted(info.items()):
        st = {'wedge': 1, 'hash': 6}.get(kind, 0)
        lines.append(f"{i + 1:3d}{j + 1:3d}{order:3d}{st:3d}")
    lines.append('M  END')
    return Chem.MolFromMolBlock('\n'.join(lines), sanitize=True, removeHs=False)

if __name__ == '__main__':
    d8 = json.load(open('/path/to/study-guides/qa/flashcards/ch08-alkenes.json'))['mols']
    out = {}
    for k, v in d8.items():
        if k == 'diazomethane':
            m = Chem.MolFromSmiles('C=[N+]=[N-]')
            rdDepictor.Compute2DCoords(m)
            m.GetAtomWithIdx(0).SetProp('atomLabel', 'H<sub>2</sub>C')
            out[k] = draw(m)
        elif k == 'ethene':
            m = Chem.MolFromSmiles('C=C')
            rdDepictor.Compute2DCoords(m)
            m.GetAtomWithIdx(0).SetProp('atomLabel', 'H<sub>2</sub>C')
            m.GetAtomWithIdx(1).SetProp('atomLabel', 'CH<sub>2</sub>')
            out[k] = draw(m)
        elif k == 'co2':
            m = Chem.MolFromSmiles('O=C=O'); rdDepictor.Compute2DCoords(m)
            out[k] = draw(m)
        else:
            m = rebuild_mol(v['svg'])
            out[k] = draw(m, molblock_wedging=True)
    json.dump(out, open('/path/to/study-guides/qa/flashcards/fix/regen08.json', 'w'), ensure_ascii=False)
    print('regenerated', len(out))

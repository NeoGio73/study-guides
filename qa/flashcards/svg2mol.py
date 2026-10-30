"""Reconstruct molecules from the RDKit-drawn SVGs embedded in the flashcard decks.
Reads bond classes (bond-N atom-i atom-j), counts parallel lines for bond order,
reads wedge/hash bonds, label colours for elements, and rebuilds a mol block so
RDKit can perceive stereo from the 2D drawing. Prints canonical SMILES per mol."""
import json, re, sys, math
from collections import defaultdict
from rdkit import Chem
from rdkit.Chem import AllChem

COL = {'#CC2121': 'O', '#9E3814': 'Br', '#19842D': 'Cl', '#263FBF': 'N'}

def pts(d):
    return [tuple(map(float, p)) for p in re.findall(r'([-\d.]+)[ ,]([-\d.]+)', d)]

def parse(svg):
    bonds = defaultdict(list)   # (idx,i,j) -> list of (kind, points, style)
    labels = defaultdict(list)
    for m in re.finditer(r"<path ([^>]*)/?>", svg):
        attrs = m.group(1)
        cls = re.search(r"class='([^']*)'", attrs)
        d = re.search(r"d='([^']*)'", attrs).group(1)
        style = (re.search(r"style='([^']*)'", attrs) or [None, ''])
        style = style[1] if hasattr(style, '__getitem__') and not isinstance(style, list) else ''
        fill = re.search(r"fill='([^']*)'", attrs)
        if not cls:
            continue
        c = cls.group(1)
        mb = re.match(r'bond-(\d+) atom-(\d+) atom-(\d+)', c)
        if mb:
            key = tuple(map(int, mb.groups()))
            sty = re.search(r"style='([^']*)'", attrs).group(1)
            bonds[key].append((d, sty))
        else:
            ma = re.match(r'atom-(\d+)', c)
            if ma:
                labels[int(ma.group(1))].append((d, fill.group(1) if fill else None))
    return bonds, labels

def lines_of(segs):
    """merge collinear touching segments into lines; keep orientation of first segment"""
    lines = []
    for (a, b) in segs:
        merged = False
        for L in lines:
            s, e = L
            # same direction and e==a
            if math.dist(e, a) < 0.3:
                v1 = (e[0]-s[0], e[1]-s[1]); v2 = (b[0]-a[0], b[1]-a[1])
                cr = v1[0]*v2[1]-v1[1]*v2[0]
                if abs(cr) < 0.05*math.hypot(*v1)*math.hypot(*v2)+1e-9:
                    L[1] = b; merged = True; break
        if not merged:
            lines.append([a, b])
    return lines

def rebuild(svg):
    bonds, labels = parse(svg)
    natoms = 1 + max([max(k[1], k[2]) for k in bonds] + list(labels.keys()) + [0])
    est = defaultdict(list)
    binfo = {}
    for key, paths in bonds.items():
        idx, i, j = key
        filled = [p for p in paths if 'fill:none' not in p[1]]
        thin = [p for p in paths if 'stroke-width:1.0px' in p[1] and 'fill:none' in p[1]]
        if filled:
            P = pts(filled[0][0])
            est[i].append(P[0]); est[j].append(((P[1][0]+P[2][0])/2, (P[1][1]+P[2][1])/2))
            binfo[key] = (1, 'wedge')
        elif len(thin) >= 3:
            mids = []
            for d, _ in thin:
                P = pts(d); mids.append(((P[0][0]+P[1][0])/2, (P[0][1]+P[1][1])/2))
            # first hash near i, last near j
            first, last = mids[0], mids[-1]
            v = (last[0]-first[0], last[1]-first[1])
            est[i].append((first[0]-0.1*v[0], first[1]-0.1*v[1]))
            est[j].append((last[0]+0.1*v[0], last[1]+0.1*v[1]))
            binfo[key] = (1, 'hash')
        else:
            segs = []
            for d, _ in paths:
                P = pts(d)
                if len(P) >= 2:
                    segs.append((P[0], P[-1]))
            L = lines_of(segs)
            # wavy or other? order = number of lines
            order = len(L)
            lens = [math.dist(a, b) for a, b in L]
            mx = max(lens)
            main = [l for l, ln in zip(L, lens) if ln > 0.9*mx]
            si = (sum(l[0][0] for l in main)/len(main), sum(l[0][1] for l in main)/len(main))
            sj = (sum(l[1][0] for l in main)/len(main), sum(l[1][1] for l in main)/len(main))
            est[i].append(si); est[j].append(sj)
            binfo[key] = (order, 'plain')
    elem = {}
    for a in range(natoms):
        if a in labels:
            fills = [f for _, f in labels[a]]
            e = None
            for f in fills:
                if f in COL: e = COL[f]; break
            elem[a] = e or '?'
        else:
            elem[a] = 'C'
    pos = {}
    for a in range(natoms):
        if est[a]:
            xs = [p[0] for p in est[a]]; ys = [p[1] for p in est[a]]
            pos[a] = (sum(xs)/len(xs), sum(ys)/len(ys))
        else:
            pos[a] = (0.0, 0.0)
    return natoms, elem, pos, binfo, labels

def to_mol(svg, overrides=None):
    natoms, elem, pos, binfo, labels = rebuild(svg)
    overrides = overrides or {}
    rw = Chem.RWMol()
    for a in range(natoms):
        sym = overrides.get(a, elem[a])
        charge = 0
        if isinstance(sym, tuple): sym, charge = sym
        if sym == '?': sym = '*'
        if sym == 'D':
            at = Chem.Atom('H'); at.SetIsotope(2)
        else:
            at = Chem.Atom(sym)
        at.SetFormalCharge(charge)
        rw.AddAtom(at)
    for (idx, i, j), (order, kind) in sorted(binfo.items()):
        bt = {1: Chem.BondType.SINGLE, 2: Chem.BondType.DOUBLE, 3: Chem.BondType.TRIPLE}.get(order, Chem.BondType.SINGLE)
        rw.AddBond(i, j, bt)
        b = rw.GetBondBetweenAtoms(i, j)
        if b.GetBeginAtomIdx() != i:
            pass
        if kind == 'wedge': b.SetBondDir(Chem.BondDir.BEGINWEDGE)
        if kind == 'hash': b.SetBondDir(Chem.BondDir.BEGINDASH)
    m = rw.GetMol()
    lines = ['', '  svg2mol', '', f"{m.GetNumAtoms():3d}{m.GetNumBonds():3d}  0  0  0  0  0  0  0  0999 V2000"]
    for a in m.GetAtoms():
        x, y = pos[a.GetIdx()][0]/15.0, -pos[a.GetIdx()][1]/15.0
        sym = a.GetSymbol()
        if a.GetIsotope() == 2: sym = 'D'
        if sym == '*': sym = 'A'
        ch = {0:0, 1:3, -1:5}.get(a.GetFormalCharge(), 0)
        lines.append(f"{x:10.4f}{y:10.4f}{0:10.4f} {sym:<3} 0{ch:3d}  0  0  0  0  0  0  0  0  0  0")
    for b in m.GetBonds():
        o = {Chem.BondType.SINGLE:1, Chem.BondType.DOUBLE:2, Chem.BondType.TRIPLE:3}[b.GetBondType()]
        st = {Chem.BondDir.BEGINWEDGE:1, Chem.BondDir.BEGINDASH:6}.get(b.GetBondDir(), 0)
        lines.append(f"{b.GetBeginAtomIdx()+1:3d}{b.GetEndAtomIdx()+1:3d}{o:3d}{st:3d}")
    lines.append('M  END')
    mb = '\n'.join(lines)
    m2 = Chem.MolFromMolBlock(mb, sanitize=True, removeHs=False)
    return m2, elem, binfo

if __name__ == '__main__':
    d = json.load(open(sys.argv[1]))
    for k, v in d['mols'].items():
        try:
            m, elem, binfo = to_mol(v['svg'])
            smi = Chem.MolToSmiles(m) if m else 'FAIL'
        except Exception as ex:
            smi = 'ERR ' + str(ex)
        q = [a for a, e in elem.items() if e == '?']
        print(f"{k}\t{v['name']}\t{smi}\t{'UNK atoms '+str(q) if q else ''}")

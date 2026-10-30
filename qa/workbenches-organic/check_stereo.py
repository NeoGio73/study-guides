"""RDKit audit of every molecule in stereochemistry-lab.html and stereochemistry-practice.html.
Reads stereo_extract.json (from extract_stereo.js); writes stereo_results.json."""
import json, sys, numpy as np
from rdkit import Chem
from rdkit.Chem import rdCIPLabeler, rdMolDescriptors, AllChem
D = json.load(open('stereo_extract.json'))
res = {'lab': {}, 'practice': {}}

def load(mb):
    m = Chem.MolFromMolBlock(mb, removeHs=False)
    Chem.AssignStereochemistryFrom3D(m)
    rdCIPLabeler.AssignCIPLabels(m)
    return m

def labels(m):
    at = {a.GetIdx()+1: a.GetProp('_CIPCode') for a in m.GetAtoms() if a.HasProp('_CIPCode')}
    bd = {}
    for b in m.GetBonds():
        if b.HasProp('_CIPCode'):
            bd[f"{b.GetBeginAtomIdx()+1}={b.GetEndAtomIdx()+1}"] = b.GetProp('_CIPCode')
    return at, bd

def desc(m, n):
    a = m.GetAtomWithIdx(n-1)
    nb = [x.GetSymbol()+str(x.GetIdx()+1)+'(H%d)' % x.GetTotalNumHs(includeNeighbors=True) for x in a.GetNeighbors()]
    return f"{a.GetSymbol()}{n}[{','.join(nb)}]"

def smi(m):
    mm = Chem.RemoveHs(m)
    return Chem.MolToSmiles(mm)

# ---------- lab ----------
L = D['lab']
for i, entry in enumerate(L['MODEL_DATA']['single']):
    name = L['MOLECULES'][i]['name']
    for cfg, d in entry.items():
        m = load(d['mol'])
        at, bd = labels(m)
        c = d['center']
        got = at.get(c, 'none')
        exp = cfg if L['MOLECULES'][i]['chiral'] else 'none'
        # stored cip (0-based)
        stored = {int(k)+1: v for k, v in d['cip'].items()}
        prio_atoms = [desc(m, n) for n in d['priority']]
        # verify priority order with CIP ranks of neighbors (legacy ranks) -> use _CIPRank from AssignStereochemistry
        Chem.AssignStereochemistry(m, cleanIt=True, force=True)
        ranks = [int(m.GetAtomWithIdx(n-1).GetProp('_CIPRank')) for n in d['priority']]
        coords = m.GetConformer().GetPositions()
        h = coords[d['priority'][3]-1]-coords[c-1]
        res['lab'][f'single:{name}:{cfg}'] = dict(formula=rdMolDescriptors.CalcMolFormula(m), stored_formula=d['formula'],
            rdkit_center=got, expected=exp, stored_cip=stored, all_centers=at, ok=(got == exp and stored.get(c, 'none') == exp and rdMolDescriptors.CalcMolFormula(m) == d['formula']),
            priority_atoms=prio_atoms, legacy_ranks_desc_should_decrease=ranks, prio_order_ok=(ranks == sorted(ranks, reverse=True)) if L['MOLECULES'][i]['chiral'] else None,
            H_vector=h.round(3).tolist(), smiles=smi(m))
for cfg, d in L['MODEL_DATA']['pair'].items():
    m = load(d['mol']); at, bd = labels(m)
    got = ''.join(at.get(c, '?') for c in d['centers'])
    canon = Chem.MolToSmiles(Chem.RemoveHs(m))
    res['lab'][f'pair:{cfg}'] = dict(rdkit=got, expected=cfg, ok=got == cfg, smiles=canon, centerH=[desc(m, n) for n in d['centerHydrogens']], chiral_centers=at)
# meso identity check
s = {cfg: res['lab'][f'pair:{cfg}']['smiles'] for cfg in ['RR', 'SS', 'RS', 'SR']}
res['lab']['pair_identities'] = dict(RS_eq_SR=s['RS'] == s['SR'], RR_ne_SS=s['RR'] != s['SS'], smiles=s)

# lab quiz view check: mission 5 uses R with view 'away' (front view; viewer on +z); mission 6 uses S with rotate y 180
def apparent(m, center, prio, flip):
    P = m.GetConformer().GetPositions()
    if flip:
        P = P*np.array([-1, 1, -1])  # rotate 180 about y
    c = P[center-1]
    v = [P[n-1]-c for n in prio]
    hz = v[3][2]
    a, b, cc = [x[:2] for x in v[:3]]
    # signed area of triangle 1->2->3 in screen (x right, y up); negative = clockwise
    area = (b[0]-a[0])*(cc[1]-a[1])-(b[1]-a[1])*(cc[0]-a[0])
    return dict(H_z=round(hz, 3), H_direction='toward' if hz > 0 else 'away', path='clockwise' if area < 0 else 'counterclockwise')
for mi, cfg, flip in [(4, 'R', False), (5, 'S', True)]:
    d = L['MODEL_DATA']['single'][0][cfg]; m = load(d['mol'])
    ap = apparent(m, d['center'], d['priority'], flip)
    mis = L['MISSIONS'][mi]
    keyed = mis['options'][mis['answer']]
    ap.update(keyed=keyed, rdkit=labels(m)[0][d['center']])
    res['lab'][f'mission{mi+1}_view'] = ap

# ---------- practice ----------
P = D['practice']
for k, mb in P['MOLS'].items():
    m = load(mb); at, bd = labels(m)
    res['practice'][k] = dict(formula=rdMolDescriptors.CalcMolFormula(m), smiles=smi(m), atom_cip=at, bond_cip=bd)
json.dump(res, open('stereo_results.json', 'w'), indent=1)
print(json.dumps(res, indent=1)[:200000])

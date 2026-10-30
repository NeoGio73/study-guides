"""Second-pass checks for stereochemistry-practice.html: atom identities behind halos/labels,
reference SMILES comparison, conformer geometry (axial/equatorial, cis/trans, dihedrals, allene).
Appends results to stereo_results.json under 'practice_detail'."""
import json, numpy as np
from rdkit import Chem
from rdkit.Chem import rdCIPLabeler, rdMolTransforms as T
D = json.load(open('stereo_extract.json'))
R = json.load(open('stereo_results.json'))
MOLS = D['practice']['MOLS']; Q = D['practice']['QUESTIONS']
def load(mb):
    m = Chem.MolFromMolBlock(mb, removeHs=False); Chem.AssignStereochemistryFrom3D(m); rdCIPLabeler.AssignCIPLabels(m); return m
def nb(m, n):
    a = m.GetAtomWithIdx(n-1)
    return a.GetSymbol()+str(n)+':'+','.join(sorted(x.GetSymbol()+str(x.GetIdx()+1) for x in a.GetNeighbors()))
def can(s):
    return Chem.MolToSmiles(Chem.MolFromSmiles(s))
def mirror_can(m):
    mm = Chem.RemoveHs(m); s = Chem.MolToSmiles(mm)
    s2 = s.replace('@@', '!').replace('@', '@@').replace('!', '@')
    return can(s2)
out = {}
# reference SMILES (PubChem isomeric SMILES of the named stereoisomer)
refs = {
 'q4': ('L-cysteine', 'C([C@@H](C(=O)O)N)S'),
 'q5': ('(S)-ibuprofen', 'C[C@@H](C1=CC=C(C=C1)CC(C)C)C(=O)O'),
 'q8': ('(-)-menthol (1R,2S,5R)', 'C[C@@H]1CC[C@H]([C@@H](C1)O)C(C)C'),
 'q18': ('L-threonine (2S,3R)', 'C[C@H]([C@@H](C(=O)O)N)O'),
 'q19': ('(S)-(+)-carvone', 'CC1=CC[C@@H](CC1=O)C(=C)C'),
}
for k, (name, s) in refs.items():
    m = load(MOLS[k]); got = Chem.MolToSmiles(Chem.RemoveHs(m))
    out[k+'_ref'] = dict(name=name, page=got, ref=can(s), match=got == can(s))
for k in MOLS:
    m = load(MOLS[k]); out[k+'_achiral'] = (Chem.MolToSmiles(Chem.RemoveHs(m)) == mirror_can(m))
# atoms named in halos / labels / reveals
for qi, q in enumerate(Q):
    for mi, md in enumerate(q['models']):
        m = load(MOLS[md['mol']])
        atoms = set(md.get('halo', []) + md.get('revealHalo', []) + [int(x) for x in md.get('label', {})] + [int(x) for x in md.get('reveal', {})])
        out[f"Q{qi+1}_{md['mol']}_atoms"] = {str(n): nb(m, n) + (' CIP='+m.GetAtomWithIdx(n-1).GetProp('_CIPCode') if m.GetAtomWithIdx(n-1).HasProp('_CIPCode') else '') for n in sorted(atoms)}
        out[f"Q{qi+1}_{md['mol']}_reveal"] = md.get('reveal')
# geometry helpers
def ring_info(m):
    ri = m.GetRingInfo(); ring = [list(r) for r in ri.AtomRings() if len(r) == 6][0]
    P = m.GetConformer().GetPositions(); c = P[ring].mean(0)
    u, s, vt = np.linalg.svd(P[ring]-c); nrm = vt[2]
    return ring, P, c, nrm
def classify(m, ringatom, sub):
    ring, P, c, nrm = ring_info(m)
    v = P[sub]-P[ringatom]; v /= np.linalg.norm(v)
    ang = np.degrees(np.arccos(abs(v @ nrm)))
    face = np.sign((P[sub]-P[ringatom]) @ nrm)
    # axial if nearly parallel to ring normal
    return dict(angle_to_normal=round(float(ang), 1), pos='axial' if ang < 35 else 'equatorial', face=int(face))
for k, pairs in {'q14': None, 'q15': None}.items():
    m = load(MOLS[k]); ring, P, c, nrm = ring_info(m)
    res = {}
    for ra in ring:
        a = m.GetAtomWithIdx(ra)
        for x in a.GetNeighbors():
            if x.GetIdx() not in ring and x.GetSymbol() == 'C':
                res[f'ringC{ra+1}->C{x.GetIdx()+1}'] = classify(m, ra, x.GetIdx())
                # the H on this ring carbon
                for h in a.GetNeighbors():
                    if h.GetSymbol() == 'H': res[f'ringC{ra+1}->H{h.GetIdx()+1}'] = classify(m, ra, h.GetIdx())
    faces = [v['face'] for kk, v in res.items() if '->C' in kk]
    res['cis'] = len(set(faces)) == 1
    out[k+'_geometry'] = res
# q16 allene: dihedral between substituent planes
m = load(MOLS['q16']); P = m.GetConformer().GetPositions()
chain = [a.GetIdx() for a in m.GetAtoms() if a.GetSymbol() == 'C']
out['q16_atoms'] = {str(i+1): nb(m, i+1) for i in chain}
# find central allene carbon (2 double bonds)
cen = [a.GetIdx() for a in m.GetAtoms() if sum(1 for b in a.GetBonds() if b.GetBondTypeAsDouble() == 2) == 2]
if cen:
    c0 = cen[0]; ends = [x.GetIdx() for x in m.GetAtomWithIdx(c0).GetNeighbors()]
    subs = []
    for e in ends:
        s = [x.GetIdx() for x in m.GetAtomWithIdx(e).GetNeighbors() if x.GetIdx() != c0 and x.GetSymbol() == 'C'][0]
        subs.append(s)
    out['q16_CH3_C_C_CH3_dihedral'] = round(T.GetDihedralDeg(m.GetConformer(), subs[0], ends[0], ends[1], subs[1]), 1)
    out['q16_C=C=C_angle'] = round(T.GetAngleDeg(m.GetConformer(), ends[0], c0, ends[1]), 1)
# q12 conformers
for k in ['q12a', 'q12b']:
    m = load(MOLS[k]); C = [a.GetIdx() for a in m.GetAtoms() if a.GetSymbol() in ('C', 'Br')]
    conf = m.GetConformer()
    br = [a.GetIdx() for a in m.GetAtoms() if a.GetSymbol() == 'Br'][0]
    c2 = m.GetAtomWithIdx(br).GetNeighbors()[0].GetIdx()
    c3 = [x.GetIdx() for x in m.GetAtomWithIdx(c2).GetNeighbors() if x.GetSymbol() == 'C' and x.GetDegree() == 4 and sum(1 for y in x.GetNeighbors() if y.GetSymbol() == 'C') == 2][0]
    c4 = [x.GetIdx() for x in m.GetAtomWithIdx(c3).GetNeighbors() if x.GetSymbol() == 'C' and x.GetIdx() != c2][0]
    c1 = [x.GetIdx() for x in m.GetAtomWithIdx(c2).GetNeighbors() if x.GetSymbol() == 'C' and x.GetIdx() != c3][0]
    out[k+'_dihedrals'] = dict(Br_C2_C3_C4=round(T.GetDihedralDeg(conf, br, c2, c3, c4), 1), C1_C2_C3_C4=round(T.GetDihedralDeg(conf, c1, c2, c3, c4), 1))
m = load(MOLS['q16']); P = m.GetConformer().GetPositions()
def _n(a, b, c):
    v = np.cross(P[b]-P[a], P[c]-P[a]); return v/np.linalg.norm(v)
out['q16_end_plane_angle'] = round(float(np.degrees(np.arccos(abs(_n(0, 1, 8) @ _n(4, 3, 9))))), 1)
ax = P[3]-P[1]
p1, p2, p3 = P[0]-P[1], P[8]-P[1], P[4]-P[3]   # near CH3 (1) > near H (2) > far CH3 (3)
s_ = float(ax @ np.cross(p2-p1, p3-p1))
out['q16_axial_chirality'] = 'Ra' if s_ > 0 else 'Sa'
out['q16_note'] = 'RDKit does not perceive allene axial chirality, so q16_achiral (SMILES test) is not meaningful; plane angle and Ra/Sa are computed from coordinates'
R['practice_detail'] = out
json.dump(R, open('stereo_results.json', 'w'), indent=1)
for k, v in out.items(): print(k, v)

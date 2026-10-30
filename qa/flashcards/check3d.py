import json
import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem, rdCIPLabeler
from rdkit import RDLogger; RDLogger.DisableLog('rdApp.*')
from svg2mol import to_mol
def from3d(md):
    rw=Chem.RWMol()
    for a in md['atoms']: rw.AddAtom(Chem.Atom(a[0]))
    for b in md['bonds']:
        o=b[2] if len(b)>2 else 1
        rw.AddBond(b[0],b[1],{1:Chem.BondType.SINGLE,2:Chem.BondType.DOUBLE,3:Chem.BondType.TRIPLE}[o])
    m=rw.GetMol()
    conf=Chem.Conformer(m.GetNumAtoms())
    for i,a in enumerate(md['atoms']): conf.SetAtomPosition(i,tuple(a[1:4]))
    conf.Set3D(True); m.AddConformer(conf)
    Chem.SanitizeMol(m)
    Chem.AssignStereochemistryFrom3D(m)
    return m
def cip(m):
    rdCIPLabeler.AssignCIPLabels(m)
    return ' '.join([f"{a.GetSymbol()}{a.GetIdx()}:{a.GetProp('_CIPCode')}" for a in m.GetAtoms() if a.HasProp('_CIPCode')]+[f"b{b.GetIdx()}:{b.GetProp('_CIPCode')}" for b in m.GetBonds() if b.HasProp('_CIPCode')])
def ring_faces(m):
    """for each ring stereocentre substituent (heavy, non-ring), report side of ring mean plane"""
    m=Chem.Mol(m)
    if m.GetNumConformers()==0 or not m.GetConformer().Is3D():
        mh=Chem.AddHs(m); AllChem.EmbedMolecule(mh,randomSeed=7); m=mh
    conf=m.GetConformer(); ri=m.GetRingInfo()
    out=[]
    for ring in ri.AtomRings():
        P=np.array([list(conf.GetAtomPosition(i)) for i in ring]); c=P.mean(0)
        u,s,vt=np.linalg.svd(P-c); n=vt[2]
        for i in ring:
            a=m.GetAtomWithIdx(i)
            for nb in a.GetNeighbors():
                if nb.GetIdx() in ring or nb.GetAtomicNum()==1: continue
                if len([x for x in a.GetNeighbors() if x.GetAtomicNum()>1 and x.GetIdx() not in ring])>1: continue
                side=np.dot(np.array(list(conf.GetAtomPosition(nb.GetIdx())))-c,n)
                out.append(f"{nb.GetSymbol()}@{i}:{'up' if side>0 else 'down'}")
    return ' '.join(out)
for fn in ['ch08-alkenes.json','ch09-alkynes.json']:
    d=json.load(open(fn))
    print('==',fn)
    for k,md in d['models'].items():
        for i,mm in enumerate(md['mols']):
            m=from3d(mm)
            print('3D',k,i,Chem.MolToSmiles(Chem.RemoveHs(m)),'|',cip(m),'|',ring_faces(m),'|',md.get('cap'),md.get('labels'))
    for k in ['cisdmch','cisepox','cpdiol','tbcpol','tdbch','tdbcp','tdbcp2','tdccp','tmcpol']:
        if k in d['mols']:
            m,_,_=to_mol(d['mols'][k]['svg'])
            m=Chem.MolFromSmiles(Chem.MolToSmiles(m))
            print('2D',k,d['mols'][k]['name'],'|',ring_faces(m))
    if 'dpentene' in d['mols']:
        m,_,_=to_mol(d['mols']['dpentene']['svg'],{2:'D',4:'D'}); print('dpentene',Chem.MolToSmiles(m),cip(m))

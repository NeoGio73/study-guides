import json, numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit import RDLogger; RDLogger.DisableLog('rdApp.*')
from svg2mol import to_mol
from check3d import from3d
def faces(m, embed=True):
    if embed:
        m=Chem.AddHs(Chem.MolFromSmiles(Chem.MolToSmiles(m))); AllChem.EmbedMolecule(m,randomSeed=11)
    conf=m.GetConformer(); out=[]
    for ring in m.GetRingInfo().AtomRings():
        n=len(ring); P=lambda i: np.array(list(conf.GetAtomPosition(i)))
        for k,i in enumerate(ring):
            prev,nxt=ring[k-1],ring[(k+1)%n]
            nrm=np.cross(P(prev)-P(i),P(nxt)-P(i))
            subs=[x for x in m.GetAtomWithIdx(i).GetNeighbors() if x.GetIdx() not in ring]
            heavy=[x for x in subs if x.GetAtomicNum()>1]
            if len(subs)==2 and len(heavy)==1:
                s=np.dot(P(heavy[0].GetIdx())-P(i),nrm)
                out.append(f"{heavy[0].GetSymbol()}@{i}:{'A' if s>0 else 'B'}")
    return ' '.join(out)
for fn in ['ch08-alkenes.json']:
    d=json.load(open(fn))
    for k in ['cisdmch','cisepox','cpdiol','tbcpol','tdbch','tdbcp','tdbcp2','tdccp','tmcpol']:
        m,_,_=to_mol(d['mols'][k]['svg'])
        print('2D',k,'|',d['mols'][k]['name'],'|',faces(m))
    for k,md in d['models'].items():
        for mm in md['mols']:
            print('3D',k,'|',faces(from3d(mm),embed=False))

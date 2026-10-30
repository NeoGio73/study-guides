import sys,json,math
sys.path.insert(0,'/path/to/study-guides/qa/flashcards')
import numpy as np
from svg2mol import rebuild, to_mol
from rdkit import Chem
from rdkit.Chem import rdDepictor
from rdkit import RDLogger; RDLogger.DisableLog('rdApp.*')
def kabsch(P,Q,allow_reflect=True):
    Pc=P-P.mean(0); Qc=Q-Q.mean(0)
    H=Pc.T@Qc; U,S,Vt=np.linalg.svd(H); R=Vt.T@U.T
    if np.linalg.det(R)<0 and not allow_reflect:
        Vt[-1]*=-1; R=Vt.T@U.T
    s=S.sum()/ (Pc**2).sum()
    return R,s,P.mean(0),Q.mean(0)
def aligned_mol(svg, overrides=None):
    natoms,elem,pos,binfo,labels=rebuild(svg)
    m,_,_=to_mol(svg,overrides)
    m2=Chem.Mol(m); m2.RemoveAllConformers()
    rdDepictor.Compute2DCoords(m2)
    c=m2.GetConformer()
    P=np.array([[c.GetAtomPosition(i).x,c.GetAtomPosition(i).y] for i in range(m2.GetNumAtoms())])
    Q=np.array([[pos[i][0],-pos[i][1]] for i in range(m2.GetNumAtoms())])
    idx=[i for i in range(len(P)) if elem[i]=='C']
    if len(idx)<2: idx=list(range(len(P)))
    best=None
    for refl in (False,True):
        PP=P.copy()
        if refl: PP[:,0]*=-1
        R,s,pm,qm=kabsch(PP[idx],Q[idx],allow_reflect=False)
        fit=((PP[idx]-pm)@R.T)*s+qm
        err=np.abs(fit-Q[idx]).max()
        if best is None or err<best[0]: best=(err,refl,R,pm)
    err,refl,R,pm=best
    PP=P.copy()
    if refl: PP[:,0]*=-1
    new=(PP-pm)@R.T
    for i in range(len(new)): c.SetAtomPosition(i,(float(new[i,0]),float(new[i,1]),0.0))
    # restore stereo perception from the new coordinates (tags are already on atoms)
    return m2, err/ (np.median([np.linalg.norm(Q[a]-Q[b]) for a,b in [(bd.GetBeginAtomIdx(),bd.GetEndAtomIdx()) for bd in m.GetBonds()]]) or 1)
if __name__=='__main__':
    d8=json.load(open('/path/to/study-guides/qa/flashcards/ch08-alkenes.json'))['mols']
    for k,v in d8.items():
        if k in ('diazomethane',): continue
        m,e=aligned_mol(v['svg'],{1:'C'} if k=='co2' else None)
        if e>0.15: print(k,'rel err',round(e,2))
    print('done')

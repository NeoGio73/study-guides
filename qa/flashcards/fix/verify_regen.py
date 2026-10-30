import sys,json
sys.path.insert(0,'/path/to/study-guides/qa/flashcards')
from svg2mol import to_mol, rebuild
from rdkit import Chem
from rdkit import RDLogger; RDLogger.DisableLog('rdApp.*')
old=json.load(open(sys.argv[1]))['mols']; new=json.load(open(sys.argv[2]))['mols'] if sys.argv[2].endswith('.json') and 'mols' in json.load(open(sys.argv[2])) else json.load(open(sys.argv[2]))
if 'mols' in new: new=new['mols']
OVo={'co2':{1:'C'},'diazomethane':{0:'C',1:('N',1),2:('N',-1)}}
OVn={'co2':{1:'C'},'diazomethane':{0:'C',1:('N',1),2:('N',-1)},'ethene':{0:'C',1:'C'}}
bad=0
for k in old:
    so=new_s=None
    ov=OVo.get(k)
    mo=to_mol(old[k]['svg'] if isinstance(old[k],dict) else old[k],ov)[0]
    nv=new[k]['svg'] if isinstance(new[k],dict) else new[k]
    mn,elem,_=to_mol(nv,OVn.get(k))
    so=Chem.MolToSmiles(mo) if mo else 'FAIL'; sn=Chem.MolToSmiles(mn) if mn else 'FAIL'
    unk=[a for a,e in elem.items() if e=='?' and a not in (OVn.get(k) or {})]
    if k=='diazomethane': so='C=[N+]=[N-]'; so=Chem.MolToSmiles(Chem.MolFromSmiles(so))
    if so!=sn or unk:
        bad+=1; print('DIFF',k,so,sn,unk)
print('compared',len(old),'mismatches',bad)

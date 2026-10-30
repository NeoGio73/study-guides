import json,sys
from rdkit import Chem
from rdkit.Chem.EnumerateStereoisomers import EnumerateStereoisomers
from rdkit.Chem import rdCIPLabeler
from svg2mol import to_mol
from rdkit import RDLogger; RDLogger.DisableLog('rdApp.*')
E8 = {
'acetaldehyde':'CC=O','aceticacid':'CC(=O)O','acetone':'CC(C)=O','brdmb':'CC(C)C(C)(C)Br','brmb':'CCC(C)(C)Br',
'bromo1p':'CCCBr','bromo2p':'CC(C)Br','bromoethanol':'OCCBr','bromohydrin':'BrCC(C)(C)O','butanone':'CCC(C)=O',
'butene2':'C/C=C/C','co2':'O=C=O','diazomethane':'C=[N+]=[N-]','cbutene':'C/C=C\\C','chcl3':'ClC(Cl)Cl','chex':'C1=CCCCC1','cisdmch':'C[C@@H]1CCCC[C@@H]1C',
'cisepox':'C[C@@H]1O[C@@H]1C','clmch':'CC1(Cl)CCCCC1','cpdiol':'O[C@@H]1CCC[C@@H]1O','cpent':'C1=CCCC1','dcp':'CC(Cl)CCl',
'dmb2ol':'CC(C)C(C)(C)O','dmb2ol33':'CC(O)C(C)(C)C','dmbutene':'C=CC(C)(C)C','dmchene':'CC1=C(C)CCCC1','ethane':'CC','ethanol':'CCO',
'ethene':'C=C','formald':'C=O','glycol':'OCCO','ibual':'CC(C)C=O','ibuoh':'CC(C)CO','isobutylene':'C=C(C)C','m2b':'CC=C(C)C',
'mb1ol':'CC(C)CCO','mb2ol':'CCC(C)(C)O','mb2ol3':'CC(C)C(C)O','mbutene':'C=CC(C)C','mbutene2':'C=C(C)CC','mchex':'CC1=CCCCC1',
'mchexol':'CC1(O)CCCCC1','mcpent':'CC1=CCCC1','mcpentol':'CC1(O)CCCC1','mesodbb':'C[C@H](Br)[C@@H](C)Br','norcarane':'C1CCC2CC2C1',
'oxohept':'CC(=O)CCCCC(=O)O','propane':'CCC','propanediol':'CC(O)CO','propanol':'CCCO','propene':'C=CC',
'tbcpol':'O[C@@H]1CCC[C@H]1Br','tbubr':'CC(C)(C)Br','tbuoh':'CC(C)(C)O','tbutene':'C/C=C/C','tdbch':'Br[C@@H]1CCCC[C@H]1Br',
'tdbcp':'Br[C@@H]1CCC[C@H]1Br','tdbcp2':'Br[C@H]1CCC[C@@H]1Br','tdccp':'C[C@@H]1[C@@H](C)C1(Cl)Cl','tmcpol':'C[C@@H]1CCC[C@H]1O','tme':'CC(C)=C(C)C',
}
E9 = {
'aceticacid':'CC(=O)O','acetophenone':'CC(=O)c1ccccc1','bromoethane':'CCBr','bromohexene':'C=C(Br)CCCC','bromopentane2':'CCCC(C)Br',
'butane':'CCCC','butylbenzene':'CCCCc1ccccc1','butyne1':'C#CCC','butyne2':'CC#CC','chxenol':'OC1=CCCCC1','chxone':'O=C1CCCCC1',
'cisbutene':'C/C=C\\C','cishexene3':'CC/C=C\\CC','cyhexbutyne':'CCC#CC1CCCCC1','dbb':'CCC(Br)CBr','dcp':'CC(Cl)CCl','dibromohexane':'CCCCC(C)(Br)Br',
'dmh':'CC(C)C#CC(C)C','dpa':'c1ccccc1C#Cc1ccccc1','dpbutene':'c1ccccc1C/C=C/Cc1ccccc1','dpbutyne':'c1ccccc1CC#CCc1ccccc1',
'edbb':'C/C(Br)=C(/C)Br','dpentene':'[2H]/C(C)=C(\\[2H])CC','propynide':'[Na+].CC#[C-]','enyne':'C#C/C=C/c1ccccc1','ethyne':'C#C','ethynylchex':'C#CC1CCCCC1','gemdcl':'CC(Cl)(Cl)C1CCCCC1',
'heptanone2':'CCCCCC(C)=O','heptyne1':'C#CCCCCC','hexanal':'CCCCCC=O','hexanol3':'CCCC(O)CC','hexanone2':'CCCCC(C)=O','hexenol':'C=C(O)CCCC',
'hexyne1':'C#CCCCC','hexyne3':'CCC#CCC','mb1yne':'C#CC(C)C','mheptene':'CC/C=C/CC(C)C','mheptyne':'CCC#CCC(C)C','mp2':'CC#CC(C)C',
'mpentane':'CCCC(C)C','mpentyne1':'C#CCC(C)C','octyne4':'CCCC#CCCC','pentene1':'C=CCCC','pentyne1':'C#CCCC','pentyne2':'CC#CCC',
'phac':'C#Cc1ccccc1','phacald':'O=CCc1ccccc1','phpropyne':'C#CCc1ccccc1','propanoic':'CCC(=O)O','propene':'C=CC','propyne':'C#CC',
'stilbdibr':'BrC(c1ccccc1)C(Br)c1ccccc1','tetrabr':'CC(Br)(Br)C(C)(Br)Br','transbutene':'C/C=C/C','transoctene':'CCC/C=C/CCC',
}
OV = {('ch09','dpentene'):{2:'D',4:'D'}, ('ch09','propynide'):{2:('C',-1),3:('Na',1)}, ('ch08','co2'):{1:'C'}, ('ch08','diazomethane'):{0:'C',1:('N',1),2:('N',-1)}, ('ch08','ethene'):{0:'C',1:'C'}}
def can(m): return Chem.MolToSmiles(m)
def mirror(smi):
    return smi.replace('@@','!').replace('@','@@').replace('!','@')
def labels(m):
    try: rdCIPLabeler.AssignCIPLabels(m)
    except Exception: pass
    out=[]
    for a in m.GetAtoms():
        if a.HasProp('_CIPCode'): out.append(f"{a.GetSymbol()}{a.GetIdx()}:{a.GetProp('_CIPCode')}")
    for b in m.GetBonds():
        if b.HasProp('_CIPCode'): out.append(f"b{b.GetIdx()}:{b.GetProp('_CIPCode')}")
    return ' '.join(out)
for tag,fn,E in [('ch08','ch08-alkenes.json',E8),('ch09','ch09-alkynes.json',E9)]:
    d=json.load(open(fn))
    for k,v in d['mols'].items():
        m,elem,binfo=to_mol(v['svg'],OV.get((tag,k)))
        if m is None: print(tag,k,'FAIL'); continue
        got=can(m)
        if k not in E: print(tag,k,v['name'],'NO-EXPECTED',got); continue
        exp=can(Chem.MolFromSmiles(E[k]))
        expm=can(Chem.MolFromSmiles(mirror(E[k])))
        status='OK' if got==exp else ('MIRROR' if got==expm else 'MISMATCH')
        if True:
            print(tag,k,'|',v['name'],'|',status,'| got',got,'| exp',exp,'|',labels(m))
    print(tag,'checked',len(d['mols']))

import re
from rdkit import Chem
from rdkit.Chem import rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D
PAL={6:(0x1E,0x23,0x30),8:(0xCC,0x21,0x21),35:(0x9E,0x38,0x14),17:(0x19,0x84,0x2D),7:(0x26,0x3F,0xBF),1:(0x1E,0x23,0x30),11:(0x1E,0x23,0x30)}
def draw(m, bond=27.5, font=None, pad=None, coordgen=False, clear=False, minfont=None, extra=None):
    m=Chem.Mol(m)
    if m.GetNumConformers()==0:
        rdDepictor.SetPreferCoordGen(coordgen); rdDepictor.Compute2DCoords(m)
    d=rdMolDraw2D.MolDraw2DSVG(-1,-1)
    o=d.drawOptions(); o.fixedBondLength=bond
    if font: o.fixedFontSize=font
    if minfont: o.minFontSize=minfont
    if pad is not None: o.padding=pad
    o.clearBackground=clear
    o.updateAtomPalette({k:tuple(c/255 for c in v) for k,v in PAL.items()})
    o.setBackgroundColour((1,1,1,0))
    if extra: extra(o)
    d.DrawMolecule(m); d.FinishDrawing(); s=d.GetDrawingText()
    s=re.sub(r"<\?xml[^>]*\?>",'',s); s=s.replace('<!-- END OF HEADER -->',''); s=re.sub(r"<rect[^>]*/>",'',s)
    return s.replace('\n','').strip()

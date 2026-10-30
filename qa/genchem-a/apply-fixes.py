# Applies the approved fixes to the four General Chemistry I guides with exact, counted string replacements.
import sys
D = '/path/to/study-guides/general-chemistry/'

def edit(fn, pairs):
    p = D + fn
    s = open(p, encoding='utf-8').read()
    for old, new, cnt in pairs:
        n = s.count(old)
        if n != cnt:
            sys.exit('%s: expected %d of %r, found %d' % (fn, cnt, old[:80], n))
        s = s.replace(old, new)
    open(p, 'w', encoding='utf-8').write(s)
    print('ok', fn, len(pairs), 'edits')

MM_OLD = """// Molar mass rounded to two decimals, the way students will use it.
function molarMass(f){
  let s=0; for(const [e,n] of parseFormula(f)) s += Number(AM[e])*n;
  return Math.round(s*100+1e-7)/100;
}"""
MM_NEW = """// Molar mass rounded to two decimals, the way students will use it. Below 10 g/mol keep three (H 1.008, H2 2.016).
function molarMass(f){
  let s=0; for(const [e,n] of parseFormula(f)) s += Number(AM[e])*n;
  return s<10 ? Math.round(s*1000+1e-7)/1000 : Math.round(s*100+1e-7)/100;
}
const mmStr = M => M.toFixed(M<10 ? 3 : 2);"""
COMMON = [(MM_OLD, MM_NEW, 1), ("M=molarMass(f).toFixed(2);", "M=mmStr(molarMass(f));", 1)]

MAXM = """
// Highest molarity used for a solute, kept below saturation at 20-25 °C (CRC solubilities). Others have no limit here.
const MAXM = {CuSO4:1.2, KNO3:2.5, KCl:3.5, NaCl:5.0, NaHCO3:1.0, Na2SO4:1.5, Na2CO3:1.8, Na3PO4:0.8, 'Ba(OH)2':0.15};
const maxM = f => MAXM[f] || 1e9;"""
DIL = "const DILUTES = ['HCl','HNO3','H2SO4','NaOH','NH3','NaCl','CuSO4','KCl','KNO3'];"
SOLN_SHARED = [
    (DIL, DIL + MAXM, 1),
    ("const Mt=g3(0.1,2.5), Mn=Number(Mt);", "const Mt=g3(0.1,Math.min(2.5,maxM(f))), Mn=Number(Mt);", 1),
    ("const m1=g3(1,12), m1n=Number(m1);", "const m1=g3(1,Math.min(12,maxM(f))), m1n=Number(m1);", 1),
    ("{type:'sol', v:g3(10,150), M:g3(0.1,1.5)}", "{type:'sol', v:g3(10,150), M:g3(0.1,Math.min(1.5,maxM(A.f)))}", 1),
    ("{type:'mL', M:g3(0.1,1.5)}", "{type:'mL', M:g3(0.1,Math.min(1.5,maxM(B.f)))}", 1),
    ("R[i].Mo=g3(0.1,1.0); R[j].Mo=g3(0.1,1.0);", "R[i].Mo=g3(0.1,Math.min(1.0,maxM(R[i].f))); R[j].Mo=g3(0.1,Math.min(1.0,maxM(R[j].f)));", 1),
    ("MMs=MM.toFixed(2), name=SOLUTES[f]", "MMs=mmStr(MM), name=SOLUTES[f]", 1),
    ("S.A.M.toFixed(2)", "mmStr(S.A.M)", 2),
    ("S.B.M.toFixed(2)", "mmStr(S.B.M)", 2),
    ("Pd.M.toFixed(2)", "mmStr(Pd.M)", 1),
]

edit('mole-and-molar-mass-study-guide.html', COMMON + [
    ("o={v:M, s:M.toFixed(2), k:key,", "o={v:M, s:mmStr(M), k:key,", 1),
    ("'. Use the value from the list above, rounded to two decimal places.'", "'. Use the value from the list above.'", 1),
    ("factors:[fSub(k,uae,up,true,en+' atoms',W)], unit:uae,", "factors:[fSub(k,uae,W+' '+fs,true,en+' atoms',W)], unit:uae,", 1),
    ("ratioStep, node('mol '+I.ion,'b')", "step('× ions in the formula',true), node('mol '+I.ion,'b')", 1),
    ("const paren=s.f.indexOf('(')>=0, repeat=parseFormula(s.f).length!==comp.length;",
     "const paren=s.f.indexOf('(')>=0, repeat=parseFormula(s.f).length!==comp.length, reps=comp.filter(([e])=>parseFormula(s.f).filter(x=>x[0]===e).length>1).map(([e])=>e);", 1),
    ("repeat ? ' One element appears in two places in this formula. Count both.' :",
     "repeat ? (reps.length>1 ? ' '+reps.slice(0,-1).join(', ')+' and '+reps[reps.length-1]+' each appear in two places in this formula. Count both places.' : ' One element appears in two places in this formula. Count both.') :", 1),
    ("""  // Stopped before the last step.
  o.factors.forEach((f,i)=>{ if(i<n-1) errors.push({value:partial[i], msg:'That is the '+f.after+'. The question asks for something else, so keep going: '+o.factors[i+1].name.toLowerCase()+'.'}); });
  // One factor upside down, or left out.
  o.factors.forEach(f=>{
    const r=f.top.v/f.bot.v;
    if(r!==1) errors.push({value:ans/(r*r), msg:f.inv});
    if(n>1 && f.skip && r!==1) errors.push({value:ans/r, msg:f.skip});
  });""",
     """  // One factor upside down, or left out.
  const slipsOf = f => {
    const r=f.top.v/f.bot.v;
    if(r!==1) errors.push({value:ans/(r*r), msg:f.inv});
    if(n>1 && f.skip && r!==1) errors.push({value:ans/r, msg:f.skip});
  };
  // Formula-subscript slips go first: when two slips give the same number, clean() keeps the first, more specific one.
  o.factors.filter(f=>f.kind==='sub').forEach(slipsOf);
  // Stopped before the last step.
  o.factors.forEach((f,i)=>{ if(i<n-1) errors.push({value:partial[i], msg:'That is the '+f.after+'. The question asks for something else, so keep going: '+o.factors[i+1].name.toLowerCase()+'.'}); });
  o.factors.filter(f=>f.kind!=='sub').forEach(slipsOf);""", 1),
    ("note:'was used in photographic film'", "note:'is used to make the silver halides in photographic film'", 1),
    ("note:'is washing soda'", "note:'is soda ash; washing soda is its decahydrate'", 1),
    ("{f:'K3PO4', name:'potassium phosphate', kind:'ion', note:'is used in fertilizers'}",
     "{f:'K3PO4', name:'potassium phosphate', kind:'ion', note:'is a strongly basic salt, related to the potassium phosphates used in fertilizers'}", 1),
    ("{f:'(NH4)3PO4', name:'ammonium phosphate', kind:'ion', note:'is a common fertilizer'}",
     "{f:'(NH4)3PO4', name:'ammonium phosphate', kind:'ion', note:'is unstable at room temperature; the related ammonium phosphates NH<sub>4</sub>H<sub>2</sub>PO<sub>4</sub> and (NH<sub>4</sub>)<sub>2</sub>HPO<sub>4</sub> are common fertilizers'}", 1),
])

edit('stoichiometry-study-guide.html', COMMON + [
    ("S.A.M.toFixed(2)", "mmStr(S.A.M)", 2),
    ("S.B.M.toFixed(2)", "mmStr(S.B.M)", 2),
    ("r.M.toFixed(2)", "mmStr(r.M)", 1),
    ("Pd.M.toFixed(2)", "mmStr(Pd.M)", 1),
    ("L.M.toFixed(2)", "mmStr(L.M)", 1),
    ("E.M.toFixed(2)", "mmStr(E.M)", 1),
    ("    if(left/E.g < 0.10) continue;\n",
     "    if(left/E.g < 0.10) continue;\n    if(Math.abs(left-used) < 0.06*E.g) continue;   // so the mass that reacts is never graded as the mass left over\n", 1),
])

edit('solution-stoichiometry-study-guide.html', COMMON + SOLN_SHARED + [
    ("Mt=mol4(0.1,0.25), Vt=vol2(15,45);", "Mt=mol4(0.1,Math.min(0.25,maxM(T.f))), Vt=vol2(15,45);", 1),
    ("if(S.ans<0.02 || S.ans>1.5) continue;", "if(S.ans<0.02 || S.ans>Math.min(1.5,maxM(An.f))) continue;", 1),
    ("Ma=mol4(0.1,0.3), Mt=mol4(0.1,0.3);", "Ma=mol4(0.1,Math.min(0.3,maxM(An.f))), Mt=mol4(0.1,Math.min(0.3,maxM(T.f)));", 1),
    ("return 'Check '+bad.map(k=>SYM[k]).join(' and ')+'. The 1s",
     "return 'Check '+(bad.length>1 ? bad.slice(0,-1).map(k=>SYM[k]).join(', ')+' and '+SYM[bad[bad.length-1]] : SYM[bad[0]])+'. The 1s", 1),
])

edit('solutions-and-gases-study-guide.html', COMMON + SOLN_SHARED + [
    ("MMs=MM.toFixed(2), name=GASES[f]", "MMs=mmStr(MM), name=GASES[f]", 1),
    ("r.M.toFixed(2)+' g/mol = '", "mmStr(r.M)+' g/mol = '", 1),
    ("B.PA={want:c.gi.Patm,tol:0.003}", "B.PA={want:c.gi.Patm,tol:0.006}", 1),
    ("B.PB={want:c.go.Patm,tol:0.003}", "B.PB={want:c.go.Patm,tol:0.006}", 1),
    ("const want={P:{want:Pa,tol:0.003},", "const want={P:{want:Pa,tol:0.006},", 1),
    ("const blanks={TB:{want:gv.TK,tol:0.002}, PB:{want:gv.Patm,tol:0.003}};", "const blanks={TB:{want:gv.TK,tol:0.002}, PB:{want:gv.Patm,tol:0.006}};", 1),
    ("    if(A.st!=='g' && B.st!=='g') continue;\n",
     "    const gas = s => s.st==='g' && s.f!=='SO3';   // SO3 condenses below 45 °C, so it is only ever weighed\n    if(!gas(A) && !gas(B)) continue;\n", 1),
    ("if(A.st==='g' && (B.st!=='g' || Math.random()<0.8)) from=", "if(gas(A) && (!gas(B) || Math.random()<0.8)) from=", 1),
    ("    if(B.st!=='g') to={type:'g'};\n", "    if(!gas(B)) to={type:'g'};\n", 1),
    ("    const S=mkChain(A,B,from,to,3); S.same=same;\n",
     "    const S=mkChain(A,B,from,to,3); S.same=same;\n    // SO2 liquefies above about 1.5 atm near 0 °C, so keep it below that.\n    if((A.f==='SO2' && from.type==='gas' && gasVals(from).Patm>1.5) || (B.f==='SO2' && to.type==='gasV' && gasVals(to).Patm>1.5)) continue;\n", 1),
    ("if(to.type==='gasP' && (S.ans<0.1 || S.ans>40)) continue;", "if(to.type==='gasP' && (S.ans<0.1 || S.ans>4)) continue;", 1),
    ("if(S.ans<0.1 || S.ans>30) continue;", "if(S.ans<0.1 || S.ans>4) continue;", 1),
    ("M:g3(0.1,2)}", "M:g3(0.1,Math.min(2,maxM(So.f)))}", 3),
    ("Number(g3(0.1,2))*G.c/So.c", "Number(g3(0.1,Math.min(2,maxM(So.f))))*G.c/So.c", 1),
    ("    if(TC>0) vErr.push({value:Vt*TC/gv.TK, msg:T_MSG});\n",
     "    vErr.push({value:act, msg:'That is the actual volume collected. The theoretical yield comes from the limiting reactant.'});\n    if(TC>0) vErr.push({value:Vt*TC/gv.TK, msg:T_MSG});\n", 1),
    ("    vErr.push({value:L.yn, msg:'That is the moles of '+fp+'. Use V = nRT ÷ P to turn the moles into liters.'});\n    vErr.push({value:act, msg:'That is the actual volume collected. The theoretical yield comes from the limiting reactant.'});\n",
     "    vErr.push({value:L.yn, msg:'That is the moles of '+fp+'. Use V = nRT ÷ P to turn the moles into liters.'});\n", 1),
])

// Independently typed reference data and arithmetic (not copied from the guides).
'use strict';
// IUPAC 2021 abridged/conventional standard atomic weights
const AW = {H: 1.008, He: 4.0026, Li: 6.94, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305, Al: 26.982,
  S: 32.06, Cl: 35.45, Ar: 39.95, K: 39.098, Ca: 40.078, Fe: 55.845, Zn: 65.38, Kr: 83.798, Xe: 131.29};
function formula(f){
  const out = {}; const re = /\(([^()]+)\)(\d*)|([A-Z][a-z]?)(\d*)/g; let m;
  while((m = re.exec(f))){
    if(m[1]){ const k = m[2] ? +m[2] : 1; const inner = formula(m[1]); for(const e in inner) out[e] = (out[e] || 0) + inner[e] * k; }
    else out[m[3]] = (out[m[3]] || 0) + (m[4] ? +m[4] : 1);
  }
  return out;
}
function MM(f){ const c = formula(f); let s = 0; for(const e in c){ if(AW[e] == null) throw new Error('no atomic weight for ' + e); s += AW[e] * c[e]; } return s; }
const R = 0.0820574;          // L·atm/(mol·K), CODATA 2018
const RJ = 8.314462618;       // J/(mol·K)
const T0 = 273.15;
const ATM = {atm: 1, torr: 760, mmHg: 760, kPa: 101.325, bar: 1.01325, psi: 14.6959, Pa: 101325};
const VM = R * T0;            // 22.414 L/mol at 0 °C, 1 atm
// Vapor pressure of water, torr (CRC Handbook)
const VPW = {15: 12.79, 16: 13.64, 17: 14.54, 18: 15.49, 19: 16.49, 20: 17.54, 21: 18.66, 22: 19.84, 23: 21.08, 24: 22.39, 25: 23.77, 26: 25.22, 27: 26.75, 28: 28.37, 29: 30.06, 30: 31.84, 35: 42.20, 40: 55.37};
// van der Waals constants, a in L²·atm/mol², b in L/mol (general-chemistry textbook table, e.g. Brown et al.; Zumdahl)
const VDW = {He: [0.0341, 0.02370], Ne: [0.211, 0.0171], Ar: [1.34, 0.0322], Kr: [2.32, 0.0398], Xe: [4.19, 0.0510], H2: [0.244, 0.0266],
  N2: [1.39, 0.0391], O2: [1.36, 0.0318], Cl2: [6.49, 0.0562], H2O: [5.46, 0.0305], CH4: [2.25, 0.0428], CO2: [3.59, 0.0427], NH3: [4.17, 0.0371]};
// critical temperatures, K
const TC = {He: 5.19, H2: 33.2, Ne: 44.4, N2: 126.2, O2: 154.6, Ar: 150.7, CH4: 190.6, Kr: 209.4, Xe: 289.7, CO2: 304.1, NH3: 405.4, Cl2: 416.9, H2O: 647.1};
// normal boiling / sublimation points, °C (for "is it really a gas" checks)
const BP = {H2: -252.9, He: -268.9, CH4: -161.5, NH3: -33.3, Ne: -246.0, N2: -195.8, O2: -183.0, Ar: -185.8, CO2: -78.5, Cl2: -34.0, SO2: -10.0, Kr: -153.4, Xe: -108.1, SF6: -64.0, C3H8: -42.1, C2H2: -84.0, CO: -191.5, HCl: -85.1, NO2: 21.2, N2O: -88.5,
  C5H12: 36.1, C6H14: 68.7, C2H6O: 78.4, C6H6: 80.1, CHCl3: 61.2, CCl4: 76.7, C4H10: -0.5, ethanol: 78.4};
const NAME2F = {hydrogen: 'H2', helium: 'He', methane: 'CH4', ammonia: 'NH3', neon: 'Ne', nitrogen: 'N2', oxygen: 'O2', argon: 'Ar', 'carbon dioxide': 'CO2',
  chlorine: 'Cl2', 'sulfur dioxide': 'SO2', krypton: 'Kr', xenon: 'Xe', propane: 'C3H8', acetylene: 'C2H2', 'nitrogen dioxide': 'NO2', 'sulfur hexafluoride': 'SF6',
  'carbon monoxide': 'CO', 'hydrogen chloride': 'HCl'};
// standard enthalpies of formation, kJ/mol, 25 °C (NIST/CODATA as tabulated in general-chemistry texts)
const HF = {'CH4(g)': -74.8, 'O2(g)': 0, 'CO2(g)': -393.5, 'H2O(l)': -285.8, 'H2O(g)': -241.8, 'C3H8(g)': -103.8, 'H2(g)': 0, 'N2(g)': 0, 'NH3(g)': -45.9,
  'CaCO3(s)': -1206.9, 'CaO(s)': -635.1, 'Al(s)': 0, 'Fe2O3(s)': -824.2, 'Al2O3(s)': -1675.7, 'Fe(s)': 0, 'NO(g)': 90.25, 'SO2(g)': -296.8, 'SO3(g)': -395.7,
  'C6H12O6(s)': -1273.3, 'H2O2(l)': -187.8, 'Mg(s)': 0, 'MgO(s)': -601.6, 'NO2(g)': 33.2, 'C2H5OH(l)': -277.7, 'C(s)': 0, 'CO(g)': -110.5, 'C2H2(g)': 226.7,
  'C2H4(g)': 52.4, 'C2H6(g)': -84.7, 'S(s)': 0, 'N2O5(g)': 11.3, 'HNO3(l)': -174.1, 'O(g)': 249.2, 'O3(g)': 142.7};
// specific heats, J/(g·°C)
const CSP = {water: 4.184, aluminum: 0.897, iron: 0.449, copper: 0.385, silver: 0.235, gold: 0.129, ethanol: 2.44, glass: 0.84, granite: 0.79, titanium: 0.523, lead: 0.129};
// enthalpies of solution at infinite dilution, kJ/mol (CRC)
const HSOLN = {NH4NO3: 25.69, KNO3: 34.89, NH4Cl: 14.78, CaCl2: -81.33, NaOH: -44.51, KCl: 17.22, LiCl: -37.03, KOH: -57.61};
// solubility, g per 100 g water, at 0/10/20/30 °C (CRC)
const SOLUB = {KNO3: [13.3, 20.9, 31.6, 45.8], NH4Cl: [29.4, 33.3, 37.2, 41.4], KCl: [27.6, 31.0, 34.0, 37.0], NH4NO3: [118, 150, 192, 242], CaCl2: [59.5, 65.0, 74.5, 100],
  NaOH: [42, 51, 109, 119], LiCl: [69.2, 74.5, 83.5, 86.2], KOH: [97, 103, 112, 126]};
function solubAt(f, T){ const s = SOLUB[f]; if(!s) return Infinity; const x = Math.max(0, Math.min(30, T)) / 10, i = Math.min(2, Math.floor(x)); return s[i] + (s[i + 1] - s[i]) * (x - i); }
const DH_NEUT = -55.8;   // kJ per mol water, strong acid + strong base, 25 °C
const sig3 = x => Number(Number(x).toPrecision(3));
module.exports = {AW, formula, MM, R, RJ, T0, ATM, VM, VPW, VDW, TC, BP, NAME2F, HF, CSP, HSOLN, SOLUB, solubAt, DH_NEUT, sig3};

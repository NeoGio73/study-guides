// Extracts molecule data and keyed answers from the two stereochemistry pages into stereo_extract.json
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../organic-chemistry');
const lab=fs.readFileSync(root+'/stereochemistry-lab.html','utf8');
const prac=fs.readFileSync(root+'/stereochemistry-practice.html','utf8');
function grabConst(src,name){const m=src.match(new RegExp('const '+name+'=(.*?);\\n'));return JSON.parse(m[1]);}
const out={lab:{MOLECULES:grabConst(lab,'MOLECULES'),MISSIONS:grabConst(lab,'MISSIONS'),MODEL_DATA:grabConst(lab,'MODEL_DATA')}};
const molData=JSON.parse(prac.match(/<script type="application\/json" id="mol-data">([\s\S]*?)<\/script>/)[1]);
const qsrc=prac.match(/var QUESTIONS = (\[[\s\S]*?\n  \]);/)[1];
const R="<i>R</i>",S="<i>S</i>",E="<i>E</i>",Z="<i>Z</i>",ROTATES="It depends on how the model is rotated",REL=["Enantiomers","Diastereomers","Identical (the same compound)","Constitutional isomers"];
const QUESTIONS=eval(qsrc);
out.practice={MOLS:molData,QUESTIONS};
fs.writeFileSync(__dirname+'/stereo_extract.json',JSON.stringify(out,null,1));
console.log('lab molecules',out.lab.MOLECULES.length,'missions',out.lab.MISSIONS.length,'practice mols',Object.keys(molData).length,'questions',QUESTIONS.length);
console.log(Object.keys(molData).join(' '));

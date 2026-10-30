Clazz.declarePackage("JM");
Clazz.load(["JM.MinObject"], "JM.MinPosition", null, function(){
var c$ = Clazz.declareType(JM, "MinPosition", JM.MinObject);
Clazz.makeConstructor(c$, 
function(data, ddata){
Clazz.superConstructor (this, JM.MinPosition, []);
this.data = data;
this.ddata = ddata;
}, "~A,~A");
});
;//5.0.1-v7 Sun Sep 20 11:26:09 CDT 2026

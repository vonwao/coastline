'use strict';
/* ---------------------------------------------------------------- Vegetation presets -------
   Asked for on 6 November: "I usually don't see shrubs that big on the beach... Florida and California, could be 2
   different settings. I'd like to actually have selectable vegetation, maybe have 5-10 presets."

   A preset is a coast's plant community, from the sea inland: the foredune (grass tufts, and runners or
   mats on the sand), the back dune (shrubs), then the trees. It fills the eleven model slots the plant
   shaders already know (js/shaders/trees.js, plantGrows):
     0, 1  palms              4  the pine            5  the conifer         2, 3, 8, 9  broadleaf trees
     6     the shrub          7  the grass           10 the ground layer: ferns under woods, or a mat on
                                                         the open dunes (vine, ice plant, heather)
   and sets the rules all the plant shaders share (COVER_GLSL in js/shaders/view.js): the small plants'
   sizes, how far the grassy front reaches before shrubs take over, the trees' mix, where the ground layer
   grows, and each model's colour. Classic is the mix as it always was.

   Memory stays as it was: the eleven slots are baked again (about a second) when the vegetation changes,
   instead of keeping every preset's models at once. So one preset is drawn at a time: chosen by a recipe or
   the studio (elements.vegetation), else ?veg= in the address, else the coast's own (veg in LOCATIONS),
   else Classic. A dissolve between two coasts with different presets holds the outgoing picture still
   while the new one bakes (see cutTo in js/frame.js). */
const VEG={baked:null,baking:null,want:null,sets:[]};
/* Each model's colour: a factor on red, green and blue, and how much colour is taken out. */
const T0=[1,1,1,0];
const VEG_PRESETS={
  classic:{name:'Classic',about:'The mix as it has been: palms and broadleaf trees, pines and conifers, round shrubs and grass clumps, ferns under the woods.'},
  florida:{name:'Florida',
    about:'North and central Florida, Gulf and Atlantic: sea oats and railroad vine on the foredune, saw palmetto and sea grape behind, then cabbage palms, live oaks and slash pines.',
    models:[()=>makeFanPalm(201,13,.55,.36),()=>makeFanPalm(223,10.5,.58,.40),
      ()=>makeBroadleaf(241,10,1.55,.85,.44,.22,{size:.12,aspect:.5,n:.95}),()=>makeBroadleaf(257,7,1.0,.5,.52,.34,{size:.19,aspect:.92,n:.55}),
      ()=>makePine(273,20,4.2,.42,.2,{bend:.25,lo:.72,flat:.55,needle:.17,aspect:.22}),()=>makePine(289,17,3.6,.44,.22,{bend:.35,lo:.65,flat:.6,needle:.17,aspect:.22}),
      ()=>makeFanPalm(301,1.5,.62,.55,{low:true}),()=>makeGrass(313,.55,.6,.62,{n:90,spread:.55,base:.3,stiff:.3,heads:[4,2.8]}),
      ()=>makeOvalTree(331,11,4.6,.46,.26,{size:.17,aspect:.45,n:1}),()=>makeMultiStem(349,4.5,3.8,.54,.36,{size:.2,aspect:.92,n:.5}),
      ()=>makeMat(363,1.6,.5,.42,{leafSize:.06,aspect:.95})],
    names:['cabbage palm','cabbage palm','live oak','sea grape (tree)','slash pine','slash pine','saw palmetto','sea oats','southern magnolia','sea grape','railroad vine'],
    tint:[[1,1.02,.95,0],[1,1.02,.95,0],[.85,.9,.85,.1],[1.05,1.08,.9,0],[.95,1,.95,.05],[.95,1,.95,.05],[1.15,1.15,1.12,.35],[1.15,1.1,.9,.25],[.8,.9,.85,0],[1.05,1.08,.9,0],[1.1,1.12,.9,0]],
    S:[.85,1.2,.7,1.25],G:[.12,.45,.97,.62],T:[.32,.28,.1,.18],M:[1,.7,.28,.5],F:[.7,1.3]},
  california:{name:'California',
    about:'Central California: European beach grass and ice plant on the dunes, coastal sage scrub behind, then coast live oaks, Monterey pines and wind-shaped Monterey cypress.',
    models:[makeNothing,makeNothing,
      ()=>makeBroadleaf(441,10,1.35,.65,.40,.2,{size:.11,aspect:.62,n:1.05}),()=>makeBroadleaf(457,8.5,1.25,.75,.40,.22,{size:.11,aspect:.62,n:1.05}),
      ()=>makePine(473,18,5.5,.40,.2,{bend:.4,lo:.4,flat:.75,limbs:1.4,needle:.16,aspect:.25}),()=>makeCypress(489,14,7,.38,.18),
      ()=>makeShrub(501,1.25,.52,.4,{flat:.8,leaf:[.04,.45],n:1.6}),()=>makeGrass(513,.75,.58,.55,{n:300,spread:.6,base:.35,stiff:.45,width:.8}),
      ()=>makeCypress(531,11,6,.40,.2),()=>makeMultiStem(549,4,3,.48,.3,{size:.09,aspect:.5,n:1.6}),
      ()=>makeMat(563,1.3,.52,.5,{succulent:true})],
    names:['','','coast live oak','coast live oak','Monterey pine','Monterey cypress','coastal sage scrub','European beach grass','Monterey cypress','toyon','ice plant'],
    tint:[T0,T0,[.8,.88,.8,.1],[.8,.88,.8,.1],[.9,.95,.9,.05],[.75,.85,.8,.05],[1.2,1.18,1.12,.5],[1.15,1.12,.95,.25],[.75,.85,.8,.05],[.85,.9,.8,.05],[1.1,1.2,.85,0]],
    S:[.8,1.25,.6,1.2],G:[.1,.45,.96,.58],T:[0,.32,.32,0],M:[1,.75,.25,.5],F:[.7,1.4]},
  hawaii:{name:'Hawaii and the tropical Pacific',
    about:'Coconut palms, beach heliotrope and kamani by the sand, ironwood, naupaka shrubs and beach morning glory on the dunes.',
    models:[()=>makePalm(11,15,.56,.28),()=>makePalm(29,12.5,.60,.36),
      ()=>makeBroadleaf(641,6.5,1.15,.7,.58,.4,{size:.14,aspect:.5,n:.9}),()=>makeBroadleaf(657,12,1.2,.6,.5,.3,{size:.2,aspect:.55,n:.6}),
      ()=>makeCasuarina(673,16,5,.42,.3),()=>makeCasuarina(689,12,4,.44,.32),
      ()=>makeShrub(701,1.5,.6,.45,{flat:.85,leaf:[.11,.45],n:.6}),()=>makeGrass(713,.5,.58,.55,{n:220,spread:.8,base:.45}),
      ()=>makeOvalTree(731,11,5,.5,.32,{size:.2,aspect:.55,n:.6}),()=>makeMultiStem(749,6,4.5,.52,.34,{size:.17,aspect:.9,n:.55}),
      ()=>makeMat(763,1.8,.52,.42,{leafSize:.06,aspect:1})],
    names:['coconut palm','coconut palm','beach heliotrope','kamani','ironwood','ironwood','naupaka','beach dropseed','kamani','hau','beach morning glory'],
    tint:[T0,T0,[1.2,1.22,1.15,.45],T0,[1,1.05,.95,.3],[1,1.05,.95,.3],[1.15,1.15,.95,0],[1.1,1.08,.95,.15],T0,[1.05,1.05,.92,0],[1.1,1.12,.9,0]],
    S:[.8,1.3,.6,1.2],G:[0,.4,.95,.5],T:[.5,.14,.08,.25],M:[1,.6,.25,.5],F:[.7,1.3]},
  mediterranean:{name:'Mediterranean',
    about:'Marram on the dunes and sea fig on the sand, maquis shrubs behind, then umbrella-shaped stone pines, Aleppo pines, holm oaks, olives and the odd tall cypress.',
    models:[makeNothing,makeNothing,
      ()=>makeBroadleaf(841,10,1.25,.5,.40,.2,{size:.1,aspect:.55,n:1.1}),()=>makeBroadleaf(857,7,1.0,.6,.55,.3,{size:.09,aspect:.25,n:1.1}),
      ()=>makePine(873,16,6.5,.42,.22,{bend:.15,lo:.8,flat:.35,up:.45,limbs:1.3,needle:.18,aspect:.2}),()=>makePine(889,14,4.5,.48,.3,{bend:.8,lo:.5,flat:.7,needle:.16,aspect:.22}),
      ()=>makeShrub(901,1.5,.44,.26,{flat:.85,leaf:[.045,.5],n:1.7}),()=>makeGrass(913,.7,.6,.62,{n:320,spread:.55,base:.35,stiff:.4,width:.7}),
      ()=>makeConifer(931,14,1.1,.36,.16),()=>makeMultiStem(949,5,3.5,.5,.3,{size:.09,aspect:.4,n:1.6}),
      ()=>makeMat(963,1.2,.5,.48,{succulent:true})],
    names:['','','holm oak','olive','stone pine','Aleppo pine','maquis (lentisk, myrtle)','marram','Italian cypress','carob','sea fig'],
    tint:[T0,T0,[.8,.85,.8,.1],[1.2,1.2,1.2,.6],[.9,.95,.88,.05],[1.05,1.05,.95,.1],[.85,.9,.8,.1],[1.15,1.12,1,.35],[.75,.85,.78,0],[.9,.95,.85,.05],[1.1,1.15,.9,0]],
    S:[.8,1.2,.6,1.2],G:[.05,.42,.95,.55],T:[0,.45,.12,0],M:[1,.5,.25,.5],F:[.7,1.3]},
  atlantic:{name:'Atlantic dunes',
    about:'Northern Europe, Brittany to Denmark: marram dunes with heather, gorse in yellow flower behind, wind-cut oaks and hawthorn, maritime and Scots pines further in.',
    models:[makeNothing,makeNothing,
      ()=>makeBroadleaf(1041,8,1.2,.9,.44,.26,{size:.12,aspect:.55,n:1.0}),()=>makeBroadleaf(1057,10,1.1,.6,.5,.32,{size:.16,aspect:.7,n:.9}),
      ()=>makePine(1073,16,4.5,.42,.2,{bend:.9,lo:.62,flat:.6,needle:.17,aspect:.22}),()=>makePine(1089,15,4,.44,.24,{bend:.4,lo:.68,flat:.55,needle:.13,aspect:.25}),
      ()=>makeShrub(1101,1.4,.42,.24,{flat:.9,leaf:[.03,.25],n:2,flowers:.12}),()=>makeGrass(1113,.75,.62,.66,{n:340,spread:.55,base:.35,stiff:.4,width:.65}),
      ()=>makeOvalTree(1131,9,4,.46,.28,{size:.12,aspect:.55,n:1.3}),()=>makeMultiStem(1149,4.5,3,.46,.3,{size:.08,aspect:.6,n:1.8}),
      ()=>makeShrub(1163,.45,.4,.5,{flat:.7,leaf:[.02,.4],n:1.2})],
    names:['','','oak','sycamore','maritime pine','Scots pine','gorse','marram','oak','hawthorn','heather'],
    tint:[T0,T0,[.85,.9,.82,.05],T0,[.9,.95,.88,.05],[.9,.92,.9,.1],[.75,.85,.7,.1],[1.15,1.12,1.02,.4],[.85,.9,.82,.05],[.9,.95,.85,.05],[1.1,.8,1.05,.3]],
    S:[.8,1.2,.55,1.1],G:[.15,.42,.97,.65],T:[0,.42,.14,0],M:[1,.55,.3,.6],F:[.7,1.3]},
  northwest:{name:'Pacific Northwest',
    about:'Oregon to British Columbia: dune grass on the sand, salal thickets, then Sitka spruce, western hemlock, shore pine and red alder, with sword ferns under them.',
    models:[makeNothing,makeNothing,
      ()=>makeBroadleaf(1241,14,1.0,.3,.5,.3,{size:.12,aspect:.65,n:.95}),()=>makeBroadleaf(1257,13,1.2,.45,.52,.34,{size:.2,aspect:.9,n:.6}),
      ()=>makePine(1273,10,3.5,.40,.2,{bend:1.4,lo:.35,flat:.75,limbs:1.3,needle:.13,aspect:.25}),()=>makeConifer(1289,20,4.2,.34,.14),
      ()=>makeShrub(1301,1.3,.44,.22,{flat:.9,leaf:[.06,.6],n:1.5}),()=>makeGrass(1313,.75,.6,.5,{n:200,spread:.7,base:.35,width:1.6}),
      ()=>makeConifer(1331,17,3.6,.36,.16),()=>makeMultiStem(1349,6,3.5,.5,.36,{size:.1,aspect:.35,n:1.5}),
      ()=>makeFern(1363,1.5,.44,.45)],
    names:['','','red alder','bigleaf maple','shore pine','Sitka spruce','salal','dune wildrye','western hemlock','willow','sword fern'],
    tint:[T0,T0,T0,T0,[.9,.95,.9,.05],[.82,.92,1,.05],[.75,.85,.75,0],[1,1.1,1.1,.3],[.8,.9,.88,0],T0,T0],
    S:[.8,1.25,.6,1.2],G:[0,.38,.94,.45],T:[0,.2,.5,0],M:[0,.6,0,0],F:[.7,1.4]},
  australia:{name:'Australia',
    about:'The east coast: spinifex runners and pigface on the dunes, coastal wattle and tea tree behind, pandanus by the sand, she-oaks, banksias and eucalypts.',
    models:[()=>makePandanus(1401,7,.52,.38),()=>makePandanus(1423,5.5,.55,.42),
      ()=>makeBroadleaf(1441,8,1.0,.5,.48,.3,{size:.11,aspect:.22,n:.95}),()=>makeBroadleaf(1457,15,.9,.25,.5,.32,{size:.12,aspect:.22,n:.9}),
      ()=>makeCasuarina(1473,12,4,.42,.26),()=>makeCasuarina(1489,9,3.5,.44,.3),
      ()=>makeShrub(1501,1.6,.48,.3,{flat:.8,leaf:[.05,.3],n:1.5}),()=>makeGrass(1513,.5,.62,.6,{n:260,spread:2.2,base:.6,stiff:.2,width:.7}),
      ()=>makeOvalTree(1531,14,5,.5,.3,{size:.12,aspect:.22,n:1.1}),()=>makeMultiStem(1549,5,3.5,.46,.3,{size:.05,aspect:.4,n:2.4}),
      ()=>makeMat(1563,1.3,.5,.5,{succulent:true})],
    names:['pandanus','pandanus','coast banksia','eucalyptus','she-oak','she-oak','coastal wattle','spinifex','eucalyptus','tea tree','pigface'],
    tint:[[1.05,1.05,.95,.1],[1.05,1.05,.95,.1],[.95,1,.9,.25],[1.05,1.1,1.15,.45],[1,1,.95,.3],[1,1,.95,.3],[.95,1,.88,.15],[1.2,1.15,.95,.35],[1.05,1.1,1.15,.45],[.9,.95,.85,.1],[1.1,1.15,.9,0]],
    S:[.8,1.3,.6,1.2],G:[.08,.42,.96,.55],T:[.18,.3,.1,.15],M:[1,.5,.25,.5],F:[.7,1.3]},
};
const VEG_IDS=Object.keys(VEG_PRESETS);
/* The region's preset for a place on Earth, roughly: for real coasts, and for real conditions followed at
   a beach. Classic outside the regions there are presets for, except that the tropics get the tropical
   Pacific's. */
function vegForPlace(lat,lon){
  if(lat==null||lon==null) return null;
  const inB=(a,b,c,d)=>lat>=a&&lat<=b&&lon>=c&&lon<=d;
  if(inB(18,23,-161,-154)) return 'hawaii';
  if(inB(24,31.5,-88,-79.5)) return 'florida';
  if(inB(32,42,-125,-114)) return 'california';
  if(inB(42,60,-140,-120)) return 'northwest';
  if(inB(36,62,-11,-5)||inB(43.5,62,-5,12)) return 'atlantic';
  if(inB(30,46,-5.5,37)) return 'mediterranean';
  if(inB(-44,-10,112,154)) return 'australia';
  if(Math.abs(lat)<23.5) return 'hawaii';
  return 'classic';
}
/* Which preset a shot draws: a recipe's or the studio's choice, else ?veg=, else the place (a real coast,
   or real conditions followed at a beach), else the coast's own (veg in js/scenes.js), else Classic. */
function vegOf(S){
  const o=S&&S.opt?.vegetation; if(o&&o!=='coast'&&VEG_PRESETS[o]) return o;
  const q=typeof Q!=='undefined'&&Q.get('veg'); if(q&&VEG_PRESETS[q]) return q;
  const L=S&&S.L;
  if(L&&L.real){ if(L.vegPlace===undefined) L.vegPlace=vegForPlace(L.real.meta.lat,L.real.meta.lon); if(L.vegPlace) return L.vegPlace; }
  if(L&&L.form!==6&&typeof LIVE!=='undefined'&&LIVE.on&&LIVE.lat!=null){ const p=vegForPlace(LIVE.lat,LIVE.lon); if(p&&p!=='classic') return p; }
  const c=L&&L.veg; return c&&VEG_PRESETS[c]?c:'classic';
}
function vegModels(id){ const P=VEG_PRESETS[id]; return P&&P.models?P.models:plantModels(); }
/* Bake a preset's models into the eleven slots (buildPlants in js/plants.js). Waits for a bake already
   running; nothing to do if it's already there. */
/* Up to two presets are kept baked at once (VEG.sets), so a dissolve between coasts with different
   plants draws both sides as they are, and a second set is only made once a second preset is wanted
   (about 280 MB of textures each). Baking a third reuses the set the shot on screen isn't using. The set
   being drawn is put in the globals by vegActivate; VEG.baked is its preset. */
function vegSet(id){ return VEG.sets.find(s=>s.id===id&&!s.baking)||null; }
function vegActivate(set){
  if(!set||(VEG.baked===set.id&&plantA===set.A)) return;
  plantA=set.A; plantL=set.L; plantInfo=set.info; plantMesh.length=0; set.mesh.forEach((M,m)=>plantMesh[m]=M);
  VEG.baked=set.id; set.used=performance.now();
}
/* Before drawing or listing the plants of a shot: its preset's set, if it is baked. */
function vegUse(S){ const s=vegSet(vegOf(S)); if(s) vegActivate(s); return !!s; }
async function vegBake(id){
  if(!VEG_PRESETS[id]) id='classic';
  VEG.want=id;
  while(VEG.baking) await VEG.baking;
  if(vegSet(id)||VEG.want!==id) return;
  const set=vegPickSet(id);
  VEG.baking=(async()=>{ const t0=performance.now(); await buildPlants(vegModels(id),set); set.baking=false; VEG.ms=Math.round(performance.now()-t0);
    if(VEG.sets.length===1||!plantA) vegActivate(set);
    /* The plants near the drone of a shot wanting this preset were listed by other rules: list them again,
       and a crossing's height over the trees with them. */
    if(typeof state!=='undefined') for(const S of [state.cur,state.next]) if(S&&vegOf(S)===id) vegRefresh(S); })();
  try{ await VEG.baking; } finally { VEG.baking=null; }
}
/* Where to bake a preset: a new set while there are fewer than two; else the one longest unused that the
   shots on screen don't need. */
function vegPickSet(id){
  const keep=new Set(typeof state!=='undefined'?[state.cur,state.next].filter(Boolean).map(vegOf):[]);
  let set=VEG.sets.length<2?null:VEG.sets.filter(s=>!keep.has(s.id)).sort((a,b)=>a.used-b.used)[0];
  if(!set){ if(VEG.sets.length>=2) set=VEG.sets.slice().sort((a,b)=>a.used-b.used)[0]; else { set={}; VEG.sets.push(set); } }
  set.baking=true; set.id=id;
  return set;
}
/* Tools and checks that draw a shot straight away (?test): bake its preset now, all at once (about a
   second), rather than over the next frames as the live window does. */
function vegBakeNow(S){
  const id=vegOf(S); if(vegSet(id)||VEG.baking) return;
  const set=vegPickSet(id);
  buildPlants(vegModels(id),set,{sync:true}); set.baking=false; vegActivate(set);
  vegRefresh(S);
}
/* A shot made before its preset was baked: its plant list and a crossing's height profile again. */
function vegRefresh(S){
  if(S.vegMade===vegOf(S)) return;
  vegUse(S);
  if(S.meshes!==null) S.meshes=undefined;
  if(S.kind==='crossing'&&S.cross&&typeof crossProfile==='function'){ crossProfile(S); S.meshes=undefined; }
  S.vegMade=vegOf(S);
}
/* For the live window: start baking what this shot wants, without waiting. */
function vegEnsure(S){ const id=vegOf(S); if(!vegSet(id)&&!VEG.baking) vegBake(id); }
function vegReady(S){ return !!vegSet(vegOf(S)); }
/* The shared rules for what is baked now (never for what is still baking, so models and rules agree). */
let vegUCache=null,vegUKey='';
function vegUniforms(){
  const id=VEG.baked||'classic', P=VEG_PRESETS[id], key=id+(plantInfo?plantInfo[20]:0);
  if(vegUCache&&vegUKey===key) return vegUCache;
  const tint=new Float32Array(44);
  if(P.tint) P.tint.forEach((t,i)=>tint.set(t,i*4));
  const F=P.F||[.6,1.3], r10=plantInfo?plantInfo[20]*.52:.66, h10=plantInfo?plantInfo[21]*2.07:.62;
  vegUCache={uVeg:id==='classic'?0:1,uVegS:P.S||[.7,1.5,.55,1.45],uVegG:P.G||[0,.38,.94,.42],uVegT:P.T||[0,0,0,0],uVegM:P.M||[0,.5,0,0],uVegF:[F[0],F[1],r10,h10],uMTint:tint};
  vegUKey=key; return vegUCache;
}

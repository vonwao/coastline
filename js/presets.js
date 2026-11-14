'use strict';
/* ---- Ready-made scenes: named moods, each a short playlist of recipes ----
   A starting point for anyone who isn't going to learn forty-odd settings: pick "Storm watch" or "Spa
   morning" and it plays. For a venue, a mood is also a link: index.html?calm=1&preset=kava-evening plays
   that mood and nothing else, building only its coasts, so it starts in seconds.
   Each recipe gives its camera as settings (kind, height, heading, speed...) and no exact path, so every
   time a shot comes round the simulation finds a new path with those settings: a mood of three recipes
   never shows the same three shots twice. The recipes follow the glare guard's rule (js/camera.js): with
   a low sun the camera looks along the coast or away from the sun, not into it. Facing the light is kept
   for twilight and the moon, where the glow and the moon's path on the water are the point.
   Directions: camera.heading 0 looks out to sea, ±90 along the coast, 180 at the land; light.sunAzimuth
   and the moon use the same directions. The lighting setups' own sun directions are in js/scenes.js.
   This is a .js file rather than JSON because the page also runs from the file system, where it can't
   fetch files. */
const PRESETS=[
  {id:'kava-evening',name:'Kava bar evening',desc:'Sunset, blue hour and moonlight over quiet coves: slow, warm and dim, for a bar after dark.',recipes:[
    {name:'Blue hour, Crescent bay',loc:'Crescent bay',light:{preset:'dusk',warmth:2},sound:{surf:.7,wash:.8},
      camera:{kind:'angled',offshore:100,height:70,heading:-70,pitch:13,speed:1,travel:0,dur:60}},
    {name:'Sunset, Palm cove',loc:'Palm cove',light:{preset:'sunset'},sound:{surf:.7,wash:.8},
      camera:{kind:'angled',offshore:80,height:50,heading:-75,pitch:11,speed:1,travel:0,dur:60}},
    {name:'Moonlight, Broken coast',loc:'Broken coast',light:{preset:'moonlit'},sound:{surf:.7,wash:.8},
      camera:{kind:'angled',offshore:70,height:80,heading:20,pitch:12,speed:.8,travel:0,dur:60}},
  ]},
  {id:'spa-morning',name:'Spa morning',desc:'Soft morning light on clear turquoise water, small waves and slow drifts.',recipes:[
    {name:'Morning lagoon',loc:'Tropical lagoon',light:{preset:'morning'},waves:{height:.3},water:{clarity:1.6},sound:{surf:.6},
      camera:{kind:'angled',offshore:110,height:90,heading:-80,pitch:22,speed:1,travel:0,dur:60}},
    {name:'Shallows from above',loc:'Tropical shallows',light:{preset:'morning'},water:{clarity:1.2},sound:{surf:.6},
      camera:{kind:'top',offshore:70,height:160,speed:1.2,dur:50}},
    {name:'Over the palms',loc:'Palm cove',light:{preset:'morning'},sound:{surf:.6},
      camera:{kind:'canopy',height:60,heading:-55,pitch:20,speed:1.5,dur:50}},
  ]},
  {id:'storm-watch',name:'Storm watch',desc:'Dark cloud and a heavy swell breaking on cliffs and rocks.',recipes:[
    {name:'Storm on the cliffs',loc:'Sea cliffs',light:{preset:'storm'},waves:{height:3.2,period:13},sound:{wind:1.5},
      camera:{kind:'angled',offshore:100,height:80,heading:65,pitch:16,speed:1,travel:0,dur:60}},
    {name:'Storm, Broken coast',loc:'Broken coast',light:{preset:'storm'},waves:{height:3,period:12.5},sound:{wind:1.5},
      camera:{kind:'angled',offshore:100,height:90,heading:-80,pitch:20,speed:1.2,travel:0,dur:55}},
    {name:'Heavy swell on the reef',loc:'Surge reef',light:{preset:'moody'},waves:{height:2.8,period:13},sound:{wind:1.3},
      camera:{kind:'angled',offshore:130,height:120,heading:-75,pitch:24,speed:1,travel:0,dur:55}},
  ]},
  {id:'moonlit-cove',name:'Moonlit cove',desc:'Night, a bright moon and its path on the water, waves washing in.',recipes:[
    {name:'Moonlit cove',loc:'Palm cove',light:{preset:'moonlit'},sound:{surf:.8},
      camera:{kind:'angled',offshore:20,height:60,heading:45,pitch:11,speed:.8,travel:0,dur:60}},
    {name:'Moonlit bay',loc:'Crescent bay',light:{preset:'moonlit'},sound:{surf:.8},
      camera:{kind:'angled',offshore:30,height:80,heading:50,pitch:12,speed:.8,travel:0,dur:60}},
  ]},
  {id:'golden-cliffs',name:'Golden cliffs',desc:'A low, warm sun lighting cliffs and rocky headlands from the side.',recipes:[
    {name:'Golden cliffs',loc:'Sea cliffs',light:{preset:'golden',warmth:5},camera:{kind:'angled',offshore:90,height:70,heading:-75,pitch:14,speed:1,travel:0,dur:60}},
    {name:'Golden coves',loc:'Broken coast',light:{preset:'golden',warmth:5},camera:{kind:'angled',offshore:100,height:90,heading:-100,pitch:20,speed:1,travel:0,dur:60}},
    {name:'Golden bay',loc:'Crescent bay',light:{preset:'golden',warmth:5},camera:{kind:'angled',offshore:150,height:80,heading:80,pitch:18,speed:1,travel:0,dur:60}},
  ]},
  /* Straight down, a high sun's reflection sits inside the picture as a white blotch; the morning sun's
     falls outside it. */
  {id:'lagoon-above',name:'Lagoon from above',desc:'Straight down over clear tropical water: sand, reef and drifting foam.',recipes:[
    {name:'Lagoon from above',loc:'Tropical lagoon',light:{preset:'morning'},water:{clarity:1.3},camera:{kind:'top',offshore:110,height:240,speed:1.5,dur:50}},
    {name:'Shallows from above',loc:'Tropical shallows',light:{preset:'morning'},water:{clarity:1.2},camera:{kind:'top',offshore:80,height:180,speed:1.2,dur:50}},
    {name:'Palm cove from above',loc:'Palm cove',light:{preset:'highSun'},camera:{kind:'top',height:160,speed:1.5,dur:50}},
  ]},
  {id:'quiet-lake',name:'Quiet lake',desc:'A still mountain lake below snowy peaks, in morning and evening light.',recipes:[
    {name:'Lake in the morning',loc:'Alpine lake',light:{preset:'morning'},camera:{kind:'angled',offshore:120,height:70,heading:-85,pitch:16,speed:1,travel:0,dur:60}},
    {name:'Lake at golden hour',loc:'Alpine lake',light:{preset:'golden'},camera:{kind:'angled',offshore:140,height:90,heading:95,pitch:16,speed:1,travel:0,dur:60}},
  ]},
  {id:'surf-break',name:'Surf break',desc:'Long lines of swell rolling onto sandy beaches in afternoon light.',recipes:[
    {name:'Afternoon surf',loc:'Surf beach',light:{preset:'late'},waves:{height:2.4,period:14,angle:12},
      camera:{kind:'angled',offshore:80,height:60,heading:80,pitch:22,speed:1.2,travel:0,dur:55}},
    {name:'Long sand coast',loc:'Long sand coast',light:{preset:'late'},waves:{height:2.6,period:14},
      camera:{kind:'angled',offshore:100,height:80,heading:85,pitch:20,speed:1.2,travel:0,dur:55}},
    {name:'Surf from above',loc:'Surf beach',light:{preset:'late'},waves:{height:2.4,period:14,angle:12},camera:{kind:'top',offshore:60,height:140,speed:1.5,dur:45}},
  ]},
  {id:'sunrise-coast',name:'Sunrise coast',desc:'The sun coming up over palm coves and a forested bay: warm light and a glowing sky.',recipes:[
    {name:'Palms at sunrise',loc:'Palm cove',light:{preset:'sunrise'},camera:{kind:'canopy',height:60,heading:-60,pitch:18,speed:1.5,dur:55}},
    {name:'Forest at sunrise',loc:'Crescent bay',light:{preset:'sunrise'},camera:{kind:'angled',offshore:60,height:85,heading:75,pitch:13,speed:1.2,travel:0,dur:55}},
  ]},
  {id:'starry-night',name:'Starry night',desc:'A dark night with no moon: stars over a quiet sea, the surf faintly glowing.',recipes:[
    {name:'Stars over the coves',loc:'Broken coast',light:{preset:'starry'},sound:{surf:.7},camera:{kind:'angled',offshore:80,height:70,heading:75,pitch:9,speed:.6,travel:0,dur:70}},
    {name:'Stars over the cliffs',loc:'Sea cliffs',light:{preset:'starry'},sound:{surf:.7},camera:{kind:'angled',offshore:90,height:80,heading:-75,pitch:9,speed:.6,travel:0,dur:70}},
  ]},
  {id:'first-light',name:'First light',desc:'Dawn twilight over a long beach, the sky glowing where the sun will rise.',recipes:[
    {name:'Dawn, long sand coast',loc:'Long sand coast',light:{preset:'dawn'},camera:{kind:'angled',offshore:20,height:70,heading:65,pitch:10,speed:1,travel:0,dur:60}},
    {name:'Dawn, Crescent bay',loc:'Crescent bay',light:{preset:'dawn'},camera:{kind:'angled',offshore:30,height:80,heading:65,pitch:11,speed:1,travel:0,dur:60}},
  ]},
  {id:'grey-day',name:'Grey day',desc:'Overcast and calm: soft, even light on a rocky shore, nothing bright.',recipes:[
    {name:'Grey rock shelf',loc:'Rock shelf',light:{preset:'moody',sunGlitter:.15},waves:{height:1},camera:{kind:'angled',offshore:80,height:70,heading:-85,pitch:20,speed:1,travel:0,dur:60}},
    {name:'Grey coves',loc:'Broken coast',light:{preset:'moody',sunGlitter:.15},waves:{height:1.2},camera:{kind:'angled',offshore:100,height:90,heading:-85,pitch:18,speed:1,travel:0,dur:60}},
  ]},
  {id:'bright-day',name:'Bright day',desc:'High sun, blue water and white surf along sandy bays: a cheerful daytime loop.',recipes:[
    {name:'Bay in the sun',loc:'Crescent bay',light:{preset:'highSun'},camera:{kind:'angled',offshore:150,height:90,heading:75,pitch:25,speed:1.2,travel:0,dur:50}},
    {name:'Cove in the sun',loc:'Palm cove',light:{preset:'highSun'},camera:{kind:'angled',offshore:120,height:80,heading:-80,pitch:24,speed:1.2,travel:0,dur:50}},
    {name:'Lagoon in the sun',loc:'Tropical lagoon',light:{preset:'highSun'},camera:{kind:'angled',offshore:120,height:110,heading:80,pitch:28,speed:1.2,travel:0,dur:50}},
  ]},
];
function presetById(id){ return PRESETS.find(P=>P.id===String(id||'').toLowerCase())||null; }
/* The coasts a mood needs, as an index list for ?only= (null if it names a coast that doesn't exist). */
function presetCoasts(P){
  const i=[...new Set(P.recipes.map(R=>LOCATIONS.findIndex(L=>L.name===R.loc)))];
  return i.includes(-1)?null:i.sort((a,b)=>a-b);
}

/* ---- ?preset=<id>: play one mood, its recipes in turn ----
   With ?calm=1 the shots join with slow dissolves, as in calm mode. Only the mood's coasts are built,
   except in the studio (?studio=1&preset=…), which needs them all to switch coasts. */
const PRESET0=(()=>{ const id=Q.get('preset'); if(!id) return null; const P=presetById(id); if(!P) console.warn('[preset] there is no preset called',id); return P; })();
const PRESET_ONLY=PRESET0&&!STUDIO&&!Q.has('only')?(presetCoasts(PRESET0)||[]).join(',')||null:null;
/* The first shot at startup, when there's a mood to play: it starts the playlist. */
function presetFirst(){
  if(!PRESET0) return null;
  presetPlay(PRESET0);
  const S=recipeNext(null); if(S) S.t=0;
  return S;
}
/* Play a mood: its recipes become the playing list (PLAYLIST in js/recipe.js). The studio's saved
   playlist isn't touched. Waves and water belong to a coast, not to one shot, so a recipe's big swell
   would stay on that coast for the next mood: each mood starts from the coasts' usual sea instead. */
function presetPlay(P){
  for(const L of LOCATIONS){
    if(!L.ready) continue;
    waveLayer(L,'recipe',null);
    if(L.waterOver) applyWater(L,{},[]);
  }
  Object.assign(PLAYLIST,{on:true,list:P.recipes.map(normRecipe),i:-1,preset:P.id});
}
/* The address that plays just this mood, calm, as a venue screen would. */
function presetLink(P){ const u=new URL(location.href); u.search=''; u.hash=''; u.searchParams.set('calm','1'); u.searchParams.set('preset',P.id); return u.href; }

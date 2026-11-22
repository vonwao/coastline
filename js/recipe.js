'use strict';
/* ---- Scene recipes: one scene written down completely, as plain JSON ----
   A recipe says which coast, which light (a preset plus any changes to it), how big the waves are, how
   the water looks, which elements are shown, and the camera: its kind of shot and its exact path. The
   same recipe gives the same shot every time; only the waves themselves are new, because they're
   simulated live. SCHEMA below lists every lever, with its range and what it does, so a person (in the
   studio, ?studio=1) or a program (an AI writing recipes, say) can work with the same contract:
   shotFromRecipe() checks each value, clamps it into range, and reports what it changed.

   A minimal recipe can be as short as {"loc":"Palm cove","light":{"preset":"golden"}}: anything left out
   is chosen as the slideshow would choose it. A camera given only as knobs (height, heading, speed...)
   gets a fresh path with those knobs; a camera with an exact path is played exactly, and any knob written
   beside it that differs from the path is applied on top. Saved favourites (L, then E) load as recipes too.

   ?recipe=<the recipe, as JSON or as the studio's link form> plays one recipe, looping, and builds only
   its coast so it starts in a few seconds. ?studio=1 opens the studio (js/studio.js). */
const STUDIO=Q.has('studio');
const RAD=Math.PI/180;
const CAM_KINDS=['top','angled','low','canopy','crossing'];

/* The lighting knobs, by the name a recipe uses, and the field of the lighting setup they set (scenes.js). */
const LIGHT_MAP={sunElevation:'el',sunAzimuth:'az',cloudCover:'cover',haze:'turb',exposure:'exposure',visibilityKm:'fog',
  cloudShadows:'cloudShade',darkness:'dark',sunGlitter:'sunVis',sunStrength:'sunK',bloom:'bloom',saturation:'sat',cloudPattern:'seed',warmth:'tint'};
const LIGHT_DEF={sunGlitter:1,sunStrength:1,darkness:0,cloudShadows:0,visibilityKm:40,warmth:0};

/* Every lever. applies: 'instant' (the next frame shows it), 'gradual' (the sea takes time to follow:
   new swell rolls in from offshore over half a minute or so), 'fixed' (part of how the coast was built:
   shown for information; changing it needs the coast rebuilt, which the studio can't do yet). */
const SCHEMA=[
  {group:'scene',label:'Scene',params:[
    {id:'loc',label:'Coast',type:'choice',applies:'instant',code:'LOCATIONS in js/scenes.js',
      desc:'Which coast. Each is a fixed, made-up landscape with its own seabed, rocks, plants and usual waves.'},
  ]},
  {group:'camera',label:'Camera',params:[
    {id:'camera.kind',label:'Kind of shot',type:'choice',choices:CAM_KINDS,applies:'instant',code:'buildShot, buildLow, buildCanopy, buildCrossing in js/camera.js',
      desc:'top: straight down from high up. angled: looking out or along the coast from a distance. low: a fast pass a few metres above the ground along the plants or rocks. canopy: a slow glide over the tree tops. crossing: a slow, low flight across the tree line: from over the trees, across the beach and out over the shallows (or the reverse, or along the edge of the plants); its height follows the trees and the ground.'},
    {id:'camera.along',label:'Along the coast',unit:'m',min:-900,max:900,step:1,applies:'instant',
      desc:'Where the middle of the path is, along the shore. 0 is the middle of the simulated stretch; near its ends the stand-in sea beyond shows.'},
    {id:'camera.offshore',label:'Out from the shore',unit:'m',min:-700,max:900,step:1,applies:'instant',
      desc:'Where the middle of the path is, measured from the waterline: positive over the sea, negative over land.'},
    {id:'camera.height',label:'Height',unit:'m',min:2,max:1500,step:.5,log:true,applies:'instant',
      desc:'Height of the drone above sea level, at the middle of the path. It is always kept a few metres clear of the ground. In a crossing, the height follows the trees and the ground, and this is how high it flies over the sand.'},
    {id:'camera.heading',label:'Heading',unit:'°',min:-180,max:180,step:1,applies:'instant',
      desc:'Which way the camera faces: 0 out to sea, 180 toward the land, +90 and -90 along the coast. In a straight-down shot it is the direction at the top of the picture.'},
    {id:'camera.pitch',label:'Looking down',unit:'°',min:-30,max:89,step:.5,applies:'instant',notFor:['top'],
      desc:'How steeply the camera looks down below the horizon; below 0 it looks up, as at a waterfall from its foot. Straight-down shots always look down 90°.'},
    {id:'camera.fov',label:'Field of view',unit:'°',min:20,max:90,step:1,applies:'instant',
      desc:'How wide the lens is, top to bottom. Smaller is a zoom, larger a wide angle.'},
    {id:'camera.speed',label:'Speed',unit:'m/s',min:0,max:30,step:.1,applies:'instant',
      desc:'How fast the drone moves along its path. Calm-mode shots drift at 0.5 to 2 m/s; low passes fly at 7 to 13.'},
    {id:'camera.travel',label:'Direction of travel',unit:'°',min:-180,max:180,step:1,applies:'instant',
      desc:'Which way the drone moves, relative to the way the camera faces: 0 forward, 180 backward, +90 and -90 sideways.'},
    {id:'camera.climb',label:'Climb',unit:'m',min:-80,max:80,step:.5,applies:'instant',
      desc:'How much higher the drone is at the end of the shot than at the start. In a crossing, how much it climbs over the last third, out over the surf.'},
    {id:'camera.turn',label:'Turn',unit:'°',min:-60,max:60,step:.5,applies:'instant',
      desc:'How far the camera turns during the shot.'},
    {id:'camera.dur',label:'Length of shot',unit:'s',min:2,max:180,step:.5,applies:'instant',
      desc:'How long the shot lasts before the next scene. Normal shots last 3 to 7 s, calm-mode shots 35 to 75.'},
  ]},
  {group:'light',label:'Light',params:[
    {id:'light.preset',label:'Lighting setup',type:'choice',applies:'instant',code:'LIGHTS in js/scenes.js',
      desc:'A hand-tuned starting point: high sun, morning, late afternoon, golden hour, moody cloud, storm, and any added since. The knobs below change it from there.'},
    {id:'light.sunElevation',label:'Sun height',unit:'°',min:-12,max:90,step:.5,applies:'instant',
      desc:'Height of the sun above the horizon. Below 0 the sun has set and gives no direct light; raise the exposure to see twilight.'},
    {id:'light.sunAzimuth',label:'Sun direction',unit:'°',min:-180,max:180,step:1,applies:'instant',
      desc:'Where the sun is: 0 straight out over the sea (shots facing out look into the sun and its glitter), 180 behind the land, +90 and -90 along the coast.'},
    {id:'light.cloudCover',label:'Cloud',unit:'',min:0,max:1,step:.01,applies:'instant',
      desc:'How much of the sky is cloud, from clear (0) to overcast (1).'},
    {id:'light.haze',label:'Haze',unit:'',min:.8,max:3,step:.05,applies:'instant',
      desc:'How hazy the air is: more haze reddens and dims a low sun and whitens the sky.'},
    {id:'light.exposure',label:'Exposure',unit:'',min:.05,max:40,step:.01,log:true,applies:'instant',
      desc:'How bright the picture is made, like a camera\'s exposure. Day setups use about 0.3 to 0.7; twilight and night need far more.'},
    {id:'light.visibilityKm',label:'Visibility',unit:'km',min:2,max:60,step:.5,log:true,applies:'instant',
      desc:'How far you can see before distance fades into the sky\'s colour.'},
    {id:'light.cloudShadows',label:'Cloud shadows',unit:'',min:0,max:1,step:.01,applies:'instant',
      desc:'How dark the shadows of clouds drifting over the land and sea are.'},
    {id:'light.darkness',label:'Gloom',unit:'',min:0,max:1,step:.01,applies:'instant',
      desc:'How dark and grey the cloud is: 0 for fair-weather cloud, about 0.4 for moody, 0.85 for a storm.'},
    {id:'light.sunGlitter',label:'Sun glitter',unit:'',min:0,max:1,step:.01,applies:'instant',
      desc:'How often the sun\'s disc is out, which sets the sharp glitter on the water. Under real overcast it is hidden nearly all the time.'},
    {id:'light.sunStrength',label:'Sunlight',unit:'',min:0,max:1.5,step:.01,applies:'instant',
      desc:'How strong the direct sunlight is, against the light from the sky.'},
    {id:'light.bloom',label:'Glow',unit:'',min:0,max:.4,step:.005,applies:'instant',
      desc:'The soft glow around bright things, such as the sun\'s glitter and white water.'},
    {id:'light.saturation',label:'Colour',unit:'',min:.5,max:1.5,step:.01,applies:'instant',
      desc:'How strong the colours are: 1 as set, less is greyer, more is more vivid.'},
    {id:'light.cloudPattern',label:'Cloud pattern',unit:'',min:1,max:999,step:1,applies:'instant',
      desc:'Which arrangement of clouds: each number gives a different sky with the same amount of cloud.'},
    {id:'light.warmth',label:'Warmth',unit:'',min:-20,max:20,step:.5,applies:'instant',code:'tint in LIGHTS (the tone pass, js/shaders/post.js)',
      desc:'The colour balance of the whole picture: above 0 warmer (redder), below 0 cooler (bluer). Golden hour is set at about +3.5 and a storm at about -3; 10 or more is a strong colour grade.'},
  ]},
  {group:'waves',label:'Waves',params:[
    {id:'waves.height',label:'Wave height',unit:'m',min:.05,max:4,step:.05,applies:'gradual',code:'Hs in LOCATIONS',
      desc:'Height of the swell arriving from offshore (significant height: the average of the bigger third). New waves take half a minute or so to roll in.'},
    {id:'waves.period',label:'Wave period',unit:'s',min:2,max:18,step:.1,applies:'gradual',code:'T in LOCATIONS',
      desc:'Time between waves. Long periods (12 s and more) make long, powerful lines of swell; short ones a choppy sea.'},
    {id:'waves.angle',label:'Wave angle',unit:'°',min:-60,max:60,step:1,applies:'gradual',code:'obl in LOCATIONS',
      desc:'The angle at which the swell meets the coast: 0 straight in; larger angles make waves peel along the shore.'},
    {id:'waves.spread',label:'Spread',unit:'°',min:0,max:120,step:1,applies:'gradual',code:'spread in LOCATIONS (default 26)',
      desc:'How widely the wave directions fan out: small for neat lines of swell, large for a confused, wind-blown sea.'},
  ]},
  {group:'water',label:'Water',params:[
    {id:'water.clarity',label:'Clarity',unit:'×',min:.25,max:4,step:.05,log:true,def:1,applies:'instant',code:'sigA, sigS in WATER (js/scenes.js)',
      desc:'How clear the water is: above 1 you see deeper into it and the shallows stay bright further out; below 1 it turns murky.'},
    {id:'water.sandy',label:'Sand in the water',unit:'×',min:0,max:4,step:.05,def:1,applies:'instant',code:'sed in WATER',
      desc:'How strongly the sand stirred up by breaking waves clouds the water.'},
    {id:'water.foam',label:'Foam',unit:'×',min:0,max:3,step:.05,def:1,applies:'gradual',code:'foamGen in WATER',
      desc:'How much white water breaking waves make.'},
    {id:'water.foamLife',label:'Foam lasts',unit:'×',min:.25,max:4,step:.05,log:true,def:1,applies:'gradual',code:'decay in WATER',
      desc:'How long foam stays on the water before it fades: above 1 it lingers as long streaks and lace.'},
    {id:'water.ripples',label:'Ripples',unit:'×',min:0,max:3,step:.05,def:1,applies:'instant',code:'chop in WATER',
      desc:'Strength of the small wind ripples on the surface.'},
    {id:'water.sandColour',label:'Sand colour',type:'colour',applies:'instant',code:'sandA, sandB in WATER',
      desc:'The average colour of the sand, as #rrggbb; its lighter and darker patches are kept. The tropical coasts\' coral sand is #ccb99a, the surf beaches\' golden sand #a88f6b, the lake\'s grey gravel #78736b.'},
    {id:'water.sandContrast',label:'Sand patches',unit:'×',min:0,max:3,step:.05,def:1,applies:'instant',code:'sandA, sandB in WATER',
      desc:'How much the sand varies between lighter and darker patches: 0 is one even colour, above 1 more mottled.'},
  ]},
  {group:'elements',label:'Elements',params:[
    {id:'elements.plants',label:'Plants',type:'bool',def:true,applies:'instant',code:'cards and meshes in js/frame.js',desc:'Trees, palms and shrubs.'},
    {id:'elements.greenery',label:'Greenery',unit:'×',min:0,max:2,step:.05,def:1,applies:'instant',code:'the plant-cover channel of the terrain, as terrS() reads it (js/shaders/view.js, trees.js)',
      desc:'How much of the land is covered in plants: 0 bare sand, earth and rock; 1 as the coast grows them; 2 lusher. Trees, shrubs and the green of the ground all follow.'},
    {id:'elements.flora',label:'Kind of plants',type:'choice',choices:['coast','tropical','broadleaf','conifer','mountain'],applies:'instant',code:'flora in LOCATIONS; the species mix in plantGrows() (js/shaders/trees.js)',
      desc:'Which plants grow: tropical (palms and broadleaf trees), broadleaf (broadleaf trees and pines), conifer (conifers, pines and a few broadleaf trees) or mountain (mountain conifers). coast keeps the coast\'s own.'},
    {id:'elements.vegetation',label:'Vegetation',type:'choice',choices:['coast',...VEG_IDS],applies:'instant',code:'VEG_PRESETS in js/vegetation.js; the shared rules in COVER_GLSL (js/shaders/view.js)',
      desc:'Which region\'s plants: '+VEG_IDS.map(k=>VEG_PRESETS[k].name+' ('+k+')').join(', ')+'. Each is a real plant community from the sea inland: low grass, runners and mats on the dunes, shrubs behind, then that region\'s trees. coast keeps the coast\'s own (Classic unless the coast has one).'},
    {id:'elements.cover',label:'Plant cover',type:'choice',choices:['coast','dunes','scrub','open','patchy','dense'],applies:'instant',code:'cover in LOCATIONS; coverWood(), treeCov(), shrubCov() in COVER_GLSL (js/shaders/view.js)',
      desc:'How the plants grow: dunes (grass and a few shrubs on the sand, almost no trees), scrub (shrubs and grass, a few trees well inland), open (trees scattered over grass), patchy (groves with clearings between) or dense (closed forest). coast keeps the coast\'s own.'},
    {id:'elements.fish',label:'Fish',type:'bool',def:true,applies:'instant',code:'fishCover in js/shaders/view.js',desc:'Schools of fish in clear water, seen from above.'},
    {id:'elements.spray',label:'Spray',type:'bool',def:true,applies:'instant',code:'js/shaders/spray.js',desc:'Spray thrown up where waves hit steep rock, and where breaking waves land.'},
    {id:'elements.breakers',label:'Breakers',type:'bool',def:true,applies:'instant',code:'js/shaders/breakers.js',desc:'The white water rolling down the front of a breaking wave, and the lip a plunging wave throws, with their spray.'},
    {id:'elements.people',label:'People',type:'choice',choices:['coast','none','few','busy'],applies:'instant',code:'js/people.js',
      desc:'People on the beach: towels, umbrellas, a few lying or sitting, trails to the water. coast: as the coast has it (a few on the sandy beaches people reach easily, none on wild coasts); none; few; busy. Never at night or in a storm, fewer early, late and under heavy cloud. The camera keeps 30 m from them.'},
  ]},
  {group:'sound',label:'Sound',params:[
    {id:'sound.surf',label:'Surf',unit:'×',min:0,max:3,step:.05,def:1,applies:'instant',code:'roar and hiss in js/sound.js',
      desc:'The breaking waves and foam near the camera: the rumble of the surf and the hiss of foam on the sand. Heard with sound on (S).'},
    {id:'sound.wash',label:'Distant surf',unit:'×',min:0,max:3,step:.05,def:1,applies:'instant',code:'bed in js/sound.js',
      desc:'The surf of the whole coast, far off: a low, steady wash.'},
    {id:'sound.wind',label:'Wind',unit:'×',min:0,max:3,step:.05,def:1,applies:'instant',code:'wind in js/sound.js',
      desc:'The wind, which is stronger under cloud and in a storm.'},
  ]},
  {group:'fixed',label:'Fixed for this coast',params:[
    {id:'fixed.form',label:'Layout',applies:'fixed',code:'form in LOCATIONS; rockyRaw(), mixedCoast() in js/shaders/terrain.js',desc:'The coast\'s layout: beach, rock shelf, cliffs, reef, bay, broken coast, cove, lake.'},
    {id:'fixed.seed',label:'Landscape seed',applies:'fixed',code:'seed in LOCATIONS',desc:'The number the landscape is grown from: another number, another coast of the same kind.'},
    {id:'fixed.dx',label:'Water detail',unit:'m',applies:'fixed',code:'dx, nx, nz in LOCATIONS',desc:'Size of one cell of the wave simulation; smaller is finer and slower.'},
    {id:'fixed.hmax',label:'Depth limit',unit:'m',applies:'fixed',code:'hmax in LOCATIONS',desc:'The simulated water is never deeper than this.'},
  ]},
];
function schemaParam(id){ for(const g of SCHEMA) for(const p of g.params) if(p.id===id) return p; return null; }

/* ---- Reading values: lighting knobs from a setup ---- */
/* Warmth is one number for the setup's tint, the colour the final picture is multiplied by: half the
   difference between its red and blue, in percent. Setting it keeps the tint's green. A new array is
   made, so an adjusted setup never changes its preset's. */
function lightGet(Li,k){
  if(k==='warmth'){ const t=Li.tint||[1,1,1]; return (t[0]-t[2])*50; }
  const v=Li[LIGHT_MAP[k]];
  if(k==='visibilityKm') return v?1/v/1000:LIGHT_DEF.visibilityKm;
  return v===undefined?LIGHT_DEF[k]:v;
}
function lightSet(Li,k,v){
  if(k==='warmth'){ Li.tint=[1+v/100,(Li.tint||[1,1,1])[1],1-v/100]; return; }
  Li[LIGHT_MAP[k]]=k==='visibilityKm'?1/(v*1000):v;
}

/* A value checked against its lever: numbers clamped into range, choices and colours checked, with a note
   of anything changed or left out. */
function checkValue(p,v,warn){
  if(!p) return undefined;
  if(p.type==='bool') return v!==false&&v!==0&&v!=='false';
  if(p.type==='choice'){ const c=String(v).toLowerCase(); if(p.choices&&p.choices.includes(c)) return c; warn.push(`${p.id}: "${v}" isn't one of ${(p.choices||[]).join(', ')}, so it was left out`); return undefined; }
  if(p.type==='colour'){
    const m=/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(v).trim());
    if(!m){ warn.push(`${p.id}: "${v}" isn't a colour like #c8b48a, so it was left out`); return undefined; }
    const h=m[1].toLowerCase(); return '#'+(h.length===3?h.replace(/./g,c=>c+c):h);
  }
  let x=+v;
  if(!isFinite(x)){ warn.push(`${p.id}: "${v}" isn't a number, so it was left out`); return undefined; }
  if(x<p.min||x>p.max){ const y=Math.min(p.max,Math.max(p.min,x)); warn.push(`${p.id}: ${x} is outside ${p.min} to ${p.max}; ${y} was used`); x=y; }
  return x;
}

/* ---- The camera's knobs: an easy description of its exact path, and the reverse ---- */
const wrap180=a=>((a+540)%360)-180;
function camKnobs(S){
  const L=S.L,c=[0,1,2].map(i=>(S.p0[i]+S.p1[i])*.5), dx=S.p1[0]-S.p0[0], dz=S.p1[2]-S.p0[2], len=Math.hypot(dx,dz);
  /* A crossing's height follows the trees and the ground: its Height is how high it flies over the sand, and
     its Climb how much it rises at the end (S.cross, camera.js). */
  const X=S.kind==='crossing'&&S.cross;
  return {kind:S.kind,along:c[2],offshore:c[0]-shoreAt(L,c[2]),height:X?X.low:c[1],heading:wrap180(S.yaw0/RAD),
    pitch:S.kind==='top'?90:-S.pitch/RAD,fov:S.fov/RAD,speed:len/S.dur,travel:len>1e-3?wrap180(Math.atan2(dz,dx)/RAD-S.yaw0/RAD):0,
    climb:X?(X.rise||0):S.p1[1]-S.p0[1],turn:(S.yaw1-S.yaw0)/RAD,dur:S.dur};
}
/* Set some knobs (an object of knob: value) and rebuild the exact path from all of them. */
function setCamKnobs(S,k){
  const K=Object.assign(camKnobs(S),k), L=S.L;
  const c=[shoreAt(L,K.along)+K.offshore,K.height,K.along];
  S.yaw0=K.heading*RAD; S.yaw1=S.yaw0+K.turn*RAD;
  S.pitch=S.kind==='top'?-Math.PI/2:-Math.min(Math.max(K.pitch,-30),89)*RAD;
  S.fov=K.fov*RAD; S.dur=Math.max(K.dur,.5);
  const half=K.speed*S.dur*.5, a=S.yaw0+K.travel*RAD;
  S.p0=[c[0]-Math.cos(a)*half,c[1]-K.climb*.5,c[2]-Math.sin(a)*half];
  S.p1=[c[0]+Math.cos(a)*half,c[1]+K.climb*.5,c[2]+Math.sin(a)*half];
  if(S.kind==='crossing') S.cross=Object.assign({v:'in',clr:11},S.cross,{low:Math.min(Math.max(K.height,4),40),rise:Math.min(Math.max(K.climb,0),40)});
  fixBounds(S);
}
/* Keep the drone clear of the ground all along its path, and give the ray march height limits that
   cover the whole path (camera.js works these out for its own paths; an edited path needs them again). */
function fixBounds(S,keepLimits=false){
  /* A crossing's profile keeps it clear of the plants and the ground, and sets its limits. */
  if(S.kind==='crossing'){ S.cross=Object.assign({v:'in',clr:11,low:9,rise:0},S.cross); S.meshes=undefined; crossProfile(S); return; }
  const L=S.L, clear=S.kind==='low'?3:S.kind==='top'?20:8;
  let need=0;
  for(let i=0;i<=16;i++){ const t=i/16,x=S.p0[0]+(S.p1[0]-S.p0[0])*t,z=S.p0[2]+(S.p1[2]-S.p0[2])*t,y=S.p0[1]+(S.p1[1]-S.p0[1])*t;
    need=Math.max(need,groundAt(L,x,z)+clear-y,1.5-y); }
  if(need>0){ S.p0[1]+=need; S.p1[1]+=need; }
  S.meshes=undefined;
  if(keepLimits&&need<=0) return;
  if(S.kind==='top'){
    const mg=Math.max(...[S.p0,S.p1].map(p=>maxGroundNear(L,p[0],p[2],p[1]*1.2)+12));
    S.maxH=mg; S.nearH=mg; S.steps=L.kind==='rocky'?30:(mg>25?22:13);
  } else {
    S.maxH=L.maxH; S.nearH=Math.max(...[S.p0,S.p1].map(p=>maxGroundNear(L,p[0],p[2],380)+14)); S.steps=L.kind==='rocky'?40:38;
  }
}

/* ---- Is the path clear? ----
   The slideshow builds its own paths to keep the water the subject and the land out of the way. A path
   written as numbers (by an AI, by hand, or with the studio's sliders) gets none of that, and can run a
   drone beside a cliff: in a test, "a slow low pass along the surf" had a rock face across a third of the
   picture halfway through. pathCheck looks along the whole path (seven points) with viewRate (camera.js),
   which stops each ray at the first ground it meets, and compares with limits for each kind of shot:
     wall    rock or land standing in the picture rather than lying under it;
     water   the share of the picture that's water, at least;
     inland  land well back from the shore, at most.
   The limits were set from the slideshow's own paths (60 of each kind): nearly all top, angled and
   tree-top paths pass. Low passes skim the edge of the trees, so land beside them is part of the look,
   and their limit allows a fifth of the picture; about one random low pass in eight goes over it. */
const PATH_US=[0,.17,.33,.5,.67,.83,1];
const PATH_LIM={top:{wall:.05,water:.12,inland:.3},angled:{wall:.08,water:.12,inland:.4},canopy:{wall:.12,water:0,inland:.55},low:{wall:.2,water:0,inland:.65},crossing:{wall:.12,water:0,inland:.7}};
function pathCheck(S,us=PATH_US){
  const lim=PATH_LIM[S.kind]||PATH_LIM.angled;
  let worst=null,score=0;
  for(const u of us){
    const r=viewRate(S,u);
    const ex={wall:Math.max(r.wall-lim.wall,0),water:Math.max(lim.water-r.water,0),inland:Math.max(r.inland-lim.inland,0)};
    const bad=ex.wall*10+ex.water*5+ex.inland*3;
    /* Among paths that pass, a little more water and shore is better. */
    score+=Math.min(r.water,.3)*.2+Math.min(r.shore,.15)*.2-bad;
    if(bad>0&&(!worst||bad>worst.bad)) worst={u,bad,r,why:ex.wall>0?'wall':ex.water>0?'water':'inland'};
  }
  return {ok:!worst,score,worst};
}
/* What's wrong, in words: "rock or land stands across 36% of the picture halfway through the shot". */
function pathTrouble(w){
  const at=w.u===0?'at the start of the shot':w.u===1?'at the end of the shot':w.u===.5?'halfway through the shot':`${Math.round(w.u*100)}% of the way through the shot`;
  const pc=v=>Math.round(v*100)+'%';
  return (w.why==='wall'?`rock or land stands across ${pc(w.r.wall)} of the picture`:w.why==='water'?`only ${pc(w.r.water)} of the picture is water`:`land fills ${pc(w.r.inland)} of the picture`)+' '+at;
}
/* The nearest clear path: small moves of the camera, the smallest first, until every point of the path
   passes. Out to sea before inland, a little higher (a low pass stays low), a little turned, looking a
   little further down, and only then along the coast. Returns what was moved, in words, or null if
   nothing nearby is clear (the path is then left as it was). */
function fitPath(S){
  const K=camKnobs(S), low=S.kind==='low', top=S.kind==='top';
  const c0=pathCheck(S); if(c0.ok) return {moves:[],before:c0};
  const D={offshore:low?[0,8,16,-8,25,-16,40,60]:[0,10,20,-10,35,-20,50,75,100],height:low?[0,2,4,7,10]:[0,8,16,30,50],heading:top?[0]:[0,8,-8,15,-15,25,-25],
    pitch:top?[0]:[0,4,8,13],along:[0,30,-30,60,-60,100,-100]};
  const cost=d=>Math.abs(d.offshore)/12+Math.abs(d.height)/(low?3:12)+Math.abs(d.heading)/10+Math.abs(d.pitch)/5+Math.abs(d.along)/35;
  const cands=[];
  for(const offshore of D.offshore)for(const height of D.height)for(const heading of D.heading)for(const pitch of D.pitch)for(const along of D.along)
    cands.push({offshore,height,heading,pitch,along});
  cands.sort((a,b)=>cost(a)-cost(b));
  const keys=['p0','p1','yaw0','yaw1','pitch','fov','dur','steps','maxH','nearH'], save={};
  for(const k of keys) save[k]=Array.isArray(S[k])?S[k].slice():S[k];
  const restore=()=>{ for(const k of keys) S[k]=Array.isArray(save[k])?save[k].slice():save[k]; S.meshes=undefined; };
  for(let i=1;i<Math.min(cands.length,900);i++){
    const d=cands[i];
    restore();
    setCamKnobs(S,{offshore:K.offshore+d.offshore,height:K.height+d.height,heading:K.heading+d.heading,along:K.along+d.along,
      pitch:top?K.pitch:Math.min(K.pitch+d.pitch,85)});
    /* The point that failed first: most candidates fail there too, and one ray march is cheap. */
    if(!pathCheck(S,[c0.worst.u]).ok) continue;
    if(!pathCheck(S).ok) continue;
    const m=[], K1=camKnobs(S);
    if(d.offshore) m.push(d.offshore>0?`moved ${d.offshore} m out to sea`:`moved ${-d.offshore} m inland`);
    if(K1.height-K.height>.5) m.push(`raised ${Math.round(K1.height-K.height)} m`);
    if(d.heading) m.push(`turned ${Math.abs(d.heading)}° toward the ${Math.cos((K.heading+d.heading)*RAD)>Math.cos(K.heading*RAD)?'sea':'land'}`);
    if(d.pitch) m.push(`looking ${d.pitch}° further down`);
    if(d.along) m.push(`moved ${Math.abs(d.along)} m along the coast`);
    return {moves:m,before:c0,d};
  }
  restore();
  return null;
}
/* The moves as one note: "Moved 16 m out to sea and raised 4 m, because rock or land stood across 36% of
   the picture halfway through the shot". */
function fitNote(f){
  const m=f.moves.slice(); if(!m.length) return '';
  const s=m.length>1?m.slice(0,-1).join(', ')+' and '+m[m.length-1]:m[0];
  return s[0].toUpperCase()+s.slice(1)+', because '+pathTrouble(f.before.worst).replace(/stands/,'stood').replace(/ is water/,' was water').replace(/fills/,'filled');
}

/* ---- Light: a preset, or a preset with changes, baked as its own lighting setup ---- */
function hashStr(s){ let h=5381; for(let i=0;i<s.length;i++) h=(h*33^s.charCodeAt(i))>>>0; return h.toString(36); }
const recipeLightUse={};
function lightFor(LR,L,warn){
  let pre=LR.preset;
  if(pre&&LIGHTS[pre]?._preset) pre=LIGHTS[pre]._preset;
  if(!pre||!LIGHTS[pre]){
    if(pre) warn.push(`light.preset: "${pre}" doesn't exist here; "${L.lights[0]}" was used`);
    /* Left out: the light the slideshow would pick (today's, when following a real beach). */
    pre=pre?L.lights[0]:LIVE.on&&LIVE.key?LIVE.key:pick(L.lights);
  }
  const over={};
  for(const k in LIGHT_MAP){
    if(LR[k]===undefined) continue;
    const v=checkValue(schemaParam('light.'+k),LR[k],warn);
    if(v!==undefined&&Math.abs(v-lightGet(LIGHTS[pre],k))>1e-6) over[k]=v;
  }
  return Object.keys(over).length?derivedLight(pre,over):pre;
}
function derivedLight(pre,over){
  const key='r:'+pre+':'+hashStr(JSON.stringify(Object.entries(over).sort()));
  recipeLightUse[key]=performance.now();
  if(LIGHTS[key]) return key;
  const Li=Object.assign({},LIGHTS[pre]); delete Li.env; delete Li.envC;
  for(const k in over) lightSet(Li,k,over[k]);
  /* base: what a favourite saves in place of this setup, which won't exist in a later session. */
  Li._preset=pre; Li._over=over; Li.base=LIGHTS[pre].base||pre; Li.label=(LIGHTS[pre].label||pre)+', adjusted';
  bakeEnv(Li); LIGHTS[key]=Li;
  /* Keep at most eight adjusted setups; free the oldest that no shot on screen is using. */
  const keys=Object.keys(LIGHTS).filter(k=>k.startsWith('r:')).sort((a,b)=>(recipeLightUse[a]||0)-(recipeLightUse[b]||0));
  for(let n=keys.length,i=0;n>8&&i<keys.length;i++){
    const k=keys[i]; if(k===key||state.cur?.lightKey===k||state.next?.lightKey===k) continue;
    freeEnv(LIGHTS[k]); delete LIGHTS[k]; delete recipeLightUse[k]; n--;
  }
  return key;
}

/* ---- Waves and water, which belong to the coast rather than to one shot ---- */
/* One owner for a coast's waves. L.waveBase is the coast's own sea (Hs, T, obl and spread as js/scenes.js
   wrote them), copied the first time anything asks for a change. Every change is a layer on top of it,
   holding only the settings it sets:
     reel    a movie's waves (reelMovieStart in js/reel.js)
     recipe  a recipe's, or the studio's sliders (applyWaves, below)
     live    the forecast at a real beach (liveUpdate in js/live.js)
   waveLayer() sets or removes one layer, then works the coast's waves out again from the base, always in
   that order: a later layer wins, and taking a layer away shows what's under it. Nothing else writes
   L.Hs, L.T, L.obl or L.spread. (Until 13 November 2026 each of the three kept its own copy of "the
   coast's own waves", L.reelBase, L.recipeBase and L.orig, taken from whatever the sea was at that moment.
   So stopping real conditions could put back a recipe's swell as if it were the coast's, and a recipe
   played while a beach was followed kept the forecast's swell as the coast's own from then on.) */
const WAVE_FIELDS=['Hs','T','obl','spread'], WAVE_LAYERS=['reel','recipe','live'];
function waveBase(L){
  if(!L.waveBase) L.waveBase={Hs:L.Hs,T:L.T,obl:L.obl,spread:L.spread};
  return L.waveBase;
}
/* o: {Hs, T, obl, spread}, any of them; null or empty takes the layer away. True if the sea changed. */
function waveLayer(L,name,o){
  if(!WAVE_LAYERS.includes(name)) throw new Error('waveLayer: no layer called '+name);
  const B=waveBase(L), Ly=L.waveLayers||(L.waveLayers={}), c={};
  if(o) for(const k of WAVE_FIELDS) if(o[k]!==undefined&&o[k]!==null&&isFinite(+o[k])) c[k]=+o[k];
  if(Object.keys(c).length) Ly[name]=c; else delete Ly[name];
  const W=Object.assign({},B);
  for(const n of WAVE_LAYERS) if(Ly[n]) Object.assign(W,Ly[n]);
  let changed=false;
  for(const k of WAVE_FIELDS){
    /* No spread is the usual 26° (buildSwell in js/world.js). */
    const d=k==='spread'?26:0;
    if(Math.abs((W[k]||d)-(L[k]||d))>1e-6){ L[k]=W[k]; changed=true; }
  }
  if(changed) buildSwell(L);
  return changed;
}
const WAVE_MAP={height:'Hs',period:'T',angle:'obl',spread:'spread'};
const waveGet=(L,k)=>k==='spread'?(L.spread||26):L[WAVE_MAP[k]];
/* A recipe's waves. replace: W is the whole of a recipe's waves, so a setting it leaves out goes back to
   the coast's own (a recipe with no waves at all plays on the coast's usual sea, whatever the recipe
   before it asked for). Otherwise W is added to what the recipe layer holds, as the studio's sliders
   need: one setting at a time. */
function applyWaves(L,W,warn,replace=false){
  const o=replace?{}:Object.assign({},L.waveLayers&&L.waveLayers.recipe);
  for(const k in WAVE_MAP){
    if(W[k]===undefined) continue;
    const v=checkValue(schemaParam('waves.'+k),W[k],warn);
    if(v!==undefined) o[WAVE_MAP[k]]=v;
  }
  return waveLayer(L,'recipe',o);
}
const WATER_KNOBS=['clarity','sandy','foam','foamLife','ripples','sandContrast'];
/* The sand is mixed from two colours, a darker and a lighter (sandA, sandB in WATER). Its colour, as a
   lever, is their average; a new colour scales both, so the patches between them stay. */
const sandMean=B=>B.sandA.map((a,i)=>(a+B.sandB[i])/2);
const hexOf=c=>'#'+c.map(v=>Math.round(Math.min(Math.max(v,0),1)*255).toString(16).padStart(2,'0')).join('');
const rgbOf=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
function sandHex(L){ return hexOf(sandMean(WATER[L.water||L.kind])); }
function applyWater(L,Wr,warn){
  const o={};
  for(const k of WATER_KNOBS){
    if(Wr[k]===undefined) continue;
    const v=checkValue(schemaParam('water.'+k),Wr[k],warn);
    if(v!==undefined&&Math.abs(v-1)>1e-6) o[k]=v;
  }
  if(Wr.sandColour!==undefined){ const v=checkValue(schemaParam('water.sandColour'),Wr.sandColour,warn); if(v&&v!==sandHex(L)) o.sandColour=v; }
  L.waterOver=Object.keys(o).length?o:null; L.waterCache=null;
}
/* The water settings a coast is drawn and simulated with: its kind of water, with any recipe's changes. */
function waterOf(L){
  const B=WATER[L.water||L.kind];
  if(!L.waterOver) return B;
  if(L.waterCache&&L.waterCache.base===B) return L.waterCache.W;
  const o=L.waterOver,c=o.clarity??1;
  const W=Object.assign({},B,{sigA:B.sigA.map(v=>v/c),sigS:B.sigS.map(v=>v/c),sed:B.sed.map(v=>v*(o.sandy??1)),
    foamGen:B.foamGen*(o.foam??1),decay:B.decay/(o.foamLife??1),chop:B.chop*(o.ripples??1)});
  if(o.sandColour||o.sandContrast!==undefined){
    const m=sandMean(B),k=o.sandContrast??1,to=o.sandColour?rgbOf(o.sandColour):m;
    const sand=S=>S.map((v,i)=>Math.min(.98,Math.max(0,(m[i]+(v-m[i])*k)*to[i]/Math.max(m[i],1e-3))));
    W.sandA=sand(B.sandA); W.sandB=sand(B.sandB);
  }
  L.waterCache={base:B,W};
  return W;
}

/* ---- Plants and sound, which belong to the shot: each recipe in a playlist keeps its own ---- */
const FLORAS=['tropical','broadleaf','conifer','mountain'];
/* Which plants grow in this shot: the recipe's choice, or the coast's own (flora in LOCATIONS). */
function floraOf(S){ const i=FLORAS.indexOf(S.opt?.flora); return i>=0?i:(S.L.flora??S.L.type); }
/* How much plant cover: the shaders scale the terrain's plant-cover channel by this. */
function greenOf(S){ return S.opt?.greenery??1; }
/* The plant cover: bare dunes, sparse scrub, open woodland, patchy (groves and clearings) or dense forest.
   The recipe's choice, or the coast's own (cover in LOCATIONS); coasts without one are dense, as all were.
   It shapes the woods in the shaders (COVER_GLSL in js/shaders/view.js, uPlantCover), and thins the plant-cover
   channel itself on the barer kinds, through greenery. */
const COVERS=['dunes','scrub','open','patchy','dense'];
const COVER_GREEN=[.62,.82,.95,1,1];
function coverOf(S){ const c=S.opt?.cover&&S.opt.cover!=='coast'?S.opt.cover:S.L.cover; const i=COVERS.indexOf(c); return i>=0?i:4; }
function greenK(S){ return greenOf(S)*COVER_GREEN[coverOf(S)]; }
const SOUND_KNOBS=['surf','wash','wind'];

/* ---- Recipes in and out ---- */
const r2=(x,d=2)=>{ const f=10**d; return Math.round(x*f)/f; };
function normRecipe(R){
  if(typeof R==='string') R=JSON.parse(R);
  if(!R||typeof R!=='object'||Array.isArray(R)) throw new Error('A recipe is a JSON object, like {"loc":"Palm cove"}');
  if(R.lightKey&&!R.camera){
    /* A saved favourite: the same shot, in the favourites' own layout. */
    const path={}; for(const k of ['p0','p1','yaw0','yaw1','pitch','pitch1','fov','noise','steps','maxH','nearH','dur','cross']) if(R[k]!==undefined) path[k]=R[k];
    return {v:1,name:R.name,loc:R.loc,light:{preset:R.lightKey},camera:{kind:R.kind,path}};
  }
  /* Shorthands a person or an AI might write: "light":"golden" for {"preset":"golden"}, "camera":"top" for
     {"kind":"top"}. */
  if(typeof R.light==='string') R=Object.assign({},R,{light:{preset:R.light}});
  if(typeof R.camera==='string') R=Object.assign({},R,{camera:{kind:R.camera}});
  return R;
}
/* Names in a recipe that aren't settings (a misspelling, or a setting an AI made up) are left out, and
   said so, rather than ignored silently. */
const RECIPE_GROUPS=['light','waves','water','elements','sound','camera'];
function unknownKeys(R,warn){
  for(const k in R) if(!['v','name','loc','coast',...RECIPE_GROUPS].includes(k)) warn.push(`${k}: not a setting, so it was left out`);
  for(const g of RECIPE_GROUPS){
    const o=R[g]; if(o===undefined) continue;
    if(!o||typeof o!=='object'||Array.isArray(o)){ warn.push(`${g}: should be an object, like {"${g==='camera'?'kind':'…'}": …}; it was left out`); continue; }
    for(const k in o) if(!(g==='camera'&&k==='path')&&!schemaParam(g+'.'+k)) warn.push(`${g}.${k}: not a setting, so it was left out`);
  }
}
/* The scene on screen as a recipe. Knobs are written beside the exact path for reading and editing. */
function recipeFromShot(S){
  const L=S.L,Li=LIGHTS[S.lightKey]||{},pre=Li._preset||(S.lightKey.startsWith('live')?(Li.base||'highSun'):S.lightKey);
  const light={preset:pre};
  if(Li._over) for(const k in Li._over) light[k]=r2(Li._over[k],k==='visibilityKm'?1:3);
  /* A real-conditions light isn't kept from one session to the next: its values are written out in full. */
  if(S.lightKey.startsWith('live')) for(const k in LIGHT_MAP) if(k!=='cloudPattern'){ const v=lightGet(Li,k); if(v!==undefined) light[k]=r2(v,3); }
  const K=camKnobs(S), cam={kind:S.kind};
  for(const k of ['along','offshore','height','heading','pitch','fov','speed','travel','climb','turn','dur']) if(!(k==='pitch'&&S.kind==='top')) cam[k]=r2(K[k],k==='speed'?2:1);
  cam.path={p0:S.p0.map(v=>r2(v,3)),p1:S.p1.map(v=>r2(v,3)),yaw0:r2(S.yaw0,5),yaw1:r2(S.yaw1,5),pitch:r2(S.pitch,5),fov:r2(S.fov,5),dur:r2(S.dur,3),noise:r2(S.noise,3),
    steps:S.steps,maxH:r2(S.maxH,2),nearH:r2(S.nearH,2)};
  if(S.pitch1!==undefined&&S.kind!=='top') cam.path.pitch1=r2(S.pitch1,5);
  if(S.cross) cam.path.cross=Object.assign({},S.cross);
  const waves={}; for(const k in WAVE_MAP) waves[k]=r2(waveGet(L,k),2);
  const water={}; for(const k of WATER_KNOBS) water[k]=r2(L.waterOver?.[k]??1,2);
  water.sandColour=L.waterOver?.sandColour||sandHex(L);
  const o=S.opt||{};
  const sound={}; for(const k of SOUND_KNOBS) sound[k]=r2(S.sound?.[k]??1,2);
  const R={v:1};
  if(S.recipeName) R.name=S.recipeName;
  R.loc=L.name;
  if(L.real) R.coast=REAL_ID;
  Object.assign(R,{light,waves,water,elements:{plants:o.plants!==false,greenery:r2(o.greenery??1,2),flora:o.flora||'coast',vegetation:o.vegetation||'coast',cover:o.cover||'coast',fish:o.fish!==false,spray:o.spray!==false,breakers:o.breakers!==false,people:o.people||'coast'},sound,camera:cam});
  return R;
}
/* ---- An exact path's numbers, kept in range ----
   A path written by hand or by a program gets the same care as the levers: a number that isn't one takes
   its usual value, and one out of range is moved into it and listed. These numbers go straight to the
   view shader: "steps": 5000 would have every pixel march 5,000 steps, enough to stop the picture, and a
   field of view of 0 leaves nothing to draw. Where a lever covers the number, the range is the
   lever's (SCHEMA): field of view, length, looking down and turn; positions reach as far as the levers
   can put a path's end (900 m along the coast, plus half of 180 s at 30 m/s; across the shore, a little
   more for where the shoreline lies), heights as high as the height lever with its climb. The ray
   march's own numbers have no lever: the camera code uses 13 to 40 steps (js/camera.js), and limits no
   higher than the land. Angles are in radians, as paths keep them. */
const PATH_RANGE=(()=>{
  const p=id=>schemaParam('camera.'+id), far=p('along').max+p('speed').max*p('dur').max/2;
  return {x:[-far-400,far+400],z:[-far,far],y:[0,p('height').max+p('climb').max/2],yaw:[-100,100],turn:[p('turn').min*RAD,p('turn').max*RAD],
    pitch:[-p('pitch').max*RAD,-p('pitch').min*RAD],fov:[p('fov').min*RAD,p('fov').max*RAD],dur:[.5,p('dur').max],noise:[-1e5,1e5],
    steps:[8,64],maxH:[1,9000],nearH:[1,9000]};
})();
function pathNum(v,d,k,warn){
  if(v===null||v===undefined||!isFinite(+v)) return d;
  const [a,b]=PATH_RANGE[k], x=+v, y=Math.min(b,Math.max(a,x));
  if(y!==x) warn.push(`camera.path.${k}: ${r2(x,3)} is outside ${r2(a,3)} to ${r2(b,3)}; ${r2(y,3)} was used`);
  return y;
}
/* A recipe made into a shot, ready to show. Every value is checked; what had to change is listed in
   S.warnings. Waves and water are set on the coast itself. */
function shotFromRecipe(R0){
  const R0n=normRecipe(R0), warn=[];
  unknownKeys(R0n,warn);
  /* A group that isn't an object was reported above; it's read as if left out. */
  const R=Object.assign({},R0n); for(const g of RECIPE_GROUPS) if(R[g]!==undefined&&(!R[g]||typeof R[g]!=='object'||Array.isArray(R[g]))) delete R[g];
  let L=null;
  if(typeof R.loc==='number') L=LOCATIONS[R.loc];
  else if(R.loc!==undefined) L=LOCATIONS.find(l=>l.name.toLowerCase()===String(R.loc).toLowerCase());
  if(!L||!L.ready){
    const ready=LOCATIONS.filter(l=>l.ready);
    if(R.loc!==undefined) warn.push(`loc: "${R.loc}" ${L?'isn\'t loaded in this page':'doesn\'t exist'}; another coast was used`);
    L=pick(ready);
  }
  applyWaves(L,R.waves||{},warn,true);
  applyWater(L,R.water||{},warn);
  const lightKey=lightFor(R.light||{},L,warn);
  const C=R.camera||{};
  let kind=C.kind;
  if(kind!==undefined&&!CAM_KINDS.includes(kind)){ warn.push(`camera.kind: "${kind}" isn't one of ${CAM_KINDS.join(', ')}`); kind=undefined; }
  const P=C.path, vec=v=>Array.isArray(v)&&v.length===3&&v.every(x=>isFinite(+x));
  let S;
  const knobs={};
  for(const k of ['along','offshore','height','heading','pitch','fov','speed','travel','climb','turn','dur']){
    if(C[k]===undefined) continue;
    const v=checkValue(schemaParam('camera.'+k),C[k],warn); if(v!==undefined) knobs[k]=v;
  }
  if(P&&vec(P.p0)&&vec(P.p1)){
    kind=kind||'angled';
    /* Every number of the path is kept inside PATH_RANGE, and a change is listed, as for the levers. */
    const num=(v,d,k)=>pathNum(v,d,k,warn);
    const defFov={top:50,angled:54,low:60,canopy:58,crossing:60}[kind];
    const pt=p=>[num(p[0],0,'x'),num(p[1],60,'y'),num(p[2],0,'z')];
    S={L,lightKey,kind,p0:pt(P.p0),p1:pt(P.p1),yaw0:num(P.yaw0,0,'yaw'),pitch:kind==='top'?-Math.PI/2:num(P.pitch,-.35,'pitch'),
      fov:num(P.fov,defFov*RAD,'fov'),dur:num(P.dur,6,'dur'),noise:num(P.noise,rnd(1000),'noise'),start:0,t:0};
    const fin=v=>v!==null&&v!==undefined&&isFinite(+v);
    S.yaw1=fin(P.yaw1)?+P.yaw1:S.yaw0;
    { const turn=S.yaw1-S.yaw0, t=num(turn,0,'turn'); if(t!==turn) S.yaw1=S.yaw0+t; }
    if(kind!=='top'&&fin(P.pitch1)) S.pitch1=num(P.pitch1,S.pitch,'pitch');
    if(kind==='crossing'&&P.cross&&typeof P.cross==='object'){
      const v=['in','back','edge'].includes(P.cross.v)?P.cross.v:'in', n=(x,d,a,b)=>isFinite(+x)?Math.min(Math.max(+x,a),b):d;
      S.cross={v,clr:n(P.cross.clr,11,4,40),low:n(P.cross.low,9,4,40),rise:n(P.cross.rise,0,0,40)};
    }
    /* The ray march's limits as saved, when they were (favourites and studio recipes keep them). */
    const lim=fin(P.steps)&&fin(P.maxH)&&fin(P.nearH);
    if(lim){ S.steps=num(P.steps,38,'steps'); S.maxH=num(P.maxH,L.maxH,'maxH'); S.nearH=num(P.nearH,L.maxH,'nearH'); }
    fixBounds(S,lim);
    /* Knobs written beside the path that no longer match it were edited by hand: apply them. */
    const K=camKnobs(S), edit={};
    for(const k in knobs){ const tol=k==='speed'?.02:k==='heading'||k==='travel'?.6:.11; let d=knobs[k]-K[k]; if(k==='heading'||k==='travel') d=wrap180(d); if(Math.abs(d)>tol) edit[k]=knobs[k]; }
    if(Object.keys(edit).length) setCamKnobs(S,edit);
  } else {
    if(P) warn.push('camera.path: needs p0 and p1 as [x, height, z]; a new path was made');
    kind=kind||pick(['top','angled','angled','canopy','crossing']);
    if(!Object.keys(knobs).length){ S=makeShot(L,lightKey,kind); }
    else {
      /* Knobs fix part of the path; the rest is free, and is tried at random until the whole path is
         clear (pathCheck): first as the slideshow would place a shot of this kind, then further along
         the coast and further out or in. Only if no free choice is clear are the recipe's own numbers
         moved, as little as will do (fitPath), and the moves are listed. */
      let best=null,bestC=null;
      for(let i=0;i<60;i++){
        const T=makeShot(L,lightKey,kind);
        if(i>=24){ const K0=camKnobs(T); setCamKnobs(T,{offshore:K0.offshore+rnd(-30,70),along:K0.along+rnd(-120,120)}); }
        setCamKnobs(T,knobs);
        const c=pathCheck(T);
        if(!bestC||c.score>bestC.score){ best=T; bestC=c; }
        if(c.ok) break;
      }
      S=best;
      if(!bestC.ok){
        const f=fitPath(S);
        if(f){ if(f.moves.length) warn.push('camera: '+fitNote(f)); }
        else warn.push(`camera: ${pathTrouble(bestC.worst)}, and no path near these numbers is clear; try another heading or height`);
      }
    }
    S.start=0; S.t=0;
  }
  const E=R.elements||{}, opt={};
  for(const k of ['plants','greenery','flora','vegetation','cover','fish','spray','breakers','people']) if(E[k]!==undefined){ const v=checkValue(schemaParam('elements.'+k),E[k],warn); if(v!==undefined) opt[k]=v; }
  if(opt.flora==='coast') delete opt.flora;
  if(opt.vegetation==='coast') delete opt.vegetation;
  if(opt.cover==='coast') delete opt.cover;
  if(opt.people==='coast') delete opt.people;
  if(opt.greenery!==undefined&&Math.abs(opt.greenery-1)<1e-6) delete opt.greenery;
  if(Object.keys(opt).length) S.opt=opt;
  const Sd=R.sound||{}, snd={};
  for(const k of SOUND_KNOBS) if(Sd[k]!==undefined){ const v=checkValue(schemaParam('sound.'+k),Sd[k],warn); if(v!==undefined&&Math.abs(v-1)>1e-6) snd[k]=v; }
  if(Object.keys(snd).length) S.sound=snd;
  if(R.name) S.recipeName=String(R.name).slice(0,80);
  S.warnings=warn;
  if(warn.length) console.warn('[recipe]',warn.join(' | '));
  return S;
}

/* ---- Scenes described in words: instructions any chat AI can follow, and reading its reply ----
   No AI is built in, and no keys or servers are needed. recipePrompt() wraps a description such as "a
   stormy dusk over a rocky cove" in complete instructions: what the simulator is, every lever in SCHEMA
   with its range and meaning, the coasts and lighting setups, what keeps the water in view, two worked
   examples and the reply wanted. Pasted into Claude, ChatGPT or any other chat AI, it comes back as a
   recipe; recipeFromReply() digs the JSON out of the reply, and shotFromRecipe() checks it as it checks
   any recipe, so an AI's slips become listed corrections. tools/recipeprompt.js prints the same text. */
const LIGHT_WORDS={highSun:'midday: the sun high, clear light, short shadows',morning:'morning: the sun about 36° up, fresh light',
  late:'late afternoon: the sun about 24° up, warmer light, longer shadows',golden:'golden hour: a low, warm sun about 10° up',
  moody:'moody: heavy grey cloud, the sun breaking through now and then',storm:'storm: dark overcast, little direct sun',
  dawn:'dawn: before sunrise, blue twilight with a glow low in the sky',sunrise:'sunrise: the sun just up, low over the sea',
  sunset:'sunset: the sun just above the sea\'s horizon',dusk:'dusk: after sunset, the deep blue hour',
  moonlit:'night with a bright moon and its path on the water',starry:'night with stars and no moon: very dark, quiet'};
const FORM_WORDS=['high sea cliffs','a low rock shelf below low cliffs','a broad reef cut by surge channels','a crescent bay: a sandy beach between rocky headlands',
  'a broken rocky coast of coves, ledges and sea stacks','a palm cove: a sandy beach between granite boulders','an alpine lake below snowy mountains'];
const WATER_WORDS={tropical:'clear turquoise water',surf:'green-grey surf water, clouded by stirred-up sand',rocky:'clear, dark blue-green water',lake:'clear, cold teal lake water'};
const FLORA_WORDS=['tropical palms and broadleaf trees','broadleaf trees and pines','conifers, pines and some broadleaf trees','mountain conifers'];
function locWords(L){
  const shape=L.type===0?'a tropical shore: a sandy beach and shallow reef':L.type===1?'a long sandy surf beach':FORM_WORDS[L.form||0]||'a rocky coast';
  const coverWords={dunes:'bare dunes with grass',scrub:'sparse scrub',open:'open woodland',patchy:'groves and clearings',dense:'dense forest'};
  return `"${L.name}": ${shape}; ${WATER_WORDS[L.water||L.kind]}; ${FLORA_WORDS[L.flora??L.type]}, ${coverWords[L.cover||'dense']}; usual waves ${L.Hs} m every ${L.T} s; suits ${[...new Set(L.lights)].join(', ')}.`;
}
function recipePrompt(desc){
  const UNIT={m:'metres','°':'degrees','m/s':'metres a second',s:'seconds',km:'kilometres','×':'times the usual (1 = as usual)'};
  const lights=[...new Set([...Object.keys(LIGHTS),...Object.keys(typeof SKY_PRESETS==='object'?SKY_PRESETS:{})])].filter(k=>!k.startsWith('r:')&&!k.startsWith('live')&&k!=='test');
  const set=[];
  for(const g of SCHEMA){
    if(g.group==='fixed') continue;
    for(const p of g.params){
      let what;
      if(p.id==='loc') what='the name of one of the coasts listed above';
      else if(p.id==='light.preset') what='one of the lighting setups listed above';
      else if(p.type==='choice') what='one of: '+p.choices.join(', ');
      else if(p.type==='bool') what='true or false (default true)';
      else if(p.type==='colour') what='a colour, written "#rrggbb"';
      else what=`${UNIT[p.unit]||'a number'}, ${p.min} to ${p.max}`;
      set.push(`- ${p.id} (${p.label}): ${what}. ${p.desc}${p.applies==='gradual'&&!/half a minute/.test(p.desc)?' Takes half a minute or so to show.':''}`);
    }
  }
  return [
`You are setting up one scene for Coastline, a live, photo-real simulation of ocean water meeting a shore, seen from a drone. The waves, foam and light are simulated as it plays; you only choose the scene. Write the scene as a recipe: one JSON object.`,
``,
`THE SCENE TO MAKE:`,
`"${String(desc||'').trim()||'a beautiful, calm scene of your choice'}"`,
``,
`HOW A RECIPE IS WRITTEN`,
`- A setting named group.name goes inside that group's object: camera.height is {"camera":{"height":80}}, light.preset is {"light":{"preset":"golden"}}. "loc" and "name" are at the top level.`,
`- Leave out anything the description doesn't call for: the simulator chooses it, as its slideshow would. Keep to the settings listed here; anything else is ignored.`,
`- Give the camera as settings only (kind, height, heading and so on). Don't write a camera "path": the simulator finds a path with your settings that keeps water in view.`,
`- Numbers outside a setting's range are moved into it.`,
`- Add a short "name" for the scene.`,
``,
`COASTS (loc), all made up:`,
...LOCATIONS.filter(L=>!L.real).map(L=>'- '+locWords(L)),
``,
`LIGHTING SETUPS (light.preset):`,
...lights.map(k=>`- ${k}: ${LIGHT_WORDS[k]||(LIGHTS[k]&&LIGHTS[k].label)||k}`),
``,
`SETTINGS:`,
...set,
``,
`WHAT MAKES A GOOD SHOT`,
`- Directions: camera.heading 0 faces straight out to sea, 180 faces the land, +90 and -90 look along the coast. Looking along the coast (heading about ±60 to ±120) shows the shore, the surf and the sea together, usually the best view. Facing the land shows mostly land: avoid it unless asked.`,
`- top: straight down, 60 to 300 m up. angled: 40 to 250 m up, looking down (pitch) 10 to 35°. low: 4 to 12 m up, flying fast (6 to 13 m/s) along the line of the trees or the rock edge, mostly over land (heading ±90 with travel 0); it is not a pass over the surf. For the surf from low down, use angled at 40 to 60 m with pitch 10 to 15°. canopy: 35 to 60 m up over the trees near the shore, slow. crossing: a slow, low flight across the tree line, from over the trees, across the beach and out over the shallows (heading about 0, travel 0, speed 1.5 to 4, pitch 20 to 30); its height follows the trees and the ground, and camera.height is how high it flies over the sand (6 to 15 m).`,
`- Calm, slow scenes drift at 0.5 to 2 m/s and last (dur) 35 to 75 s; lively ones last 4 to 8 s.`,
`- The sun: light.sunAzimuth uses the same directions as the heading. A camera facing within about 40° of the sun looks into its glare and glitter; for a scene lit from behind the camera, make sunAzimuth about heading + 180 (kept within -180 to 180).`,
`- The night and twilight setups (dawn, dusk, moonlit, starry) suit angled shots; straight down they look dark and flat.`,
`- Bigger waves: waves.height 2 to 3.5 m with waves.period 11 to 15 s. A glassy calm: height 0.2 to 0.5 m.`,
``,
`EXAMPLES`,
`"a calm golden evening in the palm cove, drifting slowly along the beach, the sun behind the camera":`,
`{"name":"Golden evening, palm cove","loc":"Palm cove","light":{"preset":"golden","sunAzimuth":-90},"camera":{"kind":"angled","height":70,"heading":90,"pitch":20,"speed":1,"travel":0,"dur":60}}`,
`"high above a tropical lagoon at noon, looking straight down through very clear water":`,
`{"name":"Lagoon from above","loc":"Tropical lagoon","light":{"preset":"highSun"},"water":{"clarity":2},"camera":{"kind":"top","height":180,"speed":2,"dur":40}}`,
``,
`REPLY with the JSON recipe only: one object, starting with { and ending with }, and no other text.`].join('\n');
}
/* The recipe in an AI's reply: inside a ```json block or not, with text around it or not. A list of
   recipes comes back as a list. Common slips (curly quotes, trailing commas) are forgiven. */
function recipeFromReply(text){
  let s=String(text||'').trim();
  const fence=s.match(/```[a-zA-Z]*\s*([\s\S]*?)```/); if(fence) s=fence[1].trim();
  const parse=t=>{ try{ return JSON.parse(t); }catch(e){
    const u=t.replace(/[“”„]/g,'"').replace(/[‘’]/g,"'").replace(/,\s*([}\]])/g,'$1');
    return JSON.parse(u); } };
  const a=s.indexOf('['), b=s.indexOf('{');
  if(a>=0&&(b<0||a<b)){ const e=s.lastIndexOf(']'); if(e>a){ try{ const v=parse(s.slice(a,e+1)); if(Array.isArray(v)&&v.length) return v; }catch(e){} } }
  const e=s.lastIndexOf('}');
  if(b<0||e<b) throw new Error('No recipe in the reply: it should hold a JSON object, starting with {');
  try{ return parse(s.slice(b,e+1)); }catch(err){ throw new Error('The recipe in the reply isn\'t valid JSON ('+err.message+')'); }
}

/* ---- For the renderers: a saved favourite or a recipe, made into a shot ----
   Used by renderFavourite() (js/render.js, for tools/prerender.js), tools/stills.js and the calm films.
   A favourite keeps its exact fields, as before; a recipe is checked as the studio checks it, and any
   corrections go to the console. A coast that isn't built here gives null, not a random stand-in. */
function shotForRender(F){
  if(F&&F.lightKey&&!F.camera) return shotOf(F);
  const R=normRecipe(F);
  if(R.loc!==undefined&&R.loc!==null&&R.loc!==''){
    const L=typeof R.loc==='number'?LOCATIONS[R.loc]:LOCATIONS.find(l=>l.name.toLowerCase()===String(R.loc).toLowerCase());
    if(!L||!L.ready) return null;
  }
  const S=shotFromRecipe(R); S.start=0; S.t=0;
  return S;
}
/* How long a favourite or recipe says its shot lasts, if it says. */
function durOfItem(F){ return F.dur??F.camera?.dur??F.camera?.path?.dur; }

/* ---- Links: a recipe in the address, as JSON or in the shorter link form (base64url of the JSON) ---- */
function recipeToLink(R){ return btoa(unescape(encodeURIComponent(JSON.stringify(R)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function recipeFromLink(s){
  s=s.trim();
  if(s.startsWith('{')) return JSON.parse(s);
  const b=s.replace(/-/g,'+').replace(/_/g,'/');
  return JSON.parse(decodeURIComponent(escape(atob(b+'==='.slice((b.length+3)%4)))));
}
const RECIPE0=(()=>{ const v=Q.get('recipe'); if(!v) return null; try{ return normRecipe(recipeFromLink(v)); }catch(e){ console.warn('[recipe] could not read ?recipe=',e.message); return null; } })();
/* One recipe: build only its coast, so it starts in seconds. */
const RECIPE_ONLY=(()=>{ if(!RECIPE0||STUDIO||Q.has('only')) return null;
  const i=typeof RECIPE0.loc==='number'?RECIPE0.loc:LOCATIONS.findIndex(l=>l.name.toLowerCase()===String(RECIPE0.loc||'').toLowerCase());
  return i>=0&&LOCATIONS[i]?String(i):null; })();

/* ---- Playing: the studio or one recipe holds its shot, looping it; a playlist plays recipes in turn ---- */
const PLAYLIST={on:false,list:[],i:-1};
function holdScene(){ return (STUDIO||!!RECIPE0)&&!PLAYLIST.on; }
function recipeNext(prev){
  if(!PLAYLIST.on||!PLAYLIST.list.length) return null;
  for(let n=0;n<PLAYLIST.list.length;n++){
    PLAYLIST.i=(PLAYLIST.i+1)%PLAYLIST.list.length;
    try{ return shotFromRecipe(PLAYLIST.list[PLAYLIST.i]); }catch(e){ console.warn('[recipe] playlist item',PLAYLIST.i,e.message); }
  }
  return null;
}
/* The first shot at startup: the recipe in the address, or in the studio the last scene worked on. */
function recipeFirst(){
  let R=RECIPE0;
  if(!R&&STUDIO){ try{ R=JSON.parse(localStorage.getItem('coastline-studio-last-v1')||'null'); }catch(e){ R=null; } }
  if(!R) return null;
  try{ const S=shotFromRecipe(R); S.t=0; return S; }catch(e){ console.warn('[recipe]',e.message); return null; }
}

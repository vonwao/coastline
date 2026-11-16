'use strict';
/* ---------------------------------------------------------------- Scene data -------- */
function rnd(a=1,b){ if(b===undefined){b=a;a=0;} return a+Math.random()*(b-a); }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function deg(x){ return x*Math.PI/180; }

const LIGHTS={
  highSun:{el:66,az:150,cover:.43,turb:1.0,exposure:.31,bloom:.07,sat:1.03,tint:[1,1,1],fog:1/9500,cloudShade:.34,seed:3},
  morning:{el:36,az:35,cover:.41,turb:1.1,exposure:.35,bloom:.08,sat:1.03,tint:[1.01,1,.985],fog:1/8500,cloudShade:.32,seed:27},
  late:{el:24,az:-55,cover:.46,turb:1.2,exposure:.41,bloom:.09,sat:1.02,tint:[1.02,1,.97],fog:1/7500,cloudShade:.30,seed:61},
  moody:{el:30,az:40,cover:.70,turb:1.5,exposure:.47,bloom:.07,sat:.96,tint:[.985,1,1.015],fog:1/6000,cloudShade:.62,seed:131,sunK:.62,dark:.42},
  storm:{el:22,az:-30,cover:.90,turb:1.9,exposure:.62,bloom:.05,sat:.90,tint:[.97,1,1.03],fog:1/4000,cloudShade:.45,seed:177,sunK:.17,dark:.85,sunVis:.06},
  golden:{el:10.5,az:32,cover:.5,turb:1.25,exposure:.66,bloom:.12,sat:1.01,tint:[1.03,1,.96],fog:1/7000,cloudShade:.0,seed:93},
};
/* Times of day beyond daylight, for the made-up coasts: twilight, sunrise and sunset, and night lit by the
   moon or only by the stars. Each is a description of the sky that skyLight() (live.js, the real-conditions
   code) turns into a lighting setup at startup (buildEnvs), so a made-up coast gets the same twilight, moon
   and stars as a real beach. sunAz and moonAz are degrees from the way the coast faces, out to sea; exp
   brightens the picture (a moonless night was all but black). They're mixed in at TOD_SHARE of the angled
   and tree-top shots (?tod=0 to 1 changes the share), never in straight-down shots or low passes, which are
   dull in dim light. ?light=<name> uses one setup for every shot, any of these or of LIGHTS above. */
const SKY_PRESETS={
  dawn:{sunEl:-4.5,sunAz:25,cloud:35,seed:211},
  sunrise:{sunEl:1.5,sunAz:20,cloud:30,seed:223},
  sunset:{sunEl:1,sunAz:-25,cloud:40,seed:227},
  dusk:{sunEl:-6.5,sunAz:-30,cloud:30,seed:229},
  moonlit:{sunEl:-30,sunAz:-150,moonEl:28,moonAz:15,lit:.9,cloud:25,seed:233},
  starry:{sunEl:-30,sunAz:-150,moonEl:-15,moonAz:0,lit:0,cloud:10,exp:1.8,seed:239},
};
const TOD_SHARE=Q.has('tod')?Math.min(Math.max(+Q.get('tod')||0,0),1):.2;
const FORCE_LIGHT=Q.get('light')||null;
function pickLight(L,kind){
  const day=kind==='top'?L.lights.filter(k=>k!=='golden'):L.lights;
  if(kind==='top'||kind==='low'||Math.random()>=TOD_SHARE) return pick(day);
  return pick(Object.keys(SKY_PRESETS).filter(k=>!(L.todOff||[]).includes(k)));
}
/* Twilight after the sun is well down, and night: straight-down shots and low passes go dark and flat. */
function dimLight(key){ const Li=LIGHTS[key]; return !!Li&&(Li.night||0)>.3; }
const WATER={
  tropical:{sigA:[.40,.058,.024],sigS:[.0035,.0055,.0075],sed:[.040,.038,.030],sedGen:.55,chop:.40,decay:.20,foamGen:1.5,tau:34,
            sandA:[.74,.66,.54],sandB:[.86,.79,.67],sandPatch:[.1,.1,.06]},
  surf:{sigA:[.43,.098,.088],sigS:[.018,.032,.029],sed:[.21,.185,.125],sedGen:1.5,chop:.7,decay:.135,foamGen:1.,tau:38,
        sandA:[.60,.50,.37],sandB:[.72,.62,.47],sandPatch:[.3,.26,.2]},
  rocky:{sigA:[.42,.08,.052],sigS:[.012,.024,.028],sed:[.11,.13,.11],sedGen:.45,chop:.9,decay:.27,foamGen:.62,tau:42,
         sandA:[.56,.50,.40],sandB:[.68,.62,.52],sandPatch:[.2,.2,.2]},
  /* Clear, cold mountain water, teal-green, with a grey gravel shore and little foam. */
  lake:{sigA:[.44,.075,.10],sigS:[.0045,.0085,.0085],sed:[.06,.07,.07],sedGen:.2,chop:.32,decay:.5,foamGen:.25,tau:30,
        sandA:[.40,.385,.36],sandB:[.54,.52,.48],sandPatch:[.15,.15,.15]},
};
const LOCATIONS=[
  {name:'Tropical shallows',veg:'hawaii',cover:'open',kind:'tropical',type:0,seed:1.7,dx:.40,nx:520,nz:1000,xMin:-72,hmax:2.3,Hs:.24,T:6.4,obl:6,maxH:280,lights:['highSun','morning','late','moody']},
  {name:'Tropical lagoon',cover:'dense',kind:'tropical',type:0,seed:4.3,dx:1.0,nx:520,nz:1200,xMin:-110,hmax:2.7,Hs:.30,T:7.2,obl:-9,maxH:280,lights:['highSun','morning','golden','moody']},
  {name:'Surf beach',veg:'florida',cover:'dunes',kind:'surf',type:1,seed:2.1,dx:.56,nx:560,nz:1000,xMin:-72,hmax:4.3,Hs:1.22,T:8.6,obl:7,maxH:380,lights:['morning','late','highSun','moody','storm']},
  {name:'Long sand coast',veg:'california',cover:'scrub',kind:'surf',type:1,seed:6.2,dx:1.05,nx:560,nz:1300,xMin:-130,hmax:5.0,Hs:1.3,T:10.2,obl:-8,maxH:380,lights:['golden','late','morning','moody','storm']},
  {name:'Rock shelf',veg:'atlantic',cover:'patchy',kind:'rocky',type:2,form:1,seed:3.3,dx:.50,nx:560,nz:1000,xMin:-110,hmax:4.5,Hs:2.1,T:8.8,obl:10,maxH:240,lights:['morning','highSun','late','moody','storm']},
  {name:'Sea cliffs',fall:{z:-62,x:-67},veg:'mediterranean',cover:'open',kind:'rocky',type:2,form:0,seed:5.1,dx:1.05,nx:560,nz:1300,xMin:-190,hmax:5.5,Hs:2.5,T:10.5,obl:-12,maxH:240,lights:['late','golden','morning','moody','storm','storm']},
  {name:'Surge reef',veg:'australia',cover:'scrub',kind:'rocky',type:2,form:2,seed:7.4,dx:.72,nx:620,nz:1000,xMin:-90,hmax:5.5,Hs:3.0,T:11.,obl:15,maxH:240,lights:['morning','late','highSun','golden','moody','storm','storm']},
  {name:'Crescent bay',veg:'california',cover:'patchy',kind:'rocky',water:'surf',flora:1,type:2,form:3,seed:8.2,dx:.9,nx:680,nz:1000,xMin:-250,hmax:4.8,Hs:1.35,T:9.4,obl:6,maxH:380,lights:['morning','late','golden','moody','storm']},
  {name:'Broken coast',veg:'northwest',cover:'dense',kind:'rocky',type:2,form:4,seed:9.6,dx:.8,nx:700,nz:1100,xMin:-190,hmax:5.5,Hs:2.6,T:10.5,obl:-9,maxH:380,lights:['morning','late','golden','moody','storm','highSun']},
  {name:'Palm cove',veg:'hawaii',cover:'dense',kind:'rocky',water:'tropical',flora:0,type:2,form:5,seed:6.7,dx:.8,nx:620,nz:1050,xMin:-230,hmax:2.8,Hs:.42,T:7.5,obl:8,maxH:300,lights:['highSun','morning','late','golden','moody']},
  /* An experiment: a mountain lake, with small wind-driven waves and snow on the peaks (snow: snowline in metres). */
  {name:'Alpine lake',cover:'dense',kind:'rocky',water:'lake',flora:3,spread:80,farLod:1,slopeK:2.5,farStep:.03,marchK:10,type:2,form:6,seed:4.9,dx:.6,nx:600,nz:1000,xMin:-160,hmax:4.,Hs:.16,T:2.8,obl:4,maxH:2700,snow:1250,fish:.25,lights:['morning','highSun','late','golden','moody'],
   /* Deep in its valley the lake goes nearly black after the sun is well down, unless the moon is up. */
   todOff:['dusk','starry']},
];
/* Pre-rendering: a finer water grid over the same area. */
if(HQ) for(const L of LOCATIONS){ const G=+(Q.get('grid')||1.5); L.dx/=G; L.nx=Math.round(L.nx*G); L.nz=Math.round(L.nz*G); }
const FAR_SPAN=17000, FAR_RES=1024;

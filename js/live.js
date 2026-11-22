'use strict';
/* ---- Real conditions: the sea and sky as they are now at a real beach ----
   Open the page with ?live=<latitude>,<longitude>, for example ?live=-33.89,151.28 for Bondi Beach.
   A third number gives the compass direction the beach faces, out to sea (?live=-33.89,151.28,110);
   without it, the direction the swell comes from is used, which is close for most open beaches.

   Every 30 minutes it asks Open-Meteo (a free forecast service; only the coordinates are sent) for the
   current swell and weather there, then:
     - sets the simulated swell's height, period and direction to match, so the waves change as the
       new swell rolls in from offshore,
     - picks the kind of coast that suits that sea (under 0.4 m: a tropical shore; up to 1.8 m: a
       sandy surf beach; bigger: rocky coasts).
   The light is worked out here, from the date and place, at every change of scene:
     - the sun's real height and direction, relative to the way the beach faces, so a west-facing
       beach gets its sunsets over the sea,
     - cloud cover, wind and rain from the forecast, from clear through overcast to storm,
     - after sunset, twilight, then night: the moon, in its real place and phase, lights the sea, and
       the stars come out. On a moonless night only a faint glow is left, so it's dark, as it is there.
   ?hour=<local hour> (for example ?hour=19.5) shows today at that hour instead of now.

   Open-Meteo's free service is for non-commercial use, and asks for credit: "Weather data by
   Open-Meteo.com, wave models by DWD". A product would need its paid plan or another source. */
const LIVE={on:false,name:null,lat:0,lon:0,facing:null,hour:null,wx:null,utcOff:null,locs:null,info:null,next:0,key:null,ver:0,desc:null,seed:301,fails:0,req:0};
(function(){
  const v=Q.get('live'); if(!v) return;
  const [la,lo,fa]=v.split(',').map(Number); if(!isFinite(la)||!isFinite(lo)) return;
  LIVE.on=true; LIVE.lat=la; LIVE.lon=lo; if(isFinite(fa)) LIVE.facing=fa;
  if(Q.has('hour')) LIVE.hour=+Q.get('hour');
})();
/* ---- Follow the clock, on the made-up coasts, with no forecast: ?clock=1, or
   ?clock=<latitude>[,<longitude>[,<facing>]] ----
   The light follows the viewer's own time of day, so a screen left running goes from morning to golden hour
   to twilight to moonlight by itself: the sun from the time, at latitude 30° unless given, the moon in its
   real place and phase, and a cloud cover that changes from day to day (?cloud= fixes it). Without a
   longitude, the time zone's standard offset stands in for one, so the sun is highest near 12:00 standard
   time. The coast faces west unless told otherwise, so the sun sets over the sea. ?hour= on its own does the
   same for today at that hour on the viewer's clock, for trying it out. A beach being followed wins. */
(function(){
  if(LIVE.on||(!Q.has('clock')&&!Q.has('hour'))) return;
  const v=Q.get('clock')||'', [la,lo,fa]=(v.includes(',')?v:v==='1'||v===''?'':v).split(',').map(s=>s===''?NaN:+s);
  const now=new Date(), y=now.getFullYear();
  const std=Math.max(new Date(y,0,1).getTimezoneOffset(),new Date(y,6,1).getTimezoneOffset());
  LIVE.clock={lat:isFinite(la)?la:30,lon:isFinite(lo)?lo:-std/4,facing:isFinite(fa)?fa:270,
    hour:Q.has('hour')?+Q.get('hour'):null,utcOff:-now.getTimezoneOffset()*60,cloud:Q.has('cloud')?+Q.get('cloud'):null};
})();
/* No forecast: some cloud, more on some days than others (changing at local midnight), never overcast. */
function clockWeather(C){ const day=Math.floor((liveTime(C)+C.utcOff*1000)/86400000); return {cloud:C.cloud??Math.round(22+18*(1+Math.sin(day*2.39996))),wind:8,rain:0}; }

/* ---- Where the sun and moon are, to within about a degree (the low-precision formulas of the
   Astronomical Almanac). Elevation in degrees above the horizon; azimuth in degrees clockwise from north. */
function astroDays(t){ return t/86400000+2440587.5-2451545; }
function eclToEqu(lam,beta,d){
  const e=deg(23.439-3.6e-7*d);
  return {ra:Math.atan2(Math.sin(lam)*Math.cos(e)-Math.tan(beta)*Math.sin(e),Math.cos(lam)),
          dec:Math.asin(Math.sin(beta)*Math.cos(e)+Math.cos(beta)*Math.sin(e)*Math.sin(lam))};
}
function equToHoriz(ra,dec,d,lat,lon){
  const H=deg((280.46061837+360.98564736629*d)%360)+deg(lon)-ra, la=deg(lat);
  const el=Math.asin(Math.sin(la)*Math.sin(dec)+Math.cos(la)*Math.cos(dec)*Math.cos(H));
  const az=Math.atan2(-Math.cos(dec)*Math.sin(H),Math.sin(dec)*Math.cos(la)-Math.cos(dec)*Math.sin(la)*Math.cos(H));
  return {el:el*180/Math.PI,az:(az*180/Math.PI+360)%360};
}
function sunMoon(t,lat,lon){
  const d=astroDays(t);
  const g=deg(357.529+.98560028*d),q=deg(280.459+.98564736*d);
  const s=eclToEqu(q+deg(1.915)*Math.sin(g)+deg(.020)*Math.sin(2*g),0,d);
  const Lm=deg(218.316+13.176396*d),Mm=deg(134.963+13.064993*d),Fm=deg(93.272+13.229350*d);
  const m=eclToEqu(Lm+deg(6.289)*Math.sin(Mm),deg(5.128)*Math.sin(Fm),d);
  /* The lit part of the moon, from the angle between it and the sun: 0 at new moon, 1 at full. */
  const cosE=Math.sin(s.dec)*Math.sin(m.dec)+Math.cos(s.dec)*Math.cos(m.dec)*Math.cos(s.ra-m.ra);
  return {sun:equToHoriz(s.ra,s.dec,d,lat,lon),moon:equToHoriz(m.ra,m.dec,d,lat,lon),lit:(1-cosE)/2};
}
/* Now, or today at ?hour= in the beach's local time (or, following the clock, the viewer's). */
function liveTime(C=LIVE){
  if(C.hour==null) return Date.now();
  const off=(C.utcOff??Math.round(C.lon/15)*3600)*1000,day=86400000;
  return Math.floor((Date.now()+off)/day)*day-off+C.hour*3600000;
}

/* ---- The light for a sun height, sky and moon ----
   By day it blends between the hand-tuned lighting setups in scenes.js by the sun's height (golden hour
   at 10.5 degrees, late afternoon at 24, morning at 36, high sun at 66). Below golden hour, and through
   twilight, the values were matched by eye: exposure rises as the light fades, as the eye adapts, but
   not all the way, so dusk still looks like dusk. */
const SKY_LOOK=[
  {el:-10,exposure:30,bloom:.10,sat:1.0,tint:[.98,1,1.03],fog:1/8000,cloudShade:0,turb:1.2},
  {el:-6,exposure:13,bloom:.10,sat:1.0,tint:[.99,1,1.02],fog:1/7500,cloudShade:0,turb:1.2},
  {el:-3,exposure:5.2,bloom:.11,sat:1.0,tint:[1,1,1.01],fog:1/7000,cloudShade:0,turb:1.25},
  {el:0,exposure:2.3,bloom:.12,sat:1.0,tint:[1.02,1,.98],fog:1/6500,cloudShade:0,turb:1.3},
  {el:4.5,exposure:1.0,bloom:.13,sat:1.0,tint:[1.035,1,.955],fog:1/6500,cloudShade:0,turb:1.3},
  {el:10.5,exposure:.66,bloom:.12,sat:1.01,tint:[1.03,1,.96],fog:1/7000,cloudShade:0,turb:1.25},
  {el:24,exposure:.41,bloom:.09,sat:1.02,tint:[1.02,1,.97],fog:1/7500,cloudShade:.30,turb:1.2},
  {el:36,exposure:.35,bloom:.08,sat:1.03,tint:[1.01,1,.985],fog:1/8500,cloudShade:.32,turb:1.1},
  {el:66,exposure:.31,bloom:.07,sat:1.03,tint:[1,1,1],fog:1/9500,cloudShade:.34,turb:1.0},
];
function skyLook(el){
  const A=SKY_LOOK; let i=0; while(i<A.length-2&&el>A[i+1].el) i++;
  const a=A[i],b=A[i+1],f=Math.min(Math.max((el-a.el)/(b.el-a.el),0),1),mix=(x,y)=>x+(y-x)*f;
  return {exposure:Math.exp(mix(Math.log(a.exposure),Math.log(b.exposure))),bloom:mix(a.bloom,b.bloom),sat:mix(a.sat,b.sat),
    tint:a.tint.map((v,k)=>mix(v,b.tint[k])),fog:mix(a.fog,b.fog),cloudShade:mix(a.cloudShade,b.cloudShade),turb:mix(a.turb,b.turb)};
}
const NIGHT_EL=-10;
function smooth(a,b,x){ const t=Math.min(Math.max((x-a)/(b-a),0),1); return t*t*(3-2*t); }
function skyLight(D,seed){
  const night=D.sunEl<NIGHT_EL;
  let Li;
  if(!night){
    Li=Object.assign(skyLook(D.sunEl),{el:D.sunEl,az:D.sunAz});
    /* Twilight: the land loses its colour first, and the first stars appear. */
    Li.night=.75*smooth(-3,NIGHT_EL,D.sunEl);
    Li.starK=smooth(-5,NIGHT_EL,D.sunEl)*.7;
  } else {
    /* Night: the moon is the light, in its real place, as bright as its phase. The sky it lights is the
       same blue as by day, only far fainter, and the eye sees it all with little colour. */
    const up=D.moonEl>.5, mk=up?D.lit*smooth(.5,12,D.moonEl):0;
    Li=Object.assign(skyLook(up?Math.max(D.moonEl,4.5):30),{el:up?Math.max(D.moonEl,.6):35,az:up?D.moonAz:D.sunAz+180});
    /* With less moon the eye adapts further, but not all the way: a moonless night is darker than a
       moonlit one, though the surf still shows. Even under a full moon it is night: the author, 18 November,
       on a moonlit beach, "everything looks too light for night (even if were a full moon)". Moonlight
       is about a 400,000th of sunlight; the eye makes up much of that, not all, so a moonlit scene is
       drawn at about a third of the brightness it had (.42 to .27 here, the sea and sand darker still
       through the tone curve), and the moon's glitter path and the surf are what stand out. Few stars
       show near a bright moon (starK). */
    Li.sunK=mk; Li.skyK=.16+.14*mk; Li.night=1; Li.starK=1-.8*mk;
    Li.exposure*=(.42-.15*mk)*Math.pow(1.12/(mk+.12),.7); Li.cloudShade=0; Li.moon=mk;
    /* For drawing the moon's phase: where the real sun is (below the horizon), which side of the moon
       it lights, and how much of the moon is lit. */
    if(up){ Li.moonSun=sunVec({el:D.sunEl,az:D.sunAz}); Li.moonLit=Math.max(D.lit,.001); }
  }
  /* Cloud: from scattered to overcast (moody) to storm, blending toward those setups' values. */
  const c=D.cloud/100, ov=smooth(.6,.92,c), st=ov*Math.min(Math.max(Math.max((D.wind-25)/20,D.rain/.8),0),1);
  Li.cover=.30+.62*Math.pow(c,1.3);
  /* Under real overcast the sun is hidden most of the time, so direct light is cut harder than in the
     hand-tuned moody setup (.62). */
  Li.sunK=(Li.sunK??1)*(1-.65*ov)*(1+(.17/.35-1)*st);
  Li.dark=.42*ov+(.85-.42)*st;
  Li.exposure*=(1+.34*ov)*(1+.12*st);
  Li.sat-=.07*ov+.05*st;
  Li.fog*=1+.7*ov+.6*st;
  Li.turb+=.4*ov+.3*st;
  Li.cloudShade+=(.62-Li.cloudShade)*ov+(.45-.62)*st;
  Li.storm=st>.5;
  /* How bright the moon's lit face looks on screen: near white but not past it, so its seas show; dimmer
     low down, and through haze. (Its light on the sea follows its phase, as above.) */
  if(Li.moonLit) Li.moonT=2.8*(.4+.6*smooth(.5,12,D.moonEl))*(1-.6*ov);
  /* How often the sun's disc is out, for its glitter on the water: under overcast it's hidden most of the
     time, more so in a storm. */
  Li.sunVis=(1-.96*ov)*(1-.5*st);
  Li.stars=Li.starK*(1-.9*ov)*.3/Li.exposure;
  Li.seed=seed;
  /* The nearest of the fixed setups, saved with favourites in place of this one. */
  Li.base=st>.5?'storm':ov>.5?'moody':night?(Li.moon>.15?'moonlit':'starry'):D.sunEl<-1?(D.sunEl>-5.5?'dawn':'dusk'):D.sunEl<4?'sunset':
    D.sunEl<16?'golden':D.sunEl<32?(D.sunAz>0?'morning':'late'):'highSun';
  Li.label=night?`night, moon ${Li.moon>0?Math.round(D.lit*100)+'% lit, '+D.moonEl.toFixed(0)+'° up':'down'}`:D.sunEl<0?`twilight, sun ${D.sunEl.toFixed(0)}°`:`sun ${D.sunEl.toFixed(0)}° high`;
  Li.label+=`, cloud ${D.cloud}%`;
  return Li;
}
/* A fixed time of day for the made-up coasts (SKY_PRESETS in scenes.js), lit the same way as a real beach. */
function skyPreset(k){
  const P=SKY_PRESETS[k], Li=skyLight(Object.assign({moonEl:-20,moonAz:0,lit:0,wind:10,rain:0},P),P.seed||301);
  if(P.exp){ Li.exposure*=P.exp; Li.stars/=P.exp; }
  delete Li.base; Li.label=k;
  return Li;
}
/* Every change of scene: if the sun, moon or weather has moved on, make a new lighting setup. Each gets
   its own name, so a shot still on screen keeps its light; old ones are freed. Following the clock works
   the same way, with the viewer's time and no forecast. */
function liveSky(){
  const C=LIVE.on?LIVE:LIVE.clock; if(!C) return;
  const P=sunMoon(liveTime(C),C.lat,C.lon), face=C.facing??90;
  const wx=LIVE.on?LIVE.wx||{cloud:40,wind:10,rain:0}:clockWeather(C);
  const D={sunEl:P.sun.el,sunAz:P.sun.az-face,moonEl:P.moon.el,moonAz:P.moon.az-face,lit:P.lit,cloud:wx.cloud,wind:wx.wind,rain:wx.rain,face,seed:LIVE.seed};
  const o=LIVE.desc;
  if(o&&Math.abs(o.sunEl-D.sunEl)<.4&&Math.abs(o.moonEl-D.moonEl)<1&&o.cloud===D.cloud&&o.wind===D.wind&&o.rain===D.rain&&o.face===D.face&&o.seed===D.seed) return;
  LIVE.desc=D;
  const key='live'+(++LIVE.ver);
  LIGHTS[key]=skyLight(D,LIVE.seed);
  /* Following the clock, a screen in a room: a night without much moon is lifted, as the moonless preset
     is, coming in gradually as the last of the twilight goes. A real beach stays as dark as it is. */
  if(!LIVE.on&&LIGHTS[key].night===1){ const L=LIGHTS[key], f=1+.8*(1-Math.min((L.moon||0)/.3,1))*smooth(-10,-16,D.sunEl); L.exposure*=f; L.stars/=f; }
  bakeEnv(LIGHTS[key]);
  const old=LIGHTS['live'+(LIVE.ver-3)]; if(old){ freeEnv(old); delete LIGHTS['live'+(LIVE.ver-3)]; }
  LIVE.key=key;
  console.log('[sun]',LIGHTS[key].label,`sun ${D.sunEl.toFixed(1)}° at ${P.sun.az.toFixed(0)}°, moon ${D.moonEl.toFixed(1)}° at ${P.moon.az.toFixed(0)}°, ${Math.round(P.lit*100)}% lit, beach faces ${face.toFixed(0)}°`);
}
/* A shot whose lighting setup has been freed (from the history, or a favourite) takes the current one. */
function liveFix(S){ if(!LIGHTS[S.lightKey]) S.lightKey=LIVE.key||'highSun'; }

/* Start following a beach, or stop, while running (the beach panel and the Wallpaper Engine settings use
   these). Starting returns once the forecast is in. */
function liveStart(lat,lon,facing,name=null){
  LIVE.name=name;
  if(LIVE.on&&LIVE.lat===lat&&LIVE.lon===lon&&LIVE.facing===facing) return;
  Object.assign(LIVE,{on:true,lat,lon,facing,wx:null,utcOff:null,locs:null,info:null,next:0,desc:null,fails:0});
  return liveUpdate();
}
function liveStop(){
  if(!LIVE.on) return;
  Object.assign(LIVE,{on:false,name:null,locs:null,info:null,desc:null,key:null});
  /* The forecast's swell is each coast's live layer (waveLayer in js/recipe.js): taking it away leaves
     the coast's own waves, or a recipe's or a reel's if one is set. */
  for(const L of LOCATIONS) if(L.waveLayers&&L.waveLayers.live) waveLayer(L,'live',null);
}
async function liveFetch(){
  const q=`latitude=${LIVE.lat}&longitude=${LIVE.lon}`;
  /* A request that never answers (a network that's half up) gives up after 20 s and counts as a failure,
     and so does an answer that is an error (the service's limit reached, say). */
  const get=u=>fetch(u,{signal:AbortSignal.timeout(20000)}).then(r=>r.json()).then(j=>{ if(j.error) throw new Error(j.reason); return j; });
  const [m,w]=await Promise.all([
    get(`https://marine-api.open-meteo.com/v1/marine?${q}&current=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction`),
    get(`https://api.open-meteo.com/v1/forecast?${q}&current=cloud_cover,wind_speed_10m,precipitation&timezone=auto`)]);
  return {m:m.current||{},w:w.current||{},utcOff:w.utc_offset_seconds};
}
async function liveUpdate(){
  if(!LIVE.on||performance.now()<LIVE.next) return;
  LIVE.next=performance.now()+30*60*1000;
  /* An answer can take up to 20 s. If, by the time it comes, following has stopped, another place is
     followed, or a newer request has gone out, it's dropped: it would put one beach's sea on another, or
     bring the forecast's swell back after "Made-up sea". Its failure is dropped the same way. */
  const req=++LIVE.req, lat=LIVE.lat, lon=LIVE.lon, stale=()=>req!==LIVE.req||!LIVE.on||LIVE.lat!==lat||LIVE.lon!==lon;
  /* Failures are retried every 5 minutes; only the first of a run is shown, so a long outage doesn't
     flash a message on the screen every 5 minutes. */
  let r; try{ r=await liveFetch(); }catch(e){ if(stale()) return; console.warn('[live] forecast failed:',e.message); if(!LIVE.fails++) toast('Real conditions: could not reach Open-Meteo'); LIVE.next=performance.now()+5*60*1000; return; }
  if(stale()) return;
  LIVE.fails=0;
  if(r.utcOff!=null) LIVE.utcOff=r.utcOff;
  const H=r.m.swell_wave_height??r.m.wave_height, T=r.m.swell_wave_period??r.m.wave_period, dir=r.m.swell_wave_direction??r.m.wave_direction;
  if(H==null||T==null){ toast('Real conditions: no wave data for that place (is it on the coast?)'); return; }
  /* Swell comes in from the open sea, so its direction is roughly the way the beach faces. */
  if(LIVE.facing==null&&dir!=null) LIVE.facing=dir;
  /* Coast type from the sea state, then the simulated swell set to match. The direction is only used
     for how obliquely the swell meets the shore, within ±15 degrees: the coasts all face the same way. */
  const kinds=H<.4?['tropical']:H<1.8?['surf']:['rocky'];
  LIVE.locs=LOCATIONS.filter(L=>L.real||kinds.includes(L.kind)&&L.form!==6);
  for(const L of LOCATIONS){
    if(L.form===6) continue;
    /* The coast's live layer (waveLayer in js/recipe.js), over its own waves and any recipe's or reel's.
       A real coast (?coast=) faces the real way, so the swell meets it at its real angle; with no
       direction in the forecast, the angle is left as it is underneath. */
    waveLayer(L,'live',{Hs:Math.max(.15,Math.min(3.,H)),T:Math.max(4,Math.min(16,T)),obl:dir!=null?(L.real?realObl(L,dir):(dir%30)-15):undefined});
  }
  LIVE.wx={cloud:r.w.cloud_cover??40,wind:r.w.wind_speed_10m??10,rain:r.w.precipitation??0};
  LIVE.seed++;
  LIVE.info=`waves ${H.toFixed(1)} m every ${T.toFixed(0)} s, cloud ${LIVE.wx.cloud}%, wind ${LIVE.wx.wind.toFixed(0)} km/h`;
  toast(`Real conditions${LIVE.name?' at '+LIVE.name:''}: ${LIVE.info}. Weather data by Open-Meteo.com`);
  console.log('[live]',LIVE.info,'->',LIVE.locs.map(L=>L.name).join(', '));
}

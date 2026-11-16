'use strict';
/* ---- Demo reels: mini-movies, each one drone's flight over one coast on one day (REELS.md) ----
   A reel file in reels/ calls REEL({...}). This file reads and checks it (reelCheck), plans its shots
   (reelPlan), works out the light for any moment (reelSky, reelLight), builds each shot (reelShot), and
   plays it live (?reel=<id>). tools/calmfilm.js --reel renders the same plan to video (reelFilm).
   Everything that's chosen at random is chosen from the reel's seed: each shot has its own seed, so it's
   the same shot whenever it's built, live or in a film. (Shots are rated on the picture's shape, so a
   window that isn't 16:9 can get different camera paths from the 16:9 film.) */
const REELS={};
function REEL(R){ if(R&&typeof R==='object'&&R.id) REELS[R.id]=R; else console.warn('[reel] a reel needs an id'); }

const REEL_DEF={seed:1,date:'2026-06-29',lat:30,shot:[30,60],fade:6,between:'black'};
const REEL_KEYS=['id','title','subtitle','seed','date','lat','noon','shot','fade','between','titles','card','movies'];
const MOVIE_KEYS=['title','subtitle','coast','length','time','date','faces','moon','weather','waves','camera','water','elements','sound','shot'];
/* Cloud in percent, wind in km/h and rain in mm an hour, as the forecast gives them to skyLight (live.js). */
const WEATHER={clear:{cloud:8,wind:6,rain:0},fair:{cloud:30,wind:10,rain:0},cloudy:{cloud:60,wind:16,rain:0},
  overcast:{cloud:88,wind:22,rain:0},storm:{cloud:97,wind:50,rain:1.2}};
/* Wave height and period, as multiples of the coast's own, and the most each may reach in metres: the
   coasts are shallow offshore (5.5 m at most), so a bigger swell breaks in deep water as straight streaks
   of foam. Storyboards showed streaks at 2.8 and 3.2 m when the sea came out at twice its height (TECHLOG
   57): 5.6 and 6.4 m of real wave. The limits were raised with the rocky coasts' own heights (by 1.4), so
   they stay below that; a limit never takes a "big" sea below the coast's usual one. */
const REEL_WAVES={calm:[.45,.9],small:[.7,.95],usual:[1,1],big:[1.3,1.15,3.4],huge:[1.5,1.25,3.9]};
/* Where each angled shot of a movie looks: along the coast one way or the other, a quarter view either
   way, or out to sea (yaw: 0 is out to sea, ±90° along the coast). The plan deals them out in a shuffled
   order, so a movie's shots don't all look the same way. */
const REEL_AIMS=[Math.PI/2,-Math.PI/2,Math.PI/4,-Math.PI/4,0];
const COMPASS={north:0,east:90,south:180,west:270};
const REEL_KINDS={angled:5,top:3,canopy:1,crossing:1};
const REEL_MUSIC=['dawn','day','dusk','night','storm'];
/* The coasts that stand in when a movie names one that doesn't exist, in turn, by name (LOCATIONS in
   js/scenes.js): a list of places in that list would point at other coasts once one was added or moved. */
const REEL_FALLBACK=['Crescent bay','Sea cliffs','Broken coast','Palm cove','Surf beach'];
/* Between movies: the picture fades out (REEL_OUT s), stays black (REEL_GAP s) and fades in (REEL_IN s);
   or, with between:'dissolve', the movies overlap by REEL_XF s. */
const REEL_GAP=.6, REEL_IN=2.5, REEL_OUT=2, REEL_XF=8;

/* ---- Seeds ---- */
function hash32(...xs){ let h=2166136261; for(const x of xs){ const s=String(x); for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } h^=124; h=Math.imul(h,16777619); } return h>>>0; }
function mulberry(seed){ let s=seed>>>0; return ()=>{ s=(s+0x6D2B79F5)|0; let t=Math.imul(s^s>>>15,1|s); t=(t+Math.imul(t^t>>>7,61|t))^t; return ((t^t>>>14)>>>0)/4294967296; }; }
/* fn runs with Math.random replaced by a generator from seed, so everything it picks is fixed by the seed. */
function withRandom(seed,fn){ const r0=Math.random; Math.random=mulberry(seed); try{ return fn(); } finally{ Math.random=r0; } }
const clamp01=x=>Math.min(Math.max(x,0),1), sm01=x=>{ x=clamp01(x); return x*x*(3-2*x); };

/* ---- Reading a reel: every value checked, anything changed or left out listed ---- */
function reelNum(v,def,lo,hi,where,warn){
  if(v===undefined||v===null) return def;
  let x=+v; if(!isFinite(x)){ warn.push(`${where}: "${v}" isn't a number; ${def} was used`); return def; }
  if(x<lo||x>hi){ const y=Math.min(hi,Math.max(lo,x)); warn.push(`${where}: ${x} is outside ${lo} to ${hi}; ${y} was used`); x=y; }
  return x;
}
function reelRange(v,def,lo,hi,where,warn){
  if(v===undefined) return def;
  if(!Array.isArray(v)||v.length!==2){ warn.push(`${where}: should be two numbers, like [30, 60]; [${def}] was used`); return def; }
  const a=reelNum(v[0],def[0],lo,hi,where,warn), b=reelNum(v[1],def[1],lo,hi,where,warn);
  return a<=b?[a,b]:[b,a];
}
function reelOneOf(v,list,def,where,warn){
  if(v===undefined||v===null) return def;
  if(list.includes(v)) return v;
  warn.push(`${where}: "${v}" isn't one of ${list.filter(x=>x!==null).join(', ')}; ${def===null?'it was left out':def+' was used'}`); return def;
}
function reelDate(s,warn,where){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if(m){ const t=Date.UTC(+m[1],+m[2]-1,+m[3]); if(isFinite(t)&&+m[2]>=1&&+m[2]<=12) return t; }
  warn.push(`${where}: "${s}" isn't a date like 2026-06-29; ${REEL_DEF.date} was used`);
  return reelDate(REEL_DEF.date,[],'');
}
/* A time of day: "18:40", or "sunrise", "sunset", "noon" or "midnight" with minutes before or after
   ("sunset-20"). Times are clock times, as the titles show them: the sun is highest at the reel's noon,
   13:00 in summer (as on summer time) and 12:00 otherwise, unless the reel sets noon. */
function reelTime(v,warn,where){
  if(typeof v==='number'&&isFinite(v)) return {base:'clock',min:v*60};
  const s=String(v).trim().toLowerCase();
  let m=/^(\d{1,2}):(\d{2})$/.exec(s);
  if(m&&+m[1]<=24&&+m[2]<60) return {base:'clock',min:+m[1]*60+ +m[2]};
  m=/^(sunrise|sunset|noon|midnight)\s*(?:([+-])\s*(\d+)\s*(?:min)?)?$/.exec(s);
  if(m) return {base:m[1],min:m[2]?(m[2]==='-'?-1:1)*+m[3]:0};
  warn.push(`${where}: "${v}" isn't a time like "18:40" or "sunset-20"; 10:00 was used`);
  return {base:'clock',min:600};
}
const reelSunCache={};
/* Sunrise and sunset in hours, where the sun's top edge crosses the horizon (-0.83°). */
function sunTimes(day,lat,noon){
  const k=day+'|'+lat+'|'+noon; if(reelSunCache[k]) return reelSunCache[k];
  let rise=null,set=null,prev=null;
  for(let i=0;i<=1440;i+=2){
    const e=sunMoon(day+(i/60-(noon-12))*3600e3,lat,0).sun.el+.83;
    if(prev!==null){ const f=(i-2+2*prev/(prev-e))/60; if(prev<0&&e>=0&&rise===null) rise=f; if(prev>=0&&e<0) set=f; }
    prev=e;
  }
  return reelSunCache[k]={rise:rise??6,set:set??18,polar:rise===null||set===null};
}
/* The moment of a clock time, for the sun and moon (sunMoon in live.js, at longitude 0). */
function reelUTC(day,h,noon){ return day+(h-(noon-12))*3600e3; }
function reelHour(T,day,lat,noon){
  if(T.base==='clock') return T.min/60;
  if(T.base==='noon') return noon+T.min/60;
  if(T.base==='midnight') return 24+T.min/60;
  const st=sunTimes(day,lat,noon); return (T.base==='sunrise'?st.rise:st.set)+T.min/60;
}
/* "6:10 am", for the titles. */
function clockWords(h){ h=((h%24)+24)%24; let H=Math.floor(h), M=Math.round((h-H)*60); if(M===60){ H=(H+1)%24; M=0; }
  return `${H%12||12}:${String(M).padStart(2,'0')} ${H<12?'am':'pm'}`; }

function reelCheck(R0,opts={}){
  const warn=[];
  if(typeof R0==='string') R0=reelSource(R0);
  if(!R0||typeof R0!=='object'||Array.isArray(R0)) throw new Error('A reel is an object like {id, title, movies: [...]}');
  for(const k in R0) if(!REEL_KEYS.includes(k)) warn.push(`${k}: not a reel setting, so it was left out`);
  const R={id:String(R0.id||'reel'),title:String(R0.title||R0.id||'Reel'),subtitle:R0.subtitle?String(R0.subtitle):''};
  if(!R0.title) warn.push('title: missing');
  const given=v=>v!==null&&v!==undefined&&v!==''&&isFinite(+v);
  R.seed=Math.floor(given(opts.seed)?+opts.seed:given(R0.seed)?+R0.seed:REEL_DEF.seed);
  if(R0.seed!==undefined&&!given(R0.seed)) warn.push(`seed: "${R0.seed}" isn't a number; ${REEL_DEF.seed} was used`);
  R.day=reelDate(R0.date??REEL_DEF.date,warn,'date');
  R.lat=reelNum(R0.lat,REEL_DEF.lat,-66,66,'lat',warn);
  /* Summer time: the clock an hour ahead of the sun from April to October in the north, October to
     April in the south. */
  const mon=new Date(R.day).getUTCMonth()+1, summer=R.lat>=0?mon>=4&&mon<=10:mon<=3||mon>=11;
  R.noon=R0.noon!==undefined?reelHour(reelTime(R0.noon,warn,'noon'),R.day,R.lat,12):summer?13:12;
  if(R.noon<10||R.noon>15){ warn.push(`noon: should be between 10:00 and 15:00; ${summer?13:12}:00 was used`); R.noon=summer?13:12; }
  R.shot=reelRange(R0.shot,REEL_DEF.shot,15,150,'shot',warn);
  R.fade=reelNum(R0.fade,REEL_DEF.fade,1,12,'fade',warn);
  R.between=reelOneOf(R0.between,['black','dissolve'],REEL_DEF.between,'between',warn);
  R.titles=R0.titles!==false&&opts.titles!==false; R.card=R0.card!==false&&opts.titles!==false;
  let ms=Array.isArray(R0.movies)?R0.movies:[];
  if(!ms.length) throw new Error('A reel needs at least one movie in "movies"');
  /* Part of a reel (tools/calmfilm.js --movies 2-3): those movies only, without the opening card. */
  let first=0;
  if(opts.movies){ const [a,b]=opts.movies; first=Math.max(0,a-1); ms=ms.slice(first,Math.max(first+1,b)); if(first>0) R.card=false; }
  R.movies=ms.map((M,i)=>movieCheck(M,i,first+i,R,warn));
  return {R,warn};
}
function movieCheck(M0,i,n,R,warn){
  const w=`movies[${n+1}]`;
  if(!M0||typeof M0!=='object'||Array.isArray(M0)){ warn.push(`${w}: should be an object; an empty movie was used`); M0={}; }
  for(const k in M0) if(!MOVIE_KEYS.includes(k)) warn.push(`${w}.${k}: not a movie setting, so it was left out`);
  const M={i,n};
  M.title=String(M0.title||`Movie ${n+1}`); if(!M0.title) warn.push(`${w}.title: missing`);
  const c=String(M0.coast||'').toLowerCase().trim();
  let L=c?LOCATIONS.findIndex(l=>l.name.toLowerCase()===c):-1;
  if(L<0&&c) L=LOCATIONS.findIndex(l=>l.name.toLowerCase().startsWith(c));
  if(L<0){ const f=REEL_FALLBACK[n%REEL_FALLBACK.length]; L=Math.max(0,LOCATIONS.findIndex(l=>l.name===f)); warn.push(`${w}.coast: "${M0.coast??''}" isn't one of the coasts; ${LOCATIONS[L].name} was used`); }
  M.L=L; M.coastName=LOCATIONS[L].name;
  M.length=reelNum(M0.length,120,30,300,w+'.length',warn);
  M.shot=reelRange(M0.shot,R.shot,15,150,w+'.shot',warn);
  M.day=M0.date!==undefined?reelDate(M0.date,warn,w+'.date'):R.day;
  /* Time: one moment, or a span the sun moves through. */
  const tv=M0.time??'10:00', ta=Array.isArray(tv)?tv:[tv];
  if(Array.isArray(tv)&&(tv.length<1||tv.length>2)) warn.push(`${w}.time: a span is two times, like ["18:20", "19:05"]`);
  M.h0=reelHour(reelTime(ta[0]??'10:00',warn,w+'.time'),M.day,R.lat,R.noon);
  M.h1=ta.length>1?reelHour(reelTime(ta[1],warn,w+'.time'),M.day,R.lat,R.noon):M.h0;
  if(M.h1<M.h0) M.h1+=24;
  if(M.h1-M.h0>8){ warn.push(`${w}.time: a span of more than 8 hours; it was cut to 8`); M.h1=M.h0+8; }
  if(sunTimes(M.day,R.lat,R.noon).polar&&ta.some(x=>/sun/.test(String(x)))) warn.push(`${w}.time: the sun doesn't rise or set that day at latitude ${R.lat}; 6:00 and 18:00 were used`);
  M.moon=M0.moon!==false;
  /* Weather: one, or a change from one to another through the movie. */
  const wv=M0.weather??'fair', wa=Array.isArray(wv)&&wv.length?wv:[wv];
  const wx=x=>{ if(WEATHER[x]) return WEATHER[x]; warn.push(`${w}.weather: "${x}" isn't one of ${Object.keys(WEATHER).join(', ')}; fair was used`); return WEATHER.fair; };
  M.w0=wx(wa[0]); M.w1=wx(wa[wa.length-1]); M.weather=wa.join(' to ');
  /* Waves: a word (a multiple of the coast's own) or numbers. */
  M.waves=null;
  const V=M0.waves;
  if(typeof V==='string'){ if(REEL_WAVES[V]){ if(V!=='usual') M.waves={scale:REEL_WAVES[V]}; } else warn.push(`${w}.waves: "${V}" isn't one of ${Object.keys(REEL_WAVES).join(', ')}; the coast's own were used`); }
  else if(V&&typeof V==='object'){ const W={}; for(const k of ['height','period','angle','spread']) if(V[k]!==undefined){ const x=checkValue(schemaParam('waves.'+k),V[k],warn); if(x!==undefined) W[k]=x; }
    for(const k in V) if(!['height','period','angle','spread'].includes(k)) warn.push(`${w}.waves.${k}: not a wave setting, so it was left out`);
    if(Object.keys(W).length) M.waves=W; }
  else if(V!==undefined) warn.push(`${w}.waves: should be a word like "big" or {height, period}`);
  /* The camera: which kinds, how fast, and the first and last shots' moves. */
  const C=M0.camera&&typeof M0.camera==='object'?M0.camera:{};
  for(const k in C) if(!['kinds','pace','open','close'].includes(k)) warn.push(`${w}.camera.${k}: not a camera setting, so it was left out`);
  let K=null;
  if(Array.isArray(C.kinds)){ K={}; for(const k of C.kinds) K[k]=1; }
  else if(C.kinds&&typeof C.kinds==='object') K=Object.assign({},C.kinds);
  else if(C.kinds!==undefined) warn.push(`${w}.camera.kinds: should be a list like ["angled", "top"] or weights like {angled: 3, top: 1}`);
  if(K){ for(const k in K){ if(!REEL_KINDS[k]){ warn.push(`${w}.camera.kinds: "${k}" ${k==='low'?'(low passes) is left out of reels: up close, the land looks made up':'isn\'t one of angled, top, canopy, crossing'}`); delete K[k]; }
    else if(!(+K[k]>=0)){ warn.push(`${w}.camera.kinds.${k}: should be a number`); delete K[k]; } else K[k]=+K[k]; }
    if(!Object.values(K).some(x=>x>0)){ if(Object.keys(C.kinds).length) warn.push(`${w}.camera.kinds: nothing left; the usual mix was used`); K=null; } }
  M.cam={kinds:K||Object.assign({},REEL_KINDS),pace:reelOneOf(C.pace,['slow','usual','lively'],'usual',w+'.camera.pace',warn),
    open:reelOneOf(C.open,['wide','reveal',null],null,w+'.camera.open',warn),close:reelOneOf(C.close,['rise',null],null,w+'.camera.close',warn)};
  /* Water and elements: recipe settings (SCENES.md). */
  M.water=null;
  if(M0.water&&typeof M0.water==='object'){ const o={}; for(const k in M0.water){ const p=schemaParam('water.'+k); if(!p){ warn.push(`${w}.water.${k}: not a setting, so it was left out`); continue; } const x=checkValue(p,M0.water[k],warn); if(x!==undefined) o[k]=x; } if(Object.keys(o).length) M.water=o; }
  M.opt=null;
  if(M0.elements&&typeof M0.elements==='object'){ const o={}; for(const k in M0.elements){ const p=schemaParam('elements.'+k); if(!p){ warn.push(`${w}.elements.${k}: not a setting, so it was left out`); continue; } const x=checkValue(p,M0.elements[k],warn); if(x!==undefined) o[k]=x; }
    if(o.flora==='coast') delete o.flora; if(o.cover==='coast') delete o.cover; if(o.greenery!==undefined&&Math.abs(o.greenery-1)<1e-6) delete o.greenery; if(Object.keys(o).length) M.opt=o; }
  /* Sound: the simulated sea and wind (as in recipes), and the movie's own natural sounds and music. */
  const Sd=M0.sound&&typeof M0.sound==='object'?M0.sound:{};
  M.sound=null; M.scape={birds:0,insects:0,rain:0,music:null};
  const snd={};
  for(const k in Sd){
    if(['surf','wash','wind'].includes(k)){ const x=checkValue(schemaParam('sound.'+k),Sd[k],warn); if(x!==undefined&&Math.abs(x-1)>1e-6) snd[k]=x; }
    else if(['birds','insects','rain'].includes(k)) M.scape[k]=reelNum(Sd[k],0,0,1,`${w}.sound.${k}`,warn);
    else if(k==='music'){
      const m=Sd.music;
      if(m===false||m===null) continue;
      if(typeof m==='string') M.scape.music={style:reelOneOf(m,REEL_MUSIC,'day',`${w}.sound.music`,warn),level:.3};
      else if(m&&typeof m==='object'){ M.scape.music={style:reelOneOf(m.style??'day',REEL_MUSIC,'day',`${w}.sound.music.style`,warn),level:reelNum(m.level,.3,0,1,`${w}.sound.music.level`,warn)};
        if(m.key!==undefined) M.scape.music.key=String(m.key); }
      else warn.push(`${w}.sound.music: should be {style, level} or false`);
    }
    else warn.push(`${w}.sound.${k}: not a sound setting, so it was left out`);
  }
  if(Object.keys(snd).length) M.sound=snd;
  M.subtitle=M0.subtitle!==undefined?String(M0.subtitle):`${M.coastName} · ${clockWords(M.h0)}`;
  M.cloudSeed=1+hash32(R.seed,'sky',n)%997;
  M.face=reelFace(M0.faces??'auto',M,R,n,warn,w);
  return M;
}
/* Which way the coast faces, out to sea, in degrees from north. 'auto' faces a low sun, so sunrise and
   sunset are over the sea; at night the moon, so its path lies on the water; with the sun higher, the sun
   is behind the land, and the sea is lit from behind a camera that looks out. */
function reelFace(f,M,R,n,warn,w){
  if(typeof f==='number'&&isFinite(f)) return ((f%360)+360)%360;
  if(typeof f==='string'&&COMPASS[f.toLowerCase()]!==undefined) return COMPASS[f.toLowerCase()];
  if(f!=='auto') warn.push(`${w}.faces: "${f}" isn't east, west, north, south, degrees or auto; auto was used`);
  const off=(mulberry(hash32(R.seed,'face',n))()*2-1)*25, hm=(M.h0+M.h1)/2, P=sunMoon(reelUTC(M.day,hm,R.noon),R.lat,0);
  const a=P.sun.el>-12&&P.sun.el<20?P.sun.az+off:P.sun.el<=-12&&M.moon&&P.moon.el>2?P.moon.az+off:P.sun.az+180+off*1.6;
  return ((a%360)+360)%360;
}
/* A reel by name, or one in the address as JSON or in the recipes' link form. */
function reelSource(v){
  if(REELS[v]) return REELS[v];
  try{ const R=recipeFromLink(v); if(R&&typeof R==='object') return R; }catch(e){}
  throw new Error(`no reel called "${v}"${Object.keys(REELS).length?' (there are '+Object.keys(REELS).join(', ')+')':''}`);
}

/* ---- The plan: when each movie and shot begins, its kind, move and seed ---- */
function reelPlan(R){
  const movies=[]; let t=0;
  R.movies.forEach((M,m)=>{
    const rng=mulberry(hash32(R.seed,'plan',M.n)), [a,b]=M.shot, len=M.length, shots=[];
    let s=0;
    for(let k=0;;k++){
      let dur=a+rng()*(b-a);
      const last=s+dur>=len-a*.5; if(last) dur=len-s;
      shots.push({m,i:k,start:t+s,dur,fadeIn:k?R.fade:0,seed:hash32(R.seed,'shot',M.n,k)});
      if(last) break;
      s+=dur-R.fade;
    }
    /* Kinds by weight, never three of a kind in a row; the first and last shots' moves are angled. */
    const W=M.cam.kinds, ks=Object.keys(W).filter(k=>W[k]>0), tot=ks.reduce((x,k)=>x+W[k],0);
    shots.forEach((S,j)=>{
      let kind=ks[0];
      for(let n=0;n<5;n++){ let r=rng()*tot; kind=ks.find(k=>(r-=W[k])<0)||ks[ks.length-1]; if(!(j>=2&&shots[j-1].kind===kind&&shots[j-2].kind===kind)) break; }
      S.kind=kind; S.move=null;
    });
    const order=[0,1,2,3,4]; for(let j=4;j>0;j--){ const k=Math.floor(rng()*(j+1)); [order[j],order[k]]=[order[k],order[j]]; }
    shots.forEach((S,j)=>{ S.aim=order[j%5]; });
    if(M.cam.open){ shots[0].kind='angled'; shots[0].move=M.cam.open; }
    if(M.cam.close&&shots.length>1){ const S=shots[shots.length-1]; S.kind='angled'; S.move=M.cam.close; }
    const mv={M,start:t,end:t+len,shots};
    movies.push(mv);
    if(m<R.movies.length-1){
      if(R.between==='black'){ shots[shots.length-1].dur+=REEL_GAP; t+=len+REEL_GAP; }
      else t+=len-REEL_XF;
    }
    else t+=len;
  });
  /* A movie after a dissolve starts with one. */
  if(R.between==='dissolve') movies.forEach((mv,m)=>{ if(m) mv.shots[0].fadeIn=REEL_XF; });
  const shots=movies.flatMap(mv=>mv.shots).sort((x,y)=>x.start-y.start);
  return {R,movies,shots,total:t};
}
/* The shot that should be on screen at T: the last to have begun. */
function reelShotAt(P,T){ let sp=P.shots[0]; for(const s of P.shots){ if(s.start<=T+1e-6) sp=s; else break; } return sp; }
function reelMovieAt(P,T){ let mv=P.movies[0]; for(const m of P.movies){ if(m.start<=T+1e-6) mv=m; else break; } return mv; }

/* ---- Light for a moment of a movie: the sun and moon where they'd be, the weather between its two ends ---- */
function reelSky(R,M,f){
  f=clamp01(f);
  const h=M.h0+(M.h1-M.h0)*f, P=sunMoon(reelUTC(M.day,h,R.noon),R.lat,0), w=k=>M.w0[k]+(M.w1[k]-M.w0[k])*f;
  return {sunEl:P.sun.el,sunAz:wrap180(P.sun.az-M.face),moonEl:M.moon?P.moon.el:-20,moonAz:wrap180(P.moon.az-M.face),lit:M.moon?P.lit:0,
    cloud:Math.round(w('cloud')),wind:w('wind'),rain:w('rain'),hour:h};
}
let reelLightN=0;
/* A lighting setup for that moment, as following the clock makes them (liveSky in live.js), with a moonless
   night lifted the same way, for a screen in a room. */
function reelLight(R,M,f,D=reelSky(R,M,f)){
  const Li=skyLight(D,M.cloudSeed);
  if(Li.night===1){ const g=1+.8*(1-Math.min((Li.moon||0)/.3,1))*smooth(-10,-16,D.sunEl); Li.exposure*=g; Li.stars/=g; }
  Li.hour=D.hour;
  bakeEnv(Li);
  const key='reel'+(++reelLightN); LIGHTS[key]=Li;
  return key;
}
function reelFreeLight(key){ if(key&&/^reel\d+$/.test(key)&&LIGHTS[key]){ freeEnv(LIGHTS[key]); delete LIGHTS[key]; } }
/* Everything a moment's light is made from, as one string: while it stays the same (a movie at one time of
   day in steady weather, for its whole length), the lighting setup is kept and nothing is made again.
   Making one draws the sky again (bakeEnv in js/world.js), which used to happen every second of every
   movie whether or not anything had moved. */
function reelSkyKey(D){ return [D.sunEl,D.sunAz,D.moonEl,D.moonAz,D.lit,D.wind,D.rain,D.hour].map(x=>x.toFixed(3)).join(',')+','+D.cloud; }

/* ---- A movie begins: its waves and water on its coast ----
   The movie's waves are the coast's reel layer (waveLayer in js/recipe.js): only what the movie sets,
   over the coast's own, so a later movie on the same coast that sets nothing has the coast's own back.
   New waves take a minute or more to cross the stretch of coast from offshore; preroll runs the sea for
   100 s first, unseen (40 s left the front of the new swell crossing the first shot). */
function reelMovieStart(M,preroll){
  const L=LOCATIONS[M.L], B=waveBase(L), W=M.waves||{}, o={};
  /* A word ("big"): multiples of the coast's own height and period. Numbers were checked by movieCheck. */
  if(W.scale){ o.Hs=Math.max(.05,Math.min(B.Hs*W.scale[0],Math.max(W.scale[2]||4,W.scale[0]>1?B.Hs:0))); o.T=Math.min(B.T*W.scale[1],18); }
  else { o.Hs=W.height; o.T=W.period; }
  o.obl=W.angle; o.spread=W.spread;
  const warn=[], changed=waveLayer(L,'reel',o);
  applyWater(L,M.water||{},warn);
  if(warn.length) console.warn('[reel]',warn.join(' | '));
  if(changed&&preroll) reelPreroll(L,100,preroll===true?Infinity:preroll);
  return changed;
}
function reelPreroll(L,secs,budgetMs){
  const t0=performance.now(), dt=1/60;
  for(let k=0;k<secs*60;k+=2){ simStep(L,dt); simStep(L,dt); foamStep(L,2*dt); if(L.sp) sprayStep(L,2*dt); if(performance.now()-t0>budgetMs) break; }
  rmPass(L);
}

/* ---- A shot, from its own seed ----
   As calm mode chooses them (makeCalmShot in camera.js), with the kind, length, pace and move the plan
   gave it. An angled shot is the one of three that looks most nearly the way the plan aimed it. In
   twilight and at night, as in the calm films, the aim is the glow of the set sun or the moon: straight
   at it, or with it off to one side (about 20° or 35°), so the moon's path isn't in the middle of every
   shot. There it's the best of five, looking out rather than down. */
function reelShot(sp,M,lightKey){
  const L=LOCATIONS[M.L];
  const S=withRandom(sp.seed,()=>{
    const Li=LIGHTS[lightKey], dim=Li.el<-1||(Li.night||0)>.3, o={kind:sp.kind,dur:sp.dur,pace:M.cam.pace,move:sp.move};
    if(sp.move||(!dim&&sp.kind!=='angled')) return makeCalmShot(L,lightKey,o);
    const aim=sp.aim??0, target=dim?deg(Li.az)+[0,.6,-.6,.35,-.35][aim]:REEL_AIMS[aim];
    let best=null,bs=-1e9;
    for(let i=0;i<(dim?5:3);i++){ const T=makeCalmShot(L,lightKey,Object.assign({},o,{kind:'angled'})); const sc=Math.cos(T.yaw0-target)+(dim&&-T.pitch<deg(22)?.3:0); if(sc>bs){ bs=sc; best=T; } }
    return best;
  });
  S.dur=sp.dur; S.start=0; S.t=0; S.reelM=sp.m; S.reelI=sp.i;
  if(M.sound) S.sound=M.sound;
  if(M.opt) S.opt=M.opt;
  return S;
}

/* ---- Titles and black, drawn the same way live (over the picture) and in films (onto it) ---- */
function reelBlack(P,T){
  let b=Math.max(1-sm01(T/3),sm01((T-(P.total-3))/3));
  if(P.R.between==='black') for(let m=0;m<P.movies.length-1;m++){
    const e=P.movies[m].end,s=P.movies[m+1].start;
    if(T>e-REEL_OUT&&T<s+REEL_IN) b=Math.max(b,T<e?sm01((T-(e-REEL_OUT))/REEL_OUT):T<s?1:1-sm01((T-s)/REEL_IN));
  }
  return b;
}
function reelTitles(P,T){
  const out=[], R=P.R, env=(t0,fi,hold,fo)=>{ const x=T-t0; return x<0?0:x<fi?x/fi:x<fi+hold?1:x<fi+hold+fo?1-(x-fi-hold)/fo:0; };
  if(R.card){ const a=env(1,1.5,4.5,1.5); if(a>0) out.push({card:true,a:sm01(a),title:R.title,subtitle:R.subtitle}); }
  if(R.titles) for(const mv of P.movies){ const a=env(mv.start+(mv.M.i===0&&R.card?9:2.5),1.2,6.5,1.5); if(a>0) out.push({card:false,a:sm01(a),title:mv.M.title,subtitle:mv.M.subtitle}); }
  return out;
}
const REEL_FONT='"Segoe UI","Helvetica Neue",Arial,sans-serif';
function reelDraw(cx,W,H,P,T){
  const b=reelBlack(P,T);
  if(b>.002){ cx.fillStyle=`rgba(0,0,0,${b.toFixed(4)})`; cx.fillRect(0,0,W,H); }
  for(const t of reelTitles(P,T)){
    cx.save(); cx.globalAlpha=t.a; cx.fillStyle='#fff'; cx.textBaseline='alphabetic';
    cx.shadowColor='rgba(0,0,0,.5)'; cx.shadowBlur=H*.018; cx.shadowOffsetY=H*.002;
    if(t.card){
      cx.textAlign='center';
      cx.font=`200 ${Math.round(H*.072)}px ${REEL_FONT}`; cx.letterSpacing=`${(H*.004).toFixed(1)}px`; cx.fillText(t.title,W/2,H*.5);
      if(t.subtitle){ cx.font=`300 ${Math.round(H*.022)}px ${REEL_FONT}`; cx.letterSpacing=`${(H*.006).toFixed(1)}px`; cx.globalAlpha=t.a*.88; cx.fillText(t.subtitle.toUpperCase(),W/2,H*.5+H*.058); }
    } else {
      cx.textAlign='left'; const x=Math.round(W*.05), y=Math.round(H*.86);
      cx.font=`300 ${Math.round(H*.044)}px ${REEL_FONT}`; cx.letterSpacing=`${(H*.0015).toFixed(1)}px`; cx.fillText(t.title,x,y);
      if(t.subtitle){ cx.font=`400 ${Math.round(H*.0185)}px ${REEL_FONT}`; cx.letterSpacing=`${(H*.0032).toFixed(1)}px`; cx.globalAlpha=t.a*.85; cx.fillText(t.subtitle.toUpperCase(),x+H*.002,y+H*.042); }
    }
    cx.restore();
  }
}

/* ---- What a reel holds, for tools: its length, chapters and corrections ---- */
function reelInfo(R0,opts){
  const {R,warn}=reelCheck(R0,opts), P=reelPlan(R);
  return {id:R.id,title:R.title,seed:R.seed,total:P.total,warn,coasts:[...new Set(R.movies.map(M=>M.L))],
    movies:P.movies.map(mv=>({title:mv.M.title,subtitle:mv.M.subtitle,coast:mv.M.coastName,start:mv.start,length:mv.M.length,shots:mv.shots.length,
      from:clockWords(mv.M.h0),to:clockWords(mv.M.h1),weather:mv.M.weather,kinds:mv.shots.map(s=>s.kind+(s.move?' ('+s.move+')':''))}))};
}

/* ---- Films: what tools/calmfilm.js needs to render a reel (FILM.render in tools/calmfilm-page.js) ----
   timeline: every shot, built when it first comes on screen (a movie's first shot sets up its coast and
   runs the new waves in); onFrame: the light, remade once a second of film; overlay: titles and black,
   drawn onto a copy of the picture; ambi: each movie's natural sounds and music (js/ambience.js). */
function reelFilm(R0,opts={}){
  const {R,warn}=reelCheck(R0,opts), P=reelPlan(R), lights={};
  const lightOf=(m,T)=>{ const st=lights[m]||(lights[m]={sec:null,key:null,sky:null}), sec=Math.floor(T);
    if(st.sec!==sec||!LIGHTS[st.key]){
      st.sec=sec;
      const mv=P.movies[m], f=(T-mv.start)/mv.M.length, D=reelSky(R,mv.M,f), sky=reelSkyKey(D);
      /* Only when the sun, moon or weather has moved (reelSkyKey). */
      if(sky!==st.sky||!LIGHTS[st.key]){ const old=st.key; st.key=reelLight(R,mv.M,f,D); st.sky=sky; st.old=old; }
    }
    return st.key; };
  const timeline=P.shots.map(sp=>({start:sp.start,dur:sp.dur,fadeIn:sp.fadeIn,build:T=>{
    const mv=P.movies[sp.m];
    if(sp.i===0) reelMovieStart(mv.M,true);
    const S=reelShot(sp,mv.M,lightOf(sp.m,sp.start));
    return S;
  }}));
  let tc=null,cx=null;
  return {R,P,warn,secs:P.total,timeline,
    onFrame(T,act){
      for(const s of act){ const S=s.S; if(!S||S.reelM===undefined) continue; S.lightKey=lightOf(S.reelM,T); }
      /* Free a light once no shot on screen uses it. */
      for(const m in lights){ const st=lights[m]; if(st.old&&!act.some(s=>s.S&&s.S.lightKey===st.old)){ reelFreeLight(st.old); st.old=null; } }
    },
    overlay(T,glc){
      if(reelBlack(P,T)<.002&&!reelTitles(P,T).length) return null;
      if(!tc){ tc=document.createElement('canvas'); tc.width=glc.width; tc.height=glc.height; cx=tc.getContext('2d'); }
      cx.drawImage(glc,0,0); reelDraw(cx,tc.width,tc.height,P,T);
      return tc;
    },
    ambi:P.movies.map(mv=>({start:mv.start,end:mv.end+(mv===P.movies[P.movies.length-1]?0:R.between==='black'?REEL_GAP:0),scape:mv.M.scape})),
    chapters:P.movies.map(mv=>({t:mv.start,title:mv.M.title,subtitle:mv.M.subtitle}))};
}

/* ---- Playing live: ?reel=<id>, optionally &movie=<n> to start there, &take=<n> for another seed and
   &titles=0 for no titles (a venue's screen, where the reel goes round all day) ---- */
const REEL_LIVE={on:false,P:null,T:0,sp:null,light:{},fx:null,cx:null,clear:true,warn:[],check:null};
function reelLiveCheck(){
  if(REEL_LIVE.check!==null) return REEL_LIVE.check;
  REEL_LIVE.check=false;
  if(!Q.has('reel')||STUDIO) return false;
  try{ REEL_LIVE.check=reelCheck(Q.get('reel'),{seed:Q.has('take')?+Q.get('take'):null,titles:Q.get('titles')!=='0'}); }
  catch(e){ console.warn('[reel]',e.message); setTimeout(()=>toast('Reel: '+e.message),1500); }
  return REEL_LIVE.check;
}
/* Only the reel's coasts are built, so it starts sooner (main.js). */
function reelOnly(){ if(Q.has('only')) return null; const C=reelLiveCheck(); return C?[...new Set(C.R.movies.map(M=>M.L))].join(','):null; }
function reelFirst(){
  const C=reelLiveCheck(); if(!C) return null;
  if(C.warn.length) console.warn('[reel] corrections:',C.warn.join(' | '));
  const Rl=REEL_LIVE; Rl.P=reelPlan(C.R); Rl.warn=C.warn; Rl.on=true;
  const m0=Math.min(Math.max(Math.round(+Q.get('movie')||1)-1,0),Rl.P.movies.length-1);
  Rl.T=Rl.P.movies[m0].start;
  const c=document.createElement('canvas'); c.id='reelFx';
  c.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2';
  document.body.appendChild(c); Rl.fx=c; Rl.cx=c.getContext('2d');
  const S=reelGo(Rl.P.movies[m0].shots[0]);
  reelFxDraw();
  return S;
}
/* Build a shot to go on screen; a movie's first shot sets up its coast and its sounds. */
function reelGo(sp){
  const Rl=REEL_LIVE, mv=Rl.P.movies[sp.m];
  if(sp.i===0){
    /* Live, the new waves get a second and a half of running in (the screen is black between movies);
       the rest roll in as the movie begins. */
    reelMovieStart(mv.M,1500);
    if(typeof ambiSet==='function') ambiSet(mv.M.scape,4);
  }
  const S=reelShot(sp,mv.M,reelLiveLight(sp.m));
  Rl.sp=sp;
  return S;
}
/* The light of movie m now, looked at once a second of the reel and remade only if the sun, moon or
   weather has moved since (reelSkyKey). Lights no shot on screen uses are freed, including those of a
   movie that has gone (a shot in the ← history whose light has gone takes another, liveFix in live.js). */
function reelLiveLight(m){
  const Rl=REEL_LIVE, st=Rl.light[m]||(Rl.light[m]={sec:null,key:null,sky:null}), sec=Math.floor(Rl.T);
  const used=k=>(state.cur&&state.cur.lightKey===k)||(state.next&&state.next.lightKey===k);
  if(st.sec!==sec||!LIGHTS[st.key]){
    st.sec=sec;
    const mv=Rl.P.movies[m], f=(Rl.T-mv.start)/mv.M.length, D=reelSky(Rl.P.R,mv.M,f), sky=reelSkyKey(D);
    if(sky!==st.sky||!LIGHTS[st.key]){
      const olds=new Set([st.key]);
      for(const S of [state.cur,state.next]) if(S&&S.reelM===m) olds.add(S.lightKey);
      st.key=reelLight(Rl.P.R,mv.M,f,D); st.sky=sky;
      for(const S of [state.cur,state.next]) if(S&&S.reelM===m) S.lightKey=st.key;
      for(const k of olds) if(k&&k!==st.key&&!used(k)) reelFreeLight(k);
    }
  }
  for(const n in Rl.light) if(+n!==m&&!(state.cur&&state.cur.reelM===+n)&&!(state.next&&state.next.reelM===+n)){
    if(!used(Rl.light[n].key)) reelFreeLight(Rl.light[n].key); delete Rl.light[n]; }
  return st.key;
}
/* Every frame (frame.js), before the picture is drawn. */
function reelTick(dt){
  const Rl=REEL_LIVE; if(!Rl.on) return;
  Rl.T+=dt;
  const P=Rl.P;
  if(Rl.T>=P.total){
    /* The end: round again from the first movie, its opening card and all, through black. */
    Rl.T-=P.total;
    state.next=null; cutTo(reelGo(P.shots[0]),0);
  } else {
    const sp=reelShotAt(P,Rl.T);
    if(sp!==Rl.sp&&!state.next){ const S=reelGo(sp); if(sp.fadeIn>0) cutTo(S,sp.fadeIn,true); else cutTo(S,0); }
  }
  for(const S of [state.cur,state.next]) if(S&&S.reelM!==undefined) reelLiveLight(S.reelM);
  reelFxDraw();
}
function reelFxDraw(){
  const Rl=REEL_LIVE, c=Rl.fx, dpr=Math.min(devicePixelRatio||1,2), w=Math.round(innerWidth*dpr), h=Math.round(innerHeight*dpr);
  if(c.width!==w||c.height!==h){ c.width=w; c.height=h; Rl.clear=true; }
  if(reelBlack(Rl.P,Rl.T)<.002&&!reelTitles(Rl.P,Rl.T).length){ if(!Rl.clear){ Rl.cx.clearRect(0,0,w,h); Rl.clear=true; } return; }
  Rl.cx.clearRect(0,0,w,h); reelDraw(Rl.cx,w,h,Rl.P,Rl.T); Rl.clear=false;
}
/* → or N: the next movie; ←: back to the start of this one, or the one before if it has only just begun. */
function reelJump(m){
  const Rl=REEL_LIVE, P=Rl.P; m=((m%P.movies.length)+P.movies.length)%P.movies.length;
  Rl.T=P.movies[m].start; state.next=null;
  cutTo(reelGo(P.movies[m].shots[0]),0);
  toast(`${m+1} of ${P.movies.length}: ${P.movies[m].M.title}`);
}
function reelKey(e){
  if(!REEL_LIVE.on) return false;
  const k=e.key.toLowerCase(), Rl=REEL_LIVE, mv=reelMovieAt(Rl.P,Rl.T), m=Rl.P.movies.indexOf(mv);
  if(k==='n'||e.key==='ArrowRight'){ reelJump(m+1); return true; }
  if(e.key==='ArrowLeft'){ reelJump(Rl.T-mv.start>10?m:m-1); return true; }
  return false;
}
/* ---- A reel described in words: instructions any chat AI can follow ----
   As recipePrompt (js/recipe.js) does for one scene: the format, the coasts, what makes a reel work and
   an example. The reply, a JSON object, plays with ?reel=<the JSON> or renders with
   tools/calmfilm.js --reel <file.json>; reelCheck corrects and lists any slips. tools/reelprompt.js
   prints it. */
function reelPrompt(desc){
  const ex=Object.assign({},REELS['the-storm']||Object.values(REELS)[0]);
  return [
`You are writing a demo reel for Coastline, a live, photo-real simulation of ocean water meeting a shore, seen from a drone. A reel is 10 to 40 minutes of mini-movies. Each mini-movie is one drone's flight over one made-up coast on one day: a span of time the sun moves through, the weather, the waves, the kinds of shot, the sound and a title. The simulator finds the camera paths and makes the light, the water and the sea's sound; you choose the movies and their order. Write the reel as one JSON object.`,
``,
`THE REEL TO MAKE:`,
`"${String(desc||'').trim()||'a calm reel of your choice'}"`,
``,
`THE REEL'S SETTINGS`,
`- id: a short name, lowercase with dashes. title, subtitle: shown on the opening card.`,
`- seed: a whole number; another number gives another take of the same reel. date: "YYYY-MM-DD", for the sun's path and the moon (29 June 2026 is a full moon, which rises in the east at dusk). lat: latitude, default 30.`,
`- shot: [min, max] seconds per shot, default [30, 60]; [25, 45] for a livelier reel. between: "black" (movies fade through black, like chapters; the default) or "dissolve".`,
`- movies: the list of movies, in order.`,
``,
`EACH MOVIE`,
`- title: its name, shown lower left as it begins. subtitle: optional; the default is the coast and the time.`,
`- coast: one of the coasts below. length: 30 to 300 seconds (most are 150 to 220).`,
`- time: a clock time "18:40", or a span ["18:20", "19:05"] the sun moves through during the movie. "sunrise", "sunset" and "noon" work too, with minutes: "sunset-25", "sunrise+10". Spans of 25 to 45 minutes give a gentle time-lapse.`,
`- weather: "clear", "fair", "cloudy", "overcast" or "storm", or a change ["fair", "storm"]. waves: "calm", "small", "usual", "big" or "huge".`,
`- faces: which way the coast faces; leave it out and it faces a low sun (sunrise and sunset over the sea) or the moon at night. moon: false takes the moon away, for a starry night.`,
`- camera: {"kinds": {"angled": 3, "top": 1, "canopy": 1}} (how often each kind of shot: angled, looking out over the coast; top, straight down; canopy, gliding over the trees by the shore; crossing, a slow, low flight from over the trees across the beach and out over the water), "pace": "slow", "usual" or "lively", "open": "wide" or "reveal" (the first shot sets the scene from high up, or tilts up from the water to the horizon), "close": "rise" (the last shot climbs away).`,
`- sound: {"surf": 1, "wash": 1, "wind": 1} (0 to 2, the simulated sea and wind), "birds", "insects", "rain" (0 to 1), "music": {"style": "dawn", "day", "dusk", "night" or "storm", "level": 0.2 to 0.35} or leave music out.`,
`- water: {"clarity": 0.3 to 3} and elements: {"flora": "tropical", "broadleaf", "conifer" or "mountain"; "cover": "dunes", "scrub", "open", "patchy" or "dense"}, rarely needed.`,
``,
`COASTS, all made up:`,
...LOCATIONS.filter(L=>!L.real).map(L=>'- '+locWords(L)),
``,
`WHAT MAKES A GOOD REEL`,
`- An arc: a day from dawn to night, a storm building and clearing, a journey from the tropics to the cliffs. Alternate bright and dim, busy and calm, and change coast from one movie to the next.`,
`- Twilight and night (from about 20 minutes after sunset) are best with angled shots only; straight down they're dark. The moon is up in the evening only near a full moon.`,
`- Straight-down shots suit clear tropical water and big surf at midday. Golden hour and sunset suit angled shots and slow pace.`,
`- Music quietly, if at all (level 0.2 to 0.35); natural sounds that fit the hour: birds in the morning, insects at night, rain in a storm.`,
`- Titles short and plain: "First Light", "The Lagoon", "After the Rain".`,
``,
`AN EXAMPLE`,
JSON.stringify(ex),
``,
`REPLY with the JSON object only, starting with { and ending with }, and no other text.`].join('\n');
}
/* For the checks and the menu. */
window.REEL_API={live:()=>REEL_LIVE,check:reelCheck,prompt:reelPrompt,plan:R=>reelPlan(reelCheck(R).R),info:reelInfo,sky:(R,m,f)=>{ const C=reelCheck(R); return reelSky(C.R,C.R.movies[m],f); },jump:m=>reelJump(m)};

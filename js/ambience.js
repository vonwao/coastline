'use strict';
/* ---- Natural sounds and music, for reels (REELS.md) ----
   Besides the sea and the wind (js/sound.js), a reel's movie can ask for:
     birds    sparse, distant calls: twitters, whistles and now and then a gull (experimental: made from
              tones, they can sound artificial, so keep them low)
     insects  crickets at night: several individuals, each chirping at its own pitch and pace, in bouts,
              spread left and right, over a faint distant chorus
     rain     soft hiss and sparse drops
     music    quiet ambient music made as it plays. The idea is Brian Eno's "Music for Airports": a few
              soft voices, each repeating its note on its own loop length (17.8 s, 20.1 s, 31.8 s ...).
              Because the lengths don't divide into one another, the voices meet in ever new chords and the
              music doesn't repeat for hours. Notes come from a pentatonic scale, so any two sound well
              together. Bells, slow pads and low drones; no beat and no melody to follow; a soft low-pass
              and a reverb made from decaying noise. Styles: dawn, day, dusk, night and storm.
   Everything is made in the browser from tones and noise; there are no recordings.

   Live: ambiSet(scape, fadeSeconds) with scape {birds, insects, rain, music:{style, level, key}} (levels
   0 to 1). It's remembered, and plays whenever sound is on (S), through the same master volume as the sea,
   so S mutes it too. A new scape crossfades with the last over fadeSeconds. Events are scheduled a few
   seconds ahead, twice a second, from a timer of its own: nothing is added to the frame loop.
   Films: ambiOffline(ctx, dest, segments, t0, seconds) adds the sounds for film time t0 onward to an
   OfflineAudioContext whose time 0 is film time t0; segments are [{start, end, scape}] in film seconds, each
   faded in and out over 4 s. Every note, chirp and drop comes from a seeded hash of its own place in time
   (a voice's repetition, a cricket's chirp, a slot of rain), never from a running random sequence, so a
   moment sounds exactly the same however the film is cut into pieces for rendering. A piece needs
   AMBI_PRE seconds rendered before it (and thrown away), so notes and the reverb that started earlier
   are already sounding; tools/calmfilm-page.js does that. */
const AMBI_PRE=24;               /* longest note (a drone of up to 17.6 s) plus the reverb, with room to spare */
const AMBI_LOOK=3;               /* live: how far ahead events are scheduled, in seconds */
/* Loudness of each layer at level 1, measured against the surf of a calm angled shot on the surf beach
   (tools/checks/ambience.js, with a loudness meter's weighting): music about as loud as that surf, so a
   reel's 0.3 is clearly in the background; rain 2 dB under it, crickets 6 dB under, a bird's call about 7
   dB under in its loudest moments. Each music style has its own gain on top, so all five are as loud. */
const AMBI_K={music:.21,rain:.115,insects:.06,birds:.05};
const AMBI={want:null,E:null,timer:null};

/* ---- Seeded numbers from a place in time ---- */
function ahash(a,b,c,d){
  let h=Math.imul((a|0)^0x9E3779B9,0x85EBCA6B); h^=h>>>13;
  h=Math.imul(h^(b|0),0xC2B2AE35); h^=h>>>16;
  h=Math.imul(h^(c|0),0x27D4EB2F); h^=h>>>15;
  h=Math.imul(h^(d|0),0x165667B1); h^=h>>>13;
  return (h>>>0)/4294967296;
}
/* A short stream of numbers for one event: r() gives the next. */
function arng(a,b,c){ let i=0; return ()=>ahash(a,b,c,i++); }

/* ---- Music: styles ----
   tonic: MIDI note of the scale's root (45 is the A two below middle C). Each voice: a timbre, the notes it
   cycles through on successive repetitions (semitones above the tonic), its loop length and first entry
   in seconds, loudness and place left to right, and how long each note lasts. */
const AMBI_STYLES={
  dawn:{key:'D',tonic:50,gain:1.3,lp:2600,verb:.45,desc:'airy and hopeful: slow pads under high bells (D major pentatonic)',voices:[
    {t:'pad',n:[0,-5],loop:31.8,off:.5,a:.55,pan:-.2,dur:12},
    {t:'pad',n:[7,9],loop:26.3,off:6,a:.42,pan:.25,dur:11},
    {t:'bell',n:[24],loop:17.8,off:3,a:.34,pan:-.4,dur:6},
    {t:'bell',n:[28,26],loop:20.1,off:9.5,a:.3,pan:.45,dur:6},
    {t:'bell',n:[19],loop:23.6,off:13,a:.32,pan:.1,dur:6.5},
    {t:'bell',n:[33,31],loop:29.9,off:18,a:.2,pan:-.15,dur:5.5}]},
  day:{key:'G',tonic:55,gain:1.55,lp:3000,verb:.35,desc:'light and open: soft bells over a warm pad (G major pentatonic)',voices:[
    {t:'pad',n:[0],loop:29.1,off:1,a:.42,pan:-.15,dur:11},
    {t:'pad',n:[7,9],loop:34.7,off:8,a:.34,pan:.2,dur:12},
    {t:'bell',n:[19,21],loop:15.4,off:2,a:.3,pan:.35,dur:5},
    {t:'bell',n:[16],loop:18.9,off:6,a:.3,pan:-.35,dur:5},
    {t:'bell',n:[24,26],loop:22.7,off:10,a:.2,pan:.05,dur:4.5},
    {t:'bell',n:[12,14],loop:27.3,off:4,a:.3,pan:-.05,dur:5.5}]},
  dusk:{key:'A',tonic:45,gain:.77,lp:1800,verb:.5,desc:'warm and slow: a low drone, pads and a few bells (A minor pentatonic)',voices:[
    {t:'drone',n:[0],loop:37.3,off:0,a:.5,pan:0,dur:16},
    {t:'pad',n:[12,15],loop:27.9,off:3,a:.45,pan:-.25,dur:12},
    {t:'pad',n:[19,17],loop:33.1,off:11,a:.4,pan:.3,dur:12},
    {t:'bell',n:[27],loop:21.3,off:6,a:.25,pan:.4,dur:6.5},
    {t:'bell',n:[31,29],loop:25.6,off:15,a:.22,pan:-.4,dur:6.5},
    {t:'bell',n:[22],loop:30.4,off:20,a:.25,pan:.1,dur:6.5}]},
  night:{key:'E',tonic:40,gain:1.04,lp:1300,verb:.6,desc:'still and dark: a deep drone and sparse glassy notes (E minor pentatonic)',voices:[
    {t:'drone',n:[0,7],loop:41.7,off:0,a:.5,pan:0,dur:16},
    {t:'pad',n:[15,19],loop:35.2,off:9,a:.3,pan:.2,dur:13},
    {t:'glass',n:[36],loop:24.1,off:4,a:.18,pan:-.35,dur:8},
    {t:'glass',n:[31,34],loop:28.9,off:12,a:.16,pan:.4,dur:8},
    {t:'glass',n:[27],loop:33.6,off:19,a:.18,pan:-.1,dur:8}]},
  storm:{key:'D',tonic:38,gain:.62,lp:900,verb:.55,desc:'low and brooding: drones and dark pads, almost no high notes (D minor pentatonic)',voices:[
    {t:'drone',n:[0],loop:33.3,off:0,a:.6,pan:-.1,dur:16},
    {t:'drone',n:[7],loop:39.1,off:10,a:.45,pan:.15,dur:16},
    {t:'pad',n:[12,15],loop:29.4,off:5,a:.35,pan:-.3,dur:13},
    {t:'pad',n:[17,22],loop:36.7,off:16,a:.3,pan:.3,dur:13},
    {t:'glass',n:[39],loop:31.5,off:22,a:.1,pan:0,dur:8}]},
};
const AMBI_KEYS={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
const midiHz=m=>440*Math.pow(2,(m-69)/12);

/* A scape with every value checked: levels 0 to 1, a known style. Nothing to play gives null. */
function ambiNorm(s){
  if(!s||typeof s!=='object') return null;
  const cl=v=>Math.min(Math.max(+v||0,0),1), n={birds:cl(s.birds),insects:cl(s.insects),rain:cl(s.rain),music:null};
  let m=s.music;
  if(typeof m==='string') m={style:m};
  if(m&&typeof m==='object'){
    if(AMBI_STYLES[m.style]) n.music={style:m.style,level:m.level===undefined?.3:cl(m.level),key:AMBI_KEYS[m.key]!==undefined?m.key:AMBI_STYLES[m.style].key,seed:(m.seed|0)};
    else console.warn('[ambience] no music style',m.style,'; styles:',Object.keys(AMBI_STYLES).join(', '));
  }
  if(n.music&&!n.music.level) n.music=null;
  return n.birds||n.insects||n.rain||n.music?n:null;
}

/* ---- Shared material: noise and the reverb's impulse, made once per sample rate from a seed ---- */
const ambiBufs={};
function ambiBuffers(sr){
  if(ambiBufs[sr]) return ambiBufs[sr];
  const mk=(secs,fill)=>{ const n=Math.round(secs*sr),b=new AudioBuffer({length:n,numberOfChannels:2,sampleRate:sr}); for(let c=0;c<2;c++) fill(b.getChannelData(c),c); return b; };
  const seeded=s=>()=>{ s=(s+0x6D2B79F5)|0; let t=Math.imul(s^s>>>15,1|s); t=(t+Math.imul(t^t>>>7,61|t))^t; return ((t^t>>>14)>>>0)/4294967296; };
  /* Six seconds of white noise, looped, different in each ear. */
  const noise=mk(6,(d,c)=>{ const r=seeded(1000+c); for(let i=0;i<d.length;i++) d[i]=r()*2-1; });
  /* The reverb: 3.2 s of noise dying away exponentially (about 2.8 s to fall 60 dB), getting darker as it
     dies, as a room or the open air soaks up high sounds first; a short gap before it. Its length is most
     of what the sound of a film costs to render (a 4.5 s one took twice as long), so it's no longer. */
  const verb=mk(3.2,(d,c)=>{ const r=seeded(2000+c), pre=Math.round(.025*sr); let lp=0;
    for(let i=pre;i<d.length;i++){ const t=(i-pre)/sr, k=Math.min(.95,.25+.25*t); lp=lp*k+(r()*2-1)*(1-k); d[i]=lp*Math.exp(-t*2.46)*(1+2*(1-k)); } });
  /* Rain drops and cricket chirps are made here once, as short recordings, rather than from nodes each
     time: a drop or a chirp is then one buffer played through one gain, which renders a film's rain and
     crickets about three times faster. Twenty-four drops, from dull to bright, short to long, left to
     right; one chirp per cricket. */
  const drops=[]; { const r=seeded(3000);
    for(let v=0;v<24;v++){ const f=1100+3900*r(), dec=.03+.05*r(), pan=(r()-.5)*1.6, n=Math.round((dec+.012)*sr);
      const w0=2*Math.PI*f/sr, al=Math.sin(w0)/(2*2.5), a0=1+al, b0=al/a0, b2=-al/a0, a1=-2*Math.cos(w0)/a0, a2=(1-al)/a0;
      const x=new Float32Array(n); let x1=0,x2=0,y1=0,y2=0;
      for(let i=0;i<n;i++){ const t=i/sr, e=t<.002?t/.002*4:t<dec?4*Math.pow(.001,(t-.002)/(dec-.002)):4*.001*Math.max(0,1-(t-dec)/.01);
        const xi=(r()*2-1)*e, y=b0*xi+b2*x2-a1*y1-a2*y2; x2=x1; x1=xi; y2=y1; y1=y; x[i]=y; }
      const b=new AudioBuffer({length:n,numberOfChannels:2,sampleRate:sr}), ang=(pan+1)*Math.PI/4;
      b.getChannelData(0).set(x.map(v=>v*Math.cos(ang))); b.getChannelData(1).set(x.map(v=>v*Math.sin(ang))); drops.push(b); } }
  const chirps=CRICKETS.map(K=>{ const pl=.016, ps=.034, n=Math.round((K.pulses*ps+.01)*sr), b=new AudioBuffer({length:n,numberOfChannels:1,sampleRate:sr}), d=b.getChannelData(0);
    for(let i=0;i<n;i++){ const t=i/sr, p=Math.floor(t/ps), u=t-p*ps; if(p>=K.pulses||u>pl) continue;
      d[i]=Math.sin(2*Math.PI*K.f*t)*Math.min(u/.004,1,(pl-u)/.005); }
    return b; });
  return ambiBufs[sr]={noise,verb,drops,chirps};
}

/* ---- An engine: the shared reverb and output for one audio context ----
   origin: the film time of the context's time 0 (0 when live, where film time is the context's clock). */
function ambiEngine(ctx,dest,origin){
  const B=ambiBuffers(ctx.sampleRate);
  const out=ctx.createGain(); out.gain.value=1; out.connect(dest);
  return {ctx,B,out,verb:null,origin,segs:[],until:0};
}
/* The reverb is made only when something is sent to it: rain and crickets alone don't need it. */
function ambiVerb(E){
  if(!E.verb){ E.verb=E.ctx.createConvolver(); E.verb.normalize=true; E.verb.buffer=E.B.verb; E.verb.connect(E.out); }
  return E.verb;
}

/* The 0 to 1 envelope of a segment at film time t: up over fadeIn from its start, down over fadeOut to its end. */
function segEnv(s,t){ const a=Math.min(Math.max((t-s.start)/s.fadeIn,0),1), b=Math.min(Math.max((s.end-t)/s.fadeOut,0),1); return Math.min(a,b); }
/* Set a gain to follow the envelope from film time `from` onward. */
function envAutomate(E,s,param,from){
  const c=t=>Math.max(0,t-E.origin), pts=[s.start,s.start+s.fadeIn,s.end-s.fadeOut,s.end].filter(t=>isFinite(t)&&t>from);
  param.setValueAtTime(segEnv(s,from),c(from));
  for(const t of pts) param.linearRampToValueAtTime(segEnv(s,t),c(t));
}

/* One segment's sounds: a small graph per layer, ending in the segment's envelope. from: the film time its
   graph starts at (its start, or the start of the piece being rendered). */
function segBuild(E,s,from){
  const c=E.ctx, g={nodes:[],layers:{}};
  const node=n=>{ g.nodes.push(n); return n; };
  const env=node(c.createGain()), envV=node(c.createGain());
  envAutomate(E,s,env.gain,from); envAutomate(E,s,envV.gain,from);
  env.connect(E.out);
  g.env=env; g.envV=envV;
  const sc=s.scape;
  if(sc.music||sc.birds) envV.connect(ambiVerb(E));
  /* A layer's way in: its level, then filters, then dry and reverb sends into the envelope. */
  const layer=(lv,filters,send)=>{
    const inG=node(c.createGain()); inG.gain.value=lv;
    let last=inG; for(const [type,f,q] of filters){ const b=node(c.createBiquadFilter()); b.type=type; b.frequency.value=f; b.Q.value=q; last.connect(b); last=b; }
    last.connect(env); if(send>0){ const sg=node(c.createGain()); sg.gain.value=send; last.connect(sg); sg.connect(envV); }
    return inG;
  };
  const at=Math.max(0,from-E.origin);
  if(sc.music){ const St=AMBI_STYLES[sc.music.style]; g.layers.music=layer(sc.music.level*AMBI_K.music*St.gain,[['lowpass',St.lp,.4]],St.verb); }
  if(sc.rain){
    const inG=layer(sc.rain*AMBI_K.rain,[['highpass',380,.5],['lowpass',6500,.4]],0);
    /* The hiss: the looped noise, started where absolute time says it should be in its loop. */
    const bed=node(c.createBufferSource()); bed.buffer=E.B.noise; bed.loop=true;
    const bg=node(c.createGain()); bg.gain.value=.5; bed.connect(bg); bg.connect(inG);
    bed.start(at,loopPos(E,from)); if(isFinite(s.end)) bed.stop(Math.max(at,s.end-E.origin+.1));
    g.layers.rain=inG;
  }
  if(sc.insects){
    const inG=layer(sc.insects*AMBI_K.insects,[['lowpass',7500,.5]],0);
    /* A faint, far chorus: noise through two narrow filters around 4.6 kHz. */
    const bed=node(c.createBufferSource()); bed.buffer=E.B.noise; bed.loop=true;
    const f1=node(c.createBiquadFilter()); f1.type='bandpass'; f1.frequency.value=4600; f1.Q.value=7;
    const f2=node(c.createBiquadFilter()); f2.type='bandpass'; f2.frequency.value=4700; f2.Q.value=7;
    const bg=node(c.createGain()); bg.gain.value=.9;
    bed.connect(f1); f1.connect(f2); f2.connect(bg); bg.connect(inG);
    bed.start(at,loopPos(E,from+2.7)); if(isFinite(s.end)) bed.stop(Math.max(at,s.end-E.origin+.1));
    /* Each cricket has its place left to right. */
    g.crickets=CRICKETS.map(K=>{ const p=node(c.createStereoPanner()); p.pan.value=K.pan; p.connect(inG); return p; });
    g.layers.insects=inG;
  }
  if(sc.birds) g.layers.birds=layer(sc.birds*AMBI_K.birds,[['lowpass',5200,.5]],.45);
  return g;
}
/* Where the looped noise is at film time t, so the hiss runs on unbroken from one piece of film to the next. */
function loopPos(E,t){ const n=E.B.noise.length,sr=E.ctx.sampleRate; return (((Math.round(t*sr))%n)+n)%n/sr; }

/* ---- Events: every one placed by a hash of where it is in time ---- */
/* Schedule the segment's events that start in film time [from, to). */
function segEvents(E,s,g,from,to){
  from=Math.max(from,s.start); to=Math.min(to,s.end);
  if(to<=from) return;
  const sc=s.scape;
  if(sc.music) musicEvents(E,s,g,from,to);
  if(sc.insects) cricketEvents(E,g,from,to);
  if(sc.rain) dropEvents(E,g,from,to);
  if(sc.birds) birdEvents(E,g,from,to);
}
function musicEvents(E,s,g,from,to){
  const m=s.scape.music, St=AMBI_STYLES[m.style];
  let shift=(AMBI_KEYS[m.key]-AMBI_KEYS[St.key]+12)%12; if(shift>6) shift-=12;
  St.voices.forEach((V,vi)=>{
    /* The voices count their repetitions from the segment's start, so a movie's music begins with it. */
    const base=s.start+V.off;
    let k=Math.max(0,Math.ceil((from-base)/V.loop-1e-9));
    for(;;k++){
      const t=base+k*V.loop; if(t>=to) break; if(t<from) continue;
      const r=arng(m.seed*977+vi,k,0x4D55);
      /* Now and then a voice rests, so the texture breathes. */
      if(k>0&&r()<.12) continue;
      const note=St.tonic+shift+V.n[(k+m.seed)%V.n.length];
      voiceNote(E,g.layers.music,V.t,t-E.origin,midiHz(note),V.a*(.82+.18*r()),V.dur*(.9+.2*r()),V.pan);
    }
  });
}
function voiceNote(E,dest,tb,w,f,a,dur,pan){
  const c=E.ctx, p=c.createStereoPanner(); p.pan.value=pan; p.connect(dest);
  /* Each part: frequency ratio, loudness, waveform, attack, the share of the note it lasts, and whether it
     holds (pads, drones) or dies away from the start (bells). */
  const P=tb==='bell'?[[1,1,'sine'],[1.0016,.35,'sine'],[2,.2,'sine',.55],[3,.06,'sine',.35]]
         :tb==='glass'?[[1,1,'sine'],[1.0021,.3,'sine'],[2.76,.05,'sine',.5]]
         :tb==='pad'?[[Math.pow(2,-5/1200),.5,'triangle'],[Math.pow(2,5/1200),.5,'triangle'],[.5,.35,'sine']]
         :[[1,1,'sine'],[1.003,.5,'sine'],[2,.3,'sine'],[3,.08,'sine']];
  const hold=tb==='pad'||tb==='drone', att=tb==='drone'?dur*.35:tb==='pad'?Math.min(3,dur*.3):tb==='glass'?.09:.06, rel=tb==='drone'?dur*.4:dur*.45;
  for(const [ratio,amp,type,share] of P){
    const o=c.createOscillator(); o.type=type; o.frequency.value=f*ratio;
    const gn=c.createGain(), A=a*amp, end=w+(share?att+(dur-att)*share:dur);
    gn.gain.setValueAtTime(0,w); gn.gain.linearRampToValueAtTime(A,w+att);
    if(hold) gn.gain.setValueAtTime(A,Math.max(w+att,w+dur-rel));
    gn.gain.exponentialRampToValueAtTime(A*.001,end); gn.gain.linearRampToValueAtTime(0,end+.05);
    o.connect(gn); gn.connect(p); o.start(w); o.stop(end+.1);
  }
}
/* Five crickets: pitch, chirps a second, pulses in a chirp, place left to right, loudness. They sing in
   bouts of about seven seconds, each bout on or off by its own hash. */
const CRICKETS=[[4300,1.9,3,-.6,.9],[4720,1.45,4,.45,.7],[4050,2.3,3,.15,.55],[5100,1.6,3,-.25,.45],[4520,1.2,4,.75,.6]]
  .map(([f,rate,pulses,pan,a])=>({f,period:1/rate,pulses,pan,a}));
function cricketEvents(E,g,from,to){
  CRICKETS.forEach((K,i)=>{
    const ph=ahash(i,77,1,0)*K.period;
    for(let k=Math.floor((from-ph)/K.period)-1;;k++){
      const r=arng(i,k,0xC81C), t=ph+k*K.period+(r()-.5)*.12*K.period; if(t-.2*K.period>=to) break;
      if(t<from||t>=to) continue;
      const bout=Math.floor(t/7+ahash(i,5,5,5)); if(ahash(i,bout,0xB0,0)>.72) continue;
      oneShot(E,g.crickets[i],t-E.origin,E.B.chirps[i],K.a*(.75+.25*r()),1+(r()-.5)*.01);
    }
  });
}
/* Rain drops: the time is cut into fifths of a second, each with none, one or two drops. */
function dropEvents(E,g,from,to){
  const D=.2;
  for(let j=Math.floor(from/D);j*D<to;j++){
    const r=arng(j,0xD209,3), n=r()<.5?0:r()<.75?1:2;
    for(let q=0;q<n;q++){ const t=(j+r())*D; if(t<from||t>=to){ r();r();r();r(); continue; }
      oneShot(E,g.layers.rain,t-E.origin,E.B.drops[Math.floor(r()*24)],.18+.32*r(),1); r(); r(); }
  }
}
/* A short recording played once, at a loudness and speed. */
function oneShot(E,dest,w,buf,a,rate){
  const c=E.ctx, src=c.createBufferSource(); src.buffer=buf; src.playbackRate.value=rate;
  const gn=c.createGain(); gn.gain.value=a; src.connect(gn); gn.connect(dest); src.start(w);
}
/* Birds: the time is cut into five-second slots; about one in three has a call. */
function birdEvents(E,g,from,to){
  const D=5;
  for(let j=Math.floor(from/D);j*D<to;j++){
    const r=arng(j,0xB12D,7); if(r()>.36) continue;
    const t=(j+.8*r())*D; if(t<from||t>=to) continue;
    const kind=r(), pan=(r()-.5)*1.4, a=.5+.5*r();
    if(kind<.5) twitter(E,g.layers.birds,t-E.origin,r,pan,a);
    else if(kind<.85) whistle(E,g.layers.birds,t-E.origin,r,pan,a);
    else gull(E,g.layers.birds,t-E.origin,r,pan,a*.8);
  }
}
function birdTone(E,dest,pan,type){ const c=E.ctx, o=c.createOscillator(); o.type=type||'sine'; const gn=c.createGain(); gn.gain.value=0; const p=c.createStereoPanner(); p.pan.value=pan; o.connect(gn); gn.connect(p); p.connect(dest); return {o,gn,p}; }
/* A small bird: three to six quick notes, each a fast slide. */
function twitter(E,dest,w,r,pan,a){
  const n=3+Math.floor(r()*4), base=2600+1800*r(), up=r()<.5, len=.05+.04*r(), gap=.09+.05*r();
  const {o,gn}=birdTone(E,dest,pan);
  o.frequency.setValueAtTime(base,w);
  for(let i=0;i<n;i++){ const s=w+i*gap, f0=base*(1+.04*(r()-.5)), f1=f0*(up?1.35:.74);
    o.frequency.setValueAtTime(f0,s); o.frequency.exponentialRampToValueAtTime(f1,s+len);
    gn.gain.setValueAtTime(0,s); gn.gain.linearRampToValueAtTime(a,s+.008); gn.gain.setValueAtTime(a,s+len-.012); gn.gain.linearRampToValueAtTime(0,s+len); }
  o.start(w); o.stop(w+n*gap+.05);
}
/* A whistle: two longer notes, gliding, with a little vibrato. */
function whistle(E,dest,w,r,pan,a){
  const c=E.ctx, {o,gn}=birdTone(E,dest,pan), f=1900+900*r();
  const lfo=c.createOscillator(); lfo.frequency.value=6+3*r(); const lg=c.createGain(); lg.gain.value=f*.012; lfo.connect(lg); lg.connect(o.frequency);
  const notes=[[f,f*1.18,.24+.12*r()],[f*1.1,f*.86,.26+.14*r()]];
  let s=w;
  for(const [f0,f1,d] of notes){ o.frequency.setValueAtTime(f0,s); o.frequency.linearRampToValueAtTime(f1,s+d);
    gn.gain.setValueAtTime(0,s); gn.gain.linearRampToValueAtTime(a*.8,s+.03); gn.gain.setValueAtTime(a*.8,s+d-.05); gn.gain.linearRampToValueAtTime(0,s+d); s+=d+.12+.1*r(); }
  o.start(w); lfo.start(w); o.stop(s); lfo.stop(s);
}
/* A distant gull: a few nasal "kyow" calls, a buzzy tone through a narrow filter. */
function gull(E,dest,w,r,pan,a){
  const c=E.ctx, bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1700; bp.Q.value=1.6;
  const lp=c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=3000;
  const {o,gn,p}=birdTone(E,dest,pan,'sawtooth'); gn.disconnect(); gn.connect(bp); bp.connect(lp); lp.connect(p);
  const n=2+Math.floor(r()*3), f=1050+250*r();
  let s=w;
  for(let i=0;i<n;i++){ const d=.28+.1*r();
    o.frequency.setValueAtTime(f,s); o.frequency.linearRampToValueAtTime(f*1.25,s+.06); o.frequency.linearRampToValueAtTime(f*.82,s+d);
    gn.gain.setValueAtTime(0,s); gn.gain.linearRampToValueAtTime(a*.35,s+.03); gn.gain.setValueAtTime(a*.35,s+d-.08); gn.gain.linearRampToValueAtTime(0,s+d); s+=d+.18+.15*r(); }
  o.start(w); o.stop(s);
}

/* ---- Films ---- */
function ambiOffline(ctx,dest,segments,t0,seconds){
  const E=ambiEngine(ctx,dest,t0), t1=t0+seconds;
  for(const s0 of segments||[]){
    const scape=ambiNorm(s0.scape); if(!scape) continue;
    const s={start:+s0.start,end:+s0.end,scape,fadeIn:s0.fadeIn??4,fadeOut:s0.fadeOut??4};
    if(!(s.end>s.start)||s.end<=t0||s.start>=t1) continue;
    const g=segBuild(E,s,Math.max(t0,s.start));
    segEvents(E,s,g,t0,t1);
  }
  return E;
}

/* ---- Live ---- */
function ambiSet(scape,fade=4){
  const n=ambiNorm(scape), E=AMBI.E;
  if(JSON.stringify(n)===JSON.stringify(AMBI.want?AMBI.want.scape:null)) return;
  AMBI.want={scape:n,fade};
  if(E){
    const now=E.ctx.currentTime;
    /* The scape playing now fades out as the new one fades in. */
    for(const s of E.segs) if(s.end>now+fade){ s.end=now+fade; s.fadeOut=Math.max(fade,.05);
      for(const p of [s.g.env.gain,s.g.envV.gain]){ if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else p.cancelScheduledValues(now); envAutomate(E,s,p,now); } }
    if(n) ambiStart(n,fade);
  }
  if(!AMBI.timer&&n) AMBI.timer=setInterval(ambiTick,400);
  ambiTick();
}
function ambiStart(scape,fade){
  const E=AMBI.E, now=E.ctx.currentTime;
  const s={start:now,end:Infinity,scape,fadeIn:Math.max(fade,.05),fadeOut:4};
  s.g=segBuild(E,s,now); E.segs.push(s);
  E.until=Math.max(E.until,now);
}
function ambiTick(){
  if(typeof SOUND==='undefined'||!SOUND.ctx||!SOUND.nodes) return;
  const c=SOUND.ctx;
  if(!AMBI.E){
    if(!AMBI.want||!AMBI.want.scape) return;
    AMBI.E=ambiEngine(c,SOUND.nodes.master,0); AMBI.E.until=c.currentTime;
    ambiStart(AMBI.want.scape,Math.min(AMBI.want.fade,3));
  }
  const E=AMBI.E, now=c.currentTime;
  /* Sound off, or not yet allowed to start: nothing is scheduled, and it picks up from the present later. */
  if(!SOUND.on||c.state!=='running'){ E.until=Math.max(E.until,now); return; }
  const from=Math.max(E.until,now), to=now+AMBI_LOOK;
  for(const s of E.segs) segEvents(E,s,s.g,from,to);
  E.until=to;
  /* Segments long finished: their notes and reverb have died away, so their graphs go. */
  E.segs=E.segs.filter(s=>{ if(s.end+AMBI_PRE<now){ for(const nd of s.g.nodes){ try{ nd.disconnect(); if(nd.stop) nd.stop(); }catch(e){} } return false; } return true; });
  if(!E.segs.length&&!(AMBI.want&&AMBI.want.scape)&&AMBI.timer){ clearInterval(AMBI.timer); AMBI.timer=null; }
}
/* For checks: what's playing. */
function ambiInfo(){ const E=AMBI.E; return {want:AMBI.want&&AMBI.want.scape,engine:!!E,segs:E?E.segs.map(s=>({start:s.start,end:isFinite(s.end)?s.end:null,style:s.scape.music&&s.scape.music.style})):[],until:E?E.until:0,timer:!!AMBI.timer}; }

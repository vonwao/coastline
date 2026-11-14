'use strict';
/* ---- Sound: the sea, driven by the simulation ----
   Press S to turn it on (browsers allow sound to start only after a key press or click).

   Four times a second the foam field is shrunk to a 24 by 48 grid on the GPU and read back without
   stalling (into a pixel buffer, collected a few frames later, when a fence says the GPU has finished).
   Each cell holds how much fresh white water (bubbles) and lingering foam it has. Weighted by distance
   from the drone, that gives three levels:
     roar   fresh breaking near the drone
     hiss   foam fizzing on the sand and in the shallows
     bed    the distant surf of the whole coast
   and waves: when fresh white water rises quickly near the drone, faster than it has lately, a wave has
   just broken there, and one crash is played, from where it broke (left or right).

   The sounds are recordings of the sea (sounds/sea.js, made by tools/seasounds.js; who recorded them, and
   their licences, are in sounds/CREDITS.md):
     distant   the surf of a whole beach from further off, following bed
     near      small waves breaking close by, following roar
     wash      the fizz and the rattle of small stones between waves, following hiss
     lap       ripples on a lake shore, for calm water (small waves, lakes, lagoons)
     rocks     water slapping among rocks, on rocky coasts, following roar
     crashes   single waves breaking, one at a time, at the moments the simulation breaks one: on a sandy
               or stony shore, or on rock; slower and deeper for big swell
   plus wind (filtered noise, in gusts), stronger in moody and stormy light and a little higher up. Every
   sound is as far as the water making it: it gets quieter with distance as sound spreads, loses its highs
   as air takes them, and close recordings give way to the distant one, so surf 200 m away is a low,
   soft rumble and a low pass over the break is loud and bright (soundLevels; TECHLOG 58).
   seaVoices makes the same sounds for the films (tools/calmfilm-page.js), offline. */
const SOUND={on:false,ctx:null,nodes:null,voices:null,lv:{roar:0,hiss:0,bed:0},crashes:[],pend:null,next:0,tex:null,fbo:null,pbo:null,data:null,waking:false};
const SND_W=24,SND_H=48;
const sndStep=(a,b,x)=>{ const t=Math.min(Math.max((x-a)/(b-a),0),1); return t*t*(3-2*t); };
const FS_SND=HEAD+`
in vec2 vUV; out vec4 o; uniform sampler2D tFx; uniform float uLod;
void main(){ vec4 f=textureLod(tFx,vUV,uLod); o=vec4(clamp(f.r,0.,1.),clamp(f.g*2.,0.,1.),0.,1.); }`;

function noiseBuffer(ctx,kind){
  /* Ten seconds of noise, looped (for the wind). Brown noise (each sample a small step from the last) is
     deep and rumbling; white noise is bright. */
  const n=ctx.sampleRate*10,b=ctx.createBuffer(2,n,ctx.sampleRate);
  for(let c=0;c<2;c++){ const d=b.getChannelData(c); let last=0;
    for(let i=0;i<n;i++){ const w=Math.random()*2-1; if(kind==='brown'){ last=(last+.02*w)/1.02; d[i]=last*3.5; } else d[i]=w*.5; } }
  return b;
}

/* The recordings: sounds/sea.js is loaded when sound is first wanted (it's 2.4 MB), decoded once, and
   cut into one buffer per piece. A page opened from the file system can load a script but not fetch a
   file, hence the script. Resolves to {name: AudioBuffer}. */
const SEA={buffers:null,promise:null,error:null};
function seaLoad(){
  if(SEA.promise) return SEA.promise;
  SEA.promise=new Promise((res,rej)=>{
    if(window.SEA_DATA) return res();
    const s=document.createElement('script'); s.src='sounds/sea.js'; s.onload=()=>res(); s.onerror=()=>rej(new Error('sounds/sea.js did not load'));
    document.head.append(s);
  }).then(async()=>{
    const D=window.SEA_DATA, bin=Uint8Array.from(atob(D.mp4),c=>c.charCodeAt(0));
    const A=await new OfflineAudioContext(2,1,48000).decodeAudioData(bin.buffer), SR=A.sampleRate, B={};
    for(const [k,c] of Object.entries(D.clips)){
      const s=Math.round(c.start*SR), n=Math.round(c.secs*SR), b=new AudioBuffer({numberOfChannels:2,length:n,sampleRate:SR});
      for(let ch=0;ch<2;ch++) b.copyToChannel(A.getChannelData(ch).subarray(s,s+n),ch);
      B[k]=b;
    }
    SEA.buffers=B; return B;
  }).catch(e=>{ SEA.error=e; console.error(e); throw e; });
  return SEA.promise;
}
const seaCrashes=kind=>Object.keys(SEA.buffers||{}).filter(k=>k.startsWith('crash-'+kind));

/* The sea's voices, into dest, in a live AudioContext or a film's OfflineAudioContext. Loops start at
   film time t0 (each at its own place in its recording), so two pieces of a film rendered separately
   agree where they join. set(v,at,first) moves every voice toward the targets of soundMix; crash(at,c)
   plays one wave (c from crashOf); a wave that broke before t0 starts part way through. */
function seaVoices(ctx,dest,B,t0=0){
  const loop=(name,phase)=>{
    const s=ctx.createBufferSource(); s.buffer=B[name]; s.loop=true;
    const f=ctx.createBiquadFilter(); f.type='lowpass'; f.Q.value=.5; f.frequency.value=18000;
    const g=ctx.createGain(); g.gain.value=0; s.connect(f); f.connect(g); g.connect(dest);
    s.start(0,(t0+phase)%B[name].duration); return {s,f,g};
  };
  const V={distant:loop('distant',3.1),near:loop('near',11.7),wash:loop('wash',7.3),lap:loop('lap',19.9),rocks:loop('rocks',5.3)};
  /* Wind: band-passed noise; the gusts are made in set. */
  { const s=ctx.createBufferSource(); s.buffer=noiseBuffer(ctx,'white'); s.loop=true; const f=ctx.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.1; f.frequency.value=600;
    const g=ctx.createGain(); g.gain.value=0; s.connect(f); f.connect(g); g.connect(dest); s.start(0,Math.random()*9); V.wind={f,g}; }
  /* What each setting was last sent toward. The levels come four times a second and the picture up to 60,
     so most frames ask for the same targets again: only a target that has changed is sent. (Every call
     adds an event to that setting's list in the browser; it was twelve a frame, all day.) The wind's gusts
     never stop moving, so they go in small steps, about half a percent of its loudest and 4 Hz of pitch, well under
     what its glide of a second or more smooths away. The steps depend on film time alone, so a film's
     pieces still agree where they join. */
  const sent=new Map(), step=(x,q)=>Math.round(x/q)*q;
  return {
    set(v,at,first){
      const set=(p,x,tc)=>{ if(first) p.setValueAtTime(x,at); else if(sent.get(p)!==x) p.setTargetAtTime(x,at,tc); else return; sent.set(p,x); };
      set(V.distant.g.gain,v.bedG,.8); set(V.distant.f.frequency,v.bedF,.8);
      set(V.near.g.gain,v.roarG,.35); set(V.near.f.frequency,v.roarF,.4);
      set(V.rocks.g.gain,v.rockG,.35); set(V.rocks.f.frequency,v.roarF,.4);
      set(V.wash.g.gain,v.hissG,.5); set(V.wash.f.frequency,v.hissF,.5);
      set(V.lap.g.gain,v.lapG,.5); set(V.lap.f.frequency,v.lapF,.5);
      /* Gusts: three slow swells that rarely line up, from nearly still to a push, and the pitch rises
         with the push. Film time, so a film's pieces agree. */
      const T=t0+at, gu=Math.max(0,.55+.3*Math.sin(T*.13)+.25*Math.sin(T*.071+1.)+.15*Math.sin(T*.31+2.));
      set(V.wind.g.gain,step(v.wind*gu,.002),1.); set(V.wind.f.frequency,step(420+380*Math.min(gu,1.2),4),1.5);
    },
    crash(at,c){
      const b=B[c.name]; if(!b) return;
      const s=ctx.createBufferSource(); s.buffer=b; s.playbackRate.value=c.rate;
      const f=ctx.createBiquadFilter(); f.type='lowpass'; f.Q.value=.5; f.frequency.value=c.f;
      const p=ctx.createStereoPanner(); p.pan.value=c.pan;
      const g=ctx.createGain(); g.gain.value=c.gain;
      s.connect(f); f.connect(p); p.connect(g); g.connect(dest);
      /* A far wave is heard late (c.delay) and with a softer onset (c.attack, s). */
      const st=at+(c.delay||0), a=c.attack||0;
      if(st>=0){ if(a>0){ g.gain.value=0; g.gain.setValueAtTime(0,st); g.gain.linearRampToValueAtTime(c.gain,st+a); } s.start(st); }
      else { const off=-st*c.rate; if(off<b.duration) s.start(0,off); }
    },
  };
}

/* Keep the sound going on a screen left running. A browser can stop it without being asked: when the tab
   has been hidden, when the computer has slept, when the speakers or the screen's sound output change.
   Nothing brought it back until S was pressed twice, so a venue's screen could go silent for the day.
   When sound is meant to be on and has stopped, ask for it again: at once when the browser says it
   stopped or the page is shown again, and from the frame loop (soundUpdate) as a backstop. One request
   waits at a time; one still held back by the browser's rule about a first click or key press (soundAuto)
   simply stays waiting. */
function soundWake(){
  const c=SOUND.ctx; if(!c||!SOUND.on||SOUND.waking||c.state==='running'||c.state==='closed') return;
  SOUND.waking=true;
  const done=()=>{ SOUND.waking=false; };
  c.resume().then(done,done);
  /* A request the browser never answers mustn't block the next for good. */
  setTimeout(done,30000);
}
function soundInit(){
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const master=ctx.createGain(); master.gain.value=0; master.connect(ctx.destination);
  SOUND.nodes={master}; SOUND.ctx=ctx;
  ctx.addEventListener('statechange',soundWake);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') soundWake(); });
  addEventListener('pageshow',soundWake); addEventListener('focus',soundWake);
  seaLoad().then(B=>{ SOUND.voices=seaVoices(ctx,master,B,Math.random()*60); SOUND.first=true; }).catch(()=>toast('The sea recordings did not load'));
  SOUND.tex=makeTex(SND_W,SND_H,{fmt:'RGBA8'}); SOUND.fbo=makeFBO(SOUND.tex);
  SOUND.pbo=gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,SOUND.pbo);
  gl.bufferData(gl.PIXEL_PACK_BUFFER,SND_W*SND_H*4,gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  SOUND.data=new Uint8Array(SND_W*SND_H*4);
}
function toggleSound(){
  if(!SOUND.ctx) soundInit();
  SOUND.on=!SOUND.on;
  if(SOUND.on) SOUND.ctx.resume();
  const g=SOUND.nodes.master.gain,t=SOUND.ctx.currentTime;
  g.cancelScheduledValues(t); g.setTargetAtTime(SOUND.on?.9:0,t,.4);
  toast(SOUND.on?'Sound on':'Sound off');
}
/* ?sound=1 turns sound on at startup. Browsers usually hold it back until the first click or key press
   (the desktop launcher starts the browser with that rule switched off), so if it's held back, it
   starts on the first one. */
function soundAuto(){
  toggleSound();
  setTimeout(()=>{
    if(SOUND.ctx.state==='running') return;
    toast('Sound starts when you click or press a key');
    const go=()=>{ SOUND.ctx.resume(); removeEventListener('pointerdown',go); removeEventListener('keydown',go); };
    addEventListener('pointerdown',go); addEventListener('keydown',go);
  },400);
}
/* Ask the GPU for a fresh grid; collect the last one if it's ready. Never waits. */
function soundSample(S){
  const L=S.L;
  if(SOUND.pend){
    /* Read only on a later frame than the one that saw the fence signalled: Chrome copies the data back
       in between, and reading in the same frame took a slow path. */
    if(!SOUND.pend.ready){ if(gl.getSyncParameter(SOUND.pend.sync,gl.SYNC_STATUS)===gl.SIGNALED) SOUND.pend.ready=true; return; }
    {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,SOUND.pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,SOUND.data); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
      gl.deleteSync(SOUND.pend.sync); const P=SOUND.pend; SOUND.pend=null;
      const e=soundLevels(P.S,P.cam,P.t); if(e) SOUND.crashes.push(e);
    }
  }
  if(performance.now()<SOUND.next||!L.fx) return;
  SOUND.next=performance.now()+250;
  use(PR.snd,{tFx:L.fx[L.fi],uLod:Math.max(0,Math.log2(L.nx/SND_W)-.5)}); drawTo(SOUND.fbo);
  gl.bindFramebuffer(gl.FRAMEBUFFER,SOUND.fbo); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,SOUND.pbo);
  gl.readPixels(0,0,SND_W,SND_H,gl.RGBA,gl.UNSIGNED_BYTE,0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const cam=cameraFor(S,Math.min(S.t/S.dur,1),S.camT!==undefined?S.camT:performance.now()*.001,1);
  SOUND.pend={sync:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),S,cam:{ro:cam.ro,R:cam.R},t:performance.now()/1000};
}
/* From the grid in SOUND.data: the levels, into SOUND.lv, and a wave breaking near the drone, if one just
   did: {t, s: how hard, 0 to 1, pan: -1 left to 1 right}, or null.
   The grid runs across the shore in x (24 cells) and along it in z (48). Each cell is heard as a sound
   source: loudness falls with distance like spreading sound, so foam right below the drone counts most,
   and distant surf adds up to a wash. Levels are compressed (1-e^-x), like the ear.
   A wave: the fresh white water that appeared since the last grid, weighted the same way, per second.
   A wave has broken when that is rising, has grown to 1.7 times its lowest in the last second and a half,
   is at least half what it has averaged over the last several seconds, and the last crash was long enough
   ago (a little under half the swell's period, at least 2 s). Big waves stand well over the average and
   crash loudest; the smaller ones between them, softer. The detector's memory is kept on the shot
   (S._snd), so each shot of a dissolve has its own. */
/* Distance, as air carries sound (TECHLOG 58). Each cell of the grid is a source at sea level, heard
   from the camera r metres away:
   - level: a cell's sound spreads, its intensity falling as 1/r² (-6 dB each time the distance doubles),
     so a long line of surf falls as 1/r (-3 dB per doubling) once the camera is further from it than the
     line is long. The coast goes on past the simulated stretch, so its surf carries on as a line of sound
     past both ends;
   - near and far: each cell's sound is split by its distance, so the recordings made close to the waves
     ('near', 'wash', 'rocks', the crashes) fade out past about 60 m and the far one ('distant') takes over;
   - air takes the highs first (airCut).
   Kept in SOUND.lv for soundMix: Ibn, Ibf the near and far breaking, Ifn the near foam (intensities), and
   rbn, rbf, rfn the distances most of each comes from. The older roar and hiss (fresh white water and
   foam near the drone, compressed like the ear) still drive the wave detector. */
const SND_R0=6, SND_RN=60;
/* Air absorption: about 3 dB per 100 m at 4 kHz and 10 dB per 100 m at 8 kHz, alpha(f) = 0.1 (f/8 kHz)^1.74
   dB per metre. A voice's low-pass goes where its sound has lost 3 dB over r metres. */
const airCut=r=>Math.min(18000,Math.max(650,8000*Math.pow(30/Math.max(r,1),.575)));
function soundLevels(S,cam,t){
  const L=S.L,ro=cam.ro,R=cam.R,D=SOUND.data,cell=L.domSize[0]/SND_W*L.domSize[1]/SND_H; let roar=0,hiss=0,rise=0,px=0,rc=0;
  const det=S._snd&&S._snd.L===L?S._snd:(S._snd={L,prev:null,t:0,base:0,r:0,last:t-2,rs:[]});
  const prev=det.prev, h=Math.max(ro[1],1.5), R0=SND_R0*SND_R0, RN=SND_RN*SND_RN;
  let Ibn=0,Ibf=0,rbn=0,rbf=0,Ifn=0,rfn=0,Bs=0,bx=0,rq=0;
  for(let j=0;j<SND_H;j++)for(let i=0;i<SND_W;i++){
    const x=L.domMin[0]+(i+.5)/SND_W*L.domSize[0],z=L.domMin[1]+(j+.5)/SND_H*L.domSize[1];
    const dx=x-ro[0],dz=z-ro[2],d2=dx*dx+ro[1]**2+dz*dz,w=cell/(d2+400);
    const k=(j*SND_W+i)*4,foam=D[k]/255,bub=D[k+1]/255;
    roar+=bub*w; hiss+=foam*w;
    const r2=dx*dx+h*h+dz*dz,r=Math.sqrt(r2),q=cell/(r2+R0),nr=1/(1+r2/RN);
    if(bub>0){ const a=bub*q; Ibn+=a*nr; rbn+=a*nr*r; Ibf+=a*(1-nr); rbf+=a*(1-nr)*r; Bs+=bub*cell; bx+=bub*cell*x; }
    if(foam>0){ const a=foam*q*nr; Ifn+=a; rfn+=a*r; }
    if(prev){ const d=bub-prev[k+1]/255; if(d>0){ rise+=d*w; rc+=d*q*r; rq+=d*q; px+=d*w*(dx*R[0]+dz*R[2])/Math.sqrt(d2); } }
  }
  /* The surf beyond the ends of the simulated stretch: a line of the same strength per metre (lam), at the
     camera's distance p from the line of surf, from each end of the stretch to far away. */
  if(Bs>0){
    const lam=Bs/L.domSize[1], p=Math.hypot(ro[0]-bx/Bs,h), za=L.domMin[1]+L.domSize[1]-ro[2], zb=ro[2]-L.domMin[1];
    const ext=lam/p*((Math.PI/2-Math.atan(za/p))+(Math.PI/2-Math.atan(zb/p)));
    Ibf+=ext; rbf+=ext*Math.hypot(p,Math.max(0,Math.min(za,zb)));
  }
  SOUND.raw={roar,hiss};
  SOUND.lv={roar:1-Math.exp(-roar*SOUND.kR),hiss:1-Math.exp(-hiss*SOUND.kH),alt:ro[1],
    Ibn,Ibf,Ifn,rbn:Ibn>0?rbn/Ibn:SND_RN,rbf:Ibf>0?rbf/Ibf:4*SND_RN,rfn:Ifn>0?rfn/Ifn:SND_RN};
  SOUND.lv.bed=Math.min(1,Math.pow((Ibf+Ibn)/SND_IREF,.375));
  /* How far the shore is, for the lapping of calm water. */
  const sx=typeof shoreAt==='function'?shoreAt(L,ro[2]):ro[0]; SOUND.lv.shore=Math.hypot(ro[0]-sx,h);
  let ev=null;
  if(prev){
    const dt=Math.min(Math.max(t-det.t,.05),2), r=rise/dt*SOUND.kR, lo=Math.min(...det.rs);
    const gap=Math.max(2,.42*(L.T||8));
    const pan=Math.max(-1,Math.min(1,px/Math.max(rise,1e-9))), at=rq>0?rc/rq:SND_RN;
    /* How hard the wave is, against the waves before it; how far it broke (where most of its sound comes
       from: the distance weighted by the new white water's intensity at the camera) sets how loud and how
       dull it sounds (crashOf). */
    if(det.base>0&&r>lo*1.7&&r>det.base*.55&&r>det.r&&r>SOUND.minRise&&t-det.last>gap){
      det.last=t; ev={t,s:Math.min(1,r/det.base*.55),pan,r:at};
    }
    /* Where no single wave stands out (on rock, where the sea breaks all along the shelf, or from high
       up), the swell still keeps time: a softer crash once a period and a half, if there's surf. */
    else if(SOUND.lv.roar>.15&&t-det.last>1.5*(L.T||8)){ det.last=t; ev={t,s:.4,pan,r:Math.max(at,SOUND.lv.rbn)}; }
    det.base=det.base>0?det.base+(r-det.base)*Math.min(1,dt/6):r; det.r=r;
    /* The near surf's average over about 8 s: distance softens the average only (soundMix), and each
       wave's rise and fall around it keeps its full size. */
    det.ibn=det.ibn>0?det.ibn+(SOUND.lv.Ibn-det.ibn)*Math.min(1,dt/8):SOUND.lv.Ibn;
    SOUND.lv.IbnAvg=det.ibn;
    det.rs.push(r); if(det.rs.length>6) det.rs.shift();
  }
  det.prev=D.slice(); det.t=t;
  return ev;
}
SOUND.kR=4; SOUND.kH=2; SOUND.minRise=.004;
/* What the coast is like, for the sound: how calm its water (small waves, a lake or lagoon) and how rocky
   its shore. */
function seaCoast(L){
  const calm=L.water==='lake'?1:1-sndStep(.35,.9,L.Hs);
  const rocky=L.kind==='rocky'&&L.water!=='lake'?(L.water==='tropical'?.35:L.water==='surf'?.55:1):0;
  return {calm,rocky};
}
/* The targets of the sound voices for a shot, from the levels v. Calm films use the same (the sound
   track in tools/calmfilm-page.js), so a film sounds as the live page does. A recipe's sound levels
   (S.sound: surf, wash, wind; js/recipe.js) scale them. */
/* Loudness from intensity: a sound's amplitude goes as the square root of its intensity. k softens the
   physics a little (k 1 would be the physics), as films do, so a high or distant shot is quieter but
   never lost; the far surf also keeps a floor, a tenth of its level close by (-20 dB). */
const SND_IREF=2.4, SND_FOAMK=.35;
const sndGain=(I,k=.75)=>Math.min(1.3,Math.pow(Math.max(I||0,0)/SND_IREF,k/2));
function soundMix(S,v){
  const L=S.L,Li=LIGHTS[S.lightKey]||{},m=S.sound||{};
  const C=seaCoast(L), surf=m.surf??1, rough=1-C.calm*.75, h=v.alt||60;
  /* Levels from an older caller (roar, hiss, bed from 0 to 1 only) stand for intensities at 30 m. */
  const I=(n,alt)=>v[n]!==undefined?v[n]:alt, P=x=>SND_IREF*Math.pow(Math.max(x||0,0),8/3);
  const Ibn=I('Ibn',P(v.roar)), Ibf=I('Ibf',P(v.bed)), Ifn=I('Ifn',SND_IREF*Math.pow(v.hiss||0,2)/SND_FOAMK);
  /* The near surf: its average over several seconds as softened distance gives it, times each wave's rise
     and fall at full size (amplitude as the square root of intensity). */
  const avg=Math.max(I('IbnAvg',Ibn),1e-6), near=Math.min(1.6,sndGain(avg)*Math.min(2,Math.sqrt(Ibn/avg)));
  const far=Math.max(.1,sndGain(Ibf)), fizz=sndGain(Ifn*SND_FOAMK,1);
  /* Calm water laps at the shore: as loud as it is close, falling 4.5 dB per doubling past 25 m. */
  const lapN=Math.min(1,Math.pow(25/Math.max(I('shore',30),25),.75));
  /* The factors make a camera 8 m from the surf sound as it did before distance was modelled. */
  return {
    bedG:.37*far*rough*(m.wash??1), bedF:Math.min(6500,airCut(I('rbf',150))),
    roarG:.26*near*rough*surf*(1-.45*C.rocky), roarF:Math.min(9500,airCut(I('rbn',30))),
    rockG:.35*C.rocky*Math.min(1,near)*surf,
    hissG:.42*fizz*rough*surf, hissF:Math.min(11500,airCut(I('rfn',30))),
    lapG:.55*C.calm*lapN*(.4+.6*Math.min(1,v.hiss*2+.2))*surf, lapF:Math.min(11000,airCut(I('shore',30))),
    crashG:1.6*(1-.8*C.calm)*surf, crashF:Math.min(12000,airCut(I('rbn',30))),
    /* A drone high up hears more wind than surf. */
    wind:(.05+.12*(Li.cover||0)+(S.lightKey==='storm'||Li.storm?.12:0)+.06*sndStep(25,150,h))*(m.wind??1)};
}
/* One wave's crash, from a detected wave e and the targets x: which recording (rock or shore, as the
   coast is), how fast it plays (big swell slower and deeper), where, and, from how far away it broke
   (e.r metres): how loud (a stretch of breaking crest falls between a point and a line, about -4.5 dB per
   doubling, softened as the levels are), how dull (airCut), how late (sound takes a second to cross
   343 m) and how soft its onset (a far crash arrives smeared by the echoes off the water and the
   beach). Chosen by the moment and the coast, not by chance, so a film made twice sounds the same. */
function crashOf(S,e,x){
  const L=S.L,C=seaCoast(L),h=k=>{ const s=Math.sin(e.t*12.9898+L.seed*78.233+k*37.719)*43758.5453; return s-Math.floor(s); };
  const pool=seaCrashes(h(1)<C.rocky?'rocks':'shore');
  if(!pool.length) return null;
  const big=sndStep(.6,1.9,L.Hs), r=Math.max(e.r||15,1);
  return {name:pool[Math.floor(h(2)*pool.length)],rate:(1.06-.26*big)*(.93+.14*h(3)),pan:e.pan*.8,
    gain:Math.min(1,e.s*x.crashG*Math.pow(15/Math.max(r,15),.56)),f:Math.min(12000,airCut(r)),delay:r/343,attack:.015+r/500};
}
/* Every frame: glide each voice toward its level, so changes are smooth, and play any wave that broke. */
function soundUpdate(S){
  if(!SOUND.on||!S) return;
  if(SOUND.ctx.state!=='running') soundWake();
  soundSample(S);
  if(!SOUND.voices){ SOUND.crashes.length=0; return; }
  const t=SOUND.ctx.currentTime,x=soundMix(S,SOUND.lv);
  SOUND.voices.set(x,t,SOUND.first); SOUND.first=false;
  for(const e of SOUND.crashes){ const c=crashOf(S,e,x); if(c) SOUND.voices.crash(t+.02,c); }
  SOUND.crashes.length=0;
}

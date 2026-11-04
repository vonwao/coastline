'use strict';
/* ---- Sound: the sea, driven by the simulation ----
   Press S to turn it on (browsers allow sound to start only after a key press or click).

   Twice a second the foam field is shrunk to a 24 by 48 grid on the GPU and read back without stalling
   (into a pixel buffer, collected a few frames later, when a fence says the GPU has finished). Each cell
   holds how much fresh white water (bubbles) and lingering foam it has. Weighted by distance from the
   drone, that gives three levels:
     roar   fresh breaking near the drone: deep, rumbling noise, brighter as it grows
     hiss   foam fizzing on the sand and in the shallows: high, soft noise
     bed    the distant surf of the whole coast: a low, steady wash
   plus wind, stronger in moody and stormy light. Height mutes the high sounds first, as distance does
   in air, so a high top-down view is a soft wash and a low pass is loud and close.
   All sounds are filtered noise, made in the browser; no recordings. */
const SOUND={on:false,ctx:null,nodes:null,lv:{roar:0,hiss:0,bed:0},pend:null,next:0,tex:null,fbo:null,pbo:null,data:null};
const SND_W=24,SND_H=48;
const FS_SND=HEAD+`
in vec2 vUV; out vec4 o; uniform sampler2D tFx; uniform float uLod;
void main(){ vec4 f=textureLod(tFx,vUV,uLod); o=vec4(clamp(f.r,0.,1.),clamp(f.g*2.,0.,1.),0.,1.); }`;

function noiseBuffer(ctx,kind){
  /* Ten seconds of noise, looped. Brown noise (each sample a small step from the last) is deep and
     rumbling; white noise is bright. */
  const n=ctx.sampleRate*10,b=ctx.createBuffer(2,n,ctx.sampleRate);
  for(let c=0;c<2;c++){ const d=b.getChannelData(c); let last=0;
    for(let i=0;i<n;i++){ const w=Math.random()*2-1; if(kind==='brown'){ last=(last+.02*w)/1.02; d[i]=last*3.5; } else d[i]=w*.5; } }
  return b;
}
function soundInit(){
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const master=ctx.createGain(); master.gain.value=0; master.connect(ctx.destination);
  const brown=noiseBuffer(ctx,'brown'),white=noiseBuffer(ctx,'white');
  const chain=(buf,type,freq,q)=>{
    const s=ctx.createBufferSource(); s.buffer=buf; s.loop=true; s.loopStart=Math.random()*5;
    const f=ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
    const g=ctx.createGain(); g.gain.value=0;
    s.connect(f); f.connect(g); g.connect(master); s.start(0,Math.random()*9);
    return {f,g};
  };
  SOUND.nodes={master,
    bed:chain(brown,'lowpass',260,.5),
    roar:chain(brown,'lowpass',500,.7),
    hiss:chain(white,'bandpass',4200,.6),
    wind:chain(white,'bandpass',700,1.4)};
  SOUND.ctx=ctx;
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
      gl.deleteSync(SOUND.pend.sync); soundLevels(SOUND.pend.L,SOUND.pend.cam); SOUND.pend=null;
    }
  }
  if(performance.now()<SOUND.next||!L.fx) return;
  SOUND.next=performance.now()+500;
  use(PR.snd,{tFx:L.fx[L.fi],uLod:Math.max(0,Math.log2(L.nx/SND_W)-.5)}); drawTo(SOUND.fbo);
  gl.bindFramebuffer(gl.FRAMEBUFFER,SOUND.fbo); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,SOUND.pbo);
  gl.readPixels(0,0,SND_W,SND_H,gl.RGBA,gl.UNSIGNED_BYTE,0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const cam=cameraFor(S,Math.min(S.t/S.dur,1),S.camT!==undefined?S.camT:performance.now()*.001,1);
  SOUND.pend={sync:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),L,cam:cam.ro};
}
function soundLevels(L,ro){
  /* The grid runs across the shore in x (24 cells) and along it in z (48). Each cell is heard as a
     sound source: loudness falls with distance like spreading sound, so foam right below the drone
     counts most, and distant surf adds up to a wash. Levels are compressed (1-e^-x), like the ear. */
  const D=SOUND.data,cell=L.domSize[0]/SND_W*L.domSize[1]/SND_H; let roar=0,hiss=0;
  for(let j=0;j<SND_H;j++)for(let i=0;i<SND_W;i++){
    const x=L.domMin[0]+(i+.5)/SND_W*L.domSize[0],z=L.domMin[1]+(j+.5)/SND_H*L.domSize[1];
    const d2=(x-ro[0])**2+ro[1]**2+(z-ro[2])**2,w=cell/(d2+400);
    const k=(j*SND_W+i)*4,foam=D[k]/255,bub=D[k+1]/255;
    roar+=bub*w; hiss+=foam*w;
  }
  SOUND.raw={roar,hiss};
  SOUND.lv={roar:1-Math.exp(-roar*SOUND.kR),hiss:1-Math.exp(-hiss*SOUND.kH),bed:Math.min(1,.25+L.Hs*.35),alt:ro[1]};
}
SOUND.kR=4; SOUND.kH=2;
/* Every frame: glide each sound toward its level, so changes are smooth. */
function soundUpdate(S){
  if(!SOUND.on||!S) return;
  soundSample(S);
  const N=SOUND.nodes,t=SOUND.ctx.currentTime,v=SOUND.lv,L=S.L,Li=LIGHTS[S.lightKey];
  const alt=v.alt||60, near=1/(1+alt/40);
  const calm=L.water==='lake'?.35:1;
  const set=(p,x,tc)=>p.setTargetAtTime(x,t,tc);
  set(N.bed.g.gain,.22*v.bed*calm,.8);
  set(N.bed.f.frequency,180+120*v.bed,.8);
  set(N.roar.g.gain,.9*v.roar*(.35+.65*near)*calm,.25);
  set(N.roar.f.frequency,280+900*v.roar*near,.3);
  set(N.hiss.g.gain,.30*v.hiss*near*calm,.3);
  set(N.hiss.f.frequency,2600+2400*near,.5);
  const wind=.04+.10*(Li.cover||0)+(S.lightKey==='storm'||Li.storm?.10:0);
  set(N.wind.g.gain,wind*(.6+.4*Math.sin(t*.13)*Math.sin(t*.071+1.)),1.2);
  set(N.wind.f.frequency,500+260*Math.sin(t*.09),2);
}

'use strict';
/* ---------------------------------------------------------------- Global resources -- */
const PR={};
let crownTex=[],rockTex=null;
let noiseTex,noise3Tex,laceTex,fftInit,fftFinal,fftA,fftB,fftFA,fftFB,fftFF,causTex,causFBO,causIdx,causVAO,causCount;
const FFT_N=256, FFT_L=64;
let simTime=0;
/* Time on the GPU is a 32-bit float, which keeps only about seven digits. After a week of running, a
   clock in seconds moves in steps of a sixteenth of a second, so the ripples froze and jumped. So every
   wave's frequency is rounded to a whole number of cycles in a fixed period (FFT_P for the ripples,
   SIM_P for each coast's swell), too small a change to see, and the shaders are given time within that
   period, which repeats the waves exactly. SIM_P is also a whole number of foam cycles (6 s and 2.6 s). */
const FFT_P=1000, SIM_P=3900;
/* A coast's own clock, which also drives its fish, plants and cloud shadows, is wound back by whole
   periods when it comes on screen, where the jump can't be seen. */
function timeRebase(L){ if(L.t>SIM_P) L.t%=SIM_P; }

function buildPrograms(){
  const P=(n,f,v)=>PR[n]=makeProgram(n,f,v);
  P('noise',FS_NOISE);P('noise3',FS_NOISE3);P('clouds',FS_CLOUDS);P('lace',FS_LACE);P('crown',FS_CROWN);P('rockH',FS_ROCKH);P('rockN',FS_ROCKN);P('plantBake',FS_PLANT_BAKE,VS_PLANT_BAKE);P('plantList',FS_PLANT_LIST);P('mesh',FS_MESH,VS_MESH);P('cards',FS_CARDS,VS_CARDS);P('spec',FS_SPEC);P('fft',FS_FFT);P('copy',FS_COPY);
  P('caus',FS_CAUS,VS_CAUS);P('sky',FS_SKY);FS_TERRAIN_KINDS.forEach((f,i)=>P('terrain'+i,f));P('terrainMix',FS_TERRAIN_MIX);P('lit',FS_LIT);P('grid',FS_GRID);
  P('simInit',FS_SIMINIT);P('simU',FS_SIMU);P('simH',FS_SIMH);P('simRM',FS_SIMRM);P('foam',FS_FOAM);
  P('sprayStep',FS_SPRAY_STEP);P('spray',FS_SPRAY,VS_SPRAY);P('brk',FS_BRK);P('brkRow',FS_BRKROW);P('lip',FS_LIP,VS_LIP);P('viewA',FS_VIEW_A);P('viewB',FS_VIEW_B);P('viewC',FS_VIEW_C);P('viewW',FS_VIEW_W);P('label',FS_LABEL);P('bdown',FS_BDOWN);P('bup',FS_BUP);P('tone',FS_TONE);P('mix',FS_MIX);P('final',FS_FINAL);P('taa',FS_TAA);P('people',FS_PEOPLE,VS_PEOPLE);
  P('snd',FS_SND);
  if(REAL_COAST) P('terrainReal',FS_TERRAIN_REAL);
}

function gaussian(){ return Math.sqrt(-2*Math.log(1-Math.random()))*Math.cos(2*Math.PI*Math.random()); }
function buildFFT(){
  const N=FFT_N,L=FFT_L,g=9.81,U=7.5,wa=Math.atan2(.12,-1);
  const Wx=Math.cos(wa),Wz=Math.sin(wa),LL=U*U/g,small=L/N*.9;
  const h0=new Float64Array(N*N*2);
  const nk=(i)=>i<N/2?i:i-N;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const kx=nk(i)*2*Math.PI/L,kz=nk(j)*2*Math.PI/L,k=Math.hypot(kx,kz);
    let P=0;
    if(k>1e-5){ const c=(kx*Wx+kz*Wz)/k; let d=c*c; if(c<0) d*=.14;
      P=Math.exp(-1/(k*LL*k*LL))/(k*k*k*k)*d*Math.exp(-k*k*small*small*.25);
      /* A wind sea with extra short-wave energy, for visible ripples */
      P*=1+ .9*Math.min(1,k/3);
    }
    const s=Math.sqrt(P/2);
    h0[(j*N+i)*2]=gaussian()*s; h0[(j*N+i)*2+1]=gaussian()*s;
  }
  let e=0; for(let i=0;i<h0.length;i++) e+=h0[i]*h0[i]; e*=2;
  const nrm=.115/Math.sqrt(e);
  const data=new Float32Array(N*N*4);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const a=(j*N+i)*2, im=((N-i)%N),jm=((N-j)%N),b=(jm*N+im)*2,d=(j*N+i)*4;
    data[d]=h0[a]*nrm;data[d+1]=h0[a+1]*nrm;data[d+2]=h0[b]*nrm;data[d+3]=-h0[b+1]*nrm;
  }
  fftInit=makeTex(N,N,{fmt:'RGBA32F',filter:'nearest',data});
  fftA=makeTex(N,N,{fmt:'RGBA32F',filter:'nearest'}); fftB=makeTex(N,N,{fmt:'RGBA32F',filter:'nearest'});
  fftFA=makeFBO(fftA); fftFB=makeFBO(fftB);
  fftFinal=makeTex(N,N,{mips:true,wrap:'repeat',aniso:4}); fftFF=makeFBO(fftFinal);
  causTex=makeTex(512,512,{mips:true,wrap:'repeat'}); causFBO=makeFBO(causTex);
  const G=256,verts=[],idx=[];
  for(let j=0;j<=G;j++)for(let i=0;i<=G;i++) verts.push(-.12+1.24*i/G,-.12+1.24*j/G);
  const vw=G+1;
  for(let j=0;j<G;j++)for(let i=0;i<G;i++){ const a=j*vw+i; idx.push(a,a+1,a+vw,a+1,a+vw+1,a+vw); }
  causVAO=gl.createVertexArray(); gl.bindVertexArray(causVAO);
  const vb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(idx),gl.STATIC_DRAW);
  causCount=idx.length;
  gl.bindVertexArray(null); gl.bindVertexArray(gl.createVertexArray());
}
function stepFFT(t){
  const N=FFT_N;
  use(PR.spec,{tH0:fftInit,uT:t%FFT_P,uW0:2*Math.PI/FFT_P,uL:FFT_L,uN:N}); drawTo(fftFA);
  let src=fftA,dstF=fftFB,dst=fftB;
  const passes=Math.log2(N);
  for(let d=0;d<2;d++) for(let i=0;i<passes;i++){
    use(PR.fft,{tI:src,uN:N,uSub:Math.pow(2,i+1),uH:d===0?1:0}); drawTo(dstF);
    const tt=src; src=dst; dst=tt; dstF=dstF===fftFA?fftFB:fftFA;
  }
  use(PR.copy,{tI:src}); drawTo(fftFF);
  gl.bindTexture(gl.TEXTURE_2D,fftFinal); gl.generateMipmap(gl.TEXTURE_2D);
  /* Caustics: push a mesh through the refracting surface and measure how it concentrates. */
  gl.bindFramebuffer(gl.FRAMEBUFFER,causFBO); gl.viewport(0,0,512,512);
  gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
  use(PR.caus,{tFFT:fftFinal,uD:.085});
  gl.bindVertexArray(causVAO); gl.drawElements(gl.TRIANGLES,causCount,gl.UNSIGNED_INT,0);
  gl.bindVertexArray(null); gl.bindVertexArray(emptyVAO);
  gl.disable(gl.BLEND);
  gl.bindTexture(gl.TEXTURE_2D,causTex); gl.generateMipmap(gl.TEXTURE_2D);
}
let emptyVAO;

function sunVec(L){ const e=deg(L.el),a=deg(L.az); return [Math.cos(e)*Math.cos(a),Math.sin(e),Math.cos(e)*Math.sin(a)]; }
function sunIrr(L){
  /* Sunlight through the air: the lower the sun, the longer its path and the redder and weaker it gets.
     The sun's disc sets between 0 and -1 degrees; below that there's no direct light. */
  const d=Math.max(L.el,0),y=Math.sin(deg(d));
  const m=1/(y+.15*Math.pow(d+3.885,-1.253));
  const bR=[5.8e-3,13.5e-3,33.1e-3],set=Math.min(Math.max(L.el+1,0),1);
  return bR.map(b=>20*.92*Math.exp(-m*(b*8+21e-3*1.2*L.turb))*set);
}
/* One lighting setup: its sun direction and strength, and its sky painted into a texture. skyK dims the
   sky (used at night). */
function bakeEnv(L){
  L.sun=sunVec(L); L.sunE=sunIrr(L).map(x=>x*(L.sunK??1));
  /* At night, the scale that makes the moon's face as bright on screen as moonT, whatever its phase. */
  if(L.moonLit){ const y=.2126*L.sunE[0]+.7152*L.sunE[1]+.0722*L.sunE[2]; L.moonK=(L.moonT??2.8)/(L.exposure*Math.max(y,1e-6)); }
  L.env=makeTex(1024,512,{mips:true,wrap:'repeat',wrapT:'clamp'});
  /* The same sky without clouds: the cloud pass (FS_CLOUDS) draws the clouds on screen over it. */
  L.envC=makeTex(1024,512,{wrap:'repeat',wrapT:'clamp'});
  const f=makeFBO(L.env,L.envC);
  use(PR.sky,{tNoise:noiseTex,tN3:noise3Tex,uSun:L.sun,uCover:L.cover,uTurb:L.turb,uSeed:L.seed,uDark:L.dark||0,uSkyK:L.skyK??1}); drawTo(f);
  gl.bindTexture(gl.TEXTURE_2D,L.env); gl.generateMipmap(gl.TEXTURE_2D);
  gl.deleteFramebuffer(f);
}
/* Frees a lighting setup's sky textures, when the setup is no longer wanted. */
function freeEnv(L){ if(!L) return; if(L.env) gl.deleteTexture(L.env); if(L.envC) gl.deleteTexture(L.envC); L.env=L.envC=null; }
function buildEnvs(){ for(const k in SKY_PRESETS) if(!LIGHTS[k]) LIGHTS[k]=skyPreset(k); for(const k in LIGHTS) bakeEnv(LIGHTS[k]); }

/* Palm cove's boulders: reshaped since 8 November (js/shaders/terrain.js, uBoulderV; CHANNEL.md D13);
   ?boulders=1 shows the old smooth domes, to compare. */
const BOULDER_V=new URLSearchParams(location.search).get('boulders')==='1'?0:1;
/* Bake one terrain texture in tiles, so a single huge draw never stalls the GPU. */
/* gentle: behind a running picture (coastBuild). Then the texture is drawn in thin strips, one a frame,
   each as tall as leaves the picture's frames nearly on time (the terrain shaders are slow: a sixteenth of
   a rocky coast at once held the picture for a fifth of a second). */
async function bakeTerrain(tex,type,seed,min,size,near,tiles,form=0,half=0,gentle=null){
  const f=makeFBO(tex);
  const TP=form>=3?PR.terrainMix:PR['terrain'+type];
  const U={tNoise:noiseTex,uMin:min,uSize:size,uSeed:seed,uType:type,uForm:form,uHalf:half,uNear:near?1:0,uTexel:size[0]/tex.w,...(form>=3?{uBoulderV:BOULDER_V}:{})};
  use(TP,U);
  gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.viewport(0,0,tex.w,tex.h);
  gl.enable(gl.SCISSOR_TEST);
  /* After a frame the frame loop may have drawn: the program, its textures and the state are set again. */
  const pause=async()=>{ gl.disable(gl.SCISSOR_TEST); await nextFrame(); use(TP,U); gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.viewport(0,0,tex.w,tex.h); gl.enable(gl.SCISSOR_TEST); };
  let y=0;
  if(gentle&&gentle.on){
    let rows=Math.max(2,Math.round(6000/tex.w)), last=performance.now();
    while(y<tex.h&&gentle.on){
      const h=Math.min(rows,tex.h-y);
      gl.scissor(0,y,tex.w,h); gl.drawArrays(gl.TRIANGLES,0,3); y+=h;
      await pause();
      const now=performance.now(),d=now-last,fr=Math.max(state.dtAvg||16.7,16.7); last=now;
      if(d>fr*1.45) rows=Math.max(1,Math.floor(rows*.6)); else if(d<fr*1.2) rows=Math.min(tex.h>>3,Math.ceil(rows*1.3));
    }
  }
  /* The rest (all of it, unless gentle): in tiles, two a frame. */
  for(let j=0;j<tiles;j++)for(let i=0;i<tiles;i++){
    const x0=Math.floor(tex.w*i/tiles),x1=Math.floor(tex.w*(i+1)/tiles),y0=Math.max(y,Math.floor(tex.h*j/tiles)),y1=Math.floor(tex.h*(j+1)/tiles);
    if(y1<=y0) continue;
    gl.scissor(x0,y0,x1-x0,y1-y0); gl.drawArrays(gl.TRIANGLES,0,3);
    if(i%2===1) await pause();
  }
  gl.disable(gl.SCISSOR_TEST);
  gl.bindTexture(gl.TEXTURE_2D,tex); gl.generateMipmap(gl.TEXTURE_2D);
  gl.deleteFramebuffer(f);
}
function buildSwell(L){
  const n=8,k=new Float32Array(32),a=new Float32Array(8);
  const c=Math.sqrt(9.81*L.hmax);
  let e=0; const w=[];
  for(let i=0;i<n;i++){ const f=i/(n-1); const wt=Math.exp(-Math.pow((f-.42)/.32,2)); w.push(wt); e+=wt; }
  for(let i=0;i<n;i++){
    const f=i/(n-1);
    const T=L.T*(1.28-.56*f);
    const om=Math.max(1,Math.round(SIM_P/T))*2*Math.PI/SIM_P,kk=om/c;
    /* spread: how widely the wave directions fan out, in degrees. Swell arrives in neat rows; waves
       raised by wind on a lake come from many directions at once. */
    const ang=deg(L.obl+(Math.random()-.5)*(L.spread||26));
    k[i*4]=-kk*Math.cos(ang); k[i*4+1]=kk*Math.sin(ang); k[i*4+2]=om; k[i*4+3]=Math.random()*6.283;
    /* The squares of the amplitudes add up to Hs²/8, so the surface's variance is Hs²/16 and its
       significant height (four standard deviations) is Hs, as the coast says and as the forecast means in
       real-conditions mode. Until 6 November they added up to Hs²/2, which made every sea twice its stated
       height (TECHLOG 56, 57). ?swellk= scales the swell alone, for test pictures. */
    a[i]=(L.Hs/4)*Math.sqrt(2*w[i]/e)*(Q.has('swellk')?+Q.get('swellk'):1);
  }
  L.swK=k;L.swA=a;
}
function simUniforms(L){
  return {uDx:L.dx,uHmax:L.hmax,uTide:0,uT:L.t,uCells:[L.nx,L.nz],uDomMin:L.domMin,uSwK:L.swK,uSwA:L.swA,uSpongeN:44};
}
function setI2(P,name,v){ gl.useProgram(P.p); if(P.u[name]) gl.uniform2i(P.u[name].loc,v[0],v[1]); }
function simVals(L,dt){ return {uRockEta:L.type===2?1:0,uBreakD:Math.max(L.Hs*1.35,.5),uDx:L.dx,uDt:dt,uHmax:L.hmax,uTide:0,uT:L.t,uDomMin:L.domMin,uSwK:L.swK,uSwA:L.swA,uSpongeN:44}; }
function simPass(P,extra,L,dt,target){
  use(P,Object.assign(simVals(L,dt),extra)); setI2(P,'uCells',[L.nx,L.nz]);
  // use() leaves the program bound; textures are bound by this point.
  drawTo(target);
}
function simStep(L,dt){
  simPass(PR.simU,{tS:L.s[0],uN2:L.n2},L,dt,L.sf[1]);
  simPass(PR.simH,{tS:L.s[1]},L,dt,L.sf[0]);
  L.t+=dt;
}
const ADV_P=6;
function advPeriod(L){ return L.kind==='rocky'?2.6:ADV_P; }
function foamStep(L,dt){
  const pre=L.t-dt;
  const P=advPeriod(L);
  const fa=Math.floor(pre/P)!==Math.floor(L.t/P);
  const fb=Math.floor(pre/P+.5)!==Math.floor(L.t/P+.5);
  const W=waterOf(L);
  const i=L.fi,o=1-i;
  simPass(PR.foam,{tS:L.s[0],tFx:L.fx[i],tAdv:L.adv[i],tNoise:noiseTex,uDomSize:L.domSize,uReset:[fa?1:0,fb?1:0],
    uDecay:W.decay,uFoamGen:W.foamGen,uSedGen:W.sedGen,uTau:W.tau,uBreakD:Math.max(L.Hs*1.35,.5)},L,dt,L.ff[o]);
  L.fi=o;
}
const SPRAY_N=HQ?512:256;
function initSpray(L){
  const mk=()=>makeTex(SPRAY_N,SPRAY_N,{fmt:'RGBA32F',filter:'nearest'});
  L.sp=[mk(),mk()]; L.sv=[mk(),mk()]; L.spF=[makeFBO(L.sp[0],L.sv[0]),makeFBO(L.sp[1],L.sv[1])]; L.si=0;
  for(const f of L.spF){ gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); }
}
function sprayStep(L,dt){
  const i=L.si,o=1-i;
  simPass(PR.sprayStep,{tS:L.s[0],tP:L.sp[i],tV:L.sv[i],tBrk:L.brk,uBand:Q.has('nobreakers')?[0,0]:[L.brkX0,L.brkX1],uRocky:L.kind==='rocky'?1:0},L,dt,L.spF[o]);
  L.si=o;
}
function rmPass(L){
  simPass(PR.simRM,{tS:L.s[0]},L,.01,L.rmF);
  gl.bindTexture(gl.TEXTURE_2D,L.fx[L.fi]); gl.generateMipmap(gl.TEXTURE_2D);
  brkPass(L);
}
/* Breaking crests, for the lips drawn over them (js/shaders/breakers.js). Only the strip of the coast
   where waves can break is looked at; the rest of the texture stays empty. */
function initBreakers(L){
  L.brk=makeTex(L.nx,L.nz,{fmt:'RGBA32F',filter:'nearest'}); L.brkF=makeFBO(L.brk);
  gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
  L.brkRow=makeTex(BRK_K,L.nz,{fmt:'RGBA32F',filter:'nearest'}); L.brkRowF=makeFBO(L.brkRow);
  gl.clearColor(-1,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.clearColor(0,0,0,0);
  const bd=Math.max(L.Hs*1.35,.5); let x0=L.gw,x1=-1;
  for(let j=0;j<L.gh;j++)for(let i=0;i<L.gw;i++){ const b=L.grid[j*L.gw+i]; if(b>-bd*1.8-.4&&b<.8){ if(i<x0) x0=i; if(i>x1) x1=i; } }
  L.brkX0=x1<0?0:Math.max(0,Math.floor((x0-1)/(L.gw-1)*L.nx));
  L.brkX1=x1<0?0:Math.min(L.nx,Math.ceil((x1+1)/(L.gw-1)*L.nx));
}
function brkPass(L){
  if(!L.brk||L.brkX1<=L.brkX0) return;
  gl.enable(gl.SCISSOR_TEST); gl.scissor(L.brkX0,0,L.brkX1-L.brkX0,L.nz);
  simPass(PR.brk,{tRM0:L.rm0,tS:L.s[0],tFx:L.fx[L.fi]},L,.01,L.brkF);
  gl.disable(gl.SCISSOR_TEST);
}
function bakeLit(L,lightKey){
  const S=LIGHTS[lightKey];
  if(L.litKey===lightKey&&L.litObj===S) return;
  L.litObj=S;
  use(PR.lit,{tT:L.terr,uSun:S.sun,uSize:L.domSize,uMaxH:L.maxH}); drawTo(L.litF);
  use(PR.lit,{tT:L.terrF,uSun:S.sun,uSize:[FAR_SPAN,FAR_SPAN],uMaxH:L.maxH}); drawTo(L.litFF);
  L.litKey=lightKey;
}
function readGrid(L){
  const gw=128,gh=256; const t=makeTex(gw,gh,{fmt:'RGBA32F',filter:'nearest'}); const f=makeFBO(t);
  use(PR.grid,{tT:L.terr}); drawTo(f);
  const a=new Float32Array(gw*gh*4); gl.readPixels(0,0,gw,gh,gl.RGBA,gl.FLOAT,a);
  L.grid=new Float32Array(gw*gh); L.gridI=new Float32Array(gw*gh); L.gridR=new Float32Array(gw*gh);
  for(let i=0;i<gw*gh;i++){ L.grid[i]=a[i*4]; L.gridI[i]=(a[i*4]>0.4?Math.max(a[i*4+2],a[i*4+1]*(a[i*4]>2.5?1:0)):0); L.gridR[i]=a[i*4+1]; }
  L.gw=gw;L.gh=gh;
  gl.deleteFramebuffer(f); gl.deleteTexture(t);
}
function groundAt(L,x,z){
  const u=Math.min(Math.max((x-L.domMin[0])/L.domSize[0],0),.9999)*(L.gw-1), v=Math.min(Math.max((z-L.domMin[1])/L.domSize[1],0),.9999)*(L.gh-1);
  const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,G=L.grid,w=L.gw;
  return (G[j*w+i]*(1-a)+G[j*w+i+1]*a)*(1-b)+(G[(j+1)*w+i]*(1-a)+G[(j+1)*w+i+1]*a)*b;
}
function inlandAt(L,x,z){
  const u=Math.min(Math.max((x-L.domMin[0])/L.domSize[0],0),.9999)*(L.gw-1), v=Math.min(Math.max((z-L.domMin[1])/L.domSize[1],0),.9999)*(L.gh-1);
  return L.gridI[Math.floor(v)*L.gw+Math.floor(u)];
}
/* How much of the ground is rock (0 sand or soil, 1 rock), from the same coarse grid. */
function rockAt(L,x,z){
  if(!L.gridR) return 0;
  const u=Math.min(Math.max((x-L.domMin[0])/L.domSize[0],0),.9999)*(L.gw-1), v=Math.min(Math.max((z-L.domMin[1])/L.domSize[1],0),.9999)*(L.gh-1);
  return L.gridR[Math.round(v)*L.gw+Math.round(u)];
}
function shoreAt(L,z){
  const x1=L.domMin[0]+L.domSize[0]*.97;
  for(let x=x1;x>L.domMin[0];x-=1.5*L.dx*2){ if(groundAt(L,x,z)>0) return x; }
  return L.domMin[0]+40;
}
function maxGroundNear(L,cx,cz,r){
  let m=0; for(let j=-8;j<=8;j++)for(let i=-8;i<=8;i++){ m=Math.max(m,groundAt(L,cx+i*r/8,cz+j*r/8)); } return m;
}

/* gentle ({on:true}): built behind a running picture, a little each frame, so the picture doesn't stutter;
   switching it off part way hurries the rest (coastBuild). */
async function buildLocation(L,progress,gentle=null){
  progress=progress||(()=>{});
  const soft=()=>!!(gentle&&gentle.on);
  const zc=0;
  L.domMin=[L.xMin,zc-L.nz*L.dx*.5];
  L.domSize=[L.nx*L.dx,L.nz*L.dx];
  L.n2=L.water?.0008:L.kind==='rocky'?.0011:L.kind==='surf'?.00065:.00075;
  buildSwell(L);
  L.phase='terrain';
  /* Rock needs a finer height map than sand does. */
  const nearW=L.kind==='rocky'?Math.min(L.nx*3,HQ?2400:1792):Math.min(L.nx*2,HQ?2048:1536),nearH=L.kind==='rocky'?Math.min(L.nz*3,HQ?3400:3072):Math.min(L.nz*2,HQ?3000:2048);
  L.terr=makeTex(nearW,nearH,{mips:true,aniso:4});
  /* Half floats keep heights to about one part in 2000: fine for coasts, but on a 2000 m mountain that is
     a metre, and slopes came out as stairs, with saw-toothed ridges. Mountains get full floats. */
  L.terrF=makeTex(FAR_RES,FAR_RES,{mips:true,aniso:4,fmt:L.maxH>1000?'RGBA32F':'RGBA16F'});
  if(L.real){ await bakeRealTerrain(L,L.terr,true); progress(.25); await bakeRealTerrain(L,L.terrF,false); } else {
  await bakeTerrain(L.terr,L.type,L.seed,L.domMin,L.domSize,true,4,L.form||0,L.domSize[1]*.5,gentle);
  progress(.25); L.phase='far terrain';
  await bakeTerrain(L.terrF,L.type,L.seed,[-FAR_SPAN*.5+L.domMin[0]+L.domSize[0]*.5,-FAR_SPAN*.5],[FAR_SPAN,FAR_SPAN],false,2,L.form||0,L.domSize[1]*.5,gentle);
  }
  L.farMin=[-FAR_SPAN*.5+L.domMin[0]+L.domSize[0]*.5,-FAR_SPAN*.5];
  L.phase='textures';
  /* Behind a running picture, the steps that each take a while (reading the height grid back, making a
     dozen textures) get a frame of their own. */
  if(soft()) await nextFrame();
  readGrid(L);
  if(soft()) await nextFrame();
  L.lit=makeTex(nearW,nearH,{fmt:'RGBA8'}); L.litF=makeFBO(L.lit);
  L.litFar=makeTex(512,512,{fmt:'RGBA8'}); L.litFF=makeFBO(L.litFar);
  L.s=[makeTex(L.nx,L.nz,{fmt:'RGBA32F',filter:'nearest'}),makeTex(L.nx,L.nz,{fmt:'RGBA32F',filter:'nearest'})];
  L.sf=L.s.map(t=>makeFBO(t));
  L.fx=[makeTex(L.nx,L.nz,{mips:true}),makeTex(L.nx,L.nz,{mips:true})];
  L.adv=[makeTex(L.nx,L.nz),makeTex(L.nx,L.nz)];
  L.ff=[makeFBO(L.fx[0],L.adv[0]),makeFBO(L.fx[1],L.adv[1])];
  for(const f of L.ff){ gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); }
  L.fi=0;
  L.rm0=makeTex(L.nx,L.nz); L.rm1=makeTex(L.nx,L.nz); L.rmF=makeFBO(L.rm0,L.rm1);
  initBreakers(L);
  if(soft()) await nextFrame();
  L.t=0;
  use(PR.simInit,Object.assign(simVals(L,.01),{tT:L.terr})); setI2(PR.simInit,'uCells',[L.nx,L.nz]);
  drawTo(L.sf[0]);
  L.phase='waves';
  /* Spin up. Waves need about one crossing of the shoaling zone to develop. */
  const dt=Math.min(.033,.24*L.dx/Math.sqrt(9.81*L.hmax+1));
  const total=L.spin||(TEST?26:26);
  const steps=Math.ceil(total/dt); let done=0; let chunk=soft()?4:30;
  let last=performance.now();
  while(done<steps){
    const n=Math.min(chunk,steps-done);
    for(let i=0;i<n;i++){ simStep(L,dt); if((done+i)%2===1) foamStep(L,dt*2); }
    done+=n; progress(.3+.7*done/steps);
    await nextFrame();
    const now=performance.now(),d=now-last; last=now;
    /* Behind a running picture, only as many steps as leave its frames nearly on time. */
    if(soft()){ const f=Math.max(state.dtAvg||16.7,16.7); if(d>f*1.45) chunk=Math.max(1,Math.floor(chunk*.7)); else if(d<f*1.2) chunk=Math.min(40,chunk+1); }
    else if(d>70) chunk=Math.max(6,Math.floor(chunk*.75)); else if(d<34) chunk=Math.min(180,Math.floor(chunk*1.25));
  }
  if(soft()) await nextFrame();
  rmPass(L);
  /* Spray: off rock on rocky coasts, and off breaking crests everywhere but the lake. */
  if(L.water!=='lake') initSpray(L);
  L.dtStep=1/60; L.phase='';
  L.builtAt=performance.now();
  L.ready=true;
}
/* ---- Coasts are built when they're needed, and put away again ----
   A built coast holds 100 to 170 MB of textures; building all eleven at the start took 11 s and 1.5 GB.
   The slideshow (no ?only=, recipe, mood, reel or studio) starts with one coast and keeps COAST_KEEP built:
   the one on screen and two more. When every built coast has had its turn on screen, the one built longest
   ago is put away and another is built in its place, behind the running picture (coastTend, called by the
   frame loop). chooseNext (js/frame.js) shows a newly built coast first, so all coasts come round: each
   is shown about twice before it is put away. (Putting away the one shown longest ago instead kept one
   coast for good, alternating with each newcomer.)
   Tools, checks and anything that names its coasts build them all at the start, as before (COASTS.auto
   stays false). Decision and numbers: TECHLOG 66. */
const COAST_KEEP=3;
const COASTS={auto:false,busy:null,chain:Promise.resolve(),now:null};
/* Put a built coast away: everything buildLocation made for it. Its settings (waves, name, shape) stay,
   so it can be built again exactly as it was. */
function freeLocation(L){
  if(!L.ready) return;
  L.ready=false;
  for(const k of ['terr','terrF','lit','litFar','rm0','rm1','brk','brkRow']){ if(L[k]) gl.deleteTexture(L[k]); L[k]=null; }
  for(const k of ['s','fx','adv','sp','sv']){ if(L[k]) L[k].forEach(t=>gl.deleteTexture(t)); L[k]=null; }
  for(const k of ['litF','litFF','rmF','brkF','brkRowF']){ if(L[k]) gl.deleteFramebuffer(L[k]); L[k]=null; }
  for(const k of ['sf','ff','spF']){ if(L[k]) L[k].forEach(f=>gl.deleteFramebuffer(f)); L[k]=null; }
  L.grid=L.gridI=L.gridR=null; L.litKey=null; L.litObj=null; L.shownAt=0;
}
/* Build a coast if it isn't built: one at a time, in the order asked. gentle: behind the running picture.
   A build asked for without gentle (the viewer is waiting) also hurries the one under way. */
function coastBuild(L,gentle){
  if(L.ready) return Promise.resolve(L);
  if(!gentle){ if(COASTS.now) COASTS.now.on=false; if(L.buildOpt) L.buildOpt.on=false; }
  if(L.building) return L.building;
  const opt=L.buildOpt={on:!!gentle};
  const run=async()=>{ COASTS.now=opt; try{ await buildLocation(L,null,opt); } finally { COASTS.now=null; L.building=null; L.buildOpt=null; } return L; };
  COASTS.chain=L.building=COASTS.chain.then(run,run);
  return L.building;
}
/* A coast has come on screen. */
function coastShown(L){ L.shownAt=L.lastShown=performance.now(); }
/* The coasts the slideshow may show now: in real-conditions mode only those that suit today's sea (any sea
   coast, but not the mountain lake, while the first forecast is awaited); playing favourites, theirs. */
function coastEligible(){
  if(state.favOnly){ const names=new Set(loadFavs().map(F=>F.loc)), f=LOCATIONS.filter(L=>names.has(L.name)); if(f.length) return f; }
  return LIVE.on?LOCATIONS.filter(L=>LIVE.locs?LIVE.locs.includes(L):L.form!==6):LOCATIONS;
}
/* Which coast the next shot shows: one just built that hasn't been on screen yet, else any other built one. */
function coastNext(prev){
  const ready=LOCATIONS.filter(L=>L.ready), el=coastEligible(), pool=ready.filter(L=>el.includes(L));
  const opts=pool.filter(L=>!prev||L!==prev.L), fresh=COASTS.auto?opts.filter(L=>!L.shownAt):[];
  return pick(fresh.length?fresh:opts.length?opts:pool.length?pool:ready);
}
/* Once a second from the frame loop, in the slideshow: keep COAST_KEEP coasts built, and bring a new one in
   when the built ones have all been shown. */
function coastTend(){
  if(!COASTS.auto||COASTS.busy||!state.cur) return;
  const pinned=L=>L===state.cur.L||(state.next&&L===state.next.L)||L===state.upL;
  const built=LOCATIONS.filter(L=>L.ready), el=coastEligible();
  /* Put away: a coast that no longer suits first, then the one built longest ago. Never one on screen, nor
     one still waiting for its first turn. */
  const evict=()=>{
    const v=built.filter(L=>!pinned(L)&&(L.shownAt||!el.includes(L))).sort((a,b)=>(el.includes(a)-el.includes(b))||(a.builtAt-b.builtAt))[0];
    if(v){ freeLocation(v); built.splice(built.indexOf(v),1); }
    return !!v;
  };
  while(built.length>COAST_KEEP&&evict());
  if(built.length>=COAST_KEEP&&built.some(L=>!L.shownAt&&el.includes(L))) return;
  const cand=el.filter(L=>!L.ready&&!L.buildFailed); if(!cand.length) return;
  const least=Math.min(...cand.map(L=>L.lastShown||0));
  const L=pick(cand.filter(L=>(L.lastShown||0)===least));
  if(built.length>=COAST_KEEP&&!evict()) return;
  COASTS.busy=L;
  coastBuild(L,true).catch(e=>{ L.buildFailed=true; console.warn('[coasts] '+L.name+' could not be built: '+(e&&e.message)); }).finally(()=>{ COASTS.busy=null; });
}

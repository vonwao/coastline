'use strict';
/* ---------------------------------------------------------------- Global resources -- */
const PR={};
let crownTex=[],rockTex=null;
let noiseTex,laceTex,fftInit,fftFinal,fftA,fftB,fftFA,fftFB,fftFF,causTex,causFBO,causIdx,causVAO,causCount;
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
  P('noise',FS_NOISE);P('lace',FS_LACE);P('crown',FS_CROWN);P('rockH',FS_ROCKH);P('rockN',FS_ROCKN);P('plantBake',FS_PLANT_BAKE,VS_PLANT_BAKE);P('plantList',FS_PLANT_LIST);P('mesh',FS_MESH,VS_MESH);P('cards',FS_CARDS,VS_CARDS);P('spec',FS_SPEC);P('fft',FS_FFT);P('copy',FS_COPY);
  P('caus',FS_CAUS,VS_CAUS);P('sky',FS_SKY);FS_TERRAIN_KINDS.forEach((f,i)=>P('terrain'+i,f));P('terrainMix',FS_TERRAIN_MIX);P('lit',FS_LIT);P('grid',FS_GRID);
  P('simInit',FS_SIMINIT);P('simU',FS_SIMU);P('simH',FS_SIMH);P('simRM',FS_SIMRM);P('foam',FS_FOAM);
  P('sprayStep',FS_SPRAY_STEP);P('spray',FS_SPRAY,VS_SPRAY);P('main',FS_MAIN);P('bdown',FS_BDOWN);P('bup',FS_BUP);P('tone',FS_TONE);P('mix',FS_MIX);P('final',FS_FINAL);
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
  const f=makeFBO(L.env);
  use(PR.sky,{tNoise:noiseTex,uSun:L.sun,uCover:L.cover,uTurb:L.turb,uSeed:L.seed,uDark:L.dark||0,uSkyK:L.skyK??1}); drawTo(f);
  gl.bindTexture(gl.TEXTURE_2D,L.env); gl.generateMipmap(gl.TEXTURE_2D);
  gl.deleteFramebuffer(f);
}
function buildEnvs(){ for(const k in LIGHTS) bakeEnv(LIGHTS[k]); }

/* Bake one terrain texture in tiles, so a single huge draw never stalls the GPU. */
async function bakeTerrain(tex,type,seed,min,size,near,tiles,form=0,half=0){
  const f=makeFBO(tex);
  const TP=form>=3?PR.terrainMix:PR['terrain'+type];
  use(TP,{tNoise:noiseTex,uMin:min,uSize:size,uSeed:seed,uType:type,uForm:form,uHalf:half,uNear:near?1:0,uTexel:size[0]/tex.w});
  gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.viewport(0,0,tex.w,tex.h);
  gl.enable(gl.SCISSOR_TEST);
  for(let j=0;j<tiles;j++)for(let i=0;i<tiles;i++){
    const x0=Math.floor(tex.w*i/tiles),x1=Math.floor(tex.w*(i+1)/tiles),y0=Math.floor(tex.h*j/tiles),y1=Math.floor(tex.h*(j+1)/tiles);
    gl.scissor(x0,y0,x1-x0,y1-y0); gl.drawArrays(gl.TRIANGLES,0,3);
    if(i%2===1){ gl.disable(gl.SCISSOR_TEST); await nextFrame(); gl.useProgram(TP.p); gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.viewport(0,0,tex.w,tex.h); gl.enable(gl.SCISSOR_TEST); }
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
    a[i]=(L.Hs/2)*Math.sqrt(2*w[i]/e)*1.0;
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
  const W=WATER[L.water||L.kind];
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
  simPass(PR.sprayStep,{tS:L.s[0],tP:L.sp[i],tV:L.sv[i]},L,dt,L.spF[o]);
  L.si=o;
}
function rmPass(L){
  simPass(PR.simRM,{tS:L.s[0]},L,.01,L.rmF);
  gl.bindTexture(gl.TEXTURE_2D,L.fx[L.fi]); gl.generateMipmap(gl.TEXTURE_2D);
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
  L.grid=new Float32Array(gw*gh); L.gridI=new Float32Array(gw*gh);
  for(let i=0;i<gw*gh;i++){ L.grid[i]=a[i*4]; L.gridI[i]=(a[i*4]>0.4?Math.max(a[i*4+2],a[i*4+1]*(a[i*4]>2.5?1:0)):0); }
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
function shoreAt(L,z){
  const x1=L.domMin[0]+L.domSize[0]*.97;
  for(let x=x1;x>L.domMin[0];x-=1.5*L.dx*2){ if(groundAt(L,x,z)>0) return x; }
  return L.domMin[0]+40;
}
function maxGroundNear(L,cx,cz,r){
  let m=0; for(let j=-8;j<=8;j++)for(let i=-8;i<=8;i++){ m=Math.max(m,groundAt(L,cx+i*r/8,cz+j*r/8)); } return m;
}

async function buildLocation(L,progress){
  const zc=0;
  L.domMin=[L.xMin,zc-L.nz*L.dx*.5];
  L.domSize=[L.nx*L.dx,L.nz*L.dx];
  L.n2=L.water?.0008:L.kind==='rocky'?.0011:L.kind==='surf'?.00065:.00075;
  buildSwell(L);
  /* Rock needs a finer height map than sand does. */
  const nearW=L.kind==='rocky'?Math.min(L.nx*3,HQ?2400:1792):Math.min(L.nx*2,HQ?2048:1536),nearH=L.kind==='rocky'?Math.min(L.nz*3,HQ?3400:3072):Math.min(L.nz*2,HQ?3000:2048);
  L.terr=makeTex(nearW,nearH,{mips:true,aniso:4});
  /* Half floats keep heights to about one part in 2000: fine for coasts, but on a 2000 m mountain that is
     a metre, and slopes came out as stairs, with saw-toothed ridges. Mountains get full floats. */
  L.terrF=makeTex(FAR_RES,FAR_RES,{mips:true,aniso:4,fmt:L.maxH>1000?'RGBA32F':'RGBA16F'});
  if(L.real){ await bakeRealTerrain(L,L.terr,true); progress(.25); await bakeRealTerrain(L,L.terrF,false); } else {
  await bakeTerrain(L.terr,L.type,L.seed,L.domMin,L.domSize,true,4,L.form||0,L.domSize[1]*.5);
  progress(.25);
  await bakeTerrain(L.terrF,L.type,L.seed,[-FAR_SPAN*.5+L.domMin[0]+L.domSize[0]*.5,-FAR_SPAN*.5],[FAR_SPAN,FAR_SPAN],false,2,L.form||0,L.domSize[1]*.5);
  }
  L.farMin=[-FAR_SPAN*.5+L.domMin[0]+L.domSize[0]*.5,-FAR_SPAN*.5];
  readGrid(L);
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
  L.t=0;
  use(PR.simInit,Object.assign(simVals(L,.01),{tT:L.terr})); setI2(PR.simInit,'uCells',[L.nx,L.nz]);
  drawTo(L.sf[0]);
  /* Spin up. Waves need about one crossing of the shoaling zone to develop. */
  const dt=Math.min(.033,.24*L.dx/Math.sqrt(9.81*L.hmax+1));
  const total=L.spin||(TEST?26:26);
  const steps=Math.ceil(total/dt); let done=0; let chunk=30;
  let last=performance.now();
  while(done<steps){
    const n=Math.min(chunk,steps-done);
    for(let i=0;i<n;i++){ simStep(L,dt); if((done+i)%2===1) foamStep(L,dt*2); }
    done+=n; progress(.3+.7*done/steps);
    await nextFrame();
    const now=performance.now(),d=now-last; last=now;
    if(d>70) chunk=Math.max(6,Math.floor(chunk*.75)); else if(d<34) chunk=Math.min(180,Math.floor(chunk*1.25));
  }
  rmPass(L);
  if(L.kind==='rocky') initSpray(L);
  L.dtStep=1/60;
  L.ready=true;
}

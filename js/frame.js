'use strict';
/* ---------------------------------------------------------------- Frame ------------- */
const CARD_RANGE=+(Q.get('cardrange')||(HQ?1300:720)), SHRUB_RANGE=HQ?480:280;
const CARD_LAYERS=[{tile:78,range:CARD_RANGE,shrub:0},{tile:27,range:SHRUB_RANGE,shrub:1}];
const CARD_MAX=HQ?900000:240000;
/* renderJit shifts the camera by a fraction of a pixel; renderNoiseF moves the screen-fixed noise some
   shaders use. Both change from frame to frame only when frames are averaged: live smoothing (taaBegin)
   or several samples per film frame. */
let renderJit=[0,0], renderNoiseF=0;
/* The depth range of every view: near 1 m, far 60 km, as the shaders' projection uses it. */
const DEPTH_A=(60000+1)/(60000-1), DEPTH_B=-2*60000*1/(60000-1);
/* The block of plant cells covering the camera's view of the ground, out to the layer's range. */
function cardGrid(C,cam,asp){
  const a=C.tile*2.399,c=Math.cos(a),s=Math.sin(a),k=18/C.tile;
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  const add=(x,z)=>{ const u=(c*x-s*z)*k,v=(s*x+c*z)*k; x0=Math.min(x0,u);x1=Math.max(x1,u);z0=Math.min(z0,v);z1=Math.max(z1,v); };
  add(cam.ro[0],cam.ro[2]);
  /* Each corner of the view, followed down to sea level or out to the layer's range. */
  for(const sx of [-1,1])for(const sy of [-1,1]){
    const d=[0,1,2].map(i=>cam.F[i]+cam.R[i]*sx*cam.tan*asp+cam.Up[i]*sy*cam.tan);
    const l=Math.hypot(d[0],d[2])||1e-6;
    const reach=d[1]<-1e-3?Math.min(cam.ro[1]/-d[1]*l,C.range):C.range;
    add(cam.ro[0]+d[0]/l*reach,cam.ro[2]+d[2]/l*reach);
  }
  let w=Math.ceil(x1-x0)+6,h=Math.ceil(z1-z0)+6;
  let ox=Math.floor(x0)-3,oz=Math.floor(z0)-3;
  /* Only a safety limit: normal views fit. If it ever applies, keep the middle of the view. */
  if(w*h>CARD_MAX){ const f=Math.sqrt(CARD_MAX/(w*h)),w2=Math.floor(w*f),h2=Math.floor(h*f); ox+=(w-w2)>>1; oz+=(h-h2)>>1; w=w2; h=h2; }
  return {x:ox,z:oz,w,h};
}
/* ---- Full 3D models for plants near the drone ---- */
const MESH_TREE=HQ?70:32,MESH_SHRUB=HQ?30:16;
const MESH_RANGE=[MESH_TREE,MESH_TREE,MESH_TREE,MESH_TREE,MESH_TREE,MESH_TREE,MESH_SHRUB,MESH_SHRUB,MESH_TREE,MESH_TREE,MESH_SHRUB];
let listTex=null,listTex2=null,listFBO=null; const LIST_N=256;
function plantList(S,force){
  /* Worked out once per shot, along the drone's whole path. High shots never get this close. force: always,
     for a crossing's height profile (camera.js), which needs the plants under its path. */
  const L=S.L; S.meshes=null;
  if(!force&&(S.kind==='top'||Q.has('nomesh'))) return;
  let low=1e9;
  for(let i=0;i<=8;i++){ const t=i/8; low=Math.min(low,S.p0[1]+(S.p1[1]-S.p0[1])*t-groundAt(L,S.p0[0]+(S.p1[0]-S.p0[0])*t,S.p0[2]+(S.p1[2]-S.p0[2])*t)); }
  if(!force&&low>MESH_TREE+10&&S.kind!=='crossing') return;
  if(!listTex){ listTex=makeTex(LIST_N,LIST_N,{fmt:'RGBA32F',filter:'nearest'}); listTex2=makeTex(LIST_N,LIST_N,{fmt:'RGBA32F',filter:'nearest'}); listFBO=makeFBO(listTex,listTex2); }
  if(AHEAD.on) aheadGuard(S);
  /* A plant's share of sun is read from the coast's baked light, which has to be this shot's. (A crossing
     lists its plants while it is being made, before the frame loop has baked its light.) */
  bakeLit(L,S.lightKey);
  const blocks=CARD_LAYERS.map(C=>listBlock(S,C));
  /* Read back now, which holds the page until the chip has caught up; or, for a shot prepared while the
     one before it plays (AHEAD below), a few frames later without holding anything. */
  const data=AHEAD.on?aheadList(S,blocks):blocks.map((B,i)=>{
    listDraw(S,CARD_LAYERS[i],B);
    const a0=new Float32Array(B.w*B.h*4),a1=new Float32Array(B.w*B.h*4);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0,0,B.w,B.h,gl.RGBA,gl.FLOAT,a0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.readPixels(0,0,B.w,B.h,gl.RGBA,gl.FLOAT,a1);
    return [a0,a1];
  });
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  const byModel=Array.from({length:PLANT.COUNT},()=>[]);
  blocks.forEach((B,j)=>{
    const [a0,a1]=data[j];
    for(let i=0;i<B.w*B.h*4;i+=4){
      if(a0[i+3]<=0) continue;
      const m=Math.floor(a0[i+3]);
      byModel[m].push(a0[i],a0[i+1],a0[i+2],a0[i+3],a1[i],a1[i+1],a1[i+2],a1[i+3]);
    }
  });
  S.meshes=byModel.map(a=>new Float32Array(a));
  S.meshOut=byModel.map(a=>new Float32Array(a.length));
}
/* The block of a layer's plant cells that a shot's path comes near. */
function listBlock(S,C){
  const D=C.shrub?MESH_SHRUB:MESH_TREE;
  const a=C.tile*2.399,c=Math.cos(a),s=Math.sin(a),k=18/C.tile;
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(const p of [S.p0,S.p1])for(const sx of [-1,1])for(const sz of [-1,1]){
    const X=p[0]+sx*(D+6),Z=p[2]+sz*(D+6),u=(c*X-s*Z)*k,v=(s*X+c*Z)*k;
    x0=Math.min(x0,u);x1=Math.max(x1,u);z0=Math.min(z0,v);z1=Math.max(z1,v);
  }
  return {ox:Math.floor(x0),oz:Math.floor(z0),w:Math.min(Math.ceil(x1-x0)+1,LIST_N),h:Math.min(Math.ceil(z1-z0)+1,LIST_N)};
}
/* Draw that block into the list texture: one texel per cell, the plant in it or nothing. */
function listDraw(S,C,B){
  const L=S.L;
  use(PR.plantList,{uType:floraOf(S),uGreenD:greenK(S)-1,uPlantCover:coverOf(S),uShrub:C.shrub,TILE:C.tile,uEdge:.06,uDomMin:L.domMin,uDomSize:L.domSize,uFarMin:L.farMin,uFarSize:[FAR_SPAN,FAR_SPAN],tTerr:L.terr,tTerrF:L.terrF,tLit:L.lit,tLitF:L.litFar,tNoise:noiseTex,...vegUniforms()});
  setI2(PR.plantList,'uOrigin',[B.ox,B.oz]);
  gl.bindFramebuffer(gl.FRAMEBUFFER,listFBO); gl.viewport(0,0,LIST_N,LIST_N);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(0,0,B.w,B.h); gl.drawArrays(gl.TRIANGLES,0,3); gl.disable(gl.SCISSOR_TEST);
}
/* ---- The next shot, prepared while this one plays ----
   Making a shot can need the list of plants near its path (above), and a crossing needs it up to ten
   times, once for each path it tries. Read back at once, each list held the page until the chip had
   finished everything queued: 55 to 380 ms with the picture standing still at every change of scene
   (measured 15 November 2026, TECHLOG 67).

   So the slideshow chooses its next shot a moment after the present one begins, and the lists are read
   back without waiting: the chip is asked, and the answer collected a few frames later. The code that makes
   shots is unchanged and still asks for a list and uses it at once. When the answer isn't there yet, the
   attempt is dropped (AHEAD_WAIT) and, once it has arrived, made again from the same random numbers, so
   it asks for the same list, now there, and gets a step further. A shot takes one to a dozen such rounds,
   all long before it is needed. Anything else (the first shot, N, favourites, a playlist, a reel, the
   studio) makes its shot on the spot as before. ?noahead switches this off. */
const AHEAD={on:false,for:null,L:null,S:null,fail:null,seed:0,tries:0,calm:false,cache:new Map(),pend:null,pbo:null};
const AHEAD_WAIT={}, AHEAD_NO={};
function aheadMay(cur){ return RH.on&&!Q.has('noahead')&&!REEL_LIVE.on&&!state.next&&!state.paused&&!holdScene()&&!state.favOnly&&!PLAYLIST.on&&!cur.flying&&!cur.hold; }
function aheadDrop(){
  const A=AHEAD; if(A.pend){ gl.deleteSync(A.pend.sync); A.pend=null; }
  A.for=null; A.L=null; A.S=null; A.fail=null; A.tries=0; A.cache.clear();
}
/* The same coast in another light can't be prepared while it is on screen: its baked light is in use. */
function aheadGuard(S){ const c=state.cur; if(c&&S.L===c.L&&(S.lightKey!==c.lightKey||LIGHTS[S.lightKey]!==c.L.litObj)) throw AHEAD_NO; }
function aheadList(S,blocks){
  const A=AHEAD;
  const keys=blocks.map((B,i)=>[S.L.name,S.lightKey,vegOf(S),floraOf(S),greenK(S),coverOf(S),i,B.ox,B.oz,B.w,B.h].join('|'));
  if(keys.every(k=>A.cache.has(k))) return keys.map(k=>A.cache.get(k));
  if(!A.pend){
    if(!A.pbo) A.pbo=[0,1,2,3].map(()=>{ const b=gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,b); gl.bufferData(gl.PIXEL_PACK_BUFFER,LIST_N*LIST_N*16,gl.STREAM_READ); return b; });
    blocks.forEach((B,i)=>{
      listDraw(S,CARD_LAYERS[i],B);
      for(const j of [0,1]){ gl.readBuffer(j?gl.COLOR_ATTACHMENT1:gl.COLOR_ATTACHMENT0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,A.pbo[i*2+j]); gl.readPixels(0,0,B.w,B.h,gl.RGBA,gl.FLOAT,0); }
    });
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null); gl.readBuffer(gl.COLOR_ATTACHMENT0);
    A.pend={sync:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),keys,blocks}; gl.flush();
  }
  throw AHEAD_WAIT;
}
/* Has the chip answered? Then keep what it sent. */
function aheadPoll(){
  const A=AHEAD,P=A.pend; if(!P) return true;
  const st=gl.clientWaitSync(P.sync,0,0);
  if(st===gl.TIMEOUT_EXPIRED) return false;
  gl.deleteSync(P.sync); A.pend=null;
  if(st===gl.WAIT_FAILED) return true;
  P.blocks.forEach((B,i)=>A.cache.set(P.keys[i],[0,1].map(j=>{ const a=new Float32Array(B.w*B.h*4); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,A.pbo[i*2+j]); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,a); return a; })));
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  return true;
}
/* Every frame of the slideshow: one more round of making the next shot, if it isn't made yet. */
function aheadTick(cur){
  const A=AHEAD;
  if(A.for&&A.for!==cur) aheadDrop();
  if(!aheadMay(cur)){ if(A.for) aheadDrop(); return; }
  if(A.S||A.fail===cur) return;
  if(A.pend&&!aheadPoll()) return;
  if(A.for!==cur){
    if(cur.t<1.2) return;
    /* Its coast: the one chosen ahead where coasts are built as needed (state.upL), else chosen now. */
    const L=COASTS.auto?state.upL:coastNext(cur); if(!L||!L.ready) return;
    A.for=cur; A.L=L; A.seed=(Math.random()*4294967296)>>>0; A.tries=0; A.calm=CALM; A.cache.clear();
  }
  if(!A.L.ready){ A.fail=cur; return; }
  if(!vegReady({L:A.L})){ vegEnsure({L:A.L}); return; }
  /* The same random numbers each round (mulberry32), so each round makes the same choices as the last. */
  const rand=Math.random; let s=A.seed;
  Math.random=()=>{ s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  A.on=true;
  try{ const S=chooseNext(cur,A); vegUse(S); if(S.meshes===undefined) plantList(S); S.vegMade=vegOf(S); A.S=S; }
  catch(e){
    if(e===AHEAD_WAIT){ if(++A.tries>16) A.fail=cur; }
    else { A.fail=cur; if(e!==AHEAD_NO) console.warn('[ahead] the next shot could not be prepared: '+(e&&e.message)); }
  }
  finally { Math.random=rand; A.on=false; vegUse(cur); }
  if(A.fail===cur&&A.pend){ gl.deleteSync(A.pend.sync); A.pend=null; }
}
/* Still being made, with an answer on its way? Then the change of scene can wait a moment for it. */
function aheadBusy(cur){ const A=AHEAD; return A.for===cur&&!A.S&&A.fail!==cur&&(!!A.pend||A.tries>0); }
/* The prepared shot, if it still suits; nothing is kept either way. */
function aheadTake(cur){
  const A=AHEAD, S=A.S&&A.for===cur&&A.calm===CALM&&A.L.ready&&!state.favOnly&&!PLAYLIST.on&&coastEligible().includes(A.L)?A.S:null;
  aheadDrop(); return S;
}
function drawMeshes(S,cam,asp,Li,dA,dB){
  const L=S.L;
  let bound=false;
  for(let m=0;m<PLANT.COUNT;m++){
    const A=S.meshes[m],O=S.meshOut[m],D=MESH_RANGE[m],M=plantMesh[m];
    let n=0;
    for(let i=0;i<A.length;i+=8){
      const dx=A[i]-cam.ro[0],dz=A[i+2]-cam.ro[2];
      if(dx*dx+dz*dz>D*D) continue;
      /* Skip plants behind the drone, allowing for their size. */
      if(dx*cam.F[0]+(A[i+1]-cam.ro[1])*cam.F[1]+dz*cam.F[2]<-16) continue;
      for(let j=0;j<8;j++) O[n*8+j]=A[i+j];
      n++;
    }
    if(!n) continue;
    if(!bound){
      use(PR.mesh,{uJit:renderJit,uNoiseF:renderNoiseF,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uTan:cam.tan,uAspect:asp,uDA:dA,uDB:dB,uTime:L.t,uType:floraOf(S),uSun:Li.sun,uSunE:Li.sunE,uCloudShade:Li.cloudShade,uCloudT:S.t||0,uCldCover:Li.cover??.4,uCldSeed:Li.seed??0,tEnv:Li.env,tNoise:noiseTex,uMTint:vegUniforms().uMTint});
      bound=true;
    }
    gl.uniform1f(PR.mesh.u.uMeshD.loc,D);
    gl.bindVertexArray(M.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,M.ib);
    gl.bufferData(gl.ARRAY_BUFFER,O.subarray(0,n*8),gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES,0,M.nV,n);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,null);
  gl.bindVertexArray(emptyVAO);
}
/* Lips and rollers on breaking crests (js/shaders/breakers.js): one ribbon per marked cell of the water
   grid, where the camera can see the sea within 320 m, inside the strip where waves break. A first pass
   lists the marked cells of each row in view, so only those are drawn. Drawn over the water with depth
   testing, leaving no depth of their own, like spray. */
/* A waterfall's water as a sheet in the air (js/shaders/fall.js; its path: fallPath in js/world.js).
   Over what is drawn, testing depth and leaving none. Where it covers the picture it also lowers the
   alpha that tells the live smoothing (FS_TAA) what is water, as falling water moves too fast to smooth. */
function drawFalls(S,cam,asp,Li,dA,dB){
  const L=S.L;
  gl.bindFramebuffer(gl.FRAMEBUFFER,RT.hdrA.f); gl.viewport(0,0,RT.w,RT.h);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
  gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE,gl.ONE_MINUS_SRC_ALPHA,gl.ZERO,gl.ONE_MINUS_SRC_ALPHA);
  use(PR.fall,{tLit:L.lit,tEnv:Li.env,tNoise:noiseTex,uDomMin:L.domMin,uDomSize:L.domSize,uJit:renderJit,uTime:L.t,uTan:cam.tan,uAspect:asp,uDA:dA,uDB:dB,uFogB:fogOf(S,Li),
    uCloudShade:Li.cloudShade,uCloudT:S.t||0,uCldCover:Li.cover??.4,uCldSeed:Li.seed??0,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uSun:Li.sun,uSunE:Li.sunE,uSide:[0,0,1]});
  /* The sheet, then its veil of spray in front (js/shaders/fall.js). */
  for(const layer of [0,1]) for(const F of L.falls){ if(!F.geo) continue;
    gl.uniform1f(PR.fall.u.uLayer.loc,layer); gl.uniform1f(PR.fall.u.uDir.loc,F.C[0]);
    gl.bindVertexArray(F.geo.vao); gl.drawArrays(gl.TRIANGLE_STRIP,0,F.geo.n); }
  gl.bindVertexArray(emptyVAO);
  gl.disable(gl.BLEND); gl.depthMask(true);
}
function drawBreakers(S,cam,asp,Li,dA,dB){
  const L=S.L,R=320;
  let x0=cam.ro[0],x1=x0,z0=cam.ro[2],z1=z0;
  for(const a of [-1,0,1]) for(const b of [-1,0,1]){
    const d=[0,1,2].map(i=>cam.F[i]+cam.R[i]*a*cam.tan*asp+cam.Up[i]*b*cam.tan);
    const hl=Math.hypot(d[0],d[2]); if(hl<1e-6) continue;
    const t=d[1]<-1e-4?cam.ro[1]/-d[1]:1e9, th=Math.min(t*hl,R)/hl;
    const x=cam.ro[0]+d[0]*th,z=cam.ro[2]+d[2]*th;
    x0=Math.min(x0,x); x1=Math.max(x1,x); z0=Math.min(z0,z); z1=Math.max(z1,z);
  }
  const cx0=Math.max(L.brkX0,Math.floor((x0-10-L.domMin[0])/L.dx)), cx1=Math.min(L.brkX1,Math.ceil((x1+10-L.domMin[0])/L.dx));
  const cz0=Math.max(0,Math.floor((z0-10-L.domMin[1])/L.dx)), cz1=Math.min(L.nz,Math.ceil((z1+10-L.domMin[1])/L.dx));
  if(cx1<=cx0||cz1<=cz0) return;
  /* The list of marked cells in each row in view. */
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(0,cz0,BRK_K,cz1-cz0);
  use(PR.brkRow,{tBrk:L.brk}); setI2(PR.brkRow,'uBand',[cx0,cx1]); drawTo(L.brkRowF);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER,RT.hdrA.f); gl.viewport(0,0,RT.w,RT.h);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
  /* The picture's alpha (water or not, for the live smoothing) is left as the main pass wrote it. */
  gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE,gl.ONE_MINUS_SRC_ALPHA,gl.ZERO,gl.ONE);
  use(PR.lip,{tBrk:L.brk,tRow:L.brkRow,tRM0:L.rm0,tLit:L.lit,tEnv:Li.env,tNoise:noiseTex,tLace:laceTex,uRow0:cz0,uK:BRK_K,uSegs:LIP_SEGS,
    uDomMin:L.domMin,uDomSize:L.domSize,uJit:renderJit,uDx:L.dx,uTime:L.t,uFar:R,uTan:cam.tan,uAspect:asp,uDA:dA,uDB:dB,uFogB:fogOf(S,Li),
    uCloudShade:Li.cloudShade,uCloudT:S.t||0,uCldCover:Li.cover??.4,uCldSeed:Li.seed??0,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uSun:Li.sun,uSunE:Li.sunE,uDbg:Q.has('lipdebug')?1:0});
  setI2(PR.lip,'uCells',[L.nx,L.nz]);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4*(LIP_SEGS+1)+2,BRK_K*(cz1-cz0));
  gl.disable(gl.BLEND); gl.depthMask(true);
  S.lipCells=BRK_K*(cz1-cz0);
}
function renderView(S,u,out){ renderHDR(S,u); postProcess(S,RT.hdrA.t,out); }
/* How thick the haze is: the lighting's own value, thicker over warm tropical water and much thinner in
   the clear mountain air at the lake; ?haze= scales it, to compare. */
const HAZE_Q=Q.has('haze')?Math.max(+Q.get('haze')||0,0):1;
function fogOf(S,Li){ const L=S.L; return Li.fog*(L.haze??(L.water==='lake'?.45:(L.water||L.kind)==='tropical'?1.2:1))*HAZE_Q; }
/* Direction of the rock beds, as the terrain shaders lay them out, so the view shader's joints follow them. */
function rockAngle(L){ const f=L.form||0; return (f>=3?.5:f===2?.82:.34)+L.seed*.37; }
/* The mixed-coast forms (3 and up) all use the same bed direction. */
/* 0 draws the picture; 1 and 2 draw answer images for training data instead (see tools/groundtruth.js). */
let LABEL=0;
/* The march's quarter-size first pass (FS_VIEW_Z in js/shaders/view.js). Tools and films (?test) draw as
   before, without it, unless ?pre asks for it; ?nopre switches it off in the live window, to compare. */
let PREMARCH=Q.has('pre')||(!TEST&&!Q.has('nopre'));
function renderHDR(S,u){
  /* A tool drawing a shot whose plants aren't baked yet (js/vegetation.js): bake them now. */
  if(TEST&&typeof vegBakeNow==='function'&&!vegReady(S)) vegBakeNow(S);
  const L=S.L,Li=LIGHTS[S.lightKey],W=waterOf(L),flora=floraOf(S),greenD=greenK(S)-1,cover=coverOf(S);
  const asp=RT.w/RT.h;
  const cam=cameraFor(S,u,S.camT!==undefined?S.camT:performance.now()*.001,asp);
  /* S.opt: elements a recipe switched off, and its kind of plants and greenery (js/recipe.js). */
  const cardD=!Q.has('nocards')&&S.opt?.plants!==false?CARD_RANGE:0;
  /* The plants of the shot's vegetation preset (js/vegetation.js). */
  if(typeof vegUse==='function') vegUse(S);
  if(S.meshes===undefined) plantList(S);
  S._cam=cam;
  const dA=DEPTH_A,dB=DEPTH_B;
  const f=(L.t/advPeriod(L))%1, fA=1-Math.abs(2*f-1), g=(f+.5)%1, fB=1-Math.abs(2*g-1);
  /* The clouds (FS_CLOUDS in js/shaders/sky.js): a pass of their own, before the view, which reads it for
     its sky pixels. Skipped when no sky can be in the picture (the top corners look below the horizon),
     for answer images, and with ?oldclouds (the clouds from the sky texture, as before). */
  const topY=Math.max(...[-1,1].map(s=>{ const d=[0,1,2].map(i=>cam.F[i]+cam.Up[i]*cam.tan+s*cam.R[i]*cam.tan*asp); return d[1]/Math.hypot(...d); }));
  const clouds=!LABEL&&!!Li.envC&&!Q.has('oldclouds')&&topY>-.02;
  if(clouds){
    use(PR.clouds,{uJit:renderJit,uNoiseF:renderNoiseF,uR:cam.R,uU:cam.Up,uF:cam.F,uTan:cam.tan,uAspect:asp,uResY:RT.cloud.f.h,uSun:Li.sun,
      tNoise:noiseTex,tN3:noise3Tex,tSkyC:Li.envC,uCloudO:[cam.ro[0]*.001+.0037*(S.t||0),cam.ro[2]*.001+.002*(S.t||0)],uCover:Li.cover,uTurb:Li.turb,uSeed:Li.seed,uDark:Li.dark||0,uSkyK:Li.skyK??1});
    drawTo(RT.cloud.f);
  }
  const U={uJit:renderJit,uNoiseF:renderNoiseF,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uTan:cam.tan,uAspect:asp,uResY:RT.h,uSteps:Math.round(S.steps*(HQ?1.6:1)),uMarchK:L.marchK||4,
    uDomMin:L.domMin,uDomSize:L.domSize,uFarMin:L.farMin,uFarSize:[FAR_SPAN,FAR_SPAN],uDx:L.dx,uEdge:.06,uMaxH:S.maxH,uNearH:S.nearH,
    uTide:0,uSimT:L.t,uTime:L.t,uChop:W.chop,uSwH:L.Hs*.6,
    tTerr:L.terr,tTerrF:L.terrF,tLit:L.lit,tLitF:L.litFar,tRM0:L.rm0,tRM1:L.rm1,tFx:L.fx[L.fi],tAdv:L.adv[L.fi],tFFT:fftFinal,tCaus:causTex,tEnv:Li.env,tNoise:noiseTex,tLace:laceTex,tRock:rockTex,tCrown:crownTex[flora===0?1:0],
    uSun:Li.sun,uSunE:Li.sunE,uSigA:W.sigA,uSigS:W.sigS,uSed:W.sed,uSandA:W.sandA,uSandB:W.sandB,uSandPatch:W.sandPatch,uType:L.type,uFlora:flora,uGreenD:greenD,uPlantCover:cover,uMixed:L.water?1:0,uRockAng:rockAngle(L),uGranite:L.form===5?1:0,uSnow:L.snow||0,uFarLod:L.farLod??4,uSlopeK:L.slopeK||1.6,uFarStep:L.farStep||.22,uFish:Q.has('nofish')||S.opt?.fish===false?0:L.fish??((L.kind==='tropical'||L.water==='tropical')?1:.35),
    uSwK:L.swK,uSwA:L.swA,uWA:fA,uWB:fB,uFogB:fogOf(S,Li),uCloudShade:Li.cloudShade,uSunVis:Li.sunVis??1,uCloudT:S.t||0,uCldCover:Li.cover??.4,uCldSeed:Li.seed??0,uDA:dA,uDB:dB,uCardD:cardD,uCardS:cardD>0?SHRUB_RANGE:0,uShrubM:[plantInfo[12],plantInfo[13],plantInfo[14],plantInfo[15]],
    tExtra:LABEL?L.s[0]:clouds?RT.cloud.t:Li.envC,uCloudPx:clouds?1:0,uLabel:LABEL,uStars:Li.stars||0,uMoonSun:Li.moonSun||[0,-1,0],uMoonLit:Li.moonLit||0,uMoonK:Li.moonK||0,...(LABEL?PEOPLE_OFF:peopleUniforms(S,cam)),...vegUniforms(),
    ...fallUniforms(L),tGA0:RT.g.a0,tGA1:RT.g.a1,tGB0:RT.g.b0,tGB1:RT.g.b1,tZ:RT.z.t,uConeK:4,uPre:PREMARCH&&!LABEL?1:0};
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.ALWAYS); gl.depthMask(true);
  /* Answer images show the ground and water only: plants and spray are left out. */
  if(LABEL){ use(PR.label,U); drawTo(RT.hdrA.f); gl.disable(gl.DEPTH_TEST); return; }
  /* The view, in four stages (js/shaders/view.js, at its end): A finds the surface and starts the ground,
     B adds driftwood, ripples and rock, C lights the ground and draws the sky, W lays the water, foam and
     haze over it. A and B write the depth buffer; all are given the same values (each uses what it needs). */
  if(PREMARCH){ gl.disable(gl.DEPTH_TEST); use(PR.viewZ,U); drawTo(RT.z.f,RT.z.w,RT.z.h); gl.enable(gl.DEPTH_TEST); }
  use(PR.viewA,U); drawTo(RT.g.a);
  use(PR.viewB,U); drawTo(RT.g.b);
  gl.disable(gl.DEPTH_TEST);
  use(PR.viewC,U); drawTo(RT.hdrA.f);
  /* W adds its light and keeps the share of C's picture its alpha says; C's own alpha (water or not) stays. */
  gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE,gl.SRC_ALPHA,gl.ZERO,gl.ONE);
  use(PR.viewW,U); drawTo(RT.hdrA.f);
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  if(cardD>0){
    /* Plants: full models up close, one card per plant beyond that. */
    gl.depthFunc(gl.LEQUAL);
    if(S.meshes) drawMeshes(S,cam,asp,Li,dA,dB);
    const ref=[0,1,2].map(i=>(S.p0[i]+S.p1[i])*.5);
    for(const C of CARD_LAYERS){
      const g=cardGrid(C,cam,asp);
      use(PR.cards,{uJit:renderJit,uNoiseF:renderNoiseF,uRef:ref,uFreeView:S.kind==='top'?0:1,uMeshD:S.meshes?(C.shrub?MESH_SHRUB:MESH_TREE):0,uGrid:g.w,uShrub:C.shrub,TILE:C.tile,uType:flora,uGreenD:greenD,uPlantCover:cover,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uTan:cam.tan,uAspect:asp,uDA:dA,uDB:dB,uMaxD:C.range,uTime:L.t,uEdge:.06,
        uDomMin:L.domMin,uDomSize:L.domSize,uFarMin:L.farMin,uFarSize:[FAR_SPAN,FAR_SPAN],tTerr:L.terr,tTerrF:L.terrF,tLit:L.lit,tLitF:L.litFar,tNoise:noiseTex,
        tPA:plantA,tPL:plantL,uModel:plantInfo,tEnv:Li.env,uSun:Li.sun,uSunE:Li.sunE,uFogB:fogOf(S,Li),uCloudShade:Li.cloudShade,uCloudT:S.t||0,uCldCover:Li.cover??.4,uCldSeed:Li.seed??0,...vegUniforms()});
      setI2(PR.cards,'uOrigin',[g.x,g.z]);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,g.w*g.h);
    }
  }
  /* People on the beach, umbrellas and cool boxes (js/people.js). */
  gl.depthFunc(gl.LEQUAL); drawPeople(S,cam,asp,Li,dA,dB);
  if(L.brk&&!Q.has('nobreakers')&&S.opt?.breakers!==false) drawBreakers(S,cam,asp,Li,dA,dB);
  if(L.falls&&L.falls.some(F=>F.geo)&&!Q.has('nofallsheet')) drawFalls(S,cam,asp,Li,dA,dB);
  if(L.sp&&!Q.has('nospray')&&S.opt?.spray!==false){
    /* Spray goes over everything already drawn, and leaves no mark in the depth buffer. */
    gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE,gl.ONE_MINUS_SRC_ALPHA,gl.ZERO,gl.ONE);
    use(PR.spray,{uJit:renderJit,tP:L.sp[L.si],tV:L.sv[L.si],tLit:L.lit,tEnv:Li.env,tNoise:noiseTex,uTexN:SPRAY_N,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uTan:cam.tan,uAspect:asp,uDA:dA,uDB:dB,uSun:Li.sun,uSunE:Li.sunE,uDomMin:L.domMin,uDomSize:L.domSize,uDensity:1,uResY:RT.h,uBrk:S.opt?.breakers===false?0:1});
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,SPRAY_N*SPRAY_N);
    gl.disable(gl.BLEND); gl.depthMask(true);
  }
  gl.disable(gl.DEPTH_TEST);
}
function postProcess(S,hdrTex,out){
  const Li=LIGHTS[S.lightKey];
  /* Bloom */
  let src=hdrTex;
  for(let i=0;i<RT.bloom.length;i++){ const b=RT.bloom[i];
    use(PR.bdown,{tI:src,uTx:[.5/b.w,.5/b.h],uThr:i===0?5.:0}); drawTo(b.f); src=b.t; }
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
  for(let i=RT.bloom.length-2;i>=0;i--){ const b=RT.bloom[i],s=RT.bloom[i+1];
    use(PR.bup,{tI:s.t,uTx:[.5/s.w,.5/s.h]}); drawTo(b.f); }
  gl.disable(gl.BLEND);
  use(PR.tone,{tI:hdrTex,tB:RT.bloom[0].t,uExp:Li.exposure,uBloom:Li.bloom,uSat:Li.sat,uTint:Li.tint,uNight:Li.night||0}); drawTo(out);
}
/* ---- Smoothing over time for the live window (FS_TAA in js/shaders/post.js). ?taa=0 turns it off; T
   switches it on and off, to compare. ---- */
let TAA_ON=Q.get('taa')!=='0';
/* How much each new frame counts (still, and extra where the picture moves fast), how far the history may
   stray from the new frame's colours, in standard deviations, and how much the new frame counts on water. */
const TAA_K=[.1,.25,1.0,.45];
const halton=(i,b)=>{ let f=1,r=0; while(i>0){ f/=b; r+=f*(i%b); i=Math.floor(i/b); } return r; };
/* A shot's history slot. A shot that wasn't drawn in the last few frames (back from the ← history, say)
   starts again, as does a new shot. */
function taaSlot(S){
  let s=RT.taa.find(x=>x.S===S);
  if(!s){ s=RT.taa.find(x=>x.S!==state.cur&&x.S!==state.next)||RT.taa[0]; s.S=S; s.valid=false; }
  if(s.frame<state.frames-3) s.valid=false;
  return s;
}
/* Before drawing a shot: this frame's shift, one of eight fractions of a pixel in turn (a Halton
   sequence, which spreads them evenly), and the noise offset. */
function taaBegin(S){
  if(!TAA_ON) return null;
  const s=taaSlot(S); s.n++;
  const k=s.n%8+1; renderJit=[(halton(k,2)-.5)*2/RT.w,(halton(k,3)-.5)*2/RT.h]; renderNoiseF=s.n%64;
  return s;
}
/* After: blend the new frame into the slot's history. A new shot starts from its first frame alone. */
function taaResolve(s,S,ldr){
  renderJit=[0,0]; renderNoiseF=0;
  if(!s) return;
  const c=S._cam,p=s.valid&&s.prev?s.prev:c,dst=s.i^1;
  use(PR.taa,{tCur:ldr.t,tHist:s.t[s.i],tDepth:RT.depth,tCls:RT.hdrA.t,uK:s.valid?TAA_K[0]:1,uKMove:TAA_K[1],uGamma:TAA_K[2],uKWater:TAA_K[3],uDA:DEPTH_A,uDB:DEPTH_B,uTan:c.tan,uAspect:RT.w/RT.h,uPTan:p.tan,
    uRo:c.ro,uR:c.R,uU:c.Up,uF:c.F,uPRo:p.ro,uPR:p.R,uPU:p.Up,uPF:p.F});
  drawTo(s.f[dst]); s.i=dst; s.valid=true; s.frame=state.frames;
  s.prev={ro:[...c.ro],R:[...c.R],Up:[...c.Up],F:[...c.F],tan:c.tan};
}
/* The picture of a shot: its smoothed history, or else what was last drawn into ldr. */
function shotTex(S,ldr){ const s=TAA_ON&&RT.taa.find(x=>x.S===S&&x.valid); return s?s.t[s.i]:ldr.t; }
function toggleTAA(){ TAA_ON=!TAA_ON; for(const s of RT.taa) s.valid=false; toast(TAA_ON?'Smoothing on':'Smoothing off (the old look)'); }
function advanceSim(L,elapsed){
  if(!L._acc) L._acc=0;
  L._acc+=Math.min(elapsed,.1);
  let n=0; const dt=1/60;
  while(L._acc>=dt&&n<4){ simStep(L,dt); L._acc-=dt; n++; }
  if(n>=4) L._acc=0;
  if(n>0){ foamStep(L,dt*n); rmPass(L); if(L.sp) sprayStep(L,dt*n); }
}

/* Calm mode (?calm=1, or press C): long, slow shots joined by slow dissolves, for a screen left running. */
let CALM=Q.has('calm');
function toggleCalm(){
  CALM=!CALM; toast(CALM?'Calm mode: long, slow shots':'Calm mode off');
  if(CALM&&state.cur&&!state.next&&!REEL_LIVE.on) cutTo(chooseNext(state.cur),rnd(3,4));
}
/* upL: the coast the next shot will show, chosen as a shot begins so its plants can be prepared (frame). */
/* capBy: the coasts and kinds of shot running below 60 a second just now, for the checks' readout. */
const state={cur:null,next:null,upL:null,fade:0,fadeDur:0,shotT:0,paused:false,last:0,scale:+(Q.get('res')||.8),fps:60,frames:0,accum:0,dtAvg:16.7,capBy:{}};
/* A steady 30 looks better than a stuttering 45. Each shot gets the rate it can hold, 60 a second or an
   even 30, and the picture size that fits it (js/rhythm.js). ?fps=30 or ?fps=60 fixes the rate. */
const FPS_FIX=+(Q.get('fps')||0);
/* ?fall=1: only coasts with a waterfall, and only shots of it. */
const FALL_ONLY=Q.has('fall');
function capFor(S){ return FPS_FIX||S.rate||60; }
/* ahead: the shot is being made early, on a coast already chosen (AHEAD above). Then nothing that can only
   happen once is done: the coast chosen ahead stays chosen, and favourites and playlists aren't touched. */
function chooseNext(prev,ahead){
  liveUpdate(); liveSky();
  /* In real-conditions mode, only coasts that suit today's sea, in today's light. */
  /* Still waiting for the first forecast (offline, say): any sea coast, but not the mountain lake. */
  /* The coast was chosen ahead if the slideshow is running (state.upL); else it is chosen now (world.js). */
  const up=state.upL; if(!ahead) state.upL=null;
  const L=ahead?ahead.L:up&&up.ready&&(!prev||up!==prev.L)&&coastEligible().includes(up)?up:coastNext(prev);
  if(!ahead&&state.favOnly){ const S=nextFav(prev); if(S){ bakeLit(S.L,S.lightKey); return S; } }
  /* The studio's playlist of recipes, when it's playing (js/recipe.js). */
  if(!ahead){ const S=recipeNext(prev); if(S){ bakeLit(S.L,S.lightKey); return S; } }
  const r=Math.random();
  let kind=r<.32?'top':r<.45?'low':r<.53?'canopy':r<.62?'crossing':'angled';
  if(prev&&prev.kind===kind&&Math.random()<.6) kind=kind==='top'?'angled':'top';
  const lk=LIVE.on||LIVE.clock?LIVE.key:LIGHTS[FORCE_LIGHT]?FORCE_LIGHT:null;
  if(lk&&dimLight(lk)&&(kind==='top'||kind==='low'||kind==='crossing')) kind='angled';
  /* A coast with a waterfall shows it in about a third of its shots (makeFallShot in js/camera.js), though
     not in the dark, where white water on a shaded cliff can hardly be seen. ?fall=1 is for looking at the
     fall: always a shot of it, in one of the coast's own daytime lights, whatever the clock or the weather
     being followed says. (A first version kept to the followed light: opened at nine in the evening by a
     browser following the clock, it showed no fall at all.) */
  const F=L.falls&&L.falls.length&&(FALL_ONLY||(Math.random()<.3&&!(lk&&dimLight(lk))))?makeFallShot(L,FALL_ONLY?pick(L.lights.filter(k=>k!=='storm')):lk,CALM):null;
  const S=F||(CALM?makeCalmShot(L,lk):makeShot(L,lk,kind));
  /* (Made ahead, its light is baked when its plants are listed, or at the cut.) */
  if(!ahead) bakeLit(L,S.lightKey);
  return S;
}
function applyScale(){
  resizeCanvas();
  const w=Math.max(320,Math.round(canvas.width*state.scale/2)*2),h=Math.max(180,Math.round(canvas.height*state.scale/2)*2);
  allocRT(w,h);
}
/* ---- Favourites: the place, light and camera path of a shot, kept in this browser. The waves
   themselves are always new, so a favourite shows the same shot of a different moment. ---- */
const FAV_KEY='coastline-favourites-v1';
const FAV_FIELDS=['lightKey','kind','p0','p1','yaw0','yaw1','pitch','pitch1','fov','noise','steps','maxH','nearH','dur','cross'];
function loadFavs(){ try{ return JSON.parse(localStorage.getItem(FAV_KEY))||[]; }catch(e){ return []; } }
function saveFavs(f){ try{ localStorage.setItem(FAV_KEY,JSON.stringify(f)); return true; }catch(e){ return false; } }
function shotOf(F){
  const L=LOCATIONS.find(l=>l.name===F.loc&&l.ready); if(!L) return null;
  const S={L,favId:F.id,start:0,t:0}; for(const k of FAV_FIELDS) S[k]=F[k];
  if(S.kind==='crossing'&&S.cross) crossProfile(S);
  liveFix(S);
  return S;
}
function nextFav(prev){
  /* Only favourites whose coast is built now (world.js builds their coasts in turn); of those, one on a
     coast that hasn't had its turn yet first. */
  const built=F=>LOCATIONS.find(l=>l.name===F.loc&&l.ready);
  const favs=loadFavs().filter(built); if(!favs.length) return null;
  let opts=favs.length>1?favs.filter(F=>!prev||F.id!==prev.favId):favs;
  const fresh=COASTS.auto?opts.filter(F=>!built(F).shownAt):[]; if(fresh.length) opts=fresh;
  return shotOf(pick(opts));
}
function toggleFav(){
  const S=state.next||state.cur, favs=loadFavs();
  if(S.favId&&favs.some(F=>F.id===S.favId)){
    const left=favs.filter(F=>F.id!==S.favId);
    const ok=saveFavs(left); S.favId=null;
    toast(ok?`Removed from favourites (${left.length} left)`:'Could not change favourites in this browser');
    return;
  }
  const F={id:Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36),loc:S.L.name};
  for(const k of FAV_FIELDS) F[k]=S[k];
  /* Real-conditions light isn't kept: the nearest fixed setup is saved instead. */
  if(LIGHTS[S.lightKey].base) F.lightKey=LIGHTS[S.lightKey].base;
  favs.push(F);
  if(saveFavs(favs)){ S.favId=F.id; toast(`♥ Saved to favourites (${favs.length})`); }
  else toast('Could not save favourites in this browser');
}
function exportFavs(){
  const favs=loadFavs();
  if(!favs.length){ toast('No favourites to save yet'); return; }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(favs,null,1)],{type:'application/json'}));
  a.download='coastline-favourites.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  toast(`Saved ${favs.length} favourites to your Downloads folder`);
}
let toastT;
function toast(m){ const e=document.getElementById('toast'); e.textContent=m; e.style.opacity=1; clearTimeout(toastT); toastT=setTimeout(()=>e.style.opacity=0,2200); }
/* Recent shots, so a shot you liked can be recovered after it has gone by. */
const history=[];
function goBack(){
  if(!history.length){ toast('No earlier scenes yet'); return; }
  const S=history.pop();
  const show=()=>{ liveFix(S); bakeLit(S.L,S.lightKey); aheadDrop(); rhythmLearn(state.cur); rhythmCut(S,true); state.next=null; state.upL=null; S.t=0; state.cur=S; coastShown(S.L); state.dtAvg=1000/capFor(S); };
  /* Its coast may have been put away since (world.js): it is built again first, as it was. */
  if(!S.L.ready){ toast('Bringing that coast back'); coastBuild(S.L,false).then(show,()=>toast('That coast could not be brought back')); }
  else show();
}
/* resize: a dissolve that may change the picture's size as it begins (calm mode and reels, which have no
   hard cuts to hide the change behind). A hard cut always may. */
function cutTo(S,fadeDur,resize){
  if(state.cur){ history.push(state.cur); if(history.length>30) history.shift(); }
  aheadDrop();
  /* Off screen until now, or a hard cut: the coast's clock can be wound back unseen (world.js). */
  if(!fadeDur||(S.L!==state.cur?.L&&S.L!==state.next?.L)) timeRebase(S.L);
  S.start=0; S.t=0; coastShown(S.L); state.upL=null;
  /* The rate the shot can hold and the picture size that fits it (js/rhythm.js). */
  if(fadeDur>0){ rhythmCut(S,!!resize,state.cur); state.next=S; state.fadeDur=fadeDur; state.fade=0; }
  else { rhythmLearn(state.cur); rhythmCut(S,true); state.cur=S; state.next=null; state.dtAvg=1000/capFor(S); }
}
function frame(now){
  requestAnimationFrame(frame);
  /* 30 a second is every second refresh of a 60 Hz display, 20 every third; the small allowance keeps
     that rhythm even. */
  const cap=state.cur?capFor(state.cur):60;
  if(cap<45&&now-state.last<(cap<25?46:29)) return;
  const elapsed=Math.min((now-state.last)/1000,.25); state.last=now;
  if(elapsed>0&&elapsed<.25) state.dtAvg+=(elapsed*1000-state.dtAvg)*.06;
  if(state.paused) { return; }
  rhythmBegin(now);
  simTime+=elapsed;
  stepFFT(simTime);
  flyUpdate(elapsed);
  /* A reel (js/reel.js) decides its own cuts, light, titles and black. */
  reelTick(elapsed);
  const cur=state.cur;
  advanceSim(cur.L,elapsed);
  /* hold: the studio has stopped the camera, while the sea goes on. */
  cur.t+=cur.hold?0:elapsed;
  bakeLit(cur.L,cur.lightKey);
  const odd=(state.frames&1)===1;
  /* Vegetation presets (js/vegetation.js): two can be baked at once. The shot coming in bakes its own
     (about a second) while the outgoing one plays on, and the dissolve waits until the new plants are
     ready. After a hard cut, the last picture stays until then. */
  vegEnsure(state.next||cur);
  /* The slideshow looks one shot ahead: the next coast is chosen as a shot begins, and its plants are baked
     while this shot plays, so the change of scene doesn't wait for them. Coasts are built and put away
     behind the picture (coastTend in world.js). */
  if(COASTS.auto&&!REEL_LIVE.on&&!state.next){
    if(state.frames%60===0) coastTend();
    if(!state.upL&&cur.t>1&&!holdScene()){ const L=coastNext(cur); if(L!==cur.L) state.upL=L; }
    if(state.upL&&vegReady(cur)) vegEnsure({L:state.upL});
  }
  /* And the next shot itself is made while this one plays (AHEAD above). */
  if(!TEST) aheadTick(cur);
  const vegHold=!vegReady(cur);
  if((!state.next||odd||state.fade===0)&&!vegHold){ const s=taaBegin(cur); renderView(cur,Math.min(cur.t/cur.dur,1.2),RT.ldrA.f); taaResolve(s,cur,RT.ldrA); }
  let finalTex=shotTex(cur,RT.ldrA);
  if(state.next){
    const nx=state.next;
    if(nx.L!==cur.L) advanceSim(nx.L,elapsed);
    nx.t+=elapsed;
    bakeLit(nx.L,nx.lightKey);
    const nxReady=vegReady(nx);
    if((!odd||state.fade===0||vegHold)&&nxReady){ const s=taaBegin(nx); renderView(nx,nx.t/nx.dur,RT.ldrB.f); taaResolve(s,nx,RT.ldrB); }
    if(nxReady) state.fade+=elapsed/state.fadeDur; else nx.t=0;
    const k=Math.min(state.fade,1), ks=k*k*(3-2*k);
    use(PR.mix,{tA:finalTex,tB:shotTex(nx,RT.ldrB),uK:ks}); drawTo(RT.ldrM.f);
    finalTex=RT.ldrM.t;
    if(state.fade>=1){
      rhythmLearn(cur); state.cur=nx; state.next=null; state.dtAvg=1000/capFor(nx);
      /* The size was held down for the shot that has just left: now it can go up, if by enough to be worth
         the moment it takes. Only where shots are long (calm mode, reels). */
      if(nx.rhGrow){ nx.rhGrow=false; const t=nx.t; rhythmCut(nx,true); nx.t=t; }
    }
  }
  use(PR.final,{tI:finalTex,uTx:[1/RT.w,1/RT.h],uTime:simTime%FFT_P,uSharp:state.scale<.99?.34:.2,uNoFxaa:TAA_ON?1:0}); drawTo(null,canvas.width,canvas.height);
  soundUpdate(state.next&&state.fade>.5?state.next:state.cur);
  /* Scene changes */
  /* The studio, or one recipe (?recipe=): the shot loops instead of changing. */
  /* The camera jumps back to its start there, so the coast's clock can be wound back unseen too: a screen
     left on one scene for days would otherwise lose the fine detail of its waves to rounding. */
  if(!TEST&&!REEL_LIVE.on&&!state.next&&state.cur.t>=state.cur.dur&&holdScene()){ const c=state.cur; rhythmLearn(c); rhythmCut(c,true); c.t=0; timeRebase(c.L); }
  /* The next shot is usually made already (AHEAD); if its last answer is still on its way, the change
     waits for it, up to half a second. */
  if(!TEST&&!REEL_LIVE.on&&!state.next&&state.cur.t>=state.cur.dur&&!(aheadBusy(state.cur)&&state.cur.t<state.cur.dur+.5)){
    const S=aheadTake(state.cur)||chooseNext(state.cur);
    /* Calm mode only dissolves, slowly. With no hard cuts to hide behind, frame rate and resolution are
       adjusted as each dissolve begins. Otherwise a shot that needs a smaller picture comes in on a cut. */
    if(CALM) cutTo(S,rnd(4.5,7),true);
    else { const dissolve=Math.random()<.24&&rhythmFits(S); cutTo(S,dissolve?rnd(1.1,1.7):0); }
  }
  rhythmEnd();
  state.frames++;
  if(hud.style.display==='block'&&state.frames%15===0){
    const c=state.cur;
    hud.textContent=`${c.favId?'♥ ':''}${c.L.name} · ${c.kind} · ${LIGHTS[c.lightKey].label||c.lightKey}\n${(1000/state.dtAvg).toFixed(0)} fps${rhythmText(c)} · render ${RT.w}x${RT.h} (${(state.scale*100).toFixed(0)}%)\nsim ${c.L.nx}x${c.L.nz} @ ${c.L.dx} m · t=${c.L.t.toFixed(1)}s`;
  }
}
/* A screen left running: if no frame has been drawn for 20 s while the page is showing (the graphics
   driver hung without saying so, say), the page starts again as it does after a graphics reset (restartSoon
   in js/gl.js), keeping calm mode, sound and favourites. A hidden page gets no frames and isn't restarted;
   nor is a tool's page (?test). */
/* Two looks in a row: after the page itself was held up for a while, the timer can fire before the frame. */
let frameStale=0;
setInterval(()=>{
  if(TEST||document.hidden||!window.COAST||!COAST.ready||!state.cur){ frameStale=0; return; }
  frameStale=performance.now()-state.last>20000?frameStale+1:0;
  if(frameStale>=2){ console.warn('[restart] no frame for 20 s'); restartSoon({calm:CALM,sound:SOUND.on,favOnly:!!state.favOnly}); }
},5000);
/* Coming back from hidden, the frame counter is stale: give the page a moment before judging it. */
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) state.last=performance.now(); });
const hud=document.getElementById('hud');
addEventListener('keydown',e=>{
  if(flyKey(e,true)) return;
  if(reelKey(e)) return;
  const k=e.key.toLowerCase();
  if(k==='g'){ toggleFly(); return; }
  if(k==='f'){ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
  else if(k===' '){ state.paused=!state.paused; e.preventDefault(); }
  else if(k==='n'||e.key==='ArrowRight'){ if(state.cur&&!state.next) cutTo(aheadTake(state.cur)||chooseNext(state.cur),0); }
  else if(e.key==='ArrowLeft'){ if(state.cur) goBack(); }
  else if(k==='l'){ if(state.cur) toggleFav(); }
  else if(k==='p'){
    if(!state.favOnly&&!loadFavs().length){ toast('No favourites yet: press L on a scene you like'); return; }
    state.favOnly=!state.favOnly; toast(state.favOnly?`♥ Playing favourites (${loadFavs().length})`:'Playing all scenes');
    if(state.favOnly&&state.cur&&!state.next){
      /* A favourite's coast may not be built just now (world.js): the first is fetched, then shown. */
      const go=()=>{ if(state.favOnly&&state.cur&&!state.next) cutTo(chooseNext(state.cur),0); };
      const el=coastEligible();
      if(COASTS.auto&&!el.some(L=>L.ready)){ toast('♥ Fetching the first favourite'); coastBuild(pick(el),false).then(go,go); } else go();
    }
  }
  else if(k==='e'){ exportFavs(); }
  else if(k==='s'){ toggleSound(); }
  else if(k==='c'){ toggleCalm(); }
  else if(k==='t'){ toggleTAA(); }
  else if(k==='b'){ toggleBeach(); }
  else if(e.key==='Escape'&&!BP.hidden){ BP.hidden=true; }
  else if(k==='h'){ hud.style.display=hud.style.display==='block'?'none':'block'; }
});
canvas.addEventListener('dblclick',()=>{ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); });
addEventListener('resize',()=>{ if(RT.w) applyScale(); });
/* The pointer hides after a moment's stillness, from the start too: before, it hid only after the mouse
   had moved once, so a window opened with the pointer resting over it kept the arrow on screen. */
let cursorT; const cursorIdle=()=>{ document.body.style.cursor='default'; clearTimeout(cursorT); cursorT=setTimeout(()=>document.body.style.cursor='none',1800); };
addEventListener('mousemove',cursorIdle); cursorIdle();

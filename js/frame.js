'use strict';
/* ---------------------------------------------------------------- Frame ------------- */
const CARD_RANGE=+(Q.get('cardrange')||(HQ?1300:720)), SHRUB_RANGE=HQ?480:280;
const CARD_LAYERS=[{tile:78,range:CARD_RANGE,shrub:0},{tile:27,range:SHRUB_RANGE,shrub:1}];
const CARD_MAX=HQ?900000:240000;
let renderJit=[0,0];
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
const MESH_RANGE=[MESH_TREE,MESH_TREE,MESH_TREE,MESH_TREE,MESH_TREE,MESH_TREE,MESH_SHRUB,MESH_SHRUB,MESH_TREE,MESH_TREE];
let listTex=null,listTex2=null,listFBO=null; const LIST_N=256;
function plantList(S){
  /* Worked out once per shot, along the drone's whole path. High shots never get this close. */
  const L=S.L; S.meshes=null;
  if(S.kind==='top'||Q.has('nomesh')) return;
  let low=1e9;
  for(let i=0;i<=8;i++){ const t=i/8; low=Math.min(low,S.p0[1]+(S.p1[1]-S.p0[1])*t-groundAt(L,S.p0[0]+(S.p1[0]-S.p0[0])*t,S.p0[2]+(S.p1[2]-S.p0[2])*t)); }
  if(low>MESH_TREE+10) return;
  if(!listTex){ listTex=makeTex(LIST_N,LIST_N,{fmt:'RGBA32F',filter:'nearest'}); listTex2=makeTex(LIST_N,LIST_N,{fmt:'RGBA32F',filter:'nearest'}); listFBO=makeFBO(listTex,listTex2); }
  const byModel=Array.from({length:PLANT.COUNT},()=>[]);
  const a0=new Float32Array(LIST_N*LIST_N*4),a1=new Float32Array(LIST_N*LIST_N*4);
  for(const C of CARD_LAYERS){
    const D=C.shrub?MESH_SHRUB:MESH_TREE;
    const a=C.tile*2.399,c=Math.cos(a),s=Math.sin(a),k=18/C.tile;
    let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
    for(const p of [S.p0,S.p1])for(const sx of [-1,1])for(const sz of [-1,1]){
      const X=p[0]+sx*(D+6),Z=p[2]+sz*(D+6),u=(c*X-s*Z)*k,v=(s*X+c*Z)*k;
      x0=Math.min(x0,u);x1=Math.max(x1,u);z0=Math.min(z0,v);z1=Math.max(z1,v);
    }
    const ox=Math.floor(x0),oz=Math.floor(z0),w=Math.min(Math.ceil(x1-x0)+1,LIST_N),h=Math.min(Math.ceil(z1-z0)+1,LIST_N);
    use(PR.plantList,{uType:L.flora??L.type,uShrub:C.shrub,TILE:C.tile,uEdge:.06,uDomMin:L.domMin,uDomSize:L.domSize,uFarMin:L.farMin,uFarSize:[FAR_SPAN,FAR_SPAN],tTerr:L.terr,tTerrF:L.terrF,tLit:L.lit,tLitF:L.litFar,tNoise:noiseTex});
    setI2(PR.plantList,'uOrigin',[ox,oz]);
    gl.bindFramebuffer(gl.FRAMEBUFFER,listFBO); gl.viewport(0,0,LIST_N,LIST_N);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0,0,w,h); gl.drawArrays(gl.TRIANGLES,0,3); gl.disable(gl.SCISSOR_TEST);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,a0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,a1);
    for(let i=0;i<w*h*4;i+=4){
      if(a0[i+3]<=0) continue;
      const m=Math.floor(a0[i+3]);
      byModel[m].push(a0[i],a0[i+1],a0[i+2],a0[i+3],a1[i],a1[i+1],a1[i+2],a1[i+3]);
    }
  }
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  S.meshes=byModel.map(a=>new Float32Array(a));
  S.meshOut=byModel.map(a=>new Float32Array(a.length));
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
      use(PR.mesh,{uJit:renderJit,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uTan:cam.tan,uAspect:asp,uDA:dA,uDB:dB,uTime:L.t,uType:L.flora??L.type,uSun:Li.sun,uSunE:Li.sunE,uCloudShade:Li.cloudShade,uCloudT:L.t,tEnv:Li.env,tNoise:noiseTex});
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
function renderView(S,u,out){ renderHDR(S,u); postProcess(S,RT.hdrA.t,out); }
/* Direction of the rock beds, as the terrain shaders lay them out, so the view shader's joints follow them. */
function rockAngle(L){ const f=L.form||0; return (f>=3?.5:f===2?.82:.34)+L.seed*.37; }
/* The mixed-coast forms (3 and up) all use the same bed direction. */
/* 0 draws the picture; 1 and 2 draw answer images for training data instead (see tools/groundtruth.js). */
let LABEL=0;
function renderHDR(S,u){
  const L=S.L,Li=LIGHTS[S.lightKey],W=WATER[L.water||L.kind],flora=L.flora??L.type;
  const asp=RT.w/RT.h;
  const cam=cameraFor(S,u,S.camT!==undefined?S.camT:performance.now()*.001,asp);
  const cardD=!Q.has('nocards')?CARD_RANGE:0;
  if(S.meshes===undefined) plantList(S);
  const DN=1,DF=60000,dA=(DF+DN)/(DF-DN),dB=-2*DF*DN/(DF-DN);
  const f=(L.t/advPeriod(L))%1, fA=1-Math.abs(2*f-1), g=(f+.5)%1, fB=1-Math.abs(2*g-1);
  use(PR.main,{uJit:renderJit,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uTan:cam.tan,uAspect:asp,uResY:RT.h,uSteps:Math.round(S.steps*(HQ?1.6:1)),uMarchK:L.marchK||4,
    uDomMin:L.domMin,uDomSize:L.domSize,uFarMin:L.farMin,uFarSize:[FAR_SPAN,FAR_SPAN],uDx:L.dx,uEdge:.06,uMaxH:S.maxH,uNearH:S.nearH,
    uTide:0,uSimT:L.t,uTime:L.t,uChop:W.chop,uSwH:L.Hs*.6,
    tTerr:L.terr,tTerrF:L.terrF,tLit:L.lit,tLitF:L.litFar,tRM0:L.rm0,tRM1:L.rm1,tFx:L.fx[L.fi],tAdv:L.adv[L.fi],tFFT:fftFinal,tCaus:causTex,tEnv:Li.env,tNoise:noiseTex,tLace:laceTex,tRock:rockTex,tCrown:crownTex[flora===0?1:0],
    uSun:Li.sun,uSunE:Li.sunE,uSigA:W.sigA,uSigS:W.sigS,uSed:W.sed,uSandA:W.sandA,uSandB:W.sandB,uSandPatch:W.sandPatch,uType:L.type,uFlora:flora,uMixed:L.water?1:0,uRockAng:rockAngle(L),uGranite:L.form===5?1:0,uSnow:L.snow||0,uFarLod:L.farLod??4,uSlopeK:L.slopeK||1.6,uFarStep:L.farStep||.22,uFish:Q.has('nofish')?0:L.fish??((L.kind==='tropical'||L.water==='tropical')?1:.35),
    uSwK:L.swK,uSwA:L.swA,uWA:fA,uWB:fB,uFogB:Li.fog,uCloudShade:Li.cloudShade,uSunVis:Li.sunVis??1,uCloudT:L.t,uDA:dA,uDB:dB,uCardD:cardD,uCardS:cardD>0?SHRUB_RANGE:0,uShrubM:[plantInfo[12],plantInfo[13],plantInfo[14],plantInfo[15]],
    tSim:L.s[0],uLabel:LABEL,uStars:Li.stars||0,uMoonSun:Li.moonSun||[0,-1,0],uMoonLit:Li.moonLit||0,uMoonK:Li.moonK||0});
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.ALWAYS); gl.depthMask(true);
  drawTo(RT.hdrA.f);
  /* Answer images show the ground and water only: plants and spray are left out. */
  if(LABEL){ gl.disable(gl.DEPTH_TEST); return; }
  if(cardD>0){
    /* Plants: full models up close, one card per plant beyond that. */
    gl.depthFunc(gl.LEQUAL);
    if(S.meshes) drawMeshes(S,cam,asp,Li,dA,dB);
    const ref=[0,1,2].map(i=>(S.p0[i]+S.p1[i])*.5);
    for(const C of CARD_LAYERS){
      const g=cardGrid(C,cam,asp);
      use(PR.cards,{uJit:renderJit,uRef:ref,uFreeView:S.kind==='top'?0:1,uMeshD:S.meshes?(C.shrub?MESH_SHRUB:MESH_TREE):0,uGrid:g.w,uShrub:C.shrub,TILE:C.tile,uType:flora,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uTan:cam.tan,uAspect:asp,uDA:dA,uDB:dB,uMaxD:C.range,uTime:L.t,uEdge:.06,
        uDomMin:L.domMin,uDomSize:L.domSize,uFarMin:L.farMin,uFarSize:[FAR_SPAN,FAR_SPAN],tTerr:L.terr,tTerrF:L.terrF,tLit:L.lit,tLitF:L.litFar,tNoise:noiseTex,
        tPA:plantA,tPL:plantL,uModel:plantInfo,tEnv:Li.env,uSun:Li.sun,uSunE:Li.sunE,uFogB:Li.fog,uCloudShade:Li.cloudShade,uCloudT:L.t});
      setI2(PR.cards,'uOrigin',[g.x,g.z]);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,g.w*g.h);
    }
  }
  if(L.sp&&!Q.has('nospray')){
    /* Spray goes over everything already drawn, and leaves no mark in the depth buffer. */
    gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    use(PR.spray,{uJit:renderJit,tP:L.sp[L.si],tV:L.sv[L.si],tLit:L.lit,tEnv:Li.env,tNoise:noiseTex,uTexN:SPRAY_N,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uTan:cam.tan,uAspect:asp,uDA:dA,uDB:dB,uSun:Li.sun,uSunE:Li.sunE,uDomMin:L.domMin,uDomSize:L.domSize,uDensity:1,uResY:RT.h});
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
  if(CALM&&state.cur&&!state.next) cutTo(chooseNext(state.cur),rnd(3,4));
}
const state={cur:null,next:null,fade:0,fadeDur:0,shotT:0,paused:false,last:0,scale:+(Q.get('res')||.8),fps:60,frames:0,accum:0,dtAvg:16.7,ceil:1,cooldown:0,capBy:{},strikes:{}};
/* A steady 30 looks better than a stuttering 45. Each kind of shot gets 60 if it can hold it,
   otherwise an even 30. ?fps=30 or ?fps=60 fixes the rate. */
const FPS_FIX=+(Q.get('fps')||0);
function capKey(S){ return S.L.name+'|'+S.kind; }
function capFor(S){ return FPS_FIX||state.capBy[capKey(S)]||60; }
function chooseNext(prev){
  liveUpdate(); liveSky();
  /* In real-conditions mode, only coasts that suit today's sea, in today's light. */
  /* Still waiting for the first forecast (offline, say): any sea coast, but not the mountain lake. */
  const ready=LOCATIONS.filter(L=>L.ready), pool=LIVE.on?ready.filter(L=>LIVE.locs?LIVE.locs.includes(L):L.form!==6):ready;
  const opts=pool.filter(L=>!prev||L!==prev.L);
  const L=pick(opts.length?opts:pool.length?pool:ready);
  if(state.favOnly){ const S=nextFav(prev); if(S){ bakeLit(S.L,S.lightKey); return S; } }
  const r=Math.random();
  let kind=r<.34?'top':r<.50?'low':r<.60?'canopy':'angled';
  if(prev&&prev.kind===kind&&Math.random()<.6) kind=kind==='top'?'angled':'top';
  const lk=LIVE.on?LIVE.key:null;
  const S=CALM?makeCalmShot(L,lk):makeShot(L,lk,kind);
  bakeLit(L,S.lightKey);
  return S;
}
function applyScale(){
  resizeCanvas();
  const w=Math.max(320,Math.round(canvas.width*state.scale/2)*2),h=Math.max(180,Math.round(canvas.height*state.scale/2)*2);
  allocRT(w,h);
}
function adaptAtCut(){
  /* Change frame rate and resolution only at a cut, when it can't be seen. */
  const d=state.dtAvg,S=state.cur; if(!S) return;
  const cap=capFor(S);
  if(cap===60){
    /* A shot that misses 60 twice runs at an even 30 from then on. One stall doesn't count. */
    if(!FPS_FIX&&d>21){ const k=capKey(S); state.strikes[k]=(state.strikes[k]||0)+1; if(state.strikes[k]>=2) state.capBy[k]=30; }
  }
  if(Q.has('res')) return;
  /* Resolution falls only if a shot can't hold 30, and comes back as soon as there's room. */
  let s=state.scale;
  if(d>38){ state.ceil=Math.min(state.ceil,s); s=Math.max(.66,s*Math.max(.85,Math.sqrt(36/d))); state.cooldown=4; }
  else if(d<36){ if(state.cooldown>0) state.cooldown--; else if(s<1){ s=Math.min(1,s+.07); state.ceil=Math.min(1,Math.max(state.ceil,s)); state.cooldown=1; } }
  if(Math.abs(s-state.scale)>.01){ state.scale=s; applyScale(); }
}
/* ---- Favourites: the place, light and camera path of a shot, kept in this browser. The waves
   themselves are always new, so a favourite shows the same shot of a different moment. ---- */
const FAV_KEY='coastline-favourites-v1';
const FAV_FIELDS=['lightKey','kind','p0','p1','yaw0','yaw1','pitch','fov','noise','steps','maxH','nearH','dur'];
function loadFavs(){ try{ return JSON.parse(localStorage.getItem(FAV_KEY))||[]; }catch(e){ return []; } }
function saveFavs(f){ try{ localStorage.setItem(FAV_KEY,JSON.stringify(f)); return true; }catch(e){ return false; } }
function shotOf(F){
  const L=LOCATIONS.find(l=>l.name===F.loc&&l.ready); if(!L) return null;
  const S={L,favId:F.id,start:0,t:0}; for(const k of FAV_FIELDS) S[k]=F[k];
  liveFix(S);
  return S;
}
function nextFav(prev){
  const favs=loadFavs(); if(!favs.length) return null;
  const opts=favs.length>1?favs.filter(F=>!prev||F.id!==prev.favId):favs;
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
  const S=history.pop(); liveFix(S); bakeLit(S.L,S.lightKey);
  state.next=null; S.t=0; state.cur=S; state.dtAvg=1000/capFor(S);
}
function cutTo(S,fadeDur){
  if(state.cur){ history.push(state.cur); if(history.length>30) history.shift(); }
  /* Off screen until now, or a hard cut: the coast's clock can be wound back unseen (world.js). */
  if(!fadeDur||(S.L!==state.cur?.L&&S.L!==state.next?.L)) timeRebase(S.L);
  S.start=0; S.t=0;
  if(fadeDur>0){ state.next=S; state.fadeDur=fadeDur; state.fade=0; }
  else { adaptAtCut(); state.cur=S; state.next=null; state.dtAvg=1000/capFor(S); }
}
function frame(now){
  requestAnimationFrame(frame);
  /* The small allowance keeps a 60 Hz display on an even every-second-refresh rhythm. */
  if(state.cur&&capFor(state.cur)<45&&now-state.last<29) return;
  const elapsed=Math.min((now-state.last)/1000,.25); state.last=now;
  if(elapsed>0&&elapsed<.25) state.dtAvg+=(elapsed*1000-state.dtAvg)*.06;
  if(state.paused) { return; }
  simTime+=elapsed;
  stepFFT(simTime);
  flyUpdate(elapsed);
  const cur=state.cur;
  advanceSim(cur.L,elapsed);
  cur.t+=elapsed;
  bakeLit(cur.L,cur.lightKey);
  const odd=(state.frames&1)===1;
  if(!state.next||odd||state.fade===0) renderView(cur,Math.min(cur.t/cur.dur,1.2),RT.ldrA.f);
  let finalTex=RT.ldrA.t;
  if(state.next){
    const nx=state.next;
    if(nx.L!==cur.L) advanceSim(nx.L,elapsed);
    nx.t+=elapsed;
    bakeLit(nx.L,nx.lightKey);
    if(!odd||state.fade===0) renderView(nx,nx.t/nx.dur,RT.ldrB.f);
    state.fade+=elapsed/state.fadeDur;
    const k=Math.min(state.fade,1), ks=k*k*(3-2*k);
    use(PR.mix,{tA:RT.ldrA.t,tB:RT.ldrB.t,uK:ks}); drawTo(RT.ldrM.f);
    finalTex=RT.ldrM.t;
    if(state.fade>=1){ state.cur=nx; state.next=null; state.dtAvg=1000/capFor(nx); }
  }
  use(PR.final,{tI:finalTex,uTx:[1/RT.w,1/RT.h],uTime:simTime%FFT_P,uSharp:state.scale<.99?.34:.2}); drawTo(null,canvas.width,canvas.height);
  soundUpdate(state.next&&state.fade>.5?state.next:state.cur);
  /* Scene changes */
  if(!TEST&&!state.next&&state.cur.t>=state.cur.dur){
    const S=chooseNext(state.cur);
    /* Calm mode only dissolves, slowly. With no hard cuts to hide behind, frame rate and resolution are
       adjusted as each dissolve begins. */
    if(CALM){ adaptAtCut(); cutTo(S,rnd(4.5,7)); }
    else { const dissolve=Math.random()<.24; cutTo(S,dissolve?rnd(1.1,1.7):0); }
  }
  state.frames++;
  if(hud.style.display==='block'&&state.frames%15===0){
    const c=state.cur;
    hud.textContent=`${c.favId?'♥ ':''}${c.L.name} · ${c.kind} · ${LIGHTS[c.lightKey].label||c.lightKey}\n${(1000/state.dtAvg).toFixed(0)} fps · render ${RT.w}x${RT.h} (${(state.scale*100).toFixed(0)}%)\nsim ${c.L.nx}x${c.L.nz} @ ${c.L.dx} m · t=${c.L.t.toFixed(1)}s`;
  }
}
const hud=document.getElementById('hud');
addEventListener('keydown',e=>{
  if(flyKey(e,true)) return;
  const k=e.key.toLowerCase();
  if(k==='g'){ toggleFly(); return; }
  if(k==='f'){ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
  else if(k===' '){ state.paused=!state.paused; e.preventDefault(); }
  else if(k==='n'||e.key==='ArrowRight'){ if(state.cur&&!state.next) cutTo(chooseNext(state.cur),0); }
  else if(e.key==='ArrowLeft'){ if(state.cur) goBack(); }
  else if(k==='l'){ if(state.cur) toggleFav(); }
  else if(k==='p'){
    if(!state.favOnly&&!loadFavs().length){ toast('No favourites yet: press L on a scene you like'); return; }
    state.favOnly=!state.favOnly; toast(state.favOnly?`♥ Playing favourites (${loadFavs().length})`:'Playing all scenes');
    if(state.favOnly&&state.cur&&!state.next) cutTo(chooseNext(state.cur),0);
  }
  else if(k==='e'){ exportFavs(); }
  else if(k==='s'){ toggleSound(); }
  else if(k==='c'){ toggleCalm(); }
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

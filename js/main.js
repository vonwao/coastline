'use strict';
/* ---------------------------------------------------------------- Startup ----------- */
const fill=document.getElementById('fill'), msg=document.getElementById('msg');
function bar(p,m){ fill.style.width=(p*100).toFixed(1)+'%'; if(m) msg.textContent=m; }
async function main(){
  /* Starting again after a graphics reset: as it was (gl.js). */
  if(RESUME){ CALM=RESUME.calm; state.favOnly=RESUME.favOnly; }
  emptyVAO=gl.createVertexArray(); gl.bindVertexArray(emptyVAO);
  bar(.01,'Compiling shaders');
  await nextFrame();
  const t0=performance.now();
  buildPrograms();
  /* The view's programs (its four stages, js/shaders/view.js) are the slowest to compile, and aren't
     needed until the first frame, so the coasts are built while they compile. */
  const later=pendingPrograms.filter(p=>VIEW_STAGES.includes(p.name)), early=pendingPrograms.filter(p=>!later.includes(p));
  const total=early.length;
  const doneAt={};
  const seen=()=>pendingPrograms.forEach(p=>{ if(!doneAt[p.name]&&programDone(p)) doneAt[p.name]=performance.now()-t0; });
  while(true){
    seen();
    const n=early.filter(programDone).length;
    bar(.02+.18*n/total);
    if(n===total) break;
    await nextFrame();
  }
  early.forEach(finalizeProgram);
  const tCompile=performance.now()-t0;
  window.COAST.compileTimes=doneAt;

  bar(.2,'Generating textures');
  await nextFrame();
  noiseTex=makeTex(512,512,{fmt:'RGBA8',mips:true,wrap:'repeat',aniso:4});
  { const f=makeFBO(noiseTex); use(PR.noise,{}); drawTo(f); gl.bindTexture(gl.TEXTURE_2D,noiseTex); gl.generateMipmap(gl.TEXTURE_2D); gl.deleteFramebuffer(f); }
  /* 3D noise for the clouds, 128 texels each way, drawn one slice at a time. */
  { const N=128; noise3Tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D,noise3Tex); gl.texStorage3D(gl.TEXTURE_3D,8,gl.RGBA8,N,N,N);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.REPEAT],[gl.TEXTURE_WRAP_T,gl.REPEAT],[gl.TEXTURE_WRAP_R,gl.REPEAT]]) gl.texParameteri(gl.TEXTURE_3D,k,v);
    const f=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,f);
    for(let z=0;z<N;z++){ gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,noise3Tex,0,z); use(PR.noise3,{uZ:(z+.5)/N}); gl.viewport(0,0,N,N); gl.drawArrays(gl.TRIANGLES,0,3); }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.deleteFramebuffer(f); gl.bindTexture(gl.TEXTURE_3D,noise3Tex); gl.generateMipmap(gl.TEXTURE_3D); }
  laceTex=makeTex(1024,1024,{fmt:'RGBA8',mips:true,wrap:'repeat',aniso:4});
  { const f=makeFBO(laceTex); use(PR.lace,{}); drawTo(f); gl.bindTexture(gl.TEXTURE_2D,laceTex); gl.generateMipmap(gl.TEXTURE_2D); gl.deleteFramebuffer(f); }
  crownTex=[0,1].map(palm=>{
    const tx=makeTex(1024,1024,{fmt:'RGBA8',mips:true,wrap:'repeat',aniso:4});
    const f=makeFBO(tx); use(PR.crown,{uPalm:palm}); drawTo(f);
    gl.bindTexture(gl.TEXTURE_2D,tx); gl.generateMipmap(gl.TEXTURE_2D); gl.deleteFramebuffer(f);
    return tx;
  });
  { const h=makeTex(2048,2048,{fmt:'RGBA16F',filter:'nearest'}),fh=makeFBO(h); use(PR.rockH,{}); drawTo(fh);
    rockTex=makeTex(2048,2048,{fmt:'RGBA8',mips:true,wrap:'repeat',aniso:4});
    const fn=makeFBO(rockTex); use(PR.rockN,{tI:h}); drawTo(fn);
    gl.bindTexture(gl.TEXTURE_2D,rockTex); gl.generateMipmap(gl.TEXTURE_2D);
    gl.deleteFramebuffer(fh); gl.deleteFramebuffer(fn); gl.deleteTexture(h); }
  buildFFT();
  emptyVAO=gl.createVertexArray(); gl.bindVertexArray(emptyVAO);
  await nextFrame();
  bar(.24,'Painting the sky');
  buildEnvs();
  await nextFrame();
  stepFFT(0);
  /* The plants are baked once the first shot is known, for its own vegetation preset (js/vegetation.js). */

  /* Real conditions: ask for the forecast now, so it's there by the time the coasts are ready. */
  liveUpdate();
  const only=Q.get('only')||RECIPE_ONLY||PRESET_ONLY||reelOnly();
  /* The slideshow starts with one coast and builds the others as they're needed (COASTS in js/world.js).
     Tools, the studio and anything that names its coasts build them all now. */
  const lazy=!only&&!TEST&&!STUDIO&&!Q.has('allcoasts')&&LOCATIONS.length>COAST_KEEP;
  const list=only?only.split(',').map(i=>LOCATIONS[+i]):lazy?[pick(coastEligible())]:LOCATIONS;
  COASTS.auto=lazy;
  for(let i=0;i<list.length;i++){
    const L=list[i];
    const base=.26+.74*i/list.length, span=.74/list.length;
    bar(base,'Starting the sea: '+L.name.toLowerCase());
    await buildLocation(L,p=>{ bar(base+span*p); seen(); });
  }
  state.scale=Math.min(1,state.scale);
  applyScale();
  liveSky();
  const firsts=LIVE.on?list.filter(L=>LIVE.locs?LIVE.locs.includes(L):L.form!==6):[];
  const first=pick(firsts.length?firsts:list), lk=LIVE.on?LIVE.key:undefined;
  /* A ready-made scene (?preset=, js/presets.js) or a recipe (?recipe=, or the studio's last scene) comes
     first, if there is one (js/recipe.js). Its plants are baked while the view shader may still compile. */
  const S=reelFirst()||presetFirst()||recipeFirst()||(FALL_ONLY&&first.falls&&first.falls.length?makeFallShot(first,pick(first.lights.filter(k=>k!=='storm')),CALM):null)||(CALM?makeCalmShot(first,lk):makeShot(first,lk)); bakeLit(S.L,S.lightKey); S.t=0;
  bar(.99,'Growing the plants');
  await vegBake(vegOf(S)); vegRefresh(S);
  /* The view shader may still be compiling. Say so, with the time it took last time (kept in this browser),
     so a long first start after an update doesn't look stuck. */
  const viewReady=()=>later.every(programDone);
  if(!viewReady()){
    let prev=0; try{ prev=+localStorage.getItem('coastline-view-ms')||0; }catch(e){}
    const w0=performance.now();
    while(!viewReady()){
      seen();
      const s=(performance.now()-w0)/1000, sofar=(performance.now()-t0)/1000;
      bar(.99,'Preparing the picture: '+Math.round(s)+' s'+(prev>sofar*1000+3000?' (last time the start took about '+Math.round(prev/1000)+' s)':''));
      await nextFrame();
    }
  }
  seen();
  later.forEach(finalizeProgram);
  try{ localStorage.setItem('coastline-view-ms',Math.round(performance.now()-t0)); }catch(e){}
  rhythmCut(S,true);
  state.cur=S; coastShown(S.L); state.last=performance.now();
  document.getElementById('load').style.opacity=0;
  setTimeout(()=>document.getElementById('load').remove(),600);
  if(!CALM&&!REEL_LIVE.on){ const hint=document.getElementById('hint'); hint.style.opacity=.55; setTimeout(()=>hint.style.opacity=0,6000); }
  if(RESUME?RESUME.sound:Q.has('sound')) soundAuto();
  /* A beach picked before (B) is followed again without being asked, so say so: the author, 22 November, saw
     only night scenes opening the page, because it was night at a beach he had once picked. */
  if(LIVE.on&&!REEL_LIVE.on&&!window.IN_WALLPAPER) setTimeout(()=>toast(`Following ${LIVE.name||'a real beach'}: its sea and sky as they are now. B to change, or see the Menu`,8000),1200);
  try{ sessionStorage.removeItem('coastline-resume'); }catch(e){}
  window.COAST.compileMs=tCompile; window.COAST.loadMs=performance.now()-t0; window.COAST.ready=true;
  requestAnimationFrame(frame);
}
/* Hooks used for automated visual checks */
window.COAST={ready:false,state,LOCATIONS,LIGHTS,WATER,toggleFav,loadFavs,goBack,meshInfo(){ return plantMesh.map(M=>M.nV); },
  /* A lighting setup for a given sky, for checks: {sunEl, sunAz, moonEl, moonAz, lit, cloud, wind, rain}. */
  sky(D,key='test'){ if(LIGHTS[key]) freeEnv(LIGHTS[key]); LIGHTS[key]=skyLight(Object.assign({sunAz:30,moonEl:-20,moonAz:0,lit:0,cloud:30,wind:10,rain:0},D),D.seed||301); bakeEnv(LIGHTS[key]); return LIGHTS[key].label; },
  show(i,light,kind,opts){ const L=LOCATIONS[i]; const S=makeShot(L,light,kind); if(opts) Object.assign(S,opts); bakeLit(L,S.lightKey); S.t=0; state.cur=S; state.next=null; return {meshes:S.meshes,p0:S.p0,p1:S.p1,kind:S.kind,light:S.lightKey,dur:S.dur}; },
  advance(i,seconds){ const L=LOCATIONS[i]; const dt=1/60; const n=Math.ceil(seconds/dt); for(let k=0;k<n;k++){ simStep(L,dt); foamStep(L,dt);} rmPass(L); },
  bench(n=60){ /* Synchronised timing: every frame is forced to finish on the GPU. */
    const px=new Uint8Array(4); const S=state.cur; const t0=performance.now();
    for(let i=0;i<n;i++){ const dt=1/60; simTime+=dt; stepFFT(simTime); advanceSim(S.L,dt); renderView(S,.5,RT.ldrA.f);
      use(PR.final,{tI:RT.ldrA.t,uTx:[1/RT.w,1/RT.h],uTime:simTime,uSharp:.16}); drawTo(null,canvas.width,canvas.height);
      gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); }
    return (performance.now()-t0)/n; },
  stats(){ return {capBy:state.capBy,fps:1000/state.dtAvg,scale:state.scale,rt:[RT.w,RT.h],cur:state.cur&&state.cur.L.name,kind:state.cur&&state.cur.kind,light:state.cur&&state.cur.lightKey,dur:state.cur&&state.cur.dur,err:gl.getError()}; },
  readState(i){ const L=LOCATIONS[i]; gl.bindFramebuffer(gl.FRAMEBUFFER,L.sf[0]); const a=new Float32Array(L.nx*L.nz*4); gl.readPixels(0,0,L.nx,L.nz,gl.RGBA,gl.FLOAT,a); let m=[0,0,0,0],nan=0,hmax=0,umax=0,wet=0; for(let k=0;k<a.length;k+=4){ if(!isFinite(a[k])||!isFinite(a[k+1])||!isFinite(a[k+2])) nan++; hmax=Math.max(hmax,a[k]); umax=Math.max(umax,Math.abs(a[k+1]),Math.abs(a[k+2])); if(a[k]>.002) wet++; } return {nan,hmax,umax,wetFrac:wet/(L.nx*L.nz),t:L.t}; },
  renderer(){ const e=gl.getExtension('WEBGL_debug_renderer_info'); return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER); }
};
main().catch(e=>{ console.error(e); msg.textContent='Could not start: '+e.message; });

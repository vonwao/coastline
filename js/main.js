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
  /* The view shader is by far the slowest to compile, and isn't needed until the first frame, so the
     coasts are built while it compiles. */
  const later=pendingPrograms.filter(p=>p.name==='main'), early=pendingPrograms.filter(p=>!later.includes(p));
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
  bar(.25,'Growing the plants');
  await nextFrame();
  await buildPlants();

  /* Real conditions: ask for the forecast now, so it's there by the time the coasts are ready. */
  liveUpdate();
  const only=Q.get('only');
  const list=only?only.split(',').map(i=>LOCATIONS[+i]):LOCATIONS;
  for(let i=0;i<list.length;i++){
    const L=list[i];
    const base=.26+.74*i/list.length, span=.74/list.length;
    bar(base,'Starting the sea: '+L.name.toLowerCase());
    await buildLocation(L,p=>{ bar(base+span*p); seen(); });
  }
  while(!later.every(programDone)) await nextFrame();
  seen(); later.forEach(finalizeProgram);
  state.scale=Math.min(1,state.scale);
  applyScale();
  liveSky();
  const firsts=LIVE.on?list.filter(L=>LIVE.locs?LIVE.locs.includes(L):L.form!==6):[];
  const first=pick(firsts.length?firsts:list), lk=LIVE.on?LIVE.key:undefined;
  const S=CALM?makeCalmShot(first,lk):makeShot(first,lk); bakeLit(first,S.lightKey); S.t=0;
  state.cur=S; state.last=performance.now();
  document.getElementById('load').style.opacity=0;
  setTimeout(()=>document.getElementById('load').remove(),600);
  if(!CALM){ const hint=document.getElementById('hint'); hint.style.opacity=.55; setTimeout(()=>hint.style.opacity=0,6000); }
  if(RESUME?RESUME.sound:Q.has('sound')) soundAuto();
  try{ sessionStorage.removeItem('coastline-resume'); }catch(e){}
  window.COAST.compileMs=tCompile; window.COAST.loadMs=performance.now()-t0; window.COAST.ready=true;
  requestAnimationFrame(frame);
}
/* Hooks used for automated visual checks */
window.COAST={ready:false,state,LOCATIONS,LIGHTS,WATER,toggleFav,loadFavs,goBack,meshInfo(){ return plantMesh.map(M=>M.nV); },
  /* A lighting setup for a given sky, for checks: {sunEl, sunAz, moonEl, moonAz, lit, cloud, wind, rain}. */
  sky(D,key='test'){ if(LIGHTS[key]&&LIGHTS[key].env) gl.deleteTexture(LIGHTS[key].env); LIGHTS[key]=skyLight(Object.assign({sunAz:30,moonEl:-20,moonAz:0,lit:0,cloud:30,wind:10,rain:0},D),D.seed||301); bakeEnv(LIGHTS[key]); return LIGHTS[key].label; },
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

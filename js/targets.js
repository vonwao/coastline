'use strict';
/* ---------------------------------------------------------------- Render targets ---- */
let RT={};
function allocRT(w,h){
  if(RT.w===w&&RT.h===h) return;
  for(const k of ['hdrA','hdrB','ldrA','ldrB','ldrM','cloud']) if(RT[k]){ gl.deleteTexture(RT[k].t); gl.deleteFramebuffer(RT[k].f); }
  if(RT.bloom) for(const b of RT.bloom){ gl.deleteTexture(b.t); gl.deleteFramebuffer(b.f); }
  const mk=(fmt)=>{ const t=makeTex(w,h,{fmt}); return {t,f:makeFBO(t)}; };
  if(RT.depth) gl.deleteTexture(RT.depth);
  if(RT.z){ gl.deleteTexture(RT.z.t); gl.deleteFramebuffer(RT.z.f); }
  if(RT.g){ for(const t of RT.g.t) gl.deleteTexture(t); gl.deleteFramebuffer(RT.g.a); gl.deleteFramebuffer(RT.g.b); }
  if(RT.taa) for(const s of RT.taa) for(let i=0;i<2;i++){ gl.deleteTexture(s.t[i]); gl.deleteFramebuffer(s.f[i]); }
  /* The depth buffer is a texture, so the smoothing over time (taaResolve in frame.js) can read how far
     away each pixel is, and find where it was on the screen a frame ago. */
  const depth=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,depth); gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT24,w,h);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
  /* Two history slots for that smoothing: a shot and the one dissolving in each keep their own. Each slot
     has two textures, read one and write the other, in half floats so slow changes aren't lost to rounding. */
  const slot=()=>{ const t=[makeTex(w,h),makeTex(w,h)]; return {t,f:t.map(x=>makeFBO(x)),i:0,S:null,valid:false,n:0,prev:null}; };
  /* cloud: the sky with its clouds, at half size, drawn before the view (PR.clouds), which reads it for its
     sky pixels. Half size costs a quarter as much; the smoothing over time recovers most of the detail. */
  const ct=makeTex(Math.max(2,w>>1),Math.max(2,h>>1));
  /* g: what the stages of the view hand on to each other (FS_VIEW_A to FS_VIEW_W in js/shaders/view.js).
     Stage A draws into a0 and a1, stage B into b0 and b1; both also write the depth buffer. a1 holds the
     distance along the view ray, which half floats would round to half a metre a kilometre away, so it
     is kept in full floats. They are read pixel for pixel, never smoothed. */
  const gt=['RGBA16F','RGBA32F','RGBA16F','RGBA16F'].map(fmt=>makeTex(w,h,{fmt,filter:'nearest'}));
  const g={t:gt,a0:gt[0],a1:gt[1],b0:gt[2],b1:gt[3],a:makeFBO(gt[0],gt[1]),b:makeFBO(gt[2],gt[3])};
  for(const f of [g.a,g.b]){ gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0); }
  /* z: the quarter-size first pass of the march (FS_VIEW_Z): a distance for each block of 4 x 4 pixels. */
  const zw=Math.ceil(w/4),zh=Math.ceil(h/4),zt=makeTex(zw,zh,{fmt:'RGBA32F',filter:'nearest'});
  RT={w,h,depth,g,z:{t:zt,f:makeFBO(zt),w:zw,h:zh},hdrA:mk('RGBA16F'),ldrA:mk('RGBA8'),ldrB:mk('RGBA8'),ldrM:mk('RGBA8'),cloud:{t:ct,f:makeFBO(ct)},bloom:[],taa:[slot(),slot()]};
  gl.bindFramebuffer(gl.FRAMEBUFFER,RT.hdrA.f); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);
  let bw=w,bh=h;
  for(let i=0;i<5;i++){ bw=Math.max(2,bw>>1); bh=Math.max(2,bh>>1); const t=makeTex(bw,bh); RT.bloom.push({t,f:makeFBO(t),w:bw,h:bh}); }
}
function resizeCanvas(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  let cw=Math.round(innerWidth*dpr),ch=Math.round(innerHeight*dpr);
  /* The canvas matches the screen up to 3840 wide (a 4K screen), so the picture is stretched to it once,
     by the last pass's filter (FS_FINAL), instead of by it to 2560 and then again by the browser. How many
     pixels are drawn is set by the rhythm (js/rhythm.js), not by this. */
  const lim=+(Q.get('maxw')||3840); if(cw>lim){ ch=Math.round(ch*lim/cw); cw=lim; }
  if(canvas.width!==cw||canvas.height!==ch){ canvas.width=cw; canvas.height=ch; }
}

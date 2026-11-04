'use strict';
/* ---------------------------------------------------------------- Render targets ---- */
let RT={};
function allocRT(w,h){
  if(RT.w===w&&RT.h===h) return;
  for(const k of ['hdrA','hdrB','ldrA','ldrB','ldrM']) if(RT[k]){ gl.deleteTexture(RT[k].t); gl.deleteFramebuffer(RT[k].f); }
  if(RT.bloom) for(const b of RT.bloom){ gl.deleteTexture(b.t); gl.deleteFramebuffer(b.f); }
  const mk=(fmt)=>{ const t=makeTex(w,h,{fmt}); return {t,f:makeFBO(t)}; };
  if(RT.depth) gl.deleteRenderbuffer(RT.depth);
  const depth=gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER,depth); gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);
  RT={w,h,depth,hdrA:mk('RGBA16F'),ldrA:mk('RGBA8'),ldrB:mk('RGBA8'),ldrM:mk('RGBA8'),bloom:[]};
  gl.bindFramebuffer(gl.FRAMEBUFFER,RT.hdrA.f); gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  let bw=w,bh=h;
  for(let i=0;i<5;i++){ bw=Math.max(2,bw>>1); bh=Math.max(2,bh>>1); const t=makeTex(bw,bh); RT.bloom.push({t,f:makeFBO(t),w:bw,h:bh}); }
}
function resizeCanvas(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  let cw=Math.round(innerWidth*dpr),ch=Math.round(innerHeight*dpr);
  const lim=+(Q.get('maxw')||2560); if(cw>lim){ ch=Math.round(ch*lim/cw); cw=lim; }
  if(canvas.width!==cw||canvas.height!==ch){ canvas.width=cw; canvas.height=ch; }
}

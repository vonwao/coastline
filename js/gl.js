'use strict';
/* =====================================================================================
   COASTLINE — a live ocean-and-shore simulation.

   Each location owns a real 2D shallow-water solver (staggered-grid, wet/dry capable)
   running over baked procedural terrain. Swell enters from an offshore sponge layer and
   then shoals, steepens, breaks and runs up the beach on its own. Foam, bubbles, wet
   sand and suspended sediment are advected through that flow. A deep-water FFT spectrum
   supplies the small-scale surface and the seabed caustics.

   Rendering is a per-pixel height-field march with physically based water optics.
   ===================================================================================== */

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const HQ = Q.has('hq'); /* Higher detail settings, for pre-rendering */
/* ?seed=N makes the sea repeatable, so two renders can be compared wave for wave. */
if(Q.has('seed')){ let a=+Q.get('seed')|0; Math.random=()=>{ a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', {antialias:false, alpha:false, depth:false, stencil:false,
  powerPreference:'high-performance', preserveDrawingBuffer:TEST||Q.has('pdb'), desynchronized:false});

/* A graphics reset (a driver update, a GPU crash, sometimes waking from sleep) loses everything on the
   GPU, and the screen stayed black for good. Building it all again is the same work as starting up, so
   the page starts again, keeping calm mode, sound and favourites-only as they were (the beach is kept
   already). If restarts keep failing, they're spaced out to every five minutes. Not for tools (?test). */
const RESUME=(()=>{ try{ const r=JSON.parse(sessionStorage.getItem('coastline-resume')||'null'); return r&&Date.now()-r.at<10*60000?r:null; }catch(e){ return null; } })();
function restartSoon(keep){
  if(TEST||restartSoon.on) return; restartSoon.on=true;
  let past=[]; try{ past=JSON.parse(sessionStorage.getItem('coastline-restarts')||'[]').filter(t=>Date.now()-t<15*60000); }catch(e){}
  try{ if(keep) sessionStorage.setItem('coastline-resume',JSON.stringify(Object.assign(keep,{at:Date.now()})));
       sessionStorage.setItem('coastline-restarts',JSON.stringify([...past,Date.now()])); }catch(e){}
  console.warn('[restart] graphics reset; starting again'+(past.length>=3?' in five minutes':''));
  setTimeout(()=>location.reload(),past.length>=3?5*60000:2000);
}
canvas.addEventListener('webglcontextlost',()=>{
  /* While starting up, keep what this start was asked for. */
  restartSoon(window.COAST&&COAST.ready?{calm:CALM,sound:SOUND.on,favOnly:!!state.favOnly}:RESUME||{calm:CALM,sound:Q.has('sound'),favOnly:false});
});
function fail(m){ document.getElementById('msg').textContent = m; document.getElementById('bar').style.display='none';
  /* Straight after a reset the browser may refuse graphics for a while: try again. */
  if(RESUME&&(!gl||gl.isContextLost())) restartSoon(RESUME);
  throw new Error(m); }
if(!gl) fail('This simulation needs WebGL2, which is not available in this browser.');
if(!gl.getExtension('EXT_color_buffer_float')) fail('This GPU cannot render to floating-point textures, which the simulation needs.');
gl.getExtension('OES_texture_float_linear');
const parallelCompile = gl.getExtension('KHR_parallel_shader_compile');
const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
gl.bindVertexArray(gl.createVertexArray());
gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);

/* ---------------------------------------------------------------- GL helpers -------- */
function makeTex(w,h,opt={}){
  const {fmt='RGBA16F',filter='linear',wrap='clamp',mips=false,data=null}=opt;
  const F={RGBA8:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE],RGBA16F:[gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT],
           RGBA32F:[gl.RGBA32F,gl.RGBA,gl.FLOAT],RG8:[gl.RG8,gl.RG,gl.UNSIGNED_BYTE]}[fmt];
  const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
  const levels=mips?Math.floor(Math.log2(Math.max(w,h)))+1:1;
  gl.texStorage2D(gl.TEXTURE_2D,levels,F[0],w,h);
  if(data) gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,F[1],F[2],data);
  const mag=filter==='linear'?gl.LINEAR:gl.NEAREST;
  const min=mips?gl.LINEAR_MIPMAP_LINEAR:mag;
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,mag);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,min);
  const W=wrap==='repeat'?gl.REPEAT:gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,W);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,opt.wrapT==='clamp'?gl.CLAMP_TO_EDGE:W);
  if(opt.aniso&&aniso) gl.texParameterf(gl.TEXTURE_2D,aniso.TEXTURE_MAX_ANISOTROPY_EXT,opt.aniso);
  t.w=w;t.h=h;t.mips=mips;
  return t;
}
function makeFBO(...texs){
  const f=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,f);
  texs.forEach((t,i)=>gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t,0));
  gl.drawBuffers(texs.map((_,i)=>gl.COLOR_ATTACHMENT0+i));
  const s=gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if(s!==gl.FRAMEBUFFER_COMPLETE) fail('Framebuffer incomplete: 0x'+s.toString(16));
  f.w=texs[0].w;f.h=texs[0].h;
  return f;
}
const VS_FSQ=`#version 300 es
out vec2 vUV;
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); vUV=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;

const pendingPrograms=[];
function makeProgram(name,fs,vs=VS_FSQ){
  const p=gl.createProgram();
  const mk=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);gl.attachShader(p,s);return s;};
  const v=mk(gl.VERTEX_SHADER,vs), f=mk(gl.FRAGMENT_SHADER,fs);
  gl.linkProgram(p);
  const P={name,p,v,f,fsSrc:fs,u:null};
  pendingPrograms.push(P);
  return P;
}
function programDone(P){ return !parallelCompile || gl.getProgramParameter(P.p,parallelCompile.COMPLETION_STATUS_KHR); }
function finalizeProgram(P){
  if(!gl.getProgramParameter(P.p,gl.LINK_STATUS)){
    const log=(gl.getShaderInfoLog(P.f)||'')+(gl.getShaderInfoLog(P.v)||'')+(gl.getProgramInfoLog(P.p)||'');
    console.error('Shader '+P.name+':\n'+log);
    fail('Shader failed to build: '+P.name);
  }
  P.u={}; const n=gl.getProgramParameter(P.p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){ const a=gl.getActiveUniform(P.p,i); const nm=a.name.replace(/\[0\]$/,'');
    P.u[nm]={loc:gl.getUniformLocation(P.p,a.name),type:a.type,size:a.size}; }
}
function use(P,vals){
  gl.useProgram(P.p); let unit=0;
  for(const k in vals){
    const U=P.u[k]; if(!U) continue; const v=vals[k]; const L=U.loc;
    switch(U.type){
      case gl.FLOAT: U.size>1?gl.uniform1fv(L,v):gl.uniform1f(L,v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(L,v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(L,v); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(L,v); break;
      case gl.INT: case gl.BOOL: gl.uniform1i(L,v); break;
      case gl.SAMPLER_2D: gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,v); gl.uniform1i(L,unit); unit++; break;
      case gl.SAMPLER_2D_ARRAY: gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D_ARRAY,v); gl.uniform1i(L,unit); unit++; break;
    }
  }
  gl.activeTexture(gl.TEXTURE0);
}
function drawTo(f,w,h){
  gl.bindFramebuffer(gl.FRAMEBUFFER,f);
  gl.viewport(0,0,w??(f?f.w:canvas.width),h??(f?f.h:canvas.height));
  gl.drawArrays(gl.TRIANGLES,0,3);
}
const nextFrame=()=>new Promise(r=>requestAnimationFrame(r));

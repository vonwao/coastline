'use strict';
/* ---- Real coast shapes (a test): ?coast=<id> ----
   Loads coasts/<id>.js, written by tools/realcoast.js from real elevation data, and runs the simulation on
   that coast alone: the real land and seabed, with the waves solved over them. The sea and sky follow the
   real place too (as ?live= does), unless the address has its own ?live=, or ?test.

   What comes from the data: the shape of the land and the seabed, at the data's resolution (3 to 30 m),
   and from that, where sand, rock and plants go (tools/realcoast.js works this out from height, slope and
   distance to the water). What doesn't: anything smaller than the data's grid, which is made up here as on
   the made-up coasts (blocky relief on rock, plants' bumps); and buildings, roads and piers, which the
   simulation can't draw, so towns come out as plain ground or woods. */
const REAL_ID=Q.get('coast');
let REAL_COAST=null;
/* Written into the page while it loads, so the data is in before the coasts are built. */
if(REAL_ID&&/^[\w-]+$/.test(REAL_ID)) document.write(`<script src="coasts/${REAL_ID}.js"><\/script>`);

function addRealCoast(meta,near,far){
  const s=meta.sim, tall=meta.maxH>400;
  const L={name:'Real: '+meta.name,kind:'rocky',water:meta.water||'surf',flora:meta.flora??1,type:2,form:7,seed:1.3,
    dx:s.dx,nx:s.nx,nz:s.nz,xMin:s.xMin,hmax:meta.hmax||6,Hs:1.3,T:10,obl:0,maxH:Math.ceil(meta.maxH+30),
    /* Real hills and mountains behind the coast need a finer ray march than low made-up coasts. */
    farLod:tall?2:4,slopeK:tall?2:1.6,farStep:tall?.08:.22,marchK:tall?6:4,
    lights:['morning','late','highSun','golden','moody','storm'],real:{meta,near,far},realFacing:meta.facing};
  if(HQ){ const G=+(Q.get('grid')||1.5); L.dx/=G; L.nx=Math.round(L.nx*G); L.nz=Math.round(L.nz*G); }
  LOCATIONS.splice(0,LOCATIONS.length,L);
  REAL_COAST=L;
  if(!Q.has('live')&&!TEST){ Object.assign(LIVE,{on:true,lat:meta.lat,lon:meta.lon,facing:meta.facing}); LIVE.name=meta.name; }
  console.log('[coast]',meta.name,meta.source,JSON.stringify(meta.sources));
}
/* The swell's angle to this real shore, from the direction it comes from: 0 straight in. Beyond about 50
   degrees it couldn't reach this shore directly; it wraps in at a steep angle instead. */
function realObl(L,dir){ let a=L.realFacing-dir; a=((a+540)%360)-180; return Math.max(-50,Math.min(50,a)); }

/* ---- The bake: real heights, smoothly interpolated, plus made-up detail below the data's grid ---- */
const FS_TERRAIN_REAL=HEAD+NOISE+`
in vec2 vUV; layout(location=0) out vec4 o; uniform vec2 uMin,uSize; uniform float uSeed,uNear,uTexel;
uniform sampler2D tNoise,tRH,tRC; uniform vec4 uRH,uRC;
float fa(vec2 p){ return textureLod(tNoise,p/4.,0.).r; }
`+TERRAIN_ROCK+`
/* A cubic B-spline through four bilinear reads: smooth slopes, with no creases along the data's grid. */
float bspline(sampler2D t,vec2 c){
  vec2 ts=vec2(textureSize(t,0)); c-=.5; vec2 i=floor(c),f=c-i,f2=f*f,f3=f2*f;
  vec2 w0=(1.-3.*f+3.*f2-f3)/6.,w1=(4.-6.*f2+3.*f3)/6.,w2=(1.+3.*f+3.*f2-3.*f3)/6.,w3=f3/6.;
  vec2 g0=w0+w1,g1=w2+w3,h0=(i-1.+w1/g0+.5)/ts,h1=(i+1.+w3/g1+.5)/ts;
  return g0.y*(g0.x*textureLod(t,h0,0.).r+g1.x*textureLod(t,vec2(h1.x,h0.y),0.).r)
        +g1.y*(g0.x*textureLod(t,vec2(h0.x,h1.y),0.).r+g1.x*textureLod(t,h1,0.).r);
}
void main(){
  vec2 p=uMin+vUV*uSize, q=p+uSeed*vec2(71.,13.);
  float h=bspline(tRH,(p-uRH.xy)*uRH.z+.5);
  vec2 c=textureLod(tRC,((p-uRC.xy)*uRC.z+.5)/vec2(textureSize(tRC,0)),0.).rg;
  /* Ragged edges for the sand and the plants, as on the made-up coasts. */
  float n1=fa(q/23.)-.5,n2=fa(q/6.)-.5;
  float sand=smoothstep(.3,.7,c.r+n1*.35+n2*.18);
  float veg=smoothstep(.2,.6,c.g+n1*.3+n2*.2)*(.42+.92*fa(q/31.));
  /* Real data is 3 to 30 m apart: the blocks, joints and fine relief of rock are made up below that. */
  float rockK=(1.-sand)*(1.-.8*min(veg,1.)), hIn=h;
  vec2 rel=rockRelief(q);
  float wall=smoothstep(.5,1.7,length(vec2(dFdx(hIn),dFdy(hIn)))/uTexel);
  h+=rel.x*.4*rockK*mix(1.,.34,wall)*smoothstep(-9.,-2.,hIn);
  h+=rel.y*rockK*mix(1.,.12,wall)*smoothstep(-6.,.4,hIn);
  h+=veg*(.3+.5*fa(q/7.))*step(.5,hIn);
  vec4 a=vec4(h,0.,min(veg,1.),sand);
  float sl=length(vec2(dFdx(a.x),dFdy(a.x)))/uTexel;
  /* Rock: steep ground, and whatever is neither sand nor plants (the seabed included). Unlike the
     made-up coasts, low land isn't rock by default: real low banks are mostly scrub and marsh. */
  a.y=max(smoothstep(.5,.9,sl),(1.-smoothstep(.15,.5,a.z))*(1.-a.w));
  a.w*=1.-smoothstep(.5,.85,sl)*smoothstep(.2,1.,a.x);
  a.y*=1.-a.w;
  o=a;
}`;
function realTextures(G){
  if(G.tex) return;
  const b=Uint8Array.from(atob(G.h16),ch=>ch.charCodeAt(0)), i16=new Int16Array(b.buffer), f=new Float32Array(i16.length);
  for(let i=0;i<f.length;i++) f[i]=i16[i]*G.scale;
  const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texStorage2D(gl.TEXTURE_2D,1,gl.R32F,G.w,G.h);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,G.w,G.h,gl.RED,gl.FLOAT,f);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
  const c=Uint8Array.from(atob(G.cover),ch=>ch.charCodeAt(0));
  G.ctex=makeTex(G.cw,G.ch,{fmt:'RG8',data:c});
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
  G.tex=t;
}
/* Bake one of a real coast's terrain textures (near: the simulated strip; far: the whole view), in
   tiles as bakeTerrain() does. */
async function bakeRealTerrain(L,tex,near){
  const G=near?L.real.near:L.real.far; realTextures(G);
  const min=near?L.domMin:[-FAR_SPAN*.5+L.domMin[0]+L.domSize[0]*.5,-FAR_SPAN*.5], size=near?L.domSize:[FAR_SPAN,FAR_SPAN];
  const f=makeFBO(tex), P=PR.terrainReal, tiles=near?4:2;
  const set=()=>{ use(P,{tNoise:noiseTex,tRH:G.tex,tRC:G.ctex,uMin:min,uSize:size,uSeed:L.seed,uNear:near?1:0,uTexel:size[0]/tex.w,
    uRH:[G.x0,G.z0,1/G.step,0],uRC:[G.x0,G.z0,1/(G.step*2),0]}); gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.viewport(0,0,tex.w,tex.h); gl.enable(gl.SCISSOR_TEST); };
  set();
  for(let j=0;j<tiles;j++)for(let i=0;i<tiles;i++){
    const x0=Math.floor(tex.w*i/tiles),x1=Math.floor(tex.w*(i+1)/tiles),y0=Math.floor(tex.h*j/tiles),y1=Math.floor(tex.h*(j+1)/tiles);
    gl.scissor(x0,y0,x1-x0,y1-y0); gl.drawArrays(gl.TRIANGLES,0,3);
    if(i%2===1){ gl.disable(gl.SCISSOR_TEST); await nextFrame(); set(); }
  }
  gl.disable(gl.SCISSOR_TEST);
  gl.bindTexture(gl.TEXTURE_2D,tex); gl.generateMipmap(gl.TEXTURE_2D);
  gl.deleteFramebuffer(f);
}

'use strict';
/* ------ Post ------ */
const FS_BDOWN=HEAD+`in vec2 vUV; out vec4 o; uniform sampler2D tI; uniform vec2 uTx; uniform float uThr;
void main(){ vec3 c=vec3(0.);
  for(int i=0;i<4;i++){ vec2 s=vec2(i&1,(i>>1)&1)*2.-1.; c+=textureLod(tI,vUV+s*uTx,0.).rgb; } c*=.25;
  if(uThr>0.){ float l=max(c.r,max(c.g,c.b)); c*=smoothstep(uThr,uThr*1.9,l); c=min(c,vec3(24.)); }
  o=vec4(c,1.); }`;
const FS_BUP=HEAD+`in vec2 vUV; out vec4 o; uniform sampler2D tI; uniform vec2 uTx;
void main(){ vec3 c=vec3(0.);
  for(int i=0;i<4;i++){ vec2 s=vec2(i&1,(i>>1)&1)*2.-1.; c+=textureLod(tI,vUV+s*uTx,0.).rgb; } o=vec4(c*.25,1.); }`;
const FS_TONE=HEAD+`in vec2 vUV; out vec4 o; uniform sampler2D tI,tB; uniform float uExp,uBloom,uSat,uNight; uniform vec3 uTint;
vec3 aces(vec3 v){
  const mat3 A=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777);
  const mat3 B=mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
  v=A*v; vec3 a=v*(v+.0245786)-.000090537; vec3 b=v*(.983729*v+.4329510)+.238081; return clamp(B*(a/b),0.,1.);
}
void main(){
  vec3 c=textureLod(tI,vUV,0.).rgb; vec3 b=textureLod(tB,vUV,0.).rgb;
  c=c+b*uBloom; c*=uExp*uTint;
  /* Night: in dim light the eye loses colour and sees what's left as bluish (the Purkinje shift). The
     brightest things, like the moon and its path on the water, keep a little more of their own colour. */
  if(uNight>0.){
    float y=dot(c,vec3(.2126,.7152,.0722));
    c=mix(c,y*vec3(.60,.80,1.18),uNight*(.88-.3*smoothstep(.6,3.,y)));
  }
  c=aces(c*1.08);
  float l=dot(c,vec3(.2126,.7152,.0722)); c=max(mix(vec3(l),c,uSat),0.);
  c=pow(c,vec3(1./2.2));
  o=vec4(c,dot(c,vec3(.299,.587,.114)));
}`;
const FS_MIX=HEAD+`in vec2 vUV; out vec4 o; uniform sampler2D tA,tB; uniform float uK; void main(){ o=mix(texture(tA,vUV),texture(tB,vUV),uK); }`;
/* Smoothing over time (temporal anti-aliasing), for the live window. Each frame is drawn from a camera
   shifted by a fraction of a pixel (uJit), a different fraction each frame, and blended with the frames
   before it, so detail finer than a pixel (leaf edges, sand grains, light on the seabed) averages out
   instead of flickering. Where a pixel was a frame ago comes from its depth and the two cameras. Moving
   water and swaying leaves can't be followed that way, so the history is pulled into the range of colours
   around the pixel in the new frame (in YCoCg, the mean plus or minus uGamma standard deviations), which
   stops it leaving trails. */
const FS_TAA=HEAD+`in vec2 vUV; out vec4 o; uniform sampler2D tCur,tHist,tDepth,tCls;
uniform float uK,uKMove,uKWater,uGamma,uDA,uDB,uTan,uAspect,uPTan; uniform vec3 uRo,uR,uU,uF,uPRo,uPR,uPU,uPF;
vec3 toY(vec3 c){ return vec3(.25*c.r+.5*c.g+.25*c.b,.5*c.r-.5*c.b,-.25*c.r+.5*c.g-.25*c.b); }
vec3 fromY(vec3 y){ return vec3(y.x+y.y-y.z,y.x+y.z,y.x-y.y-y.z); }
/* The history, read with a Catmull-Rom filter in five reads: bilinear reads blur a little more each frame. */
vec3 hist(vec2 uv){
  vec2 sz=vec2(textureSize(tHist,0)),sp=uv*sz,tp=floor(sp-.5)+.5,f=sp-tp;
  vec2 w0=f*(-.5+f*(1.-.5*f)),w1=1.+f*f*(-2.5+1.5*f),w2=f*(.5+f*(2.-1.5*f)),w3=f*f*(-.5+.5*f);
  vec2 w12=w1+w2,t0=(tp-1.)/sz,t3=(tp+2.)/sz,t12=(tp+w2/w12)/sz;
  vec3 c=texture(tHist,vec2(t12.x,t0.y)).rgb*(w12.x*w0.y)+texture(tHist,vec2(t0.x,t12.y)).rgb*(w0.x*w12.y)
        +texture(tHist,t12).rgb*(w12.x*w12.y)+texture(tHist,vec2(t3.x,t12.y)).rgb*(w3.x*w12.y)+texture(tHist,vec2(t12.x,t3.y)).rgb*(w12.x*w3.y);
  return c/(w12.x*w0.y+w0.x*w12.y+w12.x*w12.y+w3.x*w12.y+w12.x*w3.y);
}
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy),S=textureSize(tCur,0)-1;
  vec3 cur=texelFetch(tCur,p,0).rgb;
  if(uK<1.){
    /* The colours around this pixel, and the nearest depth among them, so an edge follows the thing in front. */
    vec3 m1=vec3(0.),m2=vec3(0.); float dz=1.,still=1.;
    for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ ivec2 q=clamp(p+ivec2(i,j),ivec2(0),S); vec3 c=toY(texelFetch(tCur,q,0).rgb); m1+=c; m2+=c*c; dz=min(dz,texelFetch(tDepth,q,0).r); still=min(still,texelFetch(tCls,q,0).a); }
    m1/=9.; vec3 sg=sqrt(max(m2/9.-m1*m1,0.));
    /* Where this point was on the screen a frame ago. The sky is far enough to need only the direction. */
    vec2 n=vUV*2.-1.; vec3 dir=uF+uR*n.x*uTan*uAspect+uU*n.y*uTan;
    vec3 v=dz>=1.?dir:uRo+dir*(uDB/(dz*2.-1.-uDA))-uPRo;
    float zp=dot(v,uPF); vec2 q=vec2(dot(v,uPR)/(uPTan*uAspect),dot(v,uPU)/uPTan)/max(zp,1e-6)*.5+.5;
    if(zp>0.&&q.x>=0.&&q.x<=1.&&q.y>=0.&&q.y<=1.){
      vec3 h=toY(max(hist(q),0.)),c0=m1,ext=uGamma*sg+.004,d=h-c0,a=abs(d)/ext;
      float k=max(a.x,max(a.y,a.z)); if(k>1.) h=c0+d/k;
      /* Each frame the history is resampled where things moved, and that softens it a little each time.
         Where the picture moves fast (a low pass), the new frame counts for more, which keeps it sharp. */
      float mv=length((q-vUV)*vec2(S+1));
      /* Water (alpha 0 in the main pass's picture, tCls) moves on its own: foam and ripples would smear, so
         the new frame counts for uKWater there. */
      cur=fromY(mix(h,toY(cur),max(uK+uKMove*smoothstep(.5,6.,mv),mix(uKWater,0.,still))));
    }
  }
  o=vec4(cur,dot(cur,vec3(.299,.587,.114)));
}`;
const FS_FINAL=HEAD+`in vec2 vUV; out vec4 o; uniform sampler2D tI; uniform vec2 uTx,uOut; uniform float uTime,uSharp,uNoFxaa;
float hash(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  /* FXAA, then a touch of sharpening when upscaling. The live smoothing over time does FXAA's job better,
     so with it on (uNoFxaa) FXAA is skipped. */
  vec4 M=texture(tI,vUV);
  float nw=textureOffset(tI,vUV,ivec2(-1,-1)).a,ne=textureOffset(tI,vUV,ivec2(1,-1)).a,sw=textureOffset(tI,vUV,ivec2(-1,1)).a,se=textureOffset(tI,vUV,ivec2(1,1)).a,m=M.a;
  float lmin=min(m,min(min(nw,ne),min(sw,se))),lmax=max(m,max(max(nw,ne),max(sw,se)));
  vec3 c=M.rgb;
  if(uNoFxaa<.5&&lmax-lmin>max(.045,lmax*.12)){
    vec2 d=vec2(-((nw+ne)-(sw+se)),((nw+sw)-(ne+se)));
    float rd=1./(min(abs(d.x),abs(d.y))+max((nw+ne+sw+se)*.03,.008));
    d=clamp(d*rd,-6.,6.)*uTx;
    vec3 a=.5*(texture(tI,vUV+d*(1./3.-.5)).rgb+texture(tI,vUV+d*(2./3.-.5)).rgb);
    vec3 b=a*.5+.25*(texture(tI,vUV-d*.5).rgb+texture(tI,vUV+d*.5).rgb);
    float lb=dot(b,vec3(.299,.587,.114));
    c=(lb<lmin||lb>lmax)?a:b;
  }
  vec3 blur=.25*(textureOffset(tI,vUV,ivec2(1,0)).rgb+textureOffset(tI,vUV,ivec2(-1,0)).rgb+textureOffset(tI,vUV,ivec2(0,1)).rgb+textureOffset(tI,vUV,ivec2(0,-1)).rgb);
  c=clamp(c+(c-blur)*uSharp,0.,1.);
  vec2 q=vUV-.5; float v=1.-dot(q,q)*.34; c*=v;
  float g=hash(gl_FragCoord.xy+fract(uTime)*311.)-.5;
  c+=g*.010*(1.-.5*dot(c,vec3(.33)));
  o=vec4(c,1.);
}`;

'use strict';
/* ------ FFT ocean: Phillips spectrum, packed real-valued inverse transforms ------ */
const FS_SPEC=HEAD+`
in vec2 vUV; out vec4 o; uniform sampler2D tH0; uniform float uT,uW0,uL,uN;
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy);
  vec2 n=vec2(c); n=mix(n,n-uN,step(uN*.5,n));
  /* Each frequency rounded to a multiple of uW0, so the field repeats exactly and uT can wrap (world.js). */
  vec2 k=n*2.*PI/uL; float kl=length(k); float w=floor(sqrt(9.81*kl)/uW0+.5)*uW0;
  float cs=cos(w*uT),sn=sin(w*uT); vec4 a=texelFetch(tH0,c,0);
  float hr=a.r*cs-a.g*sn+a.b*cs+a.a*sn;
  float hi=a.r*sn+a.g*cs-a.b*sn+a.a*cs;
  float f1=1.-k.x, f2=k.y-kl*kl;
  o=vec4(f1*hr,f1*hi,-f2*hi,f2*hr);
}`;
const FS_FFT=HEAD+`
in vec2 vUV; out vec4 o; uniform sampler2D tI; uniform float uN,uSub; uniform int uH;
vec2 cm(vec2 a,vec2 b){ return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x); }
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy);
  float idx=float(uH==1?c.x:c.y);
  float ev=floor(idx/uSub)*(uSub*.5)+mod(idx,uSub*.5);
  int e=int(ev),od=int(ev+uN*.5);
  vec4 E=texelFetch(tI,uH==1?ivec2(e,c.y):ivec2(c.x,e),0);
  vec4 O=texelFetch(tI,uH==1?ivec2(od,c.y):ivec2(c.x,od),0);
  float ang=2.*PI*(idx/uSub); vec2 tw=vec2(cos(ang),sin(ang));
  o=vec4(E.xy+cm(tw,O.xy),E.zw+cm(tw,O.zw));
}`;
/* After the transforms: R eta, G d/dx, B d/dz, A laplacian (real parts packed in xy / zw) */
const FS_COPY=HEAD+`in vec2 vUV; out vec4 o; uniform sampler2D tI; void main(){ o=texelFetch(tI,ivec2(gl_FragCoord.xy),0); }`;
const VS_CAUS=`#version 300 es
precision highp float;
layout(location=0) in vec2 aUV; uniform sampler2D tFFT; uniform float uD; out vec2 vO; out vec2 vN;
void main(){ vec4 f=textureLod(tFFT,aUV,1.); vec2 p=aUV+uD*vec2(f.g,f.b); vO=aUV; vN=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
const FS_CAUS=HEAD+`
in vec2 vO; in vec2 vN; out vec4 o;
void main(){
  vec2 ax=dFdx(vO),ay=dFdy(vO),bx=dFdx(vN),by=dFdy(vN);
  float a0=abs(ax.x*ay.y-ax.y*ay.x), a1=abs(bx.x*by.y-bx.y*by.x);
  float v=a0/max(a1,a0*.04);
  o=vec4(v,v,v,1.);
}`;

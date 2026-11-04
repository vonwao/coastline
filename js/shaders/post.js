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
const FS_FINAL=HEAD+`in vec2 vUV; out vec4 o; uniform sampler2D tI; uniform vec2 uTx,uOut; uniform float uTime,uSharp;
float hash(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  /* FXAA, then a touch of sharpening when upscaling */
  vec4 M=texture(tI,vUV);
  float nw=textureOffset(tI,vUV,ivec2(-1,-1)).a,ne=textureOffset(tI,vUV,ivec2(1,-1)).a,sw=textureOffset(tI,vUV,ivec2(-1,1)).a,se=textureOffset(tI,vUV,ivec2(1,1)).a,m=M.a;
  float lmin=min(m,min(min(nw,ne),min(sw,se))),lmax=max(m,max(max(nw,ne),max(sw,se)));
  vec3 c=M.rgb;
  if(lmax-lmin>max(.045,lmax*.12)){
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

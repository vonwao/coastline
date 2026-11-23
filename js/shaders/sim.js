'use strict';
/* ------ Shallow water simulation ------
   State texture: x = water depth h, y = u at the cell's +x face, z = v at the +z face, w = bed.
   Stelling & Duinmeijer style staggered upwinding, which is mass-positive and handles
   wet/dry fronts, so waves run up and drain back on the sand with no special casing. */
const SIM_COMMON=`
uniform sampler2D tS; uniform float uDx,uDt,uHmax,uTide,uT,uBreakD,uRockEta; uniform ivec2 uCells; uniform vec2 uDomMin;
uniform vec4 uSwK[8]; uniform float uSwA[8]; uniform int uSpongeN;
#define G 9.81
#define EPS 0.0012
ivec2 cl(ivec2 c){ return clamp(c,ivec2(0),uCells-1); }
vec4 F(ivec2 c){ return texelFetch(tS,cl(c),0); }
void swell(vec2 p,out float e,out float ux,out float vz){
  e=0.;ux=0.;vz=0.;
  for(int i=0;i<8;i++){ vec4 k=uSwK[i]; float s=uSwA[i]*sin(dot(k.xy,p)-k.z*uT+k.w);
    e+=s; float gw=G/k.z; ux+=gw*k.x*s; vz+=gw*k.y*s; }
}
float spongeX(int x){ return smoothstep(float(uCells.x-uSpongeN),float(uCells.x-2),float(x)); }
float spongeZ(int z){ float e=float(min(z,uCells.y-1-z)); return 1.-smoothstep(0.,26.,e); }
`;
const FS_SIMINIT=HEAD+SIM_COMMON+`
in vec2 vUV; out vec4 o; uniform sampler2D tT;
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy);
  float T=textureLod(tT,vUV,1.).r;
  float sp=spongeX(c.x);
  float b=mix(max(T,-uHmax),-uHmax,sp);
  vec2 p=uDomMin+vec2(c)*uDx+.5*uDx;
  float e,ux,vz; swell(p,e,ux,vz);
  float deepF=smoothstep(.6,uHmax*.8,uTide-b);
  float eta=uTide+e*deepF;
  float h=max(eta-b,0.);
  if(h<.002) h=0.;
  o=vec4(h,ux*deepF,vz*deepF,b);
}`;
const FS_SIMU=HEAD+SIM_COMMON+`
in vec2 vUV; out vec4 o; uniform float uN2;
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy);
  vec4 C=F(c),E=F(c+ivec2(1,0)),W=F(c-ivec2(1,0)),N=F(c+ivec2(0,1)),S=F(c-ivec2(0,1));
  vec4 SE=F(c+ivec2(1,-1)),NW=F(c+ivec2(-1,1));
  float eC=C.x+C.w,eE=E.x+E.w,eN=N.x+N.w;
  float u=C.y,v=C.z; float vmax=.24*uDx/uDt;
  float idx=1./uDx;
  float strain=length(vec3((C.y-W.y),(C.z-S.z),.5*(N.y-S.y+E.z-W.z)))*idx;
  float nuL=.05*uDx*uDx*strain;
  /* x face */
  float hfx=max(max(eC,eE)-max(C.w,E.w),0.);
  bool blockX=(C.x<EPS&&eE<=C.w)||(E.x<EPS&&eC<=E.w)||hfx<EPS;
  if(blockX) u=0.; else {
    float vb=.25*(C.z+E.z+S.z+SE.z);
    float dudx=(u>0.?u-W.y:E.y-u)*idx, dudz=(vb>0.?u-S.y:N.y-u)*idx;
    float lap=(E.y+W.y+N.y+S.y-4.*u)*idx*idx;
    float nl=1.-smoothstep(uBreakD,uBreakD*1.6,uTide-max(C.w,E.w));
    u+=uDt*(-G*(eE-eC)*idx-(u*dudx+vb*dudz)*nl+nuL*lap);
    float sp=length(vec2(u,vb)); float hb=max(hfx,.008);
    u/=1.+uDt*G*uN2*sp/pow(hb,1.3333);
    float vl=min(vmax,4.5*sqrt(G*hfx)+.2); u=clamp(u,-vl,vl);
  }
  /* z face */
  float hfz=max(max(eC,eN)-max(C.w,N.w),0.);
  bool blockZ=(C.x<EPS&&eN<=C.w)||(N.x<EPS&&eC<=N.w)||hfz<EPS;
  if(blockZ) v=0.; else {
    float ub=.25*(C.y+N.y+W.y+NW.y);
    float dvdx=(ub>0.?v-W.z:E.z-v)*idx, dvdz=(v>0.?v-S.z:N.z-v)*idx;
    float lap=(E.z+W.z+N.z+S.z-4.*v)*idx*idx;
    float nl=1.-smoothstep(uBreakD,uBreakD*1.6,uTide-max(C.w,N.w));
    v+=uDt*(-G*(eN-eC)*idx-(ub*dvdx+v*dvdz)*nl+nuL*lap);
    float sp=length(vec2(ub,v)); float hb=max(hfz,.008);
    v/=1.+uDt*G*uN2*sp/pow(hb,1.3333);
    float vl=min(vmax,4.5*sqrt(G*hfz)+.2); v=clamp(v,-vl,vl);
  }
  o=vec4(C.x,u,v,C.w);
}`;
const FS_SIMH=HEAD+SIM_COMMON+`
in vec2 vUV; out vec4 o;
float fx(vec4 A,vec4 B,float vel){ float eA=A.x+A.w,eB=B.x+B.w; float bf=max(A.w,B.w); float D=uTide-bf;
  float hn=max((vel>0.?eA:eB)-bf,0.); return vel*mix(hn,max(D,0.),smoothstep(uBreakD,uBreakD*1.6,D)); }
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy);
  vec4 C=F(c),E=F(c+ivec2(1,0)),W=F(c-ivec2(1,0)),N=F(c+ivec2(0,1)),S=F(c-ivec2(0,1));
  float Fe=c.x>=uCells.x-1?C.y*C.x:fx(C,E,C.y);
  float Fw=c.x<=0?0.:fx(W,C,W.y);
  float Fn=c.y>=uCells.y-1?0.:fx(C,N,C.z);
  float Fs=c.y<=0?0.:fx(S,C,S.z);
  float h=C.x-uDt*(Fe-Fw+Fn-Fs)/uDx;
  if(C.x>.05){
    /* Shallow-water waves steepen without limit, but real swell is held back by dispersion.
       This smoothing stands in for that, so only depth-limited waves become bores. */
    float e0=C.x+C.w;
    float eE=E.x>EPS?E.x+E.w:e0,eW=W.x>EPS?W.x+W.w:e0,eN=N.x>EPS?N.x+N.w:e0,eS=S.x>EPS?S.x+S.w:e0;
    float sl=length(vec2(eE-eW,eN-eS))/(2.*uDx);
    float deepG=smoothstep(uBreakD*.75,uBreakD*1.2,C.x);
    h+=(eE+eW+eN+eS-4.*e0)*smoothstep(.12,.3,sl)*.035*deepG*min(uDt*60.,1.);
  }
  h=max(h,0.);
  /* Thin films soak into the sand */
  if(C.w>uTide-.4) h=max(h-uDt*.0035*(1.-smoothstep(.02,.12,h)),0.);
  float u=C.y,v=C.z;
  float spx=spongeX(c.x);
  if(spx>0.){
    vec2 p=uDomMin+(vec2(c)+.5)*uDx;
    float e,ux,vz; swell(p,e,ux,vz);
    float k=spx*.22*min(uDt*60.,1.);
    h=mix(h,uTide+e-C.w,k); u=mix(u,ux,k); v=mix(v,vz,k);
  }
  float spz=spongeZ(c.y);
  if(spz>0.){ float k=spz*.12*min(uDt*60.,1.); u*=1.-k; v*=1.-k; h=mix(h,max(uTide-C.w,0.),k*.5); }
  o=vec4(h,u,v,C.w);
}`;
const FS_SIMRM=HEAD+SIM_COMMON+`
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy);
  vec4 C=F(c),E=F(c+ivec2(1,0)),W=F(c-ivec2(1,0)),N=F(c+ivec2(0,1)),S=F(c-ivec2(0,1));
  float e=C.x+C.w;
  float eE=E.x>EPS?E.x+E.w:e, eW=W.x>EPS?W.x+W.w:e, eN=N.x>EPS?N.x+N.w:e, eS=S.x>EPS?S.x+S.w:e;
  vec2 g=vec2(eE-eW,eN-eS)/(2.*uDx);
  float wf=smoothstep(.0,.05,C.x);
  /* A dry cell on a rock face takes the level of the water beside it. The surface then meets
     the rock in a clean waterline, instead of sloping up the face to the top of the cell. */
  float eOut=e;
  if(C.x<EPS){
    float se=0.,sn=0.;
    if(E.x>.02){se+=E.x+E.w;sn++;} if(W.x>.02){se+=W.x+W.w;sn++;}
    if(N.x>.02){se+=N.x+N.w;sn++;} if(S.x>.02){se+=S.x+S.w;sn++;}
    if(uRockEta>.5) eOut=sn>0.?min(se/sn,C.w):C.w-1.;
    else if(sn>0.&&C.w-se/sn>.35) eOut=se/sn;
  }
  o0=vec4(eOut,C.x,.5*(C.y+W.y),.5*(C.z+S.z));
  o1=vec4(g*wf,(C.y-W.y+C.z-S.z)/uDx,1.);
}`;
const FS_FOAM=HEAD+SIM_COMMON+`
layout(location=0) out vec4 oF; layout(location=1) out vec4 oA;
uniform sampler2D tFx,tAdv,tNoise; uniform vec2 uDomSize; uniform vec2 uReset; uniform float uDecay,uFoamGen,uSedGen,uTau; uniform vec4 uFallFoot;
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy);
  vec4 C=F(c),E=F(c+ivec2(1,0)),W=F(c-ivec2(1,0)),N=F(c+ivec2(0,1)),S=F(c-ivec2(0,1));
  vec2 uv=(vec2(c)+.5)/vec2(uCells);
  vec2 vel=vec2(.5*(C.y+W.y),.5*(C.z+S.z));
  if(C.x<.0015) vel=vec2(0.);
  vec2 back=uv-vel*uDt/uDomSize;
  vec4 f=textureLod(tFx,back,0.); vec4 a=textureLod(tAdv,back,0.);
  float e=C.x+C.w;
  float eE=E.x>EPS?E.x+E.w:e, eW=W.x>EPS?W.x+W.w:e, eN=N.x>EPS?N.x+N.w:e, eS=S.x>EPS?S.x+S.w:e;
  vec2 ge=vec2(eE-eW,eN-eS)/(2.*uDx); float slope=length(ge);
  float div=(C.y-W.y+C.z-S.z)/uDx;
  float sp=length(vel); float h=C.x;
  vec2 wp=uDomMin+uv*uDomSize;
  float patchN=textureLod(tNoise,wp/95.+uT*.006,0.).r;
  float fineN=textureLod(tNoise,wp/21.-uT*.012,0.).g;
  /* Bore fronts: steep surface and strong convergence. */
  float brk=smoothstep(.11,.30,slope)*smoothstep(.10,.48,-div)*smoothstep(.015,.14,h);
  brk*=1.-smoothstep(uBreakD*.7,uBreakD*1.25,h);
  /* Some steep fronts stay glassy, which is right for swell in deeper water. In the shallows a
     front that steep always breaks: an unbroken one there looks like a ridge of glass. */
  float glassy=smoothstep(.22,.52,textureLod(tNoise,wp/37.+vec2(uT*.017,-uT*.009),0.).r+(patchN-.5)*.4);
  brk*=mix(glassy,1.,1.-smoothstep(uBreakD*.25,uBreakD*.6,h));
  /* A face far steeper than that breaks at any depth: its crest spills over. Without this, swell
     climbing onto the edge of a rock shelf stood up as a long wall of glass. */
  brk=max(brk,smoothstep(.38,.62,slope)*smoothstep(.05,.36,-div)*smoothstep(.1,.4,h)*(.6+.4*glassy));
  /* The leading edge of run-up churns white too. */
  float swash=(1.-smoothstep(.015,.17,h))*smoothstep(.25,1.2,sp)*step(.002,h);
  /* Water slamming into rock. */
  vec2 gb=vec2(E.w-W.w,N.w-S.w)/(2.*uDx);
  float impact=smoothstep(.25,1.9,dot(vel,gb)*(1.+.8*sp))*smoothstep(.01,.12,h)*smoothstep(.22,.75,length(gb));
  float impB=smoothstep(.40,.66,fineN+(patchN-.5)*.5);
  float gen=(brk*3.0+swash*1.9+impact*1.25*impB*(1.-smoothstep(uBreakD*1.5,uBreakD*4.,h)*.55))*(.55+.9*patchN)*uFoamGen;
  /* Where a waterfall lands (fallMeasure in js/world.js) the sea is churned white, and the foam drifts off
     with the water like any other. */
  float fallK=0.;
  if(uFallFoot.w>0.){ vec2 df=wp-uFallFoot.xz; fallK=exp(-dot(df,df)/26.)*smoothstep(.005,.08,h)*uFallFoot.w; gen+=fallK*2.6*(.6+.8*fineN); }
  float foam=f.r;
  foam*=exp(-clamp(div,-1.2,1.2)*uDt*.75);
  float dec=uDecay*(.6+1.2*fineN+.9*smoothstep(.55,.25,patchN));
  dec+=smoothstep(uBreakD,uBreakD*2.2,h)*.34;
  dec+=h<.004?1.2:0.;
  dec+=(1.-smoothstep(.0,.05,h))*.45;
  foam=foam*exp(-dec*uDt)+gen*uDt;
  float bub=f.g*exp(-.62*uDt)+(brk*1.5+impact*1.1+swash*.3+fallK*1.6)*uDt;
  float wetTgt=smoothstep(.0012,.02,h);
  float wet=max(f.b-uDt/uTau,wetTgt);
  float sed=f.a*exp(-.042*uDt)+(brk*.5+smoothstep(.45,2.,sp)*(1.-smoothstep(.4,3.,h))*.34)*uDt*uSedGen;
  if(C.x<.0015) sed*=exp(-1.5*uDt);
  oF=vec4(clamp(foam,0.,1.25),clamp(bub,0.,1.2),wet,clamp(sed,0.,1.));
  a.xy+=vel*uDt; a.zw+=vel*uDt;
  if(uReset.x>.5) a.xy=vec2(0.);
  if(uReset.y>.5) a.zw=vec2(0.);
  oA=a;
}`;

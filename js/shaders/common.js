'use strict';
/* ---------------------------------------------------------------- Shared GLSL ------- */
const HEAD=`#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
#define PI 3.14159265359
`;
/* Haze between the eye and a point t metres away, the eye at height y0 and the point at y1 above the sea:
   clear air, thinning slowly with height, and a layer of sea haze (salt and moisture) in the lowest few
   hundred metres, six tenths as dense again at the sea. Shared by every pass that draws haze. */
const HAZE=`
float hazeK(float t,float y0,float y1,float fogB){
  y0=max(y0,0.); y1=max(y1,0.);
  const float H=200.;
  float dy=y1-y0;
  float m=abs(dy)<2.?exp(-.5*(y0+y1)/H):H*(exp(-y0/H)-exp(-y1/H))/dy;
  return 1.-exp(-t*fogB*(exp(-y1*.00012)+.6*m));
}
`;
const NOISE=`
float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p,int o){ float a=.5,s=0.,n=0.; mat2 m=mat2(.8,.6,-.6,.8);
  for(int i=0;i<o;i++){ s+=a*vn(p); n+=a; a*=.5; p=m*p*2.03+17.1; } return s/n; }
float ridged(vec2 p,int o){ float a=.5,s=0.,n=0.; mat2 m=mat2(.8,.6,-.6,.8);
  for(int i=0;i<o;i++){ float v=1.-abs(2.*vn(p)-1.); s+=a*v*v; n+=a; a*=.5; p=m*p*2.11+9.7; } return s/n; }
`;

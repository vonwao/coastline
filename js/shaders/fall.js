'use strict';
/* ------ A waterfall's falling water as a sheet in the air (drawFalls in js/frame.js) ------
   The path is worked out once, when the coast is built (fallPath in js/world.js): the stream leaves the
   cliff's edge at walking pace and falls freely until it meets the rock, then pours down the face. The
   sheet is a ribbon along that path, as wide as the stream and widening as it falls. Each vertex carries
   how long the water has been falling (t), so the white streaks drawn on it travel with the water and
   stretch as it speeds up, as before on the rock (fallAt in js/shaders/view.js), but now the water has
   its own place in the air: it stands out from the cliff, the cliff shows through its gaps, and it lights
   as water does, brighter where the sun comes through it from behind.
   Drawn after the view, over it, testing depth but leaving none, like the breakers' lips and the spray.
   Twice: the sheet itself (uLayer 0), then a wider, faint veil of spray just in front of it (uLayer 1),
   which softens its edges and thickens toward the bottom as the water breaks up. */
const VS_FALL=`#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
#define PI 3.14159265359
layout(location=0) in vec3 aC; layout(location=1) in vec3 aTg; layout(location=2) in vec3 aQ;
uniform sampler2D tLit,tEnv,tNoise;
uniform vec2 uDomMin,uDomSize,uJit; uniform float uTime,uTan,uAspect,uDA,uDB,uFogB,uCloudShade,uCloudT;
uniform vec3 uRo,uR,uU,uF,uSun,uSide; uniform float uDir,uLayer;
`+CLOUD_SHADOW+`
out vec3 vP,vN; out float vT,vU,vW,vCs,vFog,vSteep; out vec2 vLit; flat out vec3 vFogC;
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
`+HAZE+`
void main(){
  float t=aQ.x, u=aQ.y, hw=aQ.z;
  /* N: away from the cliff. The veil is wider and stands out in front of the sheet. */
  vec3 T=normalize(aTg), N=normalize(cross(uSide,T))*uDir;
  if(uLayer>.5) hw*=1.5+.6*smoothstep(.5,2.5,t);
  /* The sheet sways a little and its edges flutter. */
  float sway=.25*sin(t*1.9-uTime*2.3)+.12*sin(t*4.1-uTime*3.7+u*2.);
  vec3 pos=aC+uSide*(u*hw+sway*smoothstep(.2,1.2,t))+N*(.18*sin(t*3.3-uTime*2.9+u*1.7)*smoothstep(.3,1.,t)+uLayer*(.4+.5*t));
  vP=pos; vN=N; vT=t; vU=u; vW=hw;
  /* Across a ledge the water runs nearly flat: the water painted on the rock shows it there, and the
     sheet, seen edge on, made a bright line across the fall. */
  vSteep=smoothstep(.4,.75,abs(T.y));
  vec2 luv=(pos.xz-uDomMin)/uDomSize;
  vLit=textureLod(tLit,luv,0.).rg;
  vCs=cloudShadow(pos);
  vec3 F=normalize(pos-uRo);
  vec3 rh=F; rh.y=max(rh.y,.012); rh=normalize(rh);
  vec3 fc=min(textureLod(tEnv,envUV(rh),2.8).rgb,vec3(3.2));
  vFogC=mix(fc,textureLod(tEnv,vec2(.5),7.5).rgb,smoothstep(.06,.34,-F.y));
  vFog=hazeK(length(pos-uRo),uRo.y,pos.y,uFogB);
  vec3 vv=pos-uRo; float z=dot(vv,uF);
  gl_Position=vec4(dot(vv,uR)/(uTan*uAspect),dot(vv,uU)/uTan,uDA*z+uDB,z); gl_Position.xy-=uJit*gl_Position.w;
}`;
const FS_FALL=HEAD+`
in vec3 vP,vN; in float vT,vU,vW,vCs,vFog,vSteep; in vec2 vLit; flat in vec3 vFogC; layout(location=0) out vec4 o;
uniform sampler2D tEnv,tNoise; uniform vec3 uRo,uSun,uSunE; uniform float uTime,uLayer;
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
vec3 skyIrr(vec3 n){ return textureLod(tEnv,envUV(normalize(n+vec3(0,.6,0))),6.2).rgb*PI*.68; }
void main(){
  vec3 V=normalize(uRo-vP); vec3 N=normalize(vN); if(dot(N,V)<0.) N=-N;
  float x=vU*vW;
  /* Streaks: noise placed by how long the water has fallen, so they travel down with it and stretch as it
     speeds up. Three samples along the flow blur them as a camera's shutter would. */
  float s=vT-uTime*1.05, n1=0.,n2=0.,n3=0.;
  for(int k=-1;k<=1;k++){
    float d=float(k)*.035;
    n1+=texture(tNoise,vec2(x/2.4,(s+d)*.9)).r;
    n2+=texture(tNoise,vec2(x/3.4+.37,(s+d)*.6)).g;
    n3+=texture(tNoise,vec2(x/6.5+.11,(s+d)*.33)).b;
  }
  n1/=3.; n2/=3.; n3/=3.;
  /* Long streaks down the sheet: ropes of water, lighter and darker, that hardly change across a second. */
  float rope=texture(tNoise,vec2(x/1.7+.6,s*.12+vT*.05)).r;
  float strand=n1*.4+n2*.35+rope*.25;
  /* A full sheet at the edge; it tears into strands and gaps as it falls. */
  float full=1.-smoothstep(.4,2.6,vT)*.85;
  float body=smoothstep(.38,.6,strand+.3*full+(n3-.5)*.3);
  float edge=1.-smoothstep(.45,1.,abs(vU)+(n1-.5)*.5+(n3-.5)*.3);
  float a=clamp(body*edge*(.5+.5*smoothstep(.35,.7,rope)),0.,.95)*smoothstep(0.,.12,vT);
  /* The veil: faint, soft, thickest low down and toward the middle. */
  if(uLayer>.5) a=.16*smoothstep(.3,.7,n3*.6+n1*.4)*(1.-smoothstep(.2,1.,abs(vU)))*smoothstep(.3,2.2,vT);
  a*=vSteep;
  if(a<.004) discard;
  /* White, aerated water: lit like a cloud, soft on the side away from the sun, and glowing where the sun
     shines through it toward the camera. */
  float ndl=dot(N,uSun), wrap=clamp(ndl*.5+.5,0.,1.);
  float thru=pow(max(dot(-V,uSun),0.),5.)*(1.-a*.5);
  vec3 alb=vec3(.86,.89,.92)*mix(.62,1.08,smoothstep(.25,.75,rope*.7+n2*.3));
  vec3 E=uSunE*(wrap*.85+thru*1.6)*vLit.x*vCs+skyIrr(N)*vLit.y;
  vec3 L=alb/PI*E;
  L=mix(L,vFogC,vFog);
  o=vec4(L*a,a);
}`;

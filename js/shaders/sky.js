'use strict';
/* ------ Sky: single-scattering atmosphere plus lit procedural clouds, baked per lighting ------ */
/* The clouds: a real layer of cloud, 1.2 km up and up to 1.5 km thick (more in a storm), with 3D shapes
   from 3D noise (noise3Tex, FS_NOISE3 in js/shaders/textures.js), marched by each ray in steps and lit by
   looking toward the sun from each step. The cloud pass (FS_CLOUDS, below) draws them for the picture on
   screen at half size, before the view, which reads it for its sky pixels; the sky bake (FS_SKY) paints the
   same clouds, with fewer steps, into the sky texture that the water's reflections and the sky light read.
   Both call cloudSky() with the size of their own pixel, so detail too fine for it is averaged away. Needs
   tNoise and uSun declared first. */
const CLOUD_GLSL=`
precision highp sampler3D;
uniform sampler3D tN3;
uniform float uCover,uTurb,uSeed,uDark,uSkyK;
/* Where the camera is over the cloud layer, in km, plus how far the wind has carried the clouds
   (CLOUD_WIND): the clouds stay over the same ground as the drone moves, and drift. The sky bake leaves it
   at 0. The cloud shadows (CLOUD_SHADOW, below) use the same footprints and the same drift. */
uniform vec2 uCloudO;
/* Heights and distances in km. The clouds' flat bases are all at CLOUD_BASE above the sea. */
#define CLOUD_BASE 1.2
#define EARTH_R 6371.
#define CLOUD_SIG 30.
#define CLOUD_HAZE 45.
#define CLOUD_FAR 90.
#define CLOUD_PATH 14.
#define CLOUD_STEPS 90
vec3 sunT(vec3 d){ float m=1./(max(d.y,0.)+.15*pow(degrees(asin(clamp(d.y,0.,1.)))+3.885,-1.253));
  return exp(-m*(vec3(5.8e-3,13.5e-3,33.1e-3)*8.+vec3(21e-3)*1.2*uTurb)); }
/* Where a direction meets a flat sheet overhead (for the thin high cirrus). */
vec2 cloudP(vec3 d){ d.y=max(d.y,.002); d=normalize(d); return d.xz/(d.y+.075)+uSeed; }
/* Where the clouds stand, seen from above: wide patches of more and less cloud, and cells about a
   cloud-base height across, each one cloud or a cluster. p in cloud-base heights. */
float cloudShape(vec2 p,float lod){ return textureLod(tNoise,p*.045,0.).r*.45+textureLod(tNoise,p*.06+.3,lod).g*.55; }
/* The shape's level at a footprint's edge, for the share of sky the clouds cover. The cover from the
   lighting setup (.3 a few clouds, .9 overcast) gives that share; the levels are the shape's measured
   quantiles. */
float cloudThr(){
  float u=clamp(1.-(uCover-.27)/.6,0.,1.)*5.; int i=int(min(u,4.999));
  const float Q[6]=float[6](.30,.469,.525,.573,.629,.80);
  return mix(Q[i],Q[i+1],u-float(i));
}
/* How thick the layer is, base to top: heaped cumulus in a fair sky, a thinner sheet as it closes over, deep
   cloud in a storm. */
float cloudDepthKm(){ return mix(mix(1.5,.7,smoothstep(.62,.88,uCover)),2.2,smoothstep(.5,.85,uDark)); }
/* How far a ray climbing at sine s goes to reach height h, over the curved earth: low over the horizon the
   clouds are far away and small, rows of small heaps. */
float slabT(float s,float h){ return EARTH_R*(-s+sqrt(s*s+2.*h/EARTH_R)); }
/* How far into a cloud's footprint xz (km) is: below 0 outside. */
float cloudMap(vec2 xz,float thr,float lod){ return (cloudShape(xz/CLOUD_BASE+uSeed,lod)-thr)/.12; }
/* Cloud density at p (km, y above the sea), 0 to 1, in two parts. cloudBase: the shape. A cell is tallest
   in its middle, so the tops are heaped and the edges low, and the base is flat; 3D noise breaks it up
   (Perlin-Worley). h: the height in the layer, 0 at the base and 1 at the top. */
float cloudBase(vec3 p,float m,float h,float lod){
  /* The noise as a spread about its mean (measured: .49, spread about .08). */
  float n=(textureLod(tN3,p*.3,lod).r-.49)/.08;
  /* As the sky closes over, the footprints merge into one sheet; its tops and thickness vary more, and it
     breaks into cells about 1.7 km across, thick in the middle with thinner seams between, as stratocumulus
     does: darker and lighter patches from below. */
  float ov=smoothstep(.62,.9,uCover);
  float top=clamp(.16+m*.42*(1.-.45*ov)+n*(.12+.2*ov),0.,1.);
  float hg=smoothstep(0.,.035,h)*(1.-smoothstep(top*.45,top,h));
  float d=clamp(m*.35*(1.-.4*ov)+.28+n*(.16+.1*ov),0.,1.)*hg;
  if(ov>0.) d*=mix(1.,.3+.95*textureLod(tN3,vec3(p.x*.1,.37,p.z*.1),lod).g,ov);
  return d;
}
/* cloudErode: the surface eaten into bulges (Worley noise at three sizes), and into wisps under the base;
   it only takes cloud away, so the shape is never smaller than the cloud. fine (0 to 1) fades the bulges and
   the sharp edge out where a pixel is wider than they are. */
float cloudErode(vec3 p,float d,float h,float lod,float fine){
  if(fine<=0.||d<=.001) return d;
  vec4 e=textureLod(tN3,p*1.2+vec3(.31,.17,.73),lod+2.);
  float b=clamp((e.g*.6+e.b*.27+e.a*.13-.48)/.2+.5,0.,1.);
  float ero=mix(b,1.-b,smoothstep(0.,.25,h))*.5*fine;
  /* A cloud's edge is sharp: the density rises quickly inside it. */
  return smoothstep(0.,mix(1.,.3,fine),(d-ero)/(1.-ero));
}
/* Both together; with fine 0, the smooth shape alone, for the light's path to the sun (sharpened, its depth
   would come in steps). */
float cloudDens(vec3 p,float m,float D,float lod,float fine){
  float h=(p.y-CLOUD_BASE)/D;
  if(h<=0.||h>=1.) return 0.;
  return cloudErode(p,cloudBase(p,m,h,lod),h,lod,fine);
}
float cloudHG(float mu,float g){ return (1.-g*g)/(4.*PI*pow(1.+g*g-2.*g*mu,1.5)); }
/* The sky in direction rd with the clouds over it: rgb, and a, how much cloud covers it. sky and skyUp: the
   clear sky there and straight up. K scales the light (the view passes the sky texture's own scale, the
   bake 1). jit (0 to 1) starts the march part of a step in; pa is a pixel's size, in radians; q scales
   the number of steps. The march goes through the cloud layer in steps; at each step inside a cloud it
   looks four times toward the sun, farther each time, for how much cloud shades that point. */
vec4 cloudSky(vec3 rd,vec3 sky,vec3 skyUp,float K,float jit,float pa,float q){
  float thr=cloudThr(), D=cloudDepthKm(), s=max(rd.y,0.);
  float t0=slabT(s,CLOUD_BASE), t1=min(slabT(s,CLOUD_BASE+D),t0+CLOUD_PATH);
  vec3 col=vec3(0.); float T=1., A=0.;
  if(t0<CLOUD_FAR){
    /* Long steps through clear air; on meeting cloud, a step back and four times finer, until the ray has
       been in clear air again for a while. */
    int n=int(clamp((t1-t0)/.12,8.,30.)*q);
    float big=(t1-t0)/float(n), dt=big, t=t0+big*jit; int empty=0; bool fine=false;
    float mu=dot(rd,uSun);
    /* Scattering toward the eye compared with even scattering: strongly forward (the bright rim of a cloud
       in front of the sun), a little backward. */
    float ph=4.*PI*mix(cloudHG(mu,.72),cloudHG(mu,-.2),.4);
    /* Clouds keep the sunset's light a little after the ground has lost it, then go grey. */
    vec3 sc=sunT(uSun)*smoothstep(-.12,0.,uSun.y)*K*1.6*(1.-.65*uDark);
    /* Light from the sky: blue from above on the tops, dimmer from the sea and land below on the bases. */
    vec3 ambTop=mix(skyUp,vec3(dot(skyUp,vec3(.3,.5,.2))),.45)*1.3*(1.-.35*uDark), ambBot=ambTop*.4+sky*.1;
    for(int i=0;i<CLOUD_STEPS;i++){
      if(t>t1||T<.015) break;
      vec3 p=vec3(rd.x*t+uCloudO.x,s*t+t*t/(2.*EARTH_R),rd.z*t+uCloudO.y);
      float fp=pa*t;
      float m=cloudMap(p.xz,thr,max(0.,log2(fp/CLOUD_BASE*.06*512.)));
      /* Fine steps wherever the shape is, before its bulges are eaten away: a thin edge between two long
         steps would be caught by some pixels and missed by their neighbours, a pattern of dots. */
      float h=(p.y-CLOUD_BASE)/D, lod=max(0.,log2(fp*.3*128.));
      float d0=m>-.75&&h>0.&&h<1.?cloudBase(p,m,h,lod):0.;
      if(d0<=.002){ if(fine&&++empty>6){ fine=false; dt=big; } t+=dt; continue; }
      if(!fine){ fine=true; empty=0; dt=big*.25; t=max(t0,t-big*.75); continue; }
      empty=0;
      /* The bulges and the sharp edge fade out as a pixel grows wider than they are (from 15 to 60 m). */
      float d=cloudErode(p,d0,h,lod,1.-smoothstep(.015,.06,fp));
      if(d<=.002){ t+=dt; continue; }
      float od=0.,ls=.04; vec3 lp=p;
      for(int j=0;j<4;j++){ lp+=uSun*ls; od+=cloudDens(lp,cloudMap(lp.xz,thr,1.5),D,lod+1.,0.)*ls; ls*=2.2; }
      od*=CLOUD_SIG*1.6;
      /* Sunlight: what reaches this point straight, and what reaches it after scattering many times. That
         falls off slowly, about as 1/(1 + k x depth), as it does through real thick cloud: an overcast
         sheet is lit grey from above, and a cloud's shaded side isn't black. And sky light, more toward
         the top. */
      vec3 L=sc*(exp(-od)*ph+.5/(1.+od*.1))+mix(ambBot,ambTop,smoothstep(0.,.8,h));
      float a=1.-exp(-d*CLOUD_SIG*dt), fade=exp(-t/CLOUD_HAZE);
      col+=T*a*fade*L; A+=T*a*fade; T*=1.-a;
      t+=dt;
    }
  }
  float hz=smoothstep(0.,.05,s); col*=hz; A*=hz;
  sky=sky*(1.-A)+col;
  vec2 p=cloudP(rd);
  float lc=max(0.,log2(pa/max(s+.075,.01)*.09*512.*2.));
  /* High thin cirrus, seen only where the lower clouds leave the sky clear. */
  float ci=smoothstep(.56,.84,textureLod(tNoise,vec2(p.x*.018,p.y*.09)+.2,lc).r)*smoothstep(.02,.28,s)*.32*min(1.,uCover*2.2)*(1.-A);
  sky=mix(sky,sky*.6+(sunT(uSun)*1.25+vec3(.35))*smoothstep(-.12,0.,uSun.y)*K,ci);
  return vec4(sky,max(A,ci*.6));
}
`;
/* Cloud shadows on the ground, the sea, the plants and the breaking waves. Until 5 November they came from
   a noise pattern of their own, unrelated to the clouds in the sky (and tiling every 3.4 km); now they come
   from the same footprints the clouds are drawn with (cloudShape), read where the line from the point to
   the sun crosses the cloud layer, so each shadow lies under its own cloud as the sun throws it. The
   footprints are softened a little: real cloud edges are wispy. Needs tNoise, uSun, uCloudShade (how dark
   a shadow is, from the lighting setup) and uCloudT (the shot's clock, for the drift: from the start of each
   shot, so a still at a given moment of a shot always has its clouds in the same place) declared first. */
const CLOUD_SHADOW=`
uniform float uCldCover,uCldSeed;
#define CLOUD_WIND vec2(.0037,.0020)
float cldThr(){
  float u=clamp(1.-(uCldCover-.27)/.6,0.,1.)*5.; int i=int(min(u,4.999));
  const float Q[6]=float[6](.30,.469,.525,.573,.629,.80);
  return mix(Q[i],Q[i+1],u-float(i));
}
float cloudShadow(vec3 P){
  if(uCloudShade<=0.||uSun.y<=.02) return 1.;
  vec2 c=(P.xz+uSun.xz/uSun.y*max(1450.-P.y,0.))*.001+CLOUD_WIND*uCloudT;
  vec2 q=c/1.2+uCldSeed;
  float sh=textureLod(tNoise,q*.045,0.).r*.45+textureLod(tNoise,q*.06+.3,1.5).g*.55;
  return 1.-uCloudShade*smoothstep(-.35,.9,(sh-cldThr())/.12);
}`;
/* The clouds for the picture on screen: one pass before the view (renderHDR in js/frame.js), whose sky
   pixels read it. A pass of its own because the view shader has no texture unit left for the 3D noise. */
const FS_CLOUDS=HEAD+`
in vec2 vUV; out vec4 o;
uniform sampler2D tNoise,tSkyC; uniform vec3 uSun,uR,uU,uF; uniform vec2 uJit; uniform float uTan,uAspect,uResY,uNoiseF;
`+CLOUD_GLSL+`
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
void main(){
  vec2 ndc=vUV*2.-1.+uJit;
  vec3 rd=normalize(uF+uR*ndc.x*uTan*uAspect+uU*ndc.y*uTan);
  vec3 sky=textureLod(tSkyC,envUV(rd),0.).rgb;
  if(rd.y<=0.){ o=vec4(sky,0.); return; }
  /* Where in its first step each pixel's march starts: screen noise that moves on every frame when frames
     are averaged (uNoiseF), so the steps blur away. */
  float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy+5.588238*uNoiseF,vec2(.06711056,.00583715))));
  o=cloudSky(rd,sky,textureLod(tSkyC,vec2(.5,1.),0.).rgb,1.85*uSkyK*mix(1.,.62,uDark),jit,2.*uTan/uResY,1.);
}`;
const FS_SKY=HEAD+`
in vec2 vUV; layout(location=0) out vec4 o; layout(location=1) out vec4 oClear; uniform sampler2D tNoise; uniform vec3 uSun;
`+CLOUD_GLSL+`
/* After sunset: the sun's light leaves the air from the bottom up, so the haze fades away as the sun sinks
   to about 9 degrees below the horizon (the end of nautical twilight). 1 whenever the sun is up. */
float dusk(){ return smoothstep(-.16,0.,uSun.y); }
const float Re=6360e3,Ra=6420e3,HR=8e3,HM=1.2e3;
const vec3 bR=vec3(5.8e-6,13.5e-6,33.1e-6);
vec2 sph(vec3 ro,vec3 rd,float R){ float b=dot(ro,rd),c=dot(ro,ro)-R*R,d=b*b-c; if(d<0.) return vec2(1e9,-1e9); d=sqrt(d); return vec2(-b-d,-b+d); }
vec3 scatter(vec3 rd){
  vec3 ro=vec3(0,Re+150.,0); float tMax=min(sph(ro,rd,Ra).y,190e3);
  float mu=dot(rd,uSun),g=.78;
  float pR=3./(16.*PI)*(1.+mu*mu), pM=3./(8.*PI)*((1.-g*g)*(1.+mu*mu))/((2.+g*g)*pow(1.+g*g-2.*g*mu,1.5));
  vec3 bM=vec3(21e-6)*uTurb; vec3 sR=vec3(0),sM=vec3(0); float oR=0.,oM=0.;
  for(int i=0;i<18;i++){
    float a0=float(i)/18.,a1=float(i+1)/18.;
    float t0=tMax*a0*a0*a0,t1=tMax*a1*a1*a1,ds=t1-t0;
    vec3 p=ro+rd*(.5*(t0+t1)); float hh=length(p)-Re; float dR=exp(-hh/HR)*ds,dM=exp(-hh/HM)*ds; oR+=dR;oM+=dM;
    float tl=sph(p,uSun,Ra).y; if(sph(p,uSun,Re).x>0.&&sph(p,uSun,Re).x<1e8) continue;
    float lR=0.,lM=0.,dl=tl/5.;
    for(int j=0;j<5;j++){ vec3 q=p+uSun*(float(j)+.5)*dl; float h2=length(q)-Re; lR+=exp(-h2/HR)*dl; lM+=exp(-h2/HM)*dl; }
    vec3 tau=bR*(oR+lR)+bM*1.1*(oM+lM); vec3 T=exp(-tau); sR+=T*dR; sM+=T*dM;
  }
  vec3 L=20.*(sR*bR*pR+sM*bM*pM);
  /* Stand-in for multiple scattering: it lifts the horizon toward a soft bright haze. */
  float el=max(uSun.y,0.);
  float toSun=pow(max(dot(normalize(vec3(rd.x,0.,rd.z)),normalize(vec3(uSun.x,1e-3,uSun.z))),0.),2.);
  vec3 warm=vec3(1.0,.72,.48),cool=vec3(.70,.84,1.08);
  vec3 ms=mix(mix(cool*.8,warm,toSun),cool,smoothstep(.10,.5,el))*(.28+.95*smoothstep(-.02,.5,el))*dusk();
  /* Twilight: light scattered many times keeps the sky glowing well after the sun has set, though the
     single scattering above is soon cut off by the earth's shadow. A stand-in: deep blue overhead,
     warmer low toward the set sun, fading about tenfold for every 9 degrees the sun sinks. */
  float dep=degrees(asin(clamp(-uSun.y,0.,1.)));
  vec3 tw=(vec3(.30,.45,.95)*(.6+.4*max(rd.y,0.))+vec3(1.,.55,.35)*toSun*exp(-max(rd.y,0.)*5.)*.8)*.08*exp(-dep/3.9)*(1.-smoothstep(-.03,.02,uSun.y));
  return L*vec3(.84,.95,1.14)+ms*(.36*exp(-max(rd.y,0.)*8.)+.03)+tw;
}
vec3 dirOf(float th,float ph){ return vec3(cos(ph)*cos(th),sin(ph),cos(ph)*sin(th)); }
void main(){
  float th=(vUV.x-.5)*2.*PI, ph=(vUV.y-.5)*PI;
  vec3 d=dirOf(th,ph);
  vec3 dd=d; dd.y=max(dd.y,.002); dd=normalize(dd);
  vec3 sky=scatter(dd), clear=sky;
  float a=0.;
  if(d.y>0.){
    /* The same clouds, at this texture's detail (a texel is 2 pi / 1024 radians) and with fewer steps; each
       texel starts its march at its own point in the first step. */
    vec2 g=floor(vUV*vec2(1024.,512.));
    float jit=fract(52.9829189*fract(dot(g,vec2(.06711056,.00583715))));
    vec4 c=cloudSky(dd,sky,scatter(vec3(0,1,0)),1.,jit,2.*PI/1024.,.34);
    sky=c.rgb; a=c.a;
  }
  float k=1.85*uSkyK*mix(1.,.62,uDark);
  if(d.y<0.){ float g=mix(1.,.82,clamp(-d.y*4.,0.,1.)); sky*=g; clear*=g; }
  o=vec4(sky*k,a);
  /* The clear sky, for the view to draw its own clouds over. */
  oClear=vec4(clear*k,1.);
}`;

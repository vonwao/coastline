'use strict';
/* ------ Sky: single-scattering atmosphere plus lit procedural clouds, baked per lighting ------ */
const FS_SKY=HEAD+`
in vec2 vUV; out vec4 o; uniform sampler2D tNoise; uniform vec3 uSun; uniform float uCover,uTurb,uSeed,uDark,uSkyK;
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
vec3 sunT(vec3 d){ float m=1./(max(d.y,0.)+.15*pow(degrees(asin(clamp(d.y,0.,1.)))+3.885,-1.253));
  return exp(-m*(vec3(5.8e-3,13.5e-3,33.1e-3)*8.+vec3(21e-3)*1.2*uTurb)); }
float cloudD(vec2 p){
  float a=textureLod(tNoise,p*.045,0.).r, b=textureLod(tNoise,p*.17+.3,0.).g, c=textureLod(tNoise,p*.61+.7,0.).r;
  return a*.62+b*.27+c*.11;
}
void main(){
  float th=(vUV.x-.5)*2.*PI, ph=(vUV.y-.5)*PI;
  vec3 d=vec3(cos(ph)*cos(th),sin(ph),cos(ph)*sin(th));
  vec3 dd=d; dd.y=max(dd.y,.002); dd=normalize(dd);
  vec3 sky=scatter(dd);
  float a=0.;
  if(d.y>0.){
    vec2 p=dd.xz/(dd.y+.075)+uSeed;
    float thr=1.-uCover;
    float den=smoothstep(thr,thr+.17,cloudD(p));
    if(den>.001){
      vec2 sd=uSun.xz/(uSun.y+.25)*.11; float sh=0.;
      for(int i=1;i<=4;i++) sh+=smoothstep(thr,thr+.2,cloudD(p+sd*float(i)));
      float lit=exp(-sh*.72);
      float mu=max(dot(dd,uSun),0.);
      /* Clouds keep the sunset's light a little after the ground has lost it, then go grey. */
      vec3 sc=sunT(uSun)*smoothstep(-.12,0.,uSun.y);
      vec3 base=sky*.9+vec3(.40,.44,.50)*scatter(vec3(0,1,0))*2.2;
      vec3 cc=base*(1.-.35*den)+sc*(1.0*lit*(1.+1.6*pow(mu,10.))+.28)*1.5;
      float hz=smoothstep(.0,.13,dd.y);
      cc*=mix(1.,.40,uDark*smoothstep(.2,.9,den));
      a=den*hz*.97;
      sky=mix(sky,cc,a);
    }
    float ci=smoothstep(.56,.84,textureLod(tNoise,vec2(p.x*.018,p.y*.09)+.2,0.).r)*smoothstep(.02,.28,dd.y)*.32*min(1.,uCover*2.2);
    sky=mix(sky,sky*.6+(sunT(uSun)*1.25+vec3(.35))*smoothstep(-.12,0.,uSun.y),ci);
    a=max(a,ci*.6);
  }
  if(d.y<0.) sky*=mix(1.,.82,clamp(-d.y*4.,0.,1.));
  sky*=mix(1.,.62,uDark);
  o=vec4(sky*1.85*uSkyK,a);
}`;

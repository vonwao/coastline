'use strict';
/* ------ Tiling detail textures ------ */
const FS_NOISE=HEAD+`
in vec2 vUV; out vec4 o;
float h(vec2 p,float per){ p=mod(p,per); vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float pn(vec2 p,float per){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(h(i,per),h(i+vec2(1,0),per),u.x),mix(h(i+vec2(0,1),per),h(i+vec2(1,1),per),u.x),u.y); }
float pf(vec2 uv,float fr,int oc){ float a=.5,s=0.,n=0.; for(int i=0;i<oc;i++){ s+=a*pn(uv*fr+float(i)*13.,fr); n+=a; a*=.5; fr*=2.; } return s/n; }
void main(){
  float a=pf(vUV,4.,7), b=pf(vUV+.37,16.,5);
  float c=1.-abs(2.*pf(vUV+.11,6.,6)-1.);
  float d=pf(vUV+.73,64.,3);
  o=vec4(a,b,c,d);
}`;
const FS_LACE=HEAD+`
in vec2 vUV; out vec4 o;
vec2 h2(vec2 p,float per){ p=mod(p,per); vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float h1(vec2 p,float per){ return h2(p,per).x; }
float pn(vec2 p,float per){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h1(i,per),h1(i+vec2(1,0),per),u.x),mix(h1(i+vec2(0,1),per),h1(i+vec2(1,1),per),u.x),u.y); }
float pf(vec2 uv,float fr,int oc){ float a=.5,s=0.,n=0.; for(int i=0;i<oc;i++){ s+=a*pn(uv*fr,fr); n+=a; a*=.5; fr*=2.; } return s/n; }
vec2 worley(vec2 uv,float fr){ vec2 p=uv*fr,i=floor(p),f=fract(p); float a=9.,b=9.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 r=g+h2(i+g,fr)-f; float d=dot(r,r);
    if(d<a){b=a;a=d;}else if(d<b){b=d;} } return vec2(sqrt(a),sqrt(b)); }
void main(){
  vec2 w=vec2(pf(vUV,6.,5),pf(vUV+.5,6.,5))-.5;
  vec2 uv=vUV+w*.14;
  vec2 big=worley(uv,13.), mid=worley(uv+.31,33.), fin=worley(uv+.67,85.);
  float e1=clamp((big.y-big.x)/.50,0.,1.);
  float e2=clamp((mid.y-mid.x)/.55,0.,1.);
  float e3=clamp((fin.y-fin.x)/.6,0.,1.);
  float n1=pf(vUV+.13,11.,6), n2=pf(vUV+.77,37.,4);
  /* Filaments fade in and out with noise, so the network breaks up instead of forming cracks. */
  float breakup=smoothstep(.30,.70,n1);
  float fil=max(pow(1.-e1,2.6)*(.35+.65*breakup),pow(1.-e2,2.2)*.72*(.25+.75*smoothstep(.35,.65,n2)));
  float speck=pow(1.-e3,2.)*.5;
  float lump=pf(vUV+.2,7.,5);
  float pa=pf(vUV+.9,3.,5);
  float lace=fil*.62+speck*.14+n1*.30+n2*.10-.02;
  lace=clamp(lace,0.,1.);
  float fine=1.-smoothstep(.0,.42,fin.x);
  o=vec4(lace,fine,lump,pa);
}`;

/* ------ Tree canopy seen from above: R height, G per-crown random value, BA centre offset ------ */
const FS_CROWN=HEAD+`
in vec2 vUV; out vec4 o; uniform float uPalm;
#define N 18.
vec2 h2(vec2 p){ p=mod(p,N); vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float nv(vec2 p,float per){ vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  vec2 a=mod(i,per),b=mod(i+1.,per);
  float h00=fract(sin(dot(a,vec2(127.1,311.7)))*43758.5453),h10=fract(sin(dot(vec2(b.x,a.y),vec2(127.1,311.7)))*43758.5453);
  float h01=fract(sin(dot(vec2(a.x,b.y),vec2(127.1,311.7)))*43758.5453),h11=fract(sin(dot(b,vec2(127.1,311.7)))*43758.5453);
  return mix(mix(h00,h10,u.x),mix(h01,h11,u.x),u.y); }
void main(){
  vec2 p=vUV*N,ip=floor(p),fp=fract(p);
  float leaf=.5*nv(vUV*144.,144.)+.3*nv(vUV*288.,288.)+.2*nv(vUV*576.,576.);
  float lobes=nv(vUV*90.,90.);
  float H=0.,id=.5; vec2 cen=vec2(0.);
  for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
    vec2 g=vec2(x,y),j=h2(ip+g),k=h2(ip+g+37.),r=g+j-fp;
    float ang=atan(r.y,r.x),rl=length(r),top=0.;
    float R=.62+.86*k.x;
    if(uPalm>.5&&k.y<.72){
      /* Palm: a star of drooping fronds with gaps between them */
      R*=1.15;
      if(rl<R){
        float nf=floor(9.+7.*j.x);
        float a=abs(fract(ang/6.2832*nf+j.y)-.5)*2.;
        float s=rl/R;
        float bladeW=mix(.92,.42,s);
        float blade=smoothstep(bladeW,bladeW-.22,a);
        float ribs=.82+.18*sin(rl*46.+a*7.);
        top=blade*(1.-s*s)*(.72+.28*k.y)*ribs;
        top=max(top,smoothstep(.2,.05,s)*(.78+.2*k.y));
      }
    } else {
      /* Broadleaf: a lumpy dome */
      float dd=rl*(1.+.17*sin(ang*3.+j.y*30.)+.11*sin(ang*7.+j.x*40.)+.18*(leaf-.5));
      if(dd<R){ float s=1.-dd*dd/(R*R); top=sqrt(s)*(.52+.48*k.y)*(.90+.20*lobes); }
    }
    if(top>H){H=top;id=fract(k.y*7.13+j.x*3.7);cen=r;}
  }
  o=vec4(clamp(H,0.,1.),id,clamp(cen/6.+.5,0.,1.));
}`;

/* ------ Rock detail, tiling. First pass: R height, G crack, B tone, A grain. Weathered stone: rough
   at every scale, with rounded knobs, shallow pits and a few wandering cracks. An earlier version was
   a net of tilted Voronoi plates, which read as crumpled paper up close. The blocky structure of rock
   now comes from joints in the view shader, which keep one direction along a whole coast. ------ */
const FS_ROCKH=HEAD+`
in vec2 vUV; out vec4 o;
vec2 h2(vec2 p,float per){ p=mod(p,per); vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float pn(vec2 p,float per){ vec2 i=floor(p),f=fract(p),u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(h2(i,per).x,h2(i+vec2(1,0),per).x,u.x),mix(h2(i+vec2(0,1),per).x,h2(i+vec2(1,1),per).x,u.x),u.y); }
void main(){
  vec2 w=vec2(pn(vUV*6.,6.),pn(vUV*6.+3.,6.))-.5;
  vec2 uv=vUV+w*.04;
  float H=0.,a=1.,n=0.;
  for(int i=0;i<7;i++){ float f=6.*exp2(float(i)); H+=a*pn(uv*f+float(i)*7.3,f); n+=a; a*=.48; }
  H/=n;
  /* Rounded knobs: high ground swells a little, and small pits sink in. */
  float k=pn(uv*24.+.4,24.)*.6+pn(uv*48.+.8,48.)*.4;
  H+=.25*(smoothstep(.35,.75,k)-.5);
  H-=.06*smoothstep(.70,.86,pn(uv*96.+.2,96.));
  /* A few wandering cracks: contour lines of a broad noise, kept only here and there. */
  float c0=pn(uv*5.+.9,5.)*.7+pn(uv*10.+.3,10.)*.3;
  float cr=(1.-smoothstep(0.,.010,abs(c0-.5)))*smoothstep(.45,.65,pn(uv*7.+.6,7.));
  H-=.05*cr;
  float grain=pn(vUV*190.,190.)*.6+pn(vUV*420.,420.)*.4;
  float tone=pn(uv*9.+.5,9.)*.55+pn(uv*31.,31.)*.45;
  o=vec4(H,cr,tone,grain);
}`;
/* Second pass: RG slope of that height, B crack, A tone with grain. */
const FS_ROCKN=HEAD+`
in vec2 vUV; out vec4 o; uniform sampler2D tI;
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy),s=textureSize(tI,0);
  float e=texelFetch(tI,(c+ivec2(1,0))%s,0).r,w=texelFetch(tI,(c+s-ivec2(1,0))%s,0).r,n=texelFetch(tI,(c+ivec2(0,1))%s,0).r,d=texelFetch(tI,(c+s-ivec2(0,1))%s,0).r;
  vec4 m=texelFetch(tI,c,0);
  vec2 sl=clamp(vec2(e-w,n-d)*32.,-1.,1.);
  o=vec4(sl*.5+.5,m.g,clamp(m.b*.72+m.a*.5-.11,0.,1.));
}`;

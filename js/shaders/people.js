'use strict';
/* ------ People on the beach (js/people.js) ------
   Two parts. On the sand, drawn by the main view shader (PEOPLE_GROUND, joined to FS_MAIN): towels, sand
   trodden around each group and along its trail to the water, footprints up close, and the shadows the
   people and umbrellas cast. In the air, their own pass (VS_PEOPLE, FS_PEOPLE): the people, umbrellas and
   cool boxes as small instanced models, lit by the same sun and sky, shaded by the umbrellas over them,
   and hazed with distance as the plant cards are.
   The main shader already uses every texture unit, so what it needs comes as uniform arrays, for at most
   16 groups near the middle of the view (chosen each frame): uPG (centre x, z, reach, -), uPGI (first
   towel, towels, first caster, casters), uPTr (trail to the water: x0, z0, x1, z1), uPT (towel: x, z,
   yaw, pattern + size) and uPC (shadow caster: x, z, height, radius). uPeopleN is 0 when there are none,
   and then the cost is one comparison per pixel of sand. */
const PEOPLE_N={G:16,T:40,C:96};
const PEOPLE_CAST=`
uniform vec4 uPC[${PEOPLE_N.C}];
/* Shadow (0 to 1) at a point of height y from the casters i0.. above it: each is a disc of radius w at
   height z, and a point is in its shadow when the line from it to the sun passes through the disc. A
   person is two or three such discs, which also stretches their shadow under a low sun. A caster with
   its height given negative is a standing column from the ground up to that height (a walker): the
   line to the sun passes through it if it comes within w of the column's axis on the way up. */
float pCast(vec3 p,vec3 sun,int i0,int n){
  float s=0.; vec2 sd=sun.xz/max(sun.y,.15);
  for(int i=0;i<24;i++){
    if(i>=n) break;
    vec4 c=uPC[i0+i];
    if(c.z<0.){
      vec2 b=sd*max(-c.z-p.y,0.), q=c.xy-p.xz; float h=clamp(dot(q,b)/max(dot(b,b),1e-6),0.,1.);
      s=max(s,1.-smoothstep(c.w*.7,c.w*1.1,length(q-b*h)));
      continue;
    }
    float dh=c.z-p.y; if(dh<.04) continue;
    float d=length(p.xz+sd*dh-c.xy);
    s=max(s,1.-smoothstep(c.w*.80,c.w*1.06,d));
  }
  return s;
}`;
const PEOPLE_GROUND=PEOPLE_CAST+`
uniform float uPeopleN; uniform vec4 uPBox;
uniform vec4 uPG[${PEOPLE_N.G}],uPGI[${PEOPLE_N.G}],uPTr[${PEOPLE_N.G}],uPT[${PEOPLE_N.T}];
float pHash(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
/* Towel colours, linear: two per pattern. */
vec3 towelCol(int k,bool b){
  k=k-6*(k/6);
  if(k==0) return b?vec3(.80,.78,.72):vec3(.55,.05,.06);
  if(k==1) return b?vec3(.80,.78,.72):vec3(.03,.12,.42);
  if(k==2) return b?vec3(.86,.62,.05):vec3(.80,.32,.03);
  if(k==3) return b?vec3(.78,.76,.70):vec3(.02,.33,.36);
  if(k==4) return b?vec3(.45,.07,.25):vec3(.85,.55,.62);
  return b?vec3(.07,.07,.08):vec3(.70,.70,.66);
}
void peopleGround(vec3 P,float fp,float sandness,vec3 sun,inout vec3 alb,inout float sh){
  if(P.x<uPBox.x||P.z<uPBox.y||P.x>uPBox.z||P.z>uPBox.w) return;
  vec2 g=P.xz;
  float trod=0., foot=0.;
  float e=max(fp*.7,.012);
  for(int k=0;k<${PEOPLE_N.G};k++){
    if(float(k)>=uPeopleN) break;
    vec4 G=uPG[k], I=uPGI[k], T=uPTr[k];
    /* The trail to the water: a band of trodden sand, with footprints in it up close. */
    vec2 ab=T.zw-T.xy; float L2=dot(ab,ab);
    if(L2>1.){
      float h=clamp(dot(g-T.xy,ab)/L2,0.,1.); vec2 dir=ab/sqrt(L2);
      float s=h*sqrt(L2), v=dot(g-T.xy,vec2(-dir.y,dir.x));
      /* The trail wanders a little, as people do. */
      v-=.35*sin(s*.21+G.x)+.2*sin(s*.53+G.y);
      float band=1.-smoothstep(.25,.75,abs(v));
      trod=max(trod,band*.8*(1.-smoothstep(.85,1.,h)));
      if(fp<.06&&band>0.){
        float st=.68, kk=floor(s/st), sp=s-kk*st, side=mod(kk,2.)*2.-1.;
        float v0=side*.11+(pHash(vec2(kk,G.x))-.5)*.08;
        float f=length(vec2((sp-.34)/.14,(v-v0)/.06));
        foot=max(foot,(1.-smoothstep(.75,1.05,f))*(1.-smoothstep(.03,.06,fp))*step(.15,pHash(vec2(kk,G.y))));
      }
    }
    vec2 d=g-G.xy; float r=length(d);
    if(r>G.z) continue;
    /* A walker (G.w 1) only casts a shadow. */
    if(G.w>.5){ sh=min(sh,1.-pCast(P,sun,int(I.z),int(I.w))*.92); continue; }
    /* Scuffed sand around the group. */
    trod=max(trod,(1.-smoothstep(2.2,4.2,r))*(.55+.45*pHash(floor(g*3.)+G.xy)));
    /* Towels: fabric in two colours, in stripes, a border or plain, by pattern. */
    for(int i=0;i<4;i++){
      if(float(i)>=I.y) break;
      vec4 t=uPT[int(I.x)+i];
      vec2 q=g-t.xy, ax=vec2(cos(t.z),sin(t.z));
      float u=dot(q,ax), v=dot(q,vec2(-ax.y,ax.x));
      float hl=.85+fract(t.w)*.3, hw=hl*.52;
      float in_=(1.-smoothstep(hl-e,hl+e,abs(u)))*(1.-smoothstep(hw-e,hw+e,abs(v)));
      if(in_<=0.) continue;
      int k2=int(t.w); int pat=k2/6;
      bool b=pat==0?fract(u*2.6)<.5:pat==1?(abs(u)>hl-.12||abs(v)>hw-.1):false;
      vec3 tc=towelCol(k2,b);
      /* Folds and the weave catch a little light and shade. */
      tc*=.93+.07*sin(u*9.+v*3.)*smoothstep(.04,.01,fp);
      alb=mix(alb,tc,in_);
      trod*=1.-in_;
    }
    sh=min(sh,1.-pCast(P,sun,int(I.z),int(I.w))*.92);
  }
  alb*=1.-(.08*trod+.16*foot)*sandness;
}`;

/* The people, umbrellas and cool boxes: one model each, many copies. iA: x, y, z, yaw; iB: skin tone,
   colour A, colour B, scale (+10 when the person wears a top); iC: for walkers and surfers (js/people.js
   drawPeople), else zero. Materials (aM, plus 16 times a joint number for moving parts): 0 skin,
   1 swimwear, 2 hair, 3 and 4 the umbrella's two colours, 5 its pole, 6 a cool box, 7 its lid, 8 a top
   (swimwear or skin), 9 a surfboard, 10 a wetsuit. */
const VS_PEOPLE=`#version 300 es
precision highp float;
#define PI 3.14159265359
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in float aM;
layout(location=3) in vec4 iA; layout(location=4) in vec4 iB; layout(location=5) in vec4 iC;
uniform vec3 uRo,uR,uU,uF,uSun,uSunE; uniform vec2 uJit,uDomMin,uDomSize; uniform float uTan,uAspect,uDA,uDB,uFogB,uCloudShade,uCloudT;
uniform sampler2D tEnv,tNoise,tLit,tTerr,tRM0;
out vec3 vN,vW,vV,vSky,vFogC; out float vM,vFog,vLit; flat out vec4 vB;
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,s,-s,c); }
/* A leg's swing (radians, forward positive) and knee bend at phase ph of its stride (0 = the heel comes
   down). On the ground (the first 60%) the foot stays put while the hip passes over it, so the angle's
   sine falls evenly; in the air the leg swings through, the knee bending most early on. */
float legAngle(float ph,float sA,out float knee){
  if(ph<.6){ float s=ph/.6; knee=.12*sin(PI*s); return asin(sA*(1.-2.*s)); }
  float s=(ph-.6)/.4, e=.5-.5*cos(PI*s); knee=1.05*sin(PI*min(s*1.25,1.)); return asin(sA*(2.*e-1.));
}
`+HAZE+`
void main(){
  bool top=iB.w>5.; float sc=top?iB.w-10.:iB.w;
  int kind=int(iC.w+.5), id=int(aM/16.+.01); float mat=aM-16.*float(id);
  vec3 p0=aP, n0=aN, base=iA.xyz, up=vec3(0.,1.,0.);
  /* What this person wears (personLook in js/people.js, 8 times its bits in iB.z): the sun hat (14) and
     long hair (15) are drawn only on those who have them, folded to a point on everyone else. */
  int look=int(iB.z+.5)/8;
  if((mat>13.5&&mat<14.5&&(look&2)==0)||(mat>14.5&&mat<15.5&&(look&4)==0)) p0=vec3(0.);
  if(kind==1){
    /* Walking: legs from the hips, shins from the knees, arms from the shoulders, against the leg. */
    float kR,kL, thR=legAngle(fract(iC.x),iC.y,kR), thL=legAngle(fract(iC.x+.5),iC.y,kL);
    if(id>0){
      bool left=id==1||id==3||id==5; float th=left?thL:thR, kn=left?kL:kR;
      if(id<5){
        if(id>2){ vec2 k=vec2(0.,.47); p0.xy=k+rot(-kn)*(p0.xy-k); n0.xy=rot(-kn)*n0.xy; }
        vec2 h=vec2(0.,.88); p0.xy=h+rot(th)*(p0.xy-h); n0.xy=rot(th)*n0.xy;
      } else { vec2 h=vec2(0.,1.42); p0.xy=h+rot(-.7*th)*(p0.xy-h); n0.xy=rot(-.7*th)*n0.xy; }
    }
    /* The body rides up and down over the leg on the ground. */
    float cs=min(fract(iC.x)<.6?cos(thR):1.,fract(iC.x+.5)<.6?cos(thL):1.);
    p0.y+=.88*(cs-1.)*.55;
    /* Feet on the ground as drawn: the fine height map, not the coarse one the copies were placed on. */
    base.y=textureLod(tTerr,(iA.xz-uDomMin)/uDomSize,0.).r;
  } else if(kind>=2){
    /* Paddling: each arm wheels round the shoulder, half a turn apart; out of the water it comes
       forward low, elbow bent, so the circle is flattened above the shoulder. */
    if(kind==3&&id>4){
      vec2 h=vec2(.42,.24); float a=PI*.5-2.*PI*fract(iC.x+(id==5?.5:0.));
      vec2 q=rot(a)*(p0.xy-h); n0.xy=rot(a)*n0.xy; if(q.y>0.) q.y*=.4; p0.xy=h+q;
    }
    if(mat>8.5&&mat<9.5){ float bc=kind==2?.35:0.; p0.x=bc+(p0.x-bc)*iC.z; }
    /* Riding the swell: the height and slope of the simulated sea under the board. */
    vec2 uv=(iA.xz-uDomMin)/uDomSize, dx=vec2(.9/uDomSize.x,0.), dz=vec2(0.,.9/uDomSize.y);
    base.y=textureLod(tRM0,uv,0.).x;
    float ex=textureLod(tRM0,uv+dx,0.).x-textureLod(tRM0,uv-dx,0.).x, ez=textureLod(tRM0,uv+dz,0.).x-textureLod(tRM0,uv-dz,0.).x;
    up=normalize(vec3(-ex/1.8*.85,1.,-ez/1.8*.85));
  }
  vec3 p=p0*((mat>2.5&&mat<7.5)||(mat>8.5&&mat<9.5)?1.:sc);
  vec3 f=vec3(cos(iA.w),0.,sin(iA.w)); f=normalize(f-up*dot(f,up)); vec3 sd=cross(f,up);
  vec3 pos=base+f*p.x+up*p.y+sd*p.z;
  vN=f*n0.x+up*n0.y+sd*n0.z; vW=pos; vM=mat; vB=iB;
  vec3 v=pos-uRo; float z=dot(v,uF); vV=v;
  gl_Position=vec4(dot(v,uR)/(uTan*uAspect),dot(v,uU)/uTan,uDA*z+uDB,z); gl_Position.xy-=uJit*gl_Position.w;
  float cs=1.;
  if(uCloudShade>0.){ float n=textureLod(tNoise,iA.xz/3400.+vec2(uCloudT*.0011,uCloudT*.0006),0.).r; cs=1.-uCloudShade*smoothstep(.47,.66,n); }
  vec2 luv=(iA.xz-uDomMin)/uDomSize;
  vLit=cs*(all(greaterThan(luv,vec2(0.)))&&all(lessThan(luv,vec2(1.)))?textureLod(tLit,luv,0.).r:1.);
  vSky=textureLod(tEnv,envUV(normalize(vec3(0.,1.6,0.))),6.2).rgb*PI*.68;
  vec3 F=normalize(v), rh=F; rh.y=max(rh.y,.012); rh=normalize(rh);
  vFogC=mix(min(textureLod(tEnv,envUV(rh),2.8).rgb,vec3(3.2)),textureLod(tEnv,vec2(.5),7.5).rgb,smoothstep(.06,.34,-F.y));
  vFog=hazeK(length(v),uRo.y,pos.y,uFogB);
}`;
const FS_PEOPLE=HEAD+`
in vec3 vN,vW,vV,vSky,vFogC; in float vM,vFog,vLit; flat in vec4 vB; layout(location=0) out vec4 o;
uniform vec3 uSun,uSunE; uniform vec4 uPU[16]; uniform float uPUN;
/* Shade from the umbrellas over people: each canopy a disc (x, z, height, radius). */
float umbShade(vec3 p){
  float s=0.; vec2 sd=uSun.xz/max(uSun.y,.15);
  for(int i=0;i<16;i++){
    if(float(i)>=uPUN) break;
    vec4 c=uPU[i]; float dh=c.z-p.y; if(dh<.05) continue;
    s=max(s,1.-smoothstep(c.w*.80,c.w*1.06,length(p.xz+sd*dh-c.xy)));
  }
  return s;
}
vec3 swimCol(float k){
  int i=int(k)-8*(int(k)/8);
  return i==0?vec3(.02,.02,.025):i==1?vec3(.02,.05,.20):i==2?vec3(.50,.03,.04):i==3?vec3(.75,.22,.17)
    :i==4?vec3(.78,.78,.74):i==5?vec3(.02,.30,.32):i==6?vec3(.20,.05,.30):vec3(.20,.22,.06);
}
/* Surfboards: mostly white or cream, some pale colours. */
vec3 boardCol(float k){
  int i=int(k)-6*(int(k)/6);
  return i<2?vec3(.82,.82,.80):i==2?vec3(.80,.74,.58):i==3?vec3(.45,.66,.78):i==4?vec3(.82,.70,.30):vec3(.55,.75,.62);
}
vec3 umbCol(float k,bool b){
  int i=int(k)-6*(int(k)/6);
  if(b) return i==2||i==4?vec3(.82,.60,.04):vec3(.80,.79,.74);
  return i==0?vec3(.60,.04,.04):i==1?vec3(.03,.12,.48):i==2?vec3(.82,.30,.02):i==3?vec3(.02,.38,.40):i==4?vec3(.80,.79,.74):vec3(.08,.32,.10);
}
/* T-shirts: light and faded colours mostly. Sun hats: straw, white, navy, red. */
vec3 shirtCol(float k){
  int i=int(k)-6*(int(k)/6);
  return i==0?vec3(.78,.78,.76):i==1?vec3(.42,.55,.66):i==2?vec3(.03,.06,.18):i==3?vec3(.72,.30,.24):i==4?vec3(.38,.45,.32):vec3(.55,.55,.52);
}
vec3 hatCol(float k){ int i=int(k)-4*(int(k)/4); return i==0||i==1?vec3(.58,.47,.28):i==2?vec3(.80,.79,.74):i==3?vec3(.04,.06,.20):vec3(.48,.06,.05); }
void main(){
  int m=int(vM+.5);
  float sk=vB.x;
  /* iB.z: p.extra (0 to 7) and 8 times the look's bits (js/people.js personLook). */
  int look=int(vB.z+.5)/8; float ex=vB.z-8.*float(look);
  bool shorts=(look&1)!=0, shirt=(look&8)!=0, top=vB.w>5.;
  vec3 skin=sk<1.?vec3(.56,.38,.29):sk<2.?vec3(.44,.27,.18):sk<3.?vec3(.30,.17,.10):vec3(.13,.075,.045);
  vec3 hair=sk>2.5?vec3(.02,.015,.012):vec3(.10,.06,.03)+vec3(.35,.28,.12)*step(6.,ex)+vec3(.12,.03,0.)*step(4.5,ex)*step(ex,5.5);
  vec3 shirtC=shirtCol(vB.y*3.+ex);
  /* Zones of the body (js/people.js figure): 8 the chest band (a bikini top, a t-shirt or skin), 11 the
     belly and shoulders, 12 the upper arms (a t-shirt or skin), 13 the thighs (boardshorts or skin). */
  bool isSkin=m==0||((m==8)&&!shirt&&!top)||((m==11||m==12)&&!shirt)||(m==13&&!shorts);
  vec3 a=isSkin?skin:m==1?swimCol(vB.y):m==2||m==15?hair:
    m==3?umbCol(vB.y,false):m==4?umbCol(vB.y,true):m==5?vec3(.55,.55,.55):m==6?swimCol(vB.z+2.):m==7?vec3(.78,.78,.76):
    m==9?boardCol(vB.z):m==10?(vB.y<.5?vec3(.018,.018,.02):mix(vec3(.02),swimCol(vB.y),.3)):
    m==8?(shirt?shirtC:swimCol(vB.y)):m==11||m==12?shirtC:m==13?swimCol(vB.y):m==14?hatCol(ex):skin;
  /* The umbrella and the hat's brim are single sheets: seen from below, their lit side faces away. */
  vec3 n=normalize(vN); bool back=(m==3||m==4||m==14)&&dot(n,vV)>0.;
  if(back) n=-n;
  float sh=1.-umbShade(vW)*.92;
  /* Skin and hair take light softly round the turn of a limb (light scatters inside them), and skin
     warms where the light falls off. */
  float nl=dot(n,uSun), wr=isSkin?.32:m==2||m==15?.22:.06, ndl=max((nl+wr)/(1.+wr),0.);
  vec3 E=uSunE*ndl*sh*vLit+vSky*(.55+.45*n.y)+vec3(.45,.40,.33)*(uSunE*max(uSun.y,0.)*sh*vLit*.30+vSky*.25)*(.5-.5*n.y);
  if(isSkin) E+=uSunE*sh*vLit*vec3(.10,.035,.012)*(1.-smoothstep(0.,.45,abs(nl+.05)));
  vec3 L=a/PI*E;
  /* A soft highlight: skin and hair a little, wetsuits and boards more (wet). */
  if(m<3||m>7){
    vec3 Vd=-normalize(vV), Hh=normalize(uSun+Vd); float r=isSkin?.55:m==10||m==9?.32:m==2||m==15?.45:.6, a2=r*r*r*r;
    float nh=max(dot(n,Hh),0.), D=a2/(PI*pow(nh*nh*(a2-1.)+1.,2.)), Fr=.04+.96*pow(1.-max(dot(Vd,Hh),0.),5.);
    float ks=isSkin?.5:m==10?1.:m==9?.8:m==2||m==15?.35:.4;
    L+=uSunE*sh*vLit*D*Fr*max(nl,0.)*.25*ks;
  }
  /* Umbrella fabric glows with the sun through it, seen from below. */
  if((m==3||m==4)&&back) L+=a*uSunE*max(uSun.y,0.)*vLit*.10/PI;
  o=vec4(mix(L,vFogC,vFog),1.);
}`;

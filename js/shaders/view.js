'use strict';
/* ------ Main view: height-field march plus water optics ------ */
const FS_MAIN=HEAD+`
in vec2 vUV; layout(location=0) out vec4 o;
uniform vec3 uRo,uR,uU,uF; uniform vec2 uJit; uniform float uTan,uAspect,uResY; uniform int uSteps,uMarchK;
uniform vec2 uDomMin,uDomSize,uFarMin,uFarSize,uCellN; uniform float uDx,uEdge,uMaxH,uNearH,uTide,uSimT,uTime,uChop,uSwH;
uniform sampler2D tTerr,tTerrF,tLit,tLitF,tRM0,tRM1,tFx,tAdv,tFFT,tCaus,tEnv,tNoise,tLace,tCrown,tRock,tSim; uniform int uLabel;
uniform vec3 uSun,uSunE,uSigA,uSigS,uSed,uSandA,uSandB,uSandPatch; uniform int uType;
uniform vec4 uSwK[8]; uniform float uSwA[8]; uniform int uFlora; uniform float uMixed,uRockAng,uGranite,uFish,uSnow,uFarLod,uSlopeK,uFarStep; uniform vec4 uShrubM;
uniform float uWA,uWB,uFogB,uCloudShade,uCloudT,uDA,uDB,uCardD,uCardS,uStars;
uniform vec3 uMoonSun; uniform float uMoonLit;
float gT=0.;
/* The moon at night (then uSun points at the moon), in its real phase. It's drawn as a ball lit from the
   real sun's direction: seen from here, a point on its face is lit if the sun is above it there. A disc of
   0.75 degrees, larger than the real half degree as the sun's is, with darker patches for its seas and a
   faint glow on the unlit part from sunlight reflected by the earth. Returns how much of the moon's face
   is lit at this pixel, darkened by its seas; uMoonK then sets how bright that is on screen. */
uniform float uMoonK;
float moonDisc(vec3 rd,float mu,float pa){
  if(mu<.999) return 0.;
  const float R=.0131;
  vec3 s=uMoonSun-uSun*dot(uMoonSun,uSun); float sl=length(s);
  vec3 ax=sl>1e-5?s/sl:normalize(cross(uSun,vec3(0,1,0))), ay=cross(uSun,ax);
  vec2 p=vec2(dot(rd,ax),dot(rd,ay))/R; float r=length(p);
  float disc=1.-smoothstep(1.-pa/R,1.+pa/R,r);
  if(disc<=0.) return 0.;
  float z=sqrt(max(1.-r*r,0.)), cE=dot(uSun,uMoonSun), sE=sqrt(max(1.-cE*cE,0.));
  float lit=smoothstep(-.07,.07,p.x*sE-z*cE);
  float sea=textureLod(tNoise,p*.11+vec2(.31,.57),0.).r;
  float alb=1.-.4*smoothstep(.47,.6,sea);
  return disc*alb*(lit+.01);
}
/* Stars, for night skies: a fixed field of points, each about a pixel wide, a few bright and many faint,
   twinkling a little. The sky is divided into small cells round the camera, each holding at most one
   star at a random spot. Returns brightness, before the sky's own light and clouds are allowed for. */
float stars(vec3 d,float pa){
  vec3 q=d*220.; vec3 c=floor(q);
  float h=fract(sin(dot(c,vec3(127.1,311.7,74.7)))*43758.5453);
  if(h<.965) return 0.;
  vec3 j=vec3(fract(h*17.31),fract(h*91.7),fract(h*313.9));
  vec3 sd=normalize(c+.2+.6*j);
  float a=acos(clamp(dot(d,sd),-1.,1.));
  float r=max(pa*.75,1e-5);
  float mag=pow(fract(h*7.13),5.)*3.+.08;
  float tw=.75+.25*sin(uTime*(2.+5.*fract(h*3.7))+h*40.);
  return mag*tw*exp(-a*a/(r*r))*smoothstep(.0,.12,d.y);
}
/* Ground slope (rise over run) at the point being shaded, for sizing features across the ground. */
float gSlope=.05;

vec2 dUV(vec2 p){ return (p-uDomMin)/uDomSize; }
vec2 fUV(vec2 p){ return (p-uFarMin)/uFarSize; }
float edgeW(vec2 uv){ vec2 e=min(uv,1.-uv); return smoothstep(0.,uEdge,min(e.x,e.y)); }
float swellH(vec2 p){ float s=0.; for(int i=0;i<8;i++){ s+=uSwA[i]*sin(dot(uSwK[i].xy,p)-uSwK[i].z*uSimT+uSwK[i].w); } return s; }
vec4 terrS(vec2 p){
  vec2 uv=dUV(p); float w=edgeW(uv);
  vec4 f=textureLod(tTerrF,fUV(p),0.);
  if(w<=0.) return f;
  vec4 n=textureLod(tTerr,uv,0.);
  return w>=1.?n:mix(f,n,w);
}
float gFarLod=0.;
float terrH(vec2 p){
  vec2 uv=dUV(p); float w=edgeW(uv);
  if(w>=1.) return textureLod(tTerr,uv,0.).r;
  float f=textureLod(tTerrF,fUV(p),gFarLod).r;
  if(w<=0.) return f;
  return mix(f,textureLod(tTerr,uv,0.).r,w);
}
float etaH(vec2 p){
  vec2 uv=dUV(p); float w=edgeW(uv);
  float a=-100.;
  if(w<1.) a=uTide+swellH(p)*(1.-smoothstep(-3.5,-.2,textureLod(tTerrF,fUV(p),1.).r));
  if(w<=0.) return a;
  vec4 r=textureLod(tRM0,uv,0.);
  float e=(r.y>.0006||uType==2)?r.x:(w<1.?a:-100.);
  return w>=1.?e:mix(a,e,w);
}
float surfH(vec2 p){ return max(terrH(p),etaH(p)); }
vec2 litAt(vec2 p){
  vec2 uv=dUV(p); float w=edgeW(uv);
  vec2 f=textureLod(tLitF,fUV(p),0.).rg;
  if(w<=0.) return f;
  return mix(f,textureLod(tLit,uv,0.).rg,w);
}
float march(vec3 ro,vec3 rd){
  bool up=rd.y>-1.5e-4;
  if(up&&ro.y>=uMaxH) return -1.;
  float lo=-2.6-uSwH;
  float hd=max(length(rd.xz),.01);
  float t0,t1;
  if(up){
    t0=ro.y>uNearH?380./hd:.5;
    t1=rd.y>1e-4?min((uMaxH-ro.y)/rd.y,24000.):24000.;
  } else {
    t0=ro.y>uNearH?min((uNearH-ro.y)/rd.y,max(380./hd,(uMaxH>ro.y?1.:(uMaxH-ro.y)/rd.y))):.5;
    t1=min((lo-ro.y)/rd.y,42000.);
  }
  if(t1<=t0) return up?-1.:t1;
  float r=t1/t0; float tp=t0; float dp=(ro+rd*t0).y-surfH((ro+rd*t0).xz);
  if(dp<0.) return t0;
  int stepsN=uSteps+int(float(uSteps)*1.3*(1.-smoothstep(.0,.07,abs(rd.y))));
  float n=float(stepsN);
  float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))*(1.-smoothstep(.0,.1,abs(rd.y)));
  bool geo=r>4.;
  float grow=geo?pow(r,1./n)-1.:0.,lin=(t1-t0)/n;
  /* How far the ray can safely step depends on how steep the ground can be. Sharp mountain crests are
     much steeper than any coast, and with coastal steps rays jumped straight through them, leaving the
     ridges saw-toothed. */
  float slopeK=abs(rd.y)+uSlopeK;
  int maxN=uType==2?stepsN*uMarchK:stepsN;
  float texel=uDomSize.x/float(textureSize(tTerr,0).x), pxA=2.*uTan/uResY;
  for(int i=1;i<=maxN;i++){
    float full=geo?tp*grow:lin;
    float st=full;
    if(uType==2){
      /* Within 150 m, thin edges of rock must not fall between steps, or they flicker as the drone moves. */
      float fine=max(texel*1.1,tp*pxA*1.5);
      /* Near the surface far away, a step is at least uFarStep of the even step. At 0.22 that is about 5%
         of the distance, 150 m at 3 km: fine for low coasts, but rays stepped clean over mountain crests
         and the ridges came out comb-toothed. Mountain scenes use a much smaller floor. */
      st=min(full,max(dp*.7/slopeK,mix(fine,full*uFarStep,smoothstep(150.,400.,tp))));
    }
    if(i==1) st*=1.-jit;
    float t=min(tp+st,t1);
    /* Far away the march reads a blurred height map, to save time. Where tall mountains stand far away
       (uFarLod), it must stay sharp: the blurred ridge sits lower than the real one, so the ray hits a
       point the shading then finds inside the mountain, and ridges came out smeared and saw-toothed. */
    gFarLod=clamp(log2(max(t-tp,1.)/16.6)+.5,0.,uFarLod);
    vec3 p=ro+rd*t; float d=p.y-surfH(p.xz);
    if(d<0.){
      float a=tp,b=t,da=dp,db=d;
      for(int j=0;j<5;j++){
        float m=a+(b-a)*clamp(da/(da-db),.1,.9);
        vec3 q=ro+rd*m; float dm=q.y-surfH(q.xz);
        if(dm<0.){b=m;db=dm;}else{a=m;da=dm;}
      }
      gFarLod=0.;
      return .5*(a+b);
    }
    tp=t;dp=d;
    if(t>=t1) break;
  }
  gFarLod=0.;
  /* Out of steps while skimming just above the ground: call it a hit, rather than show sky through a
     mountain. Only mountain scenes skim long enough for this to happen. */
  if(tp<t1&&dp<max(tp*.004,2.)) return tp;
  return up?-1.:t1;
}
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
vec3 env(vec3 d,float lod){ return textureLod(tEnv,envUV(d),lod).rgb; }
vec3 skyIrr(vec3 n){ return textureLod(tEnv,envUV(normalize(n+vec3(0,.6,0))),6.2).rgb*PI*.68; }
vec2 rotT(vec2 p,float tile){ float a=tile*2.399; float c=cos(a),s=sin(a); return vec2(c*p.x-s*p.y,s*p.x+c*p.y); }
float nz(vec2 p,float tile,float fp,int ch){
  float lod=max(log2(max(fp,1e-3)*512./tile),0.);
  vec4 v=textureLod(tNoise,rotT(p,tile)/tile,lod);
  return ch==0?v.r:ch==1?v.g:ch==2?v.b:v.a;
}
float cloudSun(vec2 p){
  if(uCloudShade<=0.) return 1.;
  float c=textureLod(tNoise,p/3400.+vec2(uCloudT*.0011,uCloudT*.0006),0.).r;
  return 1.-uCloudShade*smoothstep(.47,.66,c);
}
/* Slope of a tiling noise channel: cheap micro-relief that holds up at any distance. */
vec2 nzSlope(vec2 p,float tile,float fp,float amp){
  float lod=max(log2(max(fp,1e-3)*512./tile),0.);
  float e=max(tile/128.,fp*.7);
  vec2 q=rotT(p,tile)/tile; float k=e/tile;
  float c=textureLod(tNoise,q,lod).g;
  float dx=textureLod(tNoise,q+vec2(k,0.),lod).g-c;
  float dz=textureLod(tNoise,q+vec2(0.,k),lod).g-c;
  /* Normalised so that amp is close to the resulting RMS slope. */
  return vec2(dx,dz)/k*(amp/16.);
}
/* Sand ripples: slope in xy, and in z the height from -1 (trough) to 1 (crest), faded with distance. */
vec3 ripple(vec2 p,float fp,float k){
  if(fp>.9) return vec3(0.);
  float w1=textureLod(tNoise,p/42.,0.).r,w2=textureLod(tNoise,p/9.,0.).g;
  vec2 dir=normalize(vec2(.9,.42)+(vec2(w1,w2)-.5)*1.1);
  float ph=dot(p,dir)*7.2+w1*22.+w2*7.;
  float a=.09*(1.-smoothstep(.06,.34,fp));
  float big=dot(p,normalize(dir+vec2(-.3,.5)))*1.25+w1*14.;
  float b=.085*(1.-smoothstep(.45,.9,fp));
  float h=(sin(ph)*a/.09+sin(big)*b/.085*.4)/1.4;
  return vec3((dir*cos(ph)*a+vec2(.75,.5)*cos(big)*b)*k,h*k);
}
vec2 hh(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
void landPalette(out vec3 woodA,out vec3 woodB,out vec3 open){
  if(uFlora==0){ woodA=vec3(.024,.044,.020); woodB=vec3(.060,.088,.036); open=vec3(.082,.094,.044); }
  else if(uFlora==1){ woodA=vec3(.025,.038,.020); woodB=vec3(.066,.078,.034); open=vec3(.125,.115,.066); }
  else if(uFlora==3){ woodA=vec3(.018,.032,.024); woodB=vec3(.045,.062,.040); open=vec3(.105,.105,.064); }
  else { woodA=vec3(.030,.044,.023); woodB=vec3(.076,.090,.038); open=vec3(.115,.110,.062); }
}
/* 1 in closed woodland, near 0 in open country. */
float landWood(vec2 p,float fp){
  float cover=nz(p,1730.,fp,0)*.62+nz(p,547.,fp,1)*.38;
  return smoothstep(.30,.52,cover+.28*(nz(p,133.,fp,0)-.5)+(uFlora==0?.10:0.))*smoothstep(.40,.50,nz(p+311.,1100.,fp,0)+.3*(nz(p,160.,fp,0)-.5));
}
/* One layer of plants: the crown under this pixel, with parallax for depth at oblique angles.
   Each crown checks plant density at its own centre, so it's kept or dropped whole. */
vec2 toWorld(vec2 r,float tile){ float a=tile*2.399,c=cos(a),s=sin(a); return vec2(c*r.x+s*r.y,-s*r.x+c*r.y); }
float nzFixed(vec2 p,float tile,int ch){ vec4 v=textureLod(tNoise,rotT(p,tile)/tile,max(log2(1024./tile),0.)); return ch==0?v.r:v.g; }
float woodAt(vec2 p){
  float cover=nzFixed(p,1730.,0)*.62+nzFixed(p,547.,1)*.38;
  return smoothstep(.30,.52,cover+.28*(nzFixed(p,133.,0)-.5)+(uFlora==0?.10:0.))*smoothstep(.40,.50,nzFixed(p+311.,1100.,0)+.3*(nzFixed(p,160.,0)-.5));
}
/* Shrubs grow in clumps: the same function as in the plant shaders. */
float shrubClump(vec2 wp){ return 1.75*smoothstep(.36,.66,nzFixed(wp,23.,0)*.62+nzFixed(wp,7.3,1)*.38); }
float presence(vec4 cIn,vec2 q,float tile,float mode,float wood){
  vec4 c=textureLod(tCrown,rotT(q,tile)/tile,0.);
  vec2 cen=q+toWorld((c.ba-.5)*6.,tile)*tile/18.;
  vec4 mc=terrS(cen);
  float cov;
  if(mode>.5) cov=smoothstep(.02,.55,mc.b)*.7*(1.-.6*smoothstep(.6,.9,mc.b))*shrubClump(cen);
  else cov=smoothstep(.22,.85,mc.b)*mix(.07,1.08,woodAt(cen));
  /* Same rules as the plant cards: nothing on low ground or bare rock. */
  if(uCardD>0.&&(mc.r<.5||mc.g>.5)) return 0.;
  return step(c.g+.006,cov);
}
void crownLayer(vec2 p,vec2 vd,float tile,float cH,float fp,float mode,float wood,out float H,out float id,out vec2 q){
  float lod=max(log2(max(fp,.01)*1024./tile),0.);
  vec4 c=textureLod(tCrown,rotT(p,tile)/tile,lod);
  q=p+vd*(c.r-.55)*cH;
  c=textureLod(tCrown,rotT(q,tile)/tile,lod);
  q=p+vd*(c.r-.55)*cH;
  c=textureLod(tCrown,rotT(q,tile)/tile,lod);
  H=c.r*presence(c,q,tile,mode,wood); id=c.g;
}
/* How much of the sky the standing plants hide from this patch of ground: the crown above it,
   and those just around it. cov is the plant cover here, so only crowns that really grow count. */
float standOcc(vec2 p,float tile,float rad,float cov){
  /* The crown texture knows where the nearest plant's centre is, so the shade can fall off
     smoothly from the plant's foot rather than follow the crown's outline. */
  vec4 c=textureLod(tCrown,rotT(p,tile)/tile,0.);
  if(c.r<=0.||c.g+.006>=cov) return 0.;
  vec2 cen=p+toWorld((c.ba-.5)*6.,tile)*tile/18.;
  float o=1.-smoothstep(.1*rad,rad,length(p-cen));
  return o*o;
}
/* The standing shrub or grass tuft whose crown covers q, rebuilt from the same random numbers the
   plant shaders use: its centre, its radius on the ground and its height. */
vec2 h2c(vec2 p){ p=mod(p,18.); vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
bool shrubAt(vec2 q,out vec2 cen,out float r,out float h){
  cen=q; r=0.; h=0.;
  vec4 c=textureLod(tCrown,rotT(q,27.)/27.,0.);
  if(c.r<=0.) return false;
  cen=q+toWorld((c.ba-.5)*6.,27.)*1.5;
  /* Whether it grows is decided at its own foot, by the same rules as the plant shaders. Decided
     where its shadow falls instead, long evening shadows fell from plants that never grew. */
  vec4 mc=terrS(cen);
  float cov=smoothstep(.02,.55,mc.b)*.7*(1.-.6*smoothstep(.6,.9,mc.b))*shrubClump(cen);
  if(c.g+.006>=cov||mc.r<.5||mc.g>.5) return false;
  vec2 ip=floor(rotT(cen,27.)/27.*18.);
  vec2 k=h2c(ip+37.),u=hh(ip+71.3);
  bool grass=u.y<(uFlora==0?.3:uFlora==1?.62:.5);
  float sc=grass?mix(.7,1.5,k.x):mix(.55,1.45,k.x);
  r=(grass?uShrubM.z*.55:uShrubM.x*.62)*sc;
  h=(grass?uShrubM.w:uShrubM.y)*2.*sc;
  return true;
}
/* Its shadow on the ground: a rounded plant throws a soft oval, stretched away from the sun. */
float shrubShadow(vec2 p,vec2 sd){
  float s=0.; vec2 cen; float r,h;
  for(int i=0;i<2;i++){
    if(!shrubAt(p-sd*(i==0?.15:.75),cen,r,h)) continue;
    vec2 a=cen+sd*h*.12,b=cen+sd*h*.72,pa=p-a,ba=b-a;
    float t=clamp(dot(pa,ba)/max(dot(ba,ba),1e-4),0.,1.);
    s=max(s,1.-smoothstep(r*.5,r*1.05,length(pa-ba*t)));
  }
  return s;
}
/* Individual trees and shrubs: their own colours, depth between crowns, shadows thrown across
   neighbours and ground, and light through the leaves. */
void canopy(vec2 p,vec3 rd,float fp,float dens,inout vec3 alb,inout vec3 N,out float sh,out float ao,out float tr){
  sh=1.;ao=1.;tr=0.;
  float nearK=1.-smoothstep(.6,2.4,fp);
  if(nearK<=0.) return;
  const float tT=78.,cT=8.,tS=27.,cS=2.2;
  float wood=landWood(p,fp);
  float cardK=uCardD>0.?1.-smoothstep(uCardD*.86,uCardD,gT):0.;
  /* Forest floor only exists where trees stand over it. It's gone before they thin out. */
  float floorK=uCardD>0.?1.-smoothstep(uCardD*.55,uCardD*.8,gT):1.;
  vec2 vd=rd.xz/max(-rd.y,.3); vd*=min(1.,.55/max(length(vd),1e-3))*(1.-cardK);
  float hT,idT,hS,idS; vec2 qT,qS;
  crownLayer(p,vd,tT,cT,fp,0.,wood,hT,idT,qT);
  crownLayer(p,vd,tS,cS,fp,1.,wood,hS,idS,qS);
  float wT=hT*cT,wS=hS*cS;
  bool isTree=wT>=wS;
  float h=isTree?hT:hS,id=isTree?idT:idS,tile=isTree?tT:tS,cH=isTree?cT:cS;
  vec2 q=isTree?qT:qS;
  float top=max(wT,wS);
  /* Leaf clusters: they break up the crown's edge and give its surface texture. */
  float clL=max(log2(max(fp,.01)*512./5.3),0.);
  float clusters=.2+.6*textureLod(tNoise,rotT(q,5.3)/5.3,clL).a;
  float mask=smoothstep(.10,.20,h+(.5-clusters)*.34);
  /* Sun shadow onto other plants and the ground. Where plants stand as cards, this pixel is
     ground level, and the shadow comes from the full height of the tree. */
  float cardS=uCardS>0.?1.-smoothstep(uCardS*.7,uCardS*.95,gT):0.;
  float topS=mix(top,0.,max(cardK,cardS));
  vec2 sd=uSun.xz/max(uSun.y,.25);
  float s1=0.;
  float lodS=max(log2(max(fp,.01)*1024./tT)+1.,0.);
  float tScale=mix(1.,1.7,cardK);
  /* Samples stay closer together than a crown is wide, so a low sun's long shadow can't
     break apart into separate blobs lying away from the plant that casts it. */
  float sdLen=max(length(sd),.01);
  float dT=min(2.9,3.5/sdLen),dS=min(.75,.9/sdLen);
  for(int i=1;i<=4;i++){
    float dst=float(i)*dT;
    vec2 qs=q+sd*dst;
    vec4 cs=textureLod(tCrown,rotT(qs,tT)/tT,lodS);
    float hs=cs.r*cT*tScale*presence(cs,qs,tT,0.,wood);
    s1=max(s1,smoothstep(.0,1.8,hs-(topS+dst)));
  }
  if(uCardS>0.){
    /* Standing shrubs: shadows from each plant's real position and size. */
    if(cardS>0.) s1=max(s1,shrubShadow(p,sd)*cardS*.92);
  } else {
    float lodSS=max(log2(max(fp,.01)*1024./tS)+1.,0.);
    for(int i=1;i<=2;i++){
      float dst=float(i)*dS;
      vec2 qs=q+sd*dst;
      vec4 cs=textureLod(tCrown,rotT(qs,tS)/tS,lodSS);
      float hs=cs.r*cS*1.5*presence(cs,qs,tS,1.,wood);
      s1=max(s1,smoothstep(.0,.6,hs-(topS+dst)));
    }
  }
  sh=1.-s1*.62*nearK*floorK;
  /* Colour: each plant has its own shade */
  vec3 wa,wb,op; landPalette(wa,wb,op);
  vec3 col=mix(mix(wa,wb,.35)*1.15,mix(wa,wb,.8)*1.15,smoothstep(.1,.9,fract(id*5.3)));
  col=mix(col,op*.85,smoothstep(.8,.98,fract(id*11.7))*.35);
  float lf=max(log2(max(fp,.01)*512./3.1),0.);
  float leaf=textureLod(tNoise,rotT(q,3.1)/3.1,lf).a;
  float leaf2=textureLod(tNoise,rotT(q,1.13)/1.13,max(log2(max(fp,.01)*512./1.13),0.)).a;
  col*=.66+.40*leaf+.40*leaf2;
  /* Clusters are bright on top and dark in the gaps; the crown darkens toward its edge. */
  col*=mix(1.22,.68,smoothstep(.28,.72,clusters));
  col*=mix(.50,1.34,pow(clamp(h,0.,1.),.7));
  /* Under the standing trees, these crowns become the dark floor of the forest. */
  float flat_=isTree?1.-cardK:(1.-cardS)*(uCardD>0.?smoothstep(.4,.75,dens):1.);
  float k=mask*nearK*flat_;
  alb=mix(alb,col,k);
  /* Under standing trees the ground falls into shade. */
  alb*=mix(1.,.86,cardK*floorK*smoothstep(.3,.8,dens));
  /* Lower ground and lower foliage sit in shade */
  ao=mix(1.,mix(.80,1.,smoothstep(.02,.7,top/cT)),nearK*smoothstep(.2,.7,dens)*floorK);
  /* Under cloud there are no shadows, and what seats a standing plant on the ground is the sky it
     hides from the ground beneath and around it. Fallen leaves and twigs gather there too. */
  float nearAO=1.-smoothstep(.08,.35,fp);
  if(max(cardK,cardS)*nearAO>0.){
    float covT=smoothstep(.22,.85,dens)*mix(.07,1.08,wood);
    float oT=standOcc(p,tT,3.4,covT)*cardK,oS=0.;
    vec2 sc_; float sr,shh;
    if(cardS>0.&&shrubAt(p,sc_,sr,shh)){ float o=1.-smoothstep(.1*sr,1.3*sr,length(p-sc_)); oS=o*o*cardS; }
    float occ=max(oT*.6,oS)*nearAO;
    ao*=1.-.55*occ;
    float lt=textureLod(tNoise,rotT(p,.9)/.9,max(log2(max(fp,.005)*512./.9),0.)).a;
    /* Litter under shrubs is dry and greyish; under trees it's thinner, so it only tints a little. */
    alb=mix(alb,alb*vec3(.66,.60,.50)*(.62+.76*lt),max(.4*oS,.22*oT)*nearAO*(1.-k));
  }
  /* Shape from the crown height */
  float lodN=max(log2(max(fp,.01)*1024./tile),0.)+.8;
  float e=max(tile/128.,fp);
  vec2 qr=rotT(q,tile)/tile; float ek=e/tile;
  float c0=textureLod(tCrown,qr,lodN).r,cx=textureLod(tCrown,qr+vec2(ek,0.),lodN).r,cz=textureLod(tCrown,qr+vec2(0.,ek),lodN).r;
  vec2 sl=toWorld(vec2(cx-c0,cz-c0)/e*cH,tile)*.5; sl*=min(1.,.8/max(length(sl),1e-3));
  /* Fine relief from the leaf clusters */
  vec2 fineS=nzSlope(q,3.1,fp,.20)+nzSlope(q,1.1,fp,.20);
  sl+=fineS;
  N=normalize(mix(N,normalize(N+vec3(-sl.x,0.,-sl.y)),k));
  /* Backlit foliage glows */
  float back=pow(max(dot(rd,uSun)*.5+.5,0.),3.);
  tr=k*(.08+.5*back);
}
vec3 groundAlb(vec2 p,float y,vec4 m,float fp,out float rough){
  float n1=nz(p,67.,fp,0),n2=nz(p,8.7,fp,1),n3=nz(p,1.9,fp,3),n4=nz(p,.47,fp,3),n5=nz(p,23.,fp,1);
  float rock=m.g,veg=m.b,pa=m.a;
  vec3 c;
  vec3 sand=mix(uSandA,uSandB,clamp(n1*1.6-.3+(n5-.5)*.9,0.,1.));
  /* Real sand is even in colour at the scale of a metre or two. Blotches there read as dirty
     concrete, so those layers are weak, and wind streaks give it a direction instead. */
  sand*=.93+.11*(n3-.5)+.15*(n4-.5);
  sand*=1.+.18*(n2-.5);
  sand*=1.+.08*(nz(p,3.1,fp,1)-.5);
  vec2 wd=vec2(.9,.42)/1.0;
  vec2 ws=vec2(dot(p,wd),dot(p,vec2(-wd.y,wd.x)));
  float strk=textureLod(tNoise,vec2(ws.x/38.,ws.y/2.4),max(log2(max(fp,.01)*512./2.4),0.)).g;
  sand*=1.+.10*(strk-.5);
  float nearSand=smoothstep(.016,.07,fp);
  float sc=nz(p,5.7,fp,3); sand*=1.-.22*nearSand*smoothstep(.52,.66,sc)*smoothstep(.42,.62,n5);
  float flk=textureLod(tLace,p/7.,max(log2(max(fp,.01)*1024./7.),0.)).g; sand*=1.-.14*nearSand*flk*flk;
  float hy=y-uTide;
  if(hy>-.2&&m.g<.95){
    /* The last high tide's line of seaweed and debris: a dark, broken band along the beach. */
    /* It runs nearly parallel to the water. Its width is set across the ground, not in height,
       so it doesn't spread into a wide smear where the beach is flat. */
    float hw=1.05+uSwH*.75+.10*(n1-.5)+.06*(n5-.5);
    /* One to three metres wide, measured along the beach's slope over a few metres. The slope at the
       shaded point alone follows every small bump, and the band came out a thin dashed line that read
       as a crack in the sand from the air. */
    float e3=3.;
    vec2 g3=vec2(terrH(p+vec2(e3,0.))-terrH(p-vec2(e3,0.)),terrH(p+vec2(0.,e3))-terrH(p-vec2(0.,e3)))/(2.*e3);
    float dm=(hy-hw)/max(length(g3),.006);
    float halfM=.6+.9*n2;
    float band=1.-smoothstep(halfM*.3,halfM,abs(dm));
    /* Separate clumps with sand between, not a continuous strip, which reads as a path. Too small to
       see from far away, they fade into a faint, even darkening of the band. (fp is per 4K pixel in
       high-quality renders.) */
    float far=smoothstep(.015,.06,fp);
    float clump=mix(smoothstep(.54,.68,nz(p,1.9,fp,0)*.45+nz(p,.71,fp,2)*.35+nz(p,.29,fp,3)*.2),.3,far);
    float wr=band*clump*(.35+.65*smoothstep(.35,.6,nz(p,13.,fp,1)))*mix(1.,.6,far);
    vec3 weed=mix(vec3(.13,.11,.07),vec3(.30,.26,.18),smoothstep(.3,.7,nz(p,.53,fp,2)));
    sand=mix(sand,weed,wr*.7);
    /* Each wave leaves a thin wavy line of fine debris where it stopped. Only on the lower, steeper
       beach and only close up: the lines are spaced by height, so on the flat upper beach they fell
       metres apart, and a small wobble in height became a long wandering dashed line, a crack seen
       from the air. (High-quality renders work at 4K, so fp is half what it is live.) */
    float sw=(hy+.05*(nz(p,9.,fp,1)-.5))*13.;
    float ln=abs(fract(sw)-.5)*2.;
    float swK=smoothstep(.1,.3,hy)*(1.-smoothstep(hw*.35,hw*.6,hy))*smoothstep(.45,.6,nz(p,4.4,fp,3))*(1.-smoothstep(.008,.022,fp))*smoothstep(.02,.04,gSlope);
    sand*=1.-.09*swK*smoothstep(.86,.96,ln);
    /* Shells and pebbles, densest along the tide line. */
    if(fp<.03){
      vec2 cg=p/.32, ci=floor(cg), hv=hh(ci), hv2=hh(ci+17.3);
      float dens=.10+.45*band+.12*(1.-smoothstep(.1,hw,hy));
      if(hv.x<dens){
        vec2 o=(.25+.5*hv2)-fract(cg);
        float r=.045+.07*hv.y;
        float d=length(o*vec2(1.,.7+.6*hv2.x));
        float s=1.-smoothstep(r*.6,r,d);
        vec3 pc=hv2.y<.45?vec3(.78,.74,.66):hv2.y<.8?vec3(.30,.28,.25):vec3(.12,.11,.10);
        float k=s*(1.-smoothstep(.012,.03,fp));
        sand=mix(sand*(1.-.25*(1.-smoothstep(r,r*1.9,d))*(1.-smoothstep(.012,.03,fp))),pc,k);
      }
    }
  }
  /* Darker ground: mineral streaks near the water, leaf litter near the plants. */
  if(uType<2&&y>0.){ sand=mix(sand,sand*vec3(.74,.68,.60),pa*(.45+.9*n2)); }
  c=sand;
  rough=.7;
  if(rock>0.){
    /* Layered sedimentary rock: bands follow height and are broken up by noise. */
    float wob=nz(p,41.,fp*.5,0)*7.+nz(p,9.,fp*.5,1)*1.6;
    float band=textureLod(tNoise,vec2((y+wob)*.021,.37),0.).g;
    float fineB=textureLod(tNoise,vec2((y+wob*.6)*.083,.61),0.).g;
    vec3 r1=vec3(.125,.115,.102),r2=vec3(.26,.235,.20),r3=vec3(.062,.060,.058);
    vec3 r=mix(r1,r2,smoothstep(.30,.70,band*.7+fineB*.3));
    r=mix(r,r3,smoothstep(.50,.80,nz(p,5.3,fp,2))*.34);
    r*=.70+.34*n3+.26*n2;
    r=mix(r,vec3(.40,.37,.20),smoothstep(.60,.76,nz(p,13.,fp,0))*smoothstep(3.,12.,y)*.42);
    float tide=(1.-smoothstep(.4,3.0+1.8*n2,y))*smoothstep(-3.5,-.5,y);
    r=mix(r,vec3(.034,.040,.034),tide*.9);
    if(y<-.5) r=mix(r,vec3(.10,.115,.085),smoothstep(-.5,-3.,y));
    c=mix(c,r,rock);
    rough=mix(.7,.55,rock);
  }
  if(veg>0.){
    /* Land cover from large to small scale. It's a function of position, so near and far agree.
       This is the colour seen from a distance, and the ground beneath the trees up close. */
    vec3 woodA,woodB,open;
    landPalette(woodA,woodB,open);
    float wood=landWood(p,fp);
    float mdl=nz(p,71.,fp,1),big=nz(p,431.,fp,0);
    vec3 forest=mix(woodA,woodB,smoothstep(.28,.72,big*.5+mdl*.3+n5*.2));
    float fineG=nz(p,5.1,fp,3)*.5+n3*.3+n4*.2;
    vec3 ground=open*(.70+.60*smoothstep(.25,.75,mdl*.5+n2*.5))*(.72+.56*fineG);
    /* Far away, plant colour averages in. Up close, the crowns themselves supply it. */
    float nearK=1.-smoothstep(.6,2.4,fp);
    if(uCardD>0.) nearK*=1.-smoothstep(uCardD*.55,uCardD*.8,gT);
    vec3 v=mix(ground,forest,wood*(1.-nearK*.82));
    v*=.82+.36*n2;
    c=mix(c,v,smoothstep(.10,.62,veg));
  }
  return c;
}
/* Rock texture projected onto whichever way the face points, so cliffs don't smear downward. */
vec3 triW(vec3 N){ vec3 w=pow(abs(N),vec3(4.)); return w/(w.x+w.y+w.z); }
vec4 triN(vec3 P,vec3 w,float tile,float fp){
  float lod=max(log2(max(fp,1e-3)*512./tile),0.);
  vec4 s=vec4(0.);
  if(w.y>.03) s+=w.y*textureLod(tNoise,rotT(P.xz,tile)/tile,lod);
  if(w.x>.03) s+=w.x*textureLod(tNoise,vec2(P.z,P.y*1.35)/tile+.31,lod);
  if(w.z>.03) s+=w.z*textureLod(tNoise,vec2(P.x,P.y*1.35)/tile+.63,lod);
  return s;
}
/* Baked fractured-rock texture, projected the same way. g gathers its slope as a world-space vector. */
vec2 triRock(vec3 P,vec3 w,float tile,float fp,inout vec3 g,float gk){
  float lod=max(log2(max(fp,1e-3)*2048./tile),0.);
  vec2 s=vec2(0.);
  if(w.y>.03){ vec4 t=textureLod(tRock,P.xz/tile,lod); vec2 d=t.xy*2.-1.; g+=w.y*vec3(d.x,0.,d.y)*gk; s+=w.y*t.zw; }
  if(w.x>.03){ vec4 t=textureLod(tRock,vec2(P.z,P.y*1.2)/tile+.31,lod); vec2 d=t.xy*2.-1.; g+=w.x*vec3(0.,d.y,d.x)*gk; s+=w.x*t.zw; }
  if(w.z>.03){ vec4 t=textureLod(tRock,vec2(P.x,P.y*1.2)/tile+.63,lod); vec2 d=t.xy*2.-1.; g+=w.z*vec3(d.x,d.y,0.)*gk; s+=w.z*t.zw; }
  return s;
}
/* One set of joints: near-parallel planes through the rock at irregular spacing, keeping one direction
   along the whole coast. Returns metres to the nearest joint, with that joint's strength, the side of it
   the point is on, and an id for the slab between joints. Minor joints stop and start along their length. */
float jointD(vec2 xz,vec2 n,float sp,float stag,float seed,out float str,out float side,out float id){
  float s=dot(xz,n)/sp+stag+1.2*(textureLod(tNoise,xz/(sp*8.)+seed*.37,0.).r-.5);
  float k=floor(s+.5); id=k; side=s>k?1.:-1.;
  vec2 hk=hh(vec2(k+seed*13.,floor(stag*16.)));
  float along=dot(xz,vec2(-n.y,n.x))/(40.+60.*hk.y);
  float seg=smoothstep(.46,.54,textureLod(tNoise,vec2(along,k*.137+seed*.29),0.).r);
  str=(.3+.7*hk.x*hk.x)*mix(seg,1.,step(.82,hk.x));
  return abs(s-k)*sp;
}
void rockSurface(vec3 P,vec3 Ng,float fp,float k,inout vec3 alb,inout vec3 Nd){
  vec3 w=triW(Ng);
  vec4 big=triN(P,w,23.,fp),mid=triN(P,w,6.1,fp);
  vec3 g=vec3(0.);
  vec2 rA=triRock(P,w,37.,fp,g,.6),rB=triRock(P,w,8.3,fp,g,.8);
  /* Close up, a finer layer of the same stone keeps the surface gritty rather than smooth like putty. */
  float fineK=1.-smoothstep(.012,.035,fp);
  vec2 rC=vec2(.5);
  if(fineK>0.) rC=mix(rC,triRock(P,w,2.3,fp,g,.75*fineK),fineK);
  /* Beds of rock follow height, tilted a little and wandering with position. */
  float wob=big.r*5.+mid.g*1.4;
  float dip=dot(P.xz,vec2(.04,.022));
  float band=textureLod(tNoise,vec2((P.y+dip+wob)*.019,.37),0.).g;
  float fineB=textureLod(tNoise,vec2((P.y+dip+wob*.5)*.097,.61),0.).g;
  vec3 r1=vec3(.098,.092,.084),r2=vec3(.215,.195,.165),r3=vec3(.052,.050,.048);
  vec3 r=mix(r1,r2,smoothstep(.32,.68,band*.65+fineB*.35));
  /* Iron stains and darker patches */
  r=mix(r,vec3(.26,.175,.115),smoothstep(.56,.74,big.g)*.38);
  r=mix(r,r3,smoothstep(.50,.74,mid.r)*.34);
  float steepF=1.-smoothstep(.35,.7,Ng.y);
  if(uGranite>0.){
    /* Granite: pale grey with a pink cast and no beds. Rain draining down steep sides leaves dark streaks. */
    vec3 gr=mix(vec3(.25,.225,.205),vec3(.42,.385,.35),smoothstep(.3,.7,big.g*.6+mid.r*.4));
    vec2 tn=normalize(vec2(-Ng.z,Ng.x)+1e-4);
    float stk=smoothstep(.52,.70,textureLod(tNoise,vec2(dot(P.xz,tn)/14.,P.y/90.+.3),0.).g);
    gr*=1.-.38*stk*steepF;
    r=mix(r,gr,uGranite);
  }
  /* Weathering tone, and a few wandering cracks from the stone texture. */
  r*=.68+.40*rA.y+.24*rB.y;
  r*=.82+.36*rC.y;
  float crA=smoothstep(.42,.66,big.r*.5+mid.b*.5);
  r*=1.-.30*rA.x*crA-.18*rB.x-.15*rC.x*fineK;
  /* Cliffs are built of beds: on steep faces each bed boundary is a recessed, shadowed line,
     and the beds weather to slightly different tones. */
  float bedY=(P.y+dip+wob*.35)/1.9;
  float bedL=smoothstep(.80,.97,fract(bedY))*(.5+.5*smoothstep(.3,.6,mid.b));
  float bedT=fract(sin(floor(bedY)*12.9898)*43758.5453);
  r*=1.-steepF*(.30*bedL-.12*(bedT-.5))*(1.-smoothstep(.15,.6,fp))*(1.-uGranite);
  /* Joints. Rock breaks along a few sets of near-parallel planes: here one set along the beds of the
     coast and one across them. Where a set meets a face it shows as a line, so faces break into
     blocks, not the random polygons of a crack net, which read as crumpled paper. Cross joints are
     offset from one bed to the next, like brickwork. A set is hidden on faces nearly parallel to it. */
  float jFade=1.-smoothstep(.3,.9,fp);
  if(jFade>0.){
    vec2 jA=vec2(cos(uRockAng),sin(uRockAng)),jB=vec2(-jA.y,jA.x);
    vec3 nA=vec3(jA.x,0.,jA.y),nB=vec3(jB.x,0.,jB.y);
    float bedI=floor(bedY);
    float sA,sB,iA,iB,stA,stB;
    float dA=jointD(P.xz,jA,6.5,0.,1.,stA,sA,iA);
    float dB=jointD(P.xz,jB,3.4,hh(vec2(bedI,3.1)).x,2.,stB,sB,iB);
    stA*=(1.-smoothstep(.7,.95,abs(dot(Ng,nA))))*(1.-.6*uGranite);
    stB*=(1.-smoothstep(.7,.95,abs(dot(Ng,nB))))*(1.-.75*uGranite);
    float aa=max(fp,.004);
    float wA=.035+.06*stA,wB=.025+.04*stB;
    float cA=stA*(1.-smoothstep(wA,wA+aa,dA))*min(1.,wA*2.5/aa);
    float cB=stB*(1.-smoothstep(wB,wB+aa,dB))*min(1.,wB*2.5/aa);
    r*=1.-.62*max(cA,cB*.85)*jFade;
    /* Each block between joints and beds weathers to its own tone. */
    vec2 bt=hh(vec2(iA*1.73+bedI*.61,iB*2.31+bedI*7.7));
    r*=mix(1.,.86+.30*bt.x,jFade);
    /* Block edges are rounded, curving down into each joint, and each block sits at its own tilt. */
    float nF=1.-smoothstep(.05,.35,fp);
    if(nF>0.){
      float gA=.20+.22*stA,gB=.14+.16*stB;
      g+=(nA*sA*stA*max(1.-dA/gA,0.)*.9+nB*sB*stB*max(1.-dB/gB,0.)*.7)*nF;
      g+=vec3(bt.y-.5,0.,fract(bt.x*7.3)-.5)*.10*nF;
    }
  }
  /* Lichen on upward faces above the spray; black and green growth at the water */
  float upF=smoothstep(.45,.85,Ng.y);
  r=mix(r,vec3(.30,.285,.17),smoothstep(.58,.74,big.b*.5+mid.g*.5)*smoothstep(3.,9.,P.y)*upF*.55);
  float splash=1.-smoothstep(.2,2.6+1.6*mid.r,P.y);
  r=mix(r,vec3(.030,.031,.030)*(.7+.8*mid.r),splash*.86);
  r=mix(r,vec3(.040,.052,.030),splash*upF*smoothstep(.50,.72,big.g*.6+mid.g*.4)*.42);
  alb=mix(alb,r,k);
  g-=Ng*dot(g,Ng);
  Nd=normalize(mix(Nd,normalize(Ng-g*mix(1.,.7,upF)),k));
}
vec3 terrN(vec2 p,float e){
  float hl=terrH(p-vec2(e,0.)),hr=terrH(p+vec2(e,0.)),hd=terrH(p-vec2(0.,e)),hu=terrH(p+vec2(0.,e));
  return normalize(vec3(hl-hr,2.*e,hd-hu));
}
vec3 mistCol(){ return (uSunE*max(uSun.y,.05)*.8+skyIrr(vec3(0,1,0)))/PI*.9; }

/* Schools of fish. At most one school in each 64 m cell, wandering about inside it; uFish (0 to 1) sets
   how many cells have one. Returns the centre (xy), the heading (z, as an angle) and radius (w, 0 = none). */
const float FCELL=64.;
vec4 fishSchool(vec2 cid){
  vec2 h=hh(cid*1.37+5.1);
  if(h.x>uFish*.3) return vec4(0.);
  float t=uSimT*(.045+.035*h.y),a=h.y*6.283,b=h.x*29.,c=h.x*17.,d=h.y*5.;
  vec2 off=vec2(sin(t+a)+.5*sin(t*1.7+b),cos(t*.83+c)+.5*cos(t*1.3+d));
  vec2 vel=vec2(cos(t+a)+.85*cos(t*1.7+b),-.83*sin(t*.83+c)-.65*sin(t*1.3+d));
  vec2 jit=hh(cid*2.71+1.3)-.5;
  vec2 cen=(cid+.5+jit*.5)*FCELL+off*10.;
  /* Fish keep to water at least a metre and a half deep. */
  if(terrH(cen)>uTide-1.5) return vec4(0.);
  return vec4(cen,atan(vel.y,vel.x),3.5+5.*fract(h.y*7.7));
}
/* How much of this point is covered by fish, seen from above. Up close each fish is drawn, with its tail
   swinging; once a fish is smaller than a pixel or two, the school becomes a soft dark cloud. sheen is a
   silver flash as a fish turns its side to the light. */
float fishCover(vec2 x,float fp,out float sheen){
  sheen=0.;
  vec2 cid=floor(x/FCELL);
  vec4 s=fishSchool(cid);
  if(s.w<=0.) return 0.;
  vec2 hd=vec2(cos(s.z),sin(s.z)),d=x-s.xy;
  vec2 uv=vec2(dot(d,hd),dot(d,vec2(-hd.y,hd.x)));
  if(length(uv)>s.w*2.6) return 0.;
  /* A school is never a neat oval: its outline flows and bulges, it trails off behind, and it is
     thicker in some places than others. */
  vec2 w=vec2(textureLod(tNoise,d/(s.w*2.2)+uSimT*.015+cid*.13,0.).r,textureLod(tNoise,d/(s.w*2.2)-uSimT*.012+cid*.29+.5,0.).g)-.5;
  vec2 u2=uv+w*s.w*1.1;
  float e=length(vec2(u2.x/(s.w*(u2.x<0.?2.1:1.4)),u2.y/s.w));
  if(e>1.25) return 0.;
  float dens=(1.-smoothstep(.35,1.05,e))*(.45+.55*smoothstep(.3,.65,textureLod(tNoise,d/3.1+uSimT*.03,0.).r));
  float farK=smoothstep(.035,.11,fp);
  float cloud=dens*.42;
  if(farK>=1.) return cloud;
  const float G=.62;
  vec2 g=uv/G,gi=floor(g);
  float cov=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 k=gi+vec2(i,j),r=hh(k+cid*7.31);
    if(r.x>dens*.92) continue;
    float ph=r.y*40.;
    vec2 fc=(k+.5+(r-.5)*.55)*G+vec2(.10*sin(uSimT*.7+ph),.07*sin(uSimT*.9+ph*1.3));
    float L=.30+.24*fract(r.y*13.1);
    float yaw=(r.x-.5)*.45+.18*sin(uSimT*.8+ph);
    vec2 q=uv-fc; float cy=cos(yaw),sy=sin(yaw); q=vec2(cy*q.x+sy*q.y,-sy*q.x+cy*q.y);
    /* The body bends more toward the tail as it swims. */
    float bt=clamp(-q.x/L,0.,1.); q.y+=.10*L*sin(uSimT*8.5+ph)*bt*bt*2.;
    float body=(length(vec2(q.x/(L*.5),q.y/(L*.15)))-1.)*L*.15;
    float tx=(-q.x-.42*L)/(.24*L);
    float tail=(tx>0.&&tx<1.)?abs(q.y)-(.03+.11*tx)*L:1.;
    float sd=min(body,tail);
    float a=1.-smoothstep(-.5*fp,.5*fp,sd);
    if(a>cov){ cov=a; sheen=pow(max(sin(uSimT*1.1+ph*2.3),0.),12.); }
  }
  return mix(cov,cloud,farK);
}
/* How much of the time the sun's disc is out: 1 under a clear or broken sky, low under overcast. Where it's
   hidden, the cloud in front of it still glows, so its reflection on the water becomes a broad, dim sheen
   instead of a sharp path of glitter. */
uniform float uSunVis;
vec3 shadeWater(vec3 P,vec3 rd,float t,float fp,float depth,float film,vec4 rm1,vec4 fx,vec2 lit,float cs,out vec3 Nout){
  float df=smoothstep(.04,1.4,film);
  float chop=uChop*mix(.32,1.,df);
  /* Steep wave faces are rough with small waves and turbulence, never smooth like glass. */
  chop*=1.+1.3*smoothstep(.07,.26,length(rm1.xy))*(1.-smoothstep(1.5,5.,film));
  float gust=mix(.62,1.28,smoothstep(.34,.66,textureLod(tNoise,P.xz/1400.+uTime*.0035,0.).r));
  chop*=gust;
  float lA=max(log2(fp*4.)+.4,0.), lB=max(log2(fp*14.8)+.9,0.), lC=max(log2(fp*256./233.),0.);
  mat2 r1=mat2(.8,.6,-.6,.8), r2=mat2(.28,.96,-.96,.28);
  vec4 fA=textureLod(tFFT,P.xz/64.+.13,lA);
  vec4 fB=textureLod(tFFT,r1*P.xz/17.3+.41,lB);
  vec4 fC=textureLod(tFFT,r2*P.xz/233.+.71,lC);
  vec2 sA=fA.gb, sB=(fB.gb)*r1, sC=(fC.gb)*r2;
  vec2 fftS=(sA*.62+sB*.62+sC*.5)*chop;
  vec2 gS=rm1.xy; float gLen=length(gS); if(gLen>.32) gS*=.32/gLen;
  vec3 N=normalize(vec3(-(gS.x+fftS.x),1.,-(gS.y+fftS.y)));
  vec3 Nr=normalize(vec3(-(gS.x*.8+fftS.x*.35),1.,-(gS.y*.8+fftS.y*.35)));
  /* Unresolved small waves shrink the mean slope and spread the sun's highlight. */
  float sig2=.0035+clamp(.0040*log2(1.+fp*5.),0.,.016)*chop;
  sig2*=mix(.9,1.2,gust);
  vec3 V=-rd;
  float NV=max(dot(N,V),.02);
  float F=.02+.98*pow(1.-NV,5.)/(1.+22.*sig2);
  /* Reflection */
  vec3 R=reflect(rd,N); R.y=abs(R.y)+.005; R=normalize(R);
  vec3 refl=env(R,1.+2.2*sqrt(sig2)*5.);
  refl*=mix(.45,1.,lit.y*lit.y);
  /* Sun glitter */
  vec3 H=normalize(uSun+V); float NH=max(dot(N,H),1e-3); float nh2=NH*NH;
  float tan2=(1.-nh2)/nh2;
  float D=exp(-tan2/sig2)/(PI*sig2*nh2*nh2);
  float Fs=.02+.98*pow(1.-max(dot(V,H),0.),5.);
  float specK=min(Fs*D/(4.*NV),3.6+60.*smoothstep(.62,1.,1.-sqrt(sig2)*5.));
  if(uSunVis<1.){
    /* The glow round a hidden sun is some twenty degrees across: the same reflection, spread that much
       wider, and dimmer, since most of the hidden sun's light is already in the grey of the sky. */
    float sb=sig2+.05, Db=exp(-tan2/sb)/(PI*sb*nh2*nh2);
    specK=specK*uSunVis+(1.-uSunVis)*.28*min(Fs*Db/(4.*NV),3.6);
  }
  vec3 spec=uSunE*specK*lit.x*cs;
  /* Refraction to the bed */
  vec3 rr=refract(rd,Nr,.752); if(dot(rr,rr)<.01) rr=vec3(0,-1,0);
  float rry=max(-rr.y,.2);
  float s=clamp(depth/rry,0.,90.);
  vec3 Q=P+rr*s;
  float hq=terrH(Q.xz);
  for(int i=0;i<3;i++){ s=clamp((P.y-hq)/rry,0.,90.); Q=P+rr*s; hq=terrH(Q.xz); }
  float bedD=max(P.y-hq,0.);
  vec3 lr=refract(-uSun,vec3(0,1,0),.752);
  float dd=bedD/max(-lr.y,.2);
  float sed=fx.a;
  vec3 sigS=uSigS+uSed*sed*1.7;
  vec3 sigT=uSigA+sigS;
  vec3 Td=exp(-sigT*dd);
  vec3 Lb=vec3(0.);
  float reach=exp(-sigT.g*(s+dd));
  if(reach>.002){
    vec4 mq=terrS(Q.xz);
    float rg; vec3 alb=groundAlb(Q.xz,hq,mq,max(fp,.012)/pow(max(-rd.y,.05),.3),rg);
    float e=max(.42,fp*1.2);
    vec3 Nq=terrN(Q.xz,e);
    vec3 rip=ripple(Q.xz,fp,mix(.65,1.,mq.g<.5?1.:0.)*(1.-mq.g)*(1.-mq.a*.7));
    Nq=normalize(Nq+vec3(-rip.x,0.,-rip.y));
    /* Fine dark grains settle in ripple troughs, so ripples show even without sun on them. */
    alb*=1.+.06*rip.z-.16*smoothstep(.2,.9,-rip.z);
    vec2 ql=litAt(Q.xz);
    /* Caustics from the live spectrum */
    float cl=max(log2(max(fp,.03)*512./21.)+.9,0.);
    float cl2=max(log2(max(fp,.03)*512./33.)+.9,0.);
    vec2 cu=Q.xz/21.+rm1.xy*.5, cv=mat2(.6,.8,-.8,.6)*Q.xz/33.-.3;
    float disp=.0018*(1.+bedD);
    vec3 c1=vec3(textureLod(tCaus,cu+disp,cl).r,textureLod(tCaus,cu,cl).r,textureLod(tCaus,cu-disp,cl).r);
    vec3 c2=vec3(textureLod(tCaus,cv+disp,cl2).r,textureLod(tCaus,cv,cl2).r,textureLod(tCaus,cv-disp,cl2).r);
    float cK=smoothstep(.04,.5,bedD)*(1.-smoothstep(9.,28.,bedD));
    float cP=.35+.9*textureLod(tNoise,Q.xz/57.+uTime*.004,0.).r;
    vec3 ca=mix(vec3(1.),.70+.25*c1*c2+.08*c1,clamp(cK*(.5+.5*lit.x)*cP,0.,1.));
    ca=min(ca,vec3(4.2));
    /* Shadows of foam and of wave faces, lying on the sand */
    vec2 off=-lr.xz/max(-lr.y,.2)*bedD;
    float fs=0.; vec2 qs=dUV(Q.xz+off);
    if(min(qs.x,qs.y)>0.&&max(qs.x,qs.y)<1.){
      fs=textureLod(tFx,qs,.8).r;
      vec4 rmS=textureLod(tRM1,qs,0.);
      ca*=clamp(1.+clamp(-rmS.z*.22,-.35,.6),.6,1.5);
    }
    float fsT=exp(-fs*1.9);
    /* Fish shadows on the bed: soft, and softer the higher the fish swims above it. */
    float fishSh=0.,fdq=clamp(bedD*.45,.4,2.6);
    if(uFish>0.&&bedD>1.){
      float hf=bedD-fdq,shn;
      fishSh=fishCover(Q.xz+lr.xz/max(-lr.y,.2)*hf,max(fp,.03+hf*.05),shn);
    }
    vec3 Eb=uSunE*max(dot(Nq,uSun),0.)*Td*ca*ql.x*cs*fsT*(1.-.03)*(1.-.75*fishSh);
    Eb+=skyIrr(vec3(0,1,0))*ql.y*exp(-sigT*bedD*1.25)*mix(1.,.72,fs);
    Lb=alb/PI*Eb*exp(-sigT*max(s,.85*depth/rry));
    /* The fish themselves, swimming part way down: dark backs from above, with a silver flash now and
       then. Their light is dimmed by the water above them. */
    if(uFish>0.&&bedD>1.){
      vec2 F=P.xz+rr.xz*(fdq/rry);
      float shn,fc=fishCover(F,fp*(1.+fdq*.15),shn);
      if(fc>0.){
        vec3 fa=vec3(.055,.075,.085)+vec3(.30,.34,.36)*shn;
        vec3 Ef=uSunE*max(uSun.y,0.)*exp(-sigT*fdq/max(-lr.y,.2))*lit.x*cs+skyIrr(vec3(0,1,0))*exp(-sigT*fdq)*lit.y;
        Lb=mix(Lb,fa/PI*Ef*exp(-sigT*fdq/rry),fc);
      }
    }
  }
  /* Single scattering in the water column */
  float kk=(1.+1./max(-lr.y,.2));
  vec3 inT=1.-exp(-sigT*kk*min(max(s,.85*depth/rry),60.));
  vec3 ssE=uSunE*uSun.y*cs*(.6+.4*lit.x)*.85+skyIrr(vec3(0,1,0));
  vec3 Ls=(sigS/(sigT*kk))*inT*ssE*(.28)*(1.+.8*pow(max(dot(rd,uSun),0.),3.));
  /* Light glowing through thin wave crests */
  float crest=clamp((P.y-uTide)/max(uSwH*1.2,.2),0.,1.);
  float back=pow(clamp(dot(rd,normalize(uSun*vec3(1.,.28,1.)+vec3(0,.05,0))),0.,1.),3.);
  Ls+=vec3(.22,.62,.54)*uSunE*.035*back*crest*(1.-exp(-film*.6))*lit.x;
  vec3 Lu=Lb+Ls;
  /* Bubble clouds just under the surface */
  float bub=clamp(fx.g,0.,1.);
  bub=bub*bub*(3.-2.*bub);
  vec3 bubC=(uSunE*max(uSun.y,.1)*lit.x*cs*.7+skyIrr(vec3(0,1,0)))/PI*vec3(.62,.86,.84);
  Lu=mix(Lu,bubC,bub*.3);
  Nout=N;
  return Lu*(1.-F)*.96+refl*F+spec;
}

vec3 foamShade(vec3 P,vec3 N,vec2 lit,float cs,float dens,float fp,vec2 dA,vec2 dB,out float alpha){
  float lS=max(log2(max(fp,.008)*1024./24.),0.), lF=max(log2(max(fp,.008)*1024./6.3),0.);
  vec2 pA=P.xz-dA,pB=P.xz-dB;
  vec4 a1=textureLod(tLace,pA/24.,lS),a2=textureLod(tLace,mat2(.8,.6,-.6,.8)*pA/6.3,lF);
  vec4 b1=textureLod(tLace,pB/24.+.37,lS),b2=textureLod(tLace,mat2(.8,.6,-.6,.8)*pB/6.3+.71,lF);
  float la=a1.r*.72+a2.r*.28, lb=b1.r*.72+b2.r*.28;
  float l=(la*uWA+lb*uWB);
  float nrm=sqrt(uWA*uWA+uWB*uWB);
  l=.5+(l-.5)/max(nrm,.5);
  float pch=textureLod(tNoise,pA/83.,max(log2(max(fp,.01)*512./83.),0.)).r*uWA+textureLod(tNoise,pB/83.+.5,max(log2(max(fp,.01)*512./83.),0.)).r*uWB;
  float pch2=textureLod(tNoise,P.xz/311.+.21,0.).g;
  float d=clamp(dens*(.42+1.15*pch)*(.72+.56*pch2),0.,1.2);
  float lodFade=smoothstep(0.,3.5,lS);
  bool onRock=uType==2&&uMixed<.5;
  float w=onRock?mix(.15,.42,lodFade):mix(.05,.42,lodFade);
  float thr=.84-d*.86;
  if(onRock){
    /* Churned whitewater is clumps and froth, not a web of filaments. Those belong to old foam
       spreading on calm water, which rock doesn't leave time for. */
    float cl=(a1.b*uWA+b1.b*uWB)*.58+(a2.b*uWA+b2.b*uWB)*.42;
    cl=.5+(.5+(cl-.5)/max(nrm,.5)-.5)*2.1;
    float froth=a2.g*uWA+b2.g*uWB;
    l=mix(l,clamp(cl+.14*(froth-.3),0.,1.),.88);
    thr=max(thr,.14);
  }
  alpha=smoothstep(thr-w,thr+w,l);
  alpha=mix(alpha,clamp(d*1.15,0.,1.),lodFade*.34);
  alpha*=onRock?smoothstep(.04,.34,d)*mix(.62,1.,smoothstep(.3,1.,d)):smoothstep(.0,.05,d);
  /* Lumps of whitewater catch the sun on one side. */
  float lump=a1.b*uWA+b1.b*uWB;
  float bump=(lump-.5)*2.;
  vec3 Nf=normalize(N+vec3(uSun.x,0.,uSun.z)*bump*.55*smoothstep(.22,.9,d));
  float diff=clamp((dot(Nf,uSun)+.42)/1.42,0.,1.);
  diff=max(diff,uSun.y*.75);
  vec3 E=uSunE*diff*lit.x*cs+skyIrr(vec3(0,1,0))*lit.y;
  float thick=mix(.70,1.,smoothstep(.2,1.,d));
  vec3 al=vec3(.90,.93,.94)*thick;
  al*=mix(.70,1.,clamp(l*1.35,0.,1.));
  al*=.86+.28*(a2.b*uWA+b2.b*uWB);
  return al/PI*E;
}

void main(){
  vec2 ndc=vUV*2.-1.+uJit;
  vec3 rd=normalize(uF+uR*ndc.x*uTan*uAspect+uU*ndc.y*uTan);
  float pa=2.*uTan/uResY;
  float t=march(uRo,rd);
  if(t<0.){
    vec4 e=textureLod(tEnv,envUV(rd),0.);
    vec3 L=e.rgb;
    float mu=dot(rd,uSun);
    if(uMoonLit>0.) L+=uSunE*uMoonK*moonDisc(rd,mu,pa)*(1.-e.a);
    else L+=uSunE*smoothstep(.99985,.99996,mu)*(1.-e.a)*6.;
    if(uStars>0.) L+=uStars*stars(rd,pa)*(1.-e.a);
    gl_FragDepth=1.;
    o=vec4(L,1.);
    if(uLabel==1) o=vec4(0.,0.,0.,-1.); else if(uLabel==2) o=vec4(0.);
    return;
  }
  vec3 P=uRo+rd*t;
  gT=t;
  gl_FragDepth=clamp((uDA+uDB/max(t*dot(rd,uF),3.))*.5+.5,0.,1.);
  float cosI=max(-rd.y,.03);
  float fp=pa*t/pow(cosI,.28);
  vec2 uv=dUV(P.xz); float w=edgeW(uv);
  vec4 rm0=vec4(0.),rm1=vec4(0.),fx=vec4(0.),adv=vec4(0.);
  float cell=uDx;
  float fxL=max(log2(max(fp,1e-3)/cell),0.);
  float wf=0.;
  if(w>0.){
    rm0=textureLod(tRM0,uv,0.); rm1=textureLod(tRM1,uv,0.); fx=textureLod(tFx,uv,fxL); adv=textureLod(tAdv,uv,0.);
    vec2 ee=min(uv,1.-uv); float em=min(ee.x,ee.y);
    wf=smoothstep(.02,.16,em+(textureLod(tNoise,P.xz/190.,0.).r-.5)*.10);
  }
  float T=terrH(P.xz);
  float eta=etaH(P.xz);
  float dp=max(eta-T,0.);
  float film=w>=1.?rm0.y:mix(dp,rm0.y,w);
  if(w<1.){
    /* Beyond the solved region, keep a plausible surf line along the far shore. */
    float sN=textureLod(tNoise,P.xz/310.,0.).r;
    float wv=sin(dp*2.3+uSimT*.62+sN*14.)*.5+.5;
    float zone=smoothstep(uSwH*2.6+.5,uSwH*.5,dp)*step(.01,dp);
    float ff=zone*(.20+.62*wv*wv*wv)*smoothstep(.28,.60,textureLod(tNoise,P.xz/61.+uSimT*.004,0.).g);
    ff=mix(ff,fx.r,wf); fx.r=ff; fx.g=mix(zone*.35*wv,fx.g,wf);
    float wetF=1.-smoothstep(.1,1.1,T-eta);
    fx.b=mix(wetF,fx.b,w);
    fx.a=mix(smoothstep(uSwH*4.+1.,.2,dp)*.42*step(.01,dp),fx.a,w);
    rm1.xy*=w;
  } else if(wf<1.){
    float dp2=dp; float sN=textureLod(tNoise,P.xz/310.,0.).r;
    float wv=sin(dp2*2.3+uSimT*.62+sN*14.)*.5+.5;
    float zone=smoothstep(uSwH*2.6+.5,uSwH*.5,dp2)*step(.01,dp2);
    float ff=zone*(.20+.62*wv*wv*wv)*smoothstep(.28,.60,textureLod(tNoise,P.xz/61.+uSimT*.004,0.).g);
    fx.r=mix(ff,fx.r,wf); fx.g=mix(zone*.35*wv,fx.g,wf);
  }
  vec2 lit=litAt(P.xz);
  float cs=cloudSun(P.xz);
  float lnz=nz(P.xz,4.1,fp,3);
  float wa=smoothstep(.0016,.016,film+(lnz-.5)*.006);
  if(w<1.) wa=mix(step(T+.001,eta),wa,w);
  /* Rock above the water is rock, whatever depth the coarser water grid has next to it. */
  float rockHere=uType==2?terrS(P.xz).g:0.;
  if(rockHere>.01){
    wa=mix(wa,smoothstep(0.,.04,eta-T),rockHere);
    film=mix(film,min(film,dp+.02),rockHere);
  }
  wa*=1.-smoothstep(2.6,3.8,T-uTide);
  vec3 L=vec3(0.); vec3 Nw=vec3(0,1,0);
  bool isGround=wa<.999;
  if(isGround){
    vec4 m=terrS(P.xz); float rg;
    float y=P.y;
    vec3 N=terrN(P.xz,mix(26.,max(m.g>.3?uDx*.75:.3,min(fp*1.5,14.)),w));
    float nl=length(N.xz);
    if(uType==2){ float bare=smoothstep(.62,.84,N.y); m.g=max(m.g,(1.-bare)*step(4.,y)*(1.-m.a*uMixed)); m.b*=bare; }
    if(m.g>.2&&fp<.25&&w>=1.){
      vec2 tx=2.2/vec2(textureSize(tLit,0)),u0=dUV(P.xz);
      lit.x=.2*lit.x+.2*(textureLod(tLit,u0+tx,0.).r+textureLod(tLit,u0-tx,0.).r+textureLod(tLit,u0+vec2(tx.x,-tx.y),0.).r+textureLod(tLit,u0+vec2(-tx.x,tx.y),0.).r);
    }
    gSlope=clamp(nl/max(N.y,.05),.004,.5);
    vec3 alb=groundAlb(P.xz,y,m,fp/pow(cosI,.18),rg);
    float sandness=(1.-m.g)*(1.-m.b);
    vec3 rp=ripple(P.xz,fp,.55*sandness);
    vec2 rip=rp.xy;
    rip+=(nzSlope(P.xz,29.,fp,.035)+nzSlope(P.xz,7.3,fp,.022))*sandness;
    rip+=(nzSlope(P.xz,71.,fp,.30)+nzSlope(P.xz,17.,fp,.34))*m.b*smoothstep(.6,2.4,fp);
    vec3 Nd=normalize(N+vec3(-rip.x,0.,-rip.y));
    /* Ripple troughs hold darker grains, so the ripples still read under a cloudy sky. */
    float rpw=1.-smoothstep(.4,1.6,T-uTide);
    alb*=1.+(.05*rp.z/.55-.13*smoothstep(.1,.5,-rp.z))*(.35+.65*rpw);
    if(m.g>.01) rockSurface(P,N,fp,m.g,alb,Nd);
    /* Snow on high ground. The snowline wanders, and steep faces shed their snow, so peaks are streaked
       with dark rock. Snow smooths away the rock's small relief. */
    float snow=0.;
    if(uSnow>0.&&y>uSnow-500.){
      float sl=y+220.*(nz(P.xz,610.,fp,0)-.5)+70.*(nz(P.xz,97.,fp,1)-.5);
      snow=smoothstep(uSnow-160.,uSnow+90.,sl)*(1.-smoothstep(.75,1.45,gSlope+.4*(nz(P.xz,37.,fp,2)-.5)));
      vec3 sc=vec3(.82,.84,.88)*(.93+.1*nz(P.xz,9.,fp,3));
      alb=mix(alb,sc,snow); Nd=normalize(mix(Nd,N,snow*.7)); m.b*=1.-snow;
    }
    float cSh=1.,cAO=1.,cTr=0.;
    if(m.b>.01) canopy(P.xz,rd,fp,m.b,alb,Nd,cSh,cAO,cTr);
    float wetBelt=(1.-smoothstep(.12,.72+.5*nz(P.xz,29.,fp,0),T-uTide))*sandness;
    float wet=clamp(max(fx.b,wetBelt*.72),0.,1.);
    float wetS=wet*wet;
    vec3 al=alb*mix(1.,mix(.50,.72,m.g),wetS);
    /* Debris at the top of the swash line. */
    /* It's a fine line, so it fades out with distance: seen from the air, a thin dark line along the
       highest run-up read as a crack in the sand. */
    float wrack=smoothstep(.03,.2,fx.b)*(1.-smoothstep(.2,.55,fx.b))*smoothstep(.38,.7,nz(P.xz,17.,fp,0))*sandness*(1.-smoothstep(.02,.06,fp));
    al=mix(al,al*.8,wrack);
    float ndl=max(dot(Nd,uSun),0.);
    float canopyLit=m.b*max(smoothstep(.6,2.4,fp),uCardD>0.?smoothstep(uCardD*.55,uCardD*.8,t):0.);
    vec3 canopyGlow=vec3(0.);
    if(canopyLit>0.){
      /* Distant canopy keeps the brightness and mottled texture of the nearer standing trees. */
      float mot=(.70+.60*nz(P.xz,97.,fp*.4,1))*(.78+.44*nz(P.xz,31.,fp*.4,0));
      al*=mix(1.,mix(1.32,.8,landWood(P.xz,fp))*mot,canopyLit);
      float backK=pow(max(dot(rd,uSun)*.5+.5,0.),4.);
      canopyGlow=al*vec3(1.,1.3,.42)/PI*uSunE*max(uSun.y,.14)*(backK*1.5+.10)*.74*canopyLit*lit.x*cs;
      vec2 hv=-rd.xz; vec3 Nv=normalize(vec3(hv.x,.9,hv.y));
      ndl=mix(ndl,clamp(dot(Nv,uSun)*.72+.28,0.,1.)*.74,canopyLit);
      cAO*=mix(1.,.71,canopyLit);
    }
    vec3 E=uSunE*ndl*lit.x*cs*cSh+skyIrr(Nd)*lit.y*cAO;
    vec3 Lg=al/PI*E;
    Lg+=al*vec3(.9,1.15,.42)/PI*uSunE*max(uSun.y,.12)*cTr*lit.x*cs*cSh+canopyGlow;
    /* Wet sand and wet rock are glossy, mirroring sky and sun. */
    vec3 Ng=normalize(mix(Nd,N+vec3(0,2.,0),wetS*.82));
    float nvg=max(dot(Ng,-rd),.02);
    float Fg=.025+.975*pow(1.-nvg,5.);
    vec3 Rg=reflect(rd,Ng); Rg.y=abs(Rg.y)+.01;
    float gloss=wetS*(sandness*.9+.5*m.g)*smoothstep(.72,1.,wet);
    Lg+=env(normalize(Rg),3.2)*Fg*gloss*lit.y*(1.4);
    vec3 Hg=normalize(uSun-rd);
    float nh=max(dot(Ng,Hg),0.);
    Lg+=uSunE*.055*gloss*mix(pow(nh,240.),.06*pow(nh,30.),1.-uSunVis)*lit.x*cs;
    Lg+=uSunE*.0035*(1.-wetS)*sandness*pow(nz(P.xz,.41,fp,3),8.)*2.*ndl*lit.x;
    L=Lg;
  }
  if(wa>.001){
    vec3 Lw=shadeWater(P,rd,t,fp,max(dp,film),film,rm1,fx,lit,cs,Nw);
    L=mix(L,Lw,wa);
  }
  /* A very steep wave face in shallow water is breaking, whatever the foam field says: white
     water along its front, broken into patches. Without it, such a wave reads as a glass ridge. */
  if(w>0.&&wa>.5){
    float stp=length(rm1.xy);
    /* In deeper water it takes a steeper face to break. */
    float thr=mix(.20,.36,smoothstep(1.,4.,film));
    float crestF=smoothstep(thr,thr+.16,stp)*smoothstep(.05,.25,film)*(1.-smoothstep(5.,9.,film))*w;
    crestF*=smoothstep(.30,.62,textureLod(tNoise,P.xz/7.3+vec2(uSimT*.031,-uSimT*.017),0.).g*.7+textureLod(tNoise,P.xz/2.1,0.).a*.3);
    fx.r=max(fx.r,crestF*.95);
  }
  /* Foam */
  if(fx.r>.008){
    float al; vec3 Lf=foamShade(P,Nw,lit,cs,fx.r,fp,adv.xy,adv.zw,al);
    L=mix(L,Lf,al);
  }
  /* Spray drifting over the breakers and around the rocks */
  if(w>.01&&uDomSize.x>0.){
    vec3 mc=mistCol(); float acc=0.;
    for(int i=0;i<3;i++){
      float yy=.8+float(i)*3.1;
      float tt=(yy-P.y)/max(-rd.y,.06);
      vec3 M=P-rd*max(tt,0.);
      vec2 mu=dUV(M.xz);
      if(min(mu.x,mu.y)>.0&&max(mu.x,mu.y)<1.){
        float mf=textureLod(tFx,mu,4.2).g;
        float mn=textureLod(tNoise,M.xz/34.+uSimT*.012,0.).g;
        acc+=max(mf-.20,0.)*(.4+1.3*mn*mn)*exp(-yy*.34)*(uType==2?.22:1.);
      }
    }
    float tr=1.-exp(-acc*(.55+.75/cosI*.4));
    L=mix(L,mc*(.9+.6*pow(max(dot(rd,uSun),0.),6.)),clamp(tr,0.,.85));
  }
  /* Answer images for training data (tools/groundtruth.js): instead of a colour, what is really at this
     pixel. Pass 1: class (1 land, 2 rock, 3 water, 4 white water, 5 plants; sky is 0), water depth in
     metres, foam (0 to 1), distance from the camera. Pass 2: the water's velocity across and along the
     shore in m/s, the ground height and the water surface height. */
  if(uLabel>0){
    vec4 mm=terrS(P.xz); float isW=step(.5,wa);
    float cls=isW>0.?(fx.r>.35?4.:3.):(mm.g>.5?2.:(mm.b>.5?5.:1.));
    if(uLabel==1) o=vec4(cls,max(eta-T,0.)*isW,clamp(fx.r,0.,1.)*isW,t);
    else { vec4 C=w>0.?textureLod(tSim,uv,0.):vec4(0.); o=vec4(C.y*isW,C.z*isW,T,eta); }
    return;
  }
  /* Aerial perspective */
  float hz=exp(-max(P.y,0.)*.00012);
  float fg=1.-exp(-t*uFogB*hz);
  vec3 rh=rd; rh.y=max(rh.y,.012); rh=normalize(rh);
  vec3 fc=min(env(rh,2.8),vec3(3.2));
  fc=mix(fc,textureLod(tEnv,vec2(.5),7.5).rgb,smoothstep(.06,.34,-rd.y));
  float mu=max(dot(rd,uSun),0.);
  fc+=uSunE*.012*pow(mu,18.)*(1.-smoothstep(.02,.2,-rd.y));
  L=mix(L,fc,fg);
  o=vec4(min(L,vec3(120.)),1.);
}`;

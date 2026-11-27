'use strict';
/* ------ Where plants grow, shared by the view and the plant shaders (js/shaders/trees.js) ------
   Both include this, after defining nzFixed (the noise at a fixed level of detail), so plants, their
   shadows, the litter under them and the green of the ground always agree.
   uPlantCover is the plant cover (a recipe setting; per coast in LOCATIONS): 0 bare dunes, 1 sparse scrub,
   2 open woodland, 3 patchy (groves and clearings), 4 dense forest (the woods as they always were).
   The cover also scales the plant-cover channel itself, through greenery (greenK in js/recipe.js). */
const COVER_GLSL=`
uniform int uPlantCover;
/* Vegetation presets (VEG_PRESETS in js/vegetation.js). uVeg 0 is Classic: every rule below as it always
   was. Otherwise the preset sets the small plants' sizes (uVegS: grass from, to; shrubs from, to), how
   grassy the beach front is (uVegG: share added, extra share at the front, most, and how far inland the
   grassy front reaches), the trees' mix (uVegT: palms, the pine model, the conifer model, extra palms at
   the front), and the ground layer (uVegM: 1 for low mats on the open dunes, 0 for ferns under woods; their
   density; where mats thin out inland, from and to; uVegF: their sizes from, to, and the model's radius on
   the ground and height for shadows). */
uniform int uVeg; uniform vec4 uVegS,uVegG,uVegT,uVegM,uVegF;
float smallScale(bool grass,float kx){
  if(uVeg==0) return grass?mix(.7,1.5,kx):mix(.55,1.45,kx);
  return grass?mix(uVegS.x,uVegS.y,kx):mix(uVegS.z,uVegS.w,kx);
}
/* The share of palms among the trees, from how the stand runs and the plant cover. */
float palmShare(float stand,float veg){
  if(uVeg==0) return uFlora==0?mix(.22,.94,stand)*mix(1.,.55,smoothstep(.45,.9,veg))+.25*(1.-smoothstep(.25,.6,veg)):0.;
  return uVegT.x*mix(.5,1.5,stand)*mix(1.,.55,smoothstep(.45,.9,veg))+uVegT.w*(1.-smoothstep(.25,.6,veg));
}
/* Shrubs grow in clumps and drifts with bare sand between, not spread evenly like a planted bed. */
float shrubClump(vec2 wp){ return 1.75*smoothstep(.36,.66,nzFixed(wp,23.,0)*.62+nzFixed(wp,7.3,1)*.38); }
/* The coast's own woods: 1 in closed woodland, near 0 in open country, with clearings. */
float woodRaw(vec2 p){
  float cover=nzFixed(p,1730.,0)*.62+nzFixed(p,547.,1)*.38;
  return smoothstep(.30,.52,cover+.28*(nzFixed(p,133.,0)-.5)+(uFlora==0?.10:0.))*smoothstep(.40,.50,nzFixed(p+311.,1100.,0)+.3*(nzFixed(p,160.,0)-.5));
}
/* The woods reshaped by the plant cover. Patchy: groves a couple of hundred metres across with open
   ground between, the coast's own woods still showing through. Open woodland: trees scattered evenly
   over grass, never closing into a canopy. Scrub: a few trees, mostly well inland. Dunes: none in
   their own right (see treeCov). */
float coverWood(float w,vec2 p){
  if(uPlantCover>=4) return w;
  if(uPlantCover==3){ float g=smoothstep(.44,.60,nzFixed(p+733.,240.,0)*.65+nzFixed(p+91.,70.,1)*.35); return g*mix(.55,1.,w); }
  if(uPlantCover==2) return .16+.20*nzFixed(p+57.,90.,0);
  if(uPlantCover==1) return w*.14;
  return 0.;
}
float woodAt(vec2 p){ return coverWood(woodRaw(p),p); }
/* The zones from the sea follow the plant-cover channel as the coast grew it, before greenery scaled it:
   less greenery thins the plants, it doesn't turn the whole coast into beach front. */
float zoneVeg(float veg){ return veg/max(1.+uGreenD,.05); }
/* How likely a tree stands here, from the plant-cover channel and how wooded it is. On bare dunes a
   few stunted trees grow only in the lushest hollows. */
float treeCov(float veg,float wood){
  float c=smoothstep(.22,.85,veg)*mix(.07,1.08,wood);
  if(uPlantCover==0) c=.16*smoothstep(.55,.85,veg)*smoothstep(.5,.8,wood);
  else if(uPlantCover==1) c*=.55*smoothstep(.55,.9,veg);
  return c;
}
/* Trees in a grove are older and taller at its heart; young trees grow at its edges and out in the
   open. Dense forest is left as it was. */
float treeAge(float wood){ return uPlantCover>=4?1.:mix(.62,1.08,smoothstep(.12,.75,wood)); }
/* Grass drifts, 0 to 1: patches a few metres to twenty across. Read sharp (mip 3), the same in the plant
   and view shaders: the blurred noise used elsewhere here hardly varies at this size. */
float grassDrift(vec2 wp){
  float a=textureLod(tNoise,rotT(wp+53.,40.)/40.,3.).g, b=textureLod(tNoise,rotT(wp+9.,11.)/11.,3.).r;
  return smoothstep(.47,.6,a*.7+b*.3);
}
/* How likely a shrub or grass tuft stands here. */
float shrubCov(vec2 wp,float veg){
  float k=uPlantCover==0?.55:uPlantCover==1?.85:1.;
  float c=nzFixed(wp,23.,0)*.62+nzFixed(wp,7.3,1)*.38;
  /* The first plants on open sand grow in scattered colonies, not spread evenly: the same clumping, more
     sharply, near the beach. */
  float pioneer=mix(mix(1.,smoothstep(.47,.68,c),uPlantCover>=4?.45:uPlantCover==3?.7:1.),1.,smoothstep(.22,.55,zoneVeg(veg)));
  /* On open sand they gather into thickets a few metres across, with bare sand between: the author, 18 November,
     from above, "plants/vegetation looks ... too perfect (maybe repeating patterns ...)": the shrubs at the
     edge of the beach were an even sprinkle of single balls. (The noise above varies every 2 or 3 m, about
     one shrub apart, too fine to group them.) As many shrubs in all; under closed cover, no change. */
  float cl=smoothstep(.42,.58,textureLod(tNoise,rotT(wp+31.,150.)/150.,4.4).g);
  float open=(1.-smoothstep(.3,.7,zoneVeg(veg)))*.85;
  /* In the open, where the small plants are mostly grass, they grow in drifts a few metres to twenty
     across, the tufts close enough to run together, with bare ground between (the author, 23 November, on the
     Alpine lake and Broken coast: tufts standing one by one, evenly spread, "round patches of grass").
     About as many plants in all. */
  float drift=mix(1.,2.2*grassDrift(wp),(1.-smoothstep(.25,.6,zoneVeg(veg)))*.9);
  return smoothstep(.02,.55,veg)*.7*(1.-.6*smoothstep(.6,.9,veg))*1.75*smoothstep(.36,.66,c)*k*pioneer*mix(1.,2.*cl,open)*drift;
}
/* The share of grass among the small plants. Grasses and creepers are the first to grow on open sand,
   so near the beach nearly all small plants are grass; shrubs take over further in. Dunes and open
   country are grassier. */
float grassShare(int flora,float veg){
  float base=flora==0?.3:flora==1?.62:.5;
  base+=uPlantCover==0?.22:uPlantCover==1||uPlantCover==2?.10:0.;
  if(uVeg==0) return clamp(mix(base+.38,base,smoothstep(.10,.42,zoneVeg(veg))),.1,.94);
  /* A preset keeps the dune front to grass and runners for longer, with the shrubs further back, as real
     beaches have them. */
  base+=uVegG.x;
  return clamp(mix(base+uVegG.y,base,smoothstep(.10,uVegG.w,zoneVeg(veg))),.05,uVegG.z);
}
/* Ferns: the understory of the woods. They take plant cells that shrubs and grass leave empty (a cell's
   plant is a fern when its number lies between shrubCov and shrubCov plus this), so every shrub stays where
   it was. They grow only under closed woods, in drifts with bare leaf litter between, thinning out toward
   the edge of the woods: none in open country or on the dunes. Thickest in the damp tropical and mountain
   woods, fewest in the dry ones. wood is woodAt here (or near enough: it changes over hundreds of metres). */
float fernCov(float veg,float wood,vec2 wp){
  if(uVeg>0&&uVegM.x>.5){
    /* A preset's mats (railroad vine, ice plant, heather) take the empty cells on the open dunes instead:
       from the first plants on the sand, thinning out where the scrub closes in. */
    float open=smoothstep(.015,.08,veg)*(1.-smoothstep(uVegM.z,uVegM.w,zoneVeg(veg)));
    if(open<=0.) return 0.;
    float drift=smoothstep(.34,.6,nzFixed(wp+17.,37.,1)*.65+nzFixed(wp+5.,11.,0)*.35);
    return uVegM.y*open*drift;
  }
  float under=smoothstep(.42,.8,veg)*smoothstep(.3,.75,wood);
  if(under<=0.) return 0.;
  float k=uVeg>0?uVegM.y:uFlora==0?.6:uFlora==1?.2:uFlora==3?.55:.48;
  float drift=smoothstep(.36,.62,nzFixed(wp+17.,37.,1)*.65+nzFixed(wp+5.,11.,0)*.35);
  return k*under*drift;
}
/* A fern's size, from the same random number that sizes it on its card (FERN in js/plants.js): its radius
   on the ground and height, for its shadow and the shade at its foot. A preset's ground layer has its own. */
float groundScale(float kx){ return uVeg>0?mix(uVegF.x,uVegF.y,kx):mix(.6,1.3,kx); }
vec2 fernSize(float kx){ float sc=groundScale(kx); return (uVeg>0?uVegF.zw:vec2(.66,.62))*sc; }
`;
/* ------ The view: height-field march plus water optics ------
   VIEW_LIB holds every function of the view. The programs that draw it are at the end of this file. */
const VIEW_LIB=HEAD+PEOPLE_GROUND+`
in vec2 vUV;
uniform vec3 uRo,uR,uU,uF; uniform vec2 uJit; uniform float uTan,uAspect,uResY,uNoiseF; uniform int uSteps,uMarchK;
uniform vec2 uDomMin,uDomSize,uFarMin,uFarSize,uCellN; uniform float uDx,uEdge,uMaxH,uNearH,uTide,uSimT,uTime,uChop,uSwH;
uniform sampler2D tTerr,tTerrF,tLit,tLitF,tRM0,tRM1,tFx,tAdv,tFFT,tCaus,tEnv,tNoise,tLace,tCrown,tRock,tExtra; uniform int uLabel;
uniform vec3 uSun,uSunE,uSigA,uSigS,uSed,uSandA,uSandB,uSandPatch; uniform int uType;
uniform vec4 uSwK[8]; uniform float uSwA[8]; uniform int uFlora; uniform vec3 uRockTone; uniform float uMixed,uRockAng,uGranite,uFish,uSnow,uFarLod,uSlopeK,uFarStep; uniform vec4 uShrubM;
uniform float uWA,uWB,uFogB,uCloudShade,uCloudT,uDA,uDB,uCardD,uCardS,uStars,uGreenD;
uniform vec3 uMoonSun; uniform float uMoonLit;
/* tExtra: the sky with its clouds, drawn for this very picture by the cloud pass (FS_CLOUDS in
   js/shaders/sky.js) when uCloudPx is 1, or for answer images the water's state. One slot serves both
   because this shader already uses all sixteen texture units a GPU must offer. */
uniform float uCloudPx;
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
   star at a random spot. Returns brightness, before the sky's own light and clouds are allowed for.
   Fewer than there were: one cell in 70 holds a star (it was one in 29), and the faintest are fainter,
   so a sky shows a scatter of bright ones and only a dusting of the rest; near the horizon, where the
   air is thickest, they fade out higher up. the author, 18 November: "Too many stars, in reality you might
   only see a few stars, right?" */
float stars(vec3 d,float pa){
  vec3 q=d*220.; vec3 c=floor(q);
  float h=fract(sin(dot(c,vec3(127.1,311.7,74.7)))*43758.5453);
  if(h<.986) return 0.;
  vec3 j=vec3(fract(h*17.31),fract(h*91.7),fract(h*313.9));
  vec3 sd=normalize(c+.2+.6*j);
  float a=acos(clamp(dot(d,sd),-1.,1.));
  float r=max(pa*.75,1e-5);
  float mag=pow(fract(h*7.13),4.)*3.+.03;
  float tw=.75+.25*sin(uTime*(2.+5.*fract(h*3.7))+h*40.);
  return mag*tw*exp(-a*a/(r*r))*smoothstep(.02,.22,d.y);
}
/* Ground slope (rise over run) at the point being shaded, for sizing features across the ground. */
float gSlope=.05;

vec2 dUV(vec2 p){ return (p-uDomMin)/uDomSize; }
vec2 fUV(vec2 p){ return (p-uFarMin)/uFarSize; }
float edgeW(vec2 uv){ vec2 e=min(uv,1.-uv); return smoothstep(0.,uEdge,min(e.x,e.y)); }
/* Past the far map's ends along the coast (8.5 km away) its last row would repeat to the horizon, a
   perfectly straight coast running on for 40 km. The coast has curved away inland by then (farBend in
   js/shaders/terrain.js); what land is left tapers into the sea over the map's last 1.2 km, so the coast
   ends in a low point in the haze. */
float farEnd(vec2 fu){ return smoothstep(0.,.07,min(fu.y,1.-fu.y)); }
float swellH(vec2 p){ float s=0.; for(int i=0;i<8;i++){ s+=uSwA[i]*sin(dot(uSwK[i].xy,p)-uSwK[i].z*uSimT+uSwK[i].w); } return s; }
/* Greenery (uGreenD is the recipe's greenery minus 1) scales the plant-cover channel as the plant shaders
   do (green() in js/shaders/trees.js), so trees, their shadows and the ground's green agree. */
vec4 terrS(vec2 p){
  vec2 uv=dUV(p); float w=edgeW(uv);
  vec2 fu=fUV(p); vec4 f=textureLod(tTerrF,fu,0.);
  f.r=mix(min(f.r,-12.),f.r,farEnd(fu));
  vec4 m=f;
  if(w>0.){ vec4 n=textureLod(tTerr,uv,0.); m=w>=1.?n:mix(f,n,w); }
  m.b=min(m.b*(1.+uGreenD),max(m.b,1.));
  return m;
}
float gFarLod=0.;
float terrH(vec2 p){
  vec2 uv=dUV(p); float w=edgeW(uv);
  if(w>=1.) return textureLod(tTerr,uv,0.).r;
  vec2 fu=fUV(p); float f=textureLod(tTerrF,fu,gFarLod).r; f=mix(min(f,-12.),f,farEnd(fu));
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
/* The march finds where a view ray meets the ground or the water. It is the dearest single step of a frame:
   50 to 120 samples of the height maps for every pixel, most of them through empty air.
   So it is done twice (TECHLOG 67). First for one pixel in sixteen (FS_VIEW_Z, a quarter of the size each
   way), stopping not at the surface but as soon as the ray comes within a few pixels' width of it (gCone:
   the ray is treated as a cone as wide as its block of pixels, and the ground a little to each side is
   looked at too), and giving the last point before that. Then for every pixel, starting from the nearest
   such point of the four blocks around it (gT0) instead of from the camera, with the same steps from there
   on. Every pixel still finds its own surface; only the empty air before it is skipped.
   Measured 15 November 2026: 8 to 26 samples a pixel instead of 38 to 121, the march 35 to 55% cheaper on
   shots along the coast, and no further from a march with eight times the steps than before. */
float gT0=-1.,gCone=0.;
uniform sampler2D tZ; uniform float uConeK,uPre;
float march(vec3 ro,vec3 rd){
  bool up=rd.y>-1.5e-4;
  if(up&&ro.y>=uMaxH) return gCone>0.?1e9:-1.;
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
  if(t1<=t0) return gCone>0.?1e9:(up?-1.:t1);
  float r=t1/t0; float tp=t0; float dp=(ro+rd*t0).y-surfH((ro+rd*t0).xz);
  if(dp<0.) return t0;
  /* Start where the first pass says nothing lies before (if that point is above the surface, as it should be). */
  if(gT0>t0){ if(gT0>=t1) return up?-1.:t1; float d2=(ro+rd*gT0).y-surfH((ro+rd*gT0).xz); if(d2>=0.){ tp=gT0; dp=d2; } }
  int stepsN=uSteps+int(float(uSteps)*1.3*(1.-smoothstep(.0,.07,abs(rd.y))));
  float n=float(stepsN);
  /* uNoiseF moves this screen noise on each frame when frames are averaged (live smoothing, or several
     samples per film frame), so it averages away instead of standing still on the screen. */
  float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy+5.588238*uNoiseF,vec2(.06711056,.00583715))))*(1.-smoothstep(.0,.1,abs(rd.y)));
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
    gFarLod=clamp(log2(max(t-tp,1.)/(uFarSize.x/float(textureSize(tTerrF,0).x)))+.5,0.,uFarLod+log2(float(textureSize(tTerrF,0).x)/1024.));
    vec3 p=ro+rd*t; float d=p.y-surfH(p.xz);
    /* The first pass: within the cone's radius of the surface here, or of the ground half a block to
       either side? Then every pixel of the block starts from the point before. */
    if(gCone>0.){ float rr=t*gCone; vec2 sd=vec2(rd.z,-rd.x)/hd*rr*.5; d=min(d,min(p.y-terrH(p.xz+sd),p.y-terrH(p.xz-sd))); if(d<rr){ gFarLod=0.; return tp; } }
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
  if(gCone>0.) return tp<t1?tp:1e9;
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
`+CLOUD_SHADOW+`
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
vec2 hh(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
/* Smooth value noise, -.5 to .5, one octave: its slope never exceeds about 1.9 per cell, so it can bend a
   pattern by a known, limited amount (the noise texture's fine octaves are far steeper). */
float vn(vec2 p){ vec2 i=floor(p),f=fract(p),u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hh(i).x,hh(i+vec2(1,0)).x,u.x),mix(hh(i+vec2(0,1)).x,hh(i+vec2(1,1)).x,u.x),u.y)-.5; }
/* One set of wind ripples: phase along the wind, displaced by d metres; a steep face downwind. */
vec2 rippleSet(float ph){ return vec2(sin(ph)+.32*sin(2.*ph)+.08*sin(3.*ph),cos(ph)+.64*cos(2.*ph)+.24*cos(3.*ph))/1.3; }
/* Wind ripples on dry sand: crests 9 to 15 cm apart across the wind, bending gently and forking where two
   spacings meet, with the steep face away from the wind. Slope in xy; in z the height, -1 (trough) to 1
   (crest); both times k, and faded out before they get too fine to draw.
   The phase runs along a fixed wind direction, and the bending is a displacement whose slope stays well
   under 1. Before 5 November the bending noise was steeper than the ripples' own spacing, and the direction
   itself was varied by noise and multiplied by the distance from the origin: the crest lines closed into
   rings, which read up close as wood grain or a contour map. */
/* A crest that starts and ends: a pair of phase defects a few ripples apart along the crests, which
   splices one extra short crest into the pattern, with a fork at each end. The phase added is the angle
   the pair subtends from p (it jumps by 2 pi only between the two, where the ripple can't tell), faded to
   nothing within the cell's neighbourhood. */
float rippleForks(vec2 p,vec2 wd){
  /* The four cells nearest p: each pair's influence ends within half a cell of its centre's cell, so
     nothing outside them can reach p. */
  const float C=1.;
  vec2 c0=floor(p/C-.5); float ph=0.;
  for(int j=0;j<=1;j++)for(int i=0;i<=1;i++){
    vec2 ci=c0+vec2(i,j), h1=hh(ci+31.7), h2=hh(ci+57.1);
    if(h1.x>.62) continue;
    vec2 c=(ci+.3+.4*h2)*C;
    float a=(h1.y-.5)*.9, len=.1+.13*h2.x;
    vec2 ax=vec2(-wd.y,wd.x)*cos(a)+wd*sin(a);
    vec2 u=p-(c+ax*len), v=p-(c-ax*len);
    float ang=atan(u.x*v.y-u.y*v.x,dot(u,v));
    ph+=(h2.y<.5?1.:-1.)*ang*(1.-smoothstep(len+.08,C*.68,length(p-c)));
  }
  return ph;
}
vec3 ripple(vec2 p,float fp,float k){
  const float L1=.105,L2=.135;
  /* Gone by four pixels per crest: finer than that they only shimmer. */
  float fade=1.-smoothstep(L1*.12,L1*.25,fp);
  if(fade<=0.||k<=0.) return vec3(0.);
  /* Bare, trampled or sheltered patches have none; elsewhere they're lower or higher. */
  float amp=k*fade*.85*smoothstep(-.18,.14,vn(p/7.3+5.)+.35*vn(p/2.2));
  if(amp<.003) return vec3(0.);
  vec2 wd=vec2(.906,.423);
  /* Bending at several scales, from sweeps of several metres to the wiggle of each crest. */
  float d=.045*vn(p/.42)+.09*vn(p/1.05+2.3)+.2*vn(p/2.6)+.5*vn(p/6.5+7.1);
  float s=dot(p,wd)+d, fk=rippleForks(p,wd);
  /* Patches of finer and coarser ripples; only where they meet are both drawn. */
  float m=smoothstep(-.12,.12,vn(p/4.1+1.3));
  vec2 r=m<.999?rippleSet(s*6.2832/L1+fk):vec2(0.);
  if(m>.001) r=mix(r,rippleSet(s*6.2832/L2+1.7+fk),m);
  /* Height amplitude about a fortieth of the spacing: slope = 2*pi/40 (~.16) times the waveform's
     derivative, the same for both spacings. */
  return vec3(wd*r.y*.16*amp,r.x*amp);
}
void landPalette(out vec3 woodA,out vec3 woodB,out vec3 open){
  if(uFlora==0){ woodA=vec3(.024,.044,.020); woodB=vec3(.060,.088,.036); open=vec3(.082,.094,.044); }
  else if(uFlora==1){ woodA=vec3(.025,.038,.020); woodB=vec3(.066,.078,.034); open=vec3(.125,.115,.066); }
  else if(uFlora==3){ woodA=vec3(.018,.032,.024); woodB=vec3(.045,.062,.040); open=vec3(.105,.105,.064); }
  else { woodA=vec3(.030,.044,.023); woodB=vec3(.076,.090,.038); open=vec3(.115,.110,.062); }
}
float nzFixed(vec2 p,float tile,int ch){ vec4 v=textureLod(tNoise,rotT(p,tile)/tile,max(log2(1024./tile),0.)); return ch==0?v.r:v.g; }
`+COVER_GLSL+`
/* 1 in closed woodland, near 0 in open country: woodAt, filtered for distance. */
float landWood(vec2 p,float fp){
  float cover=nz(p,1730.,fp,0)*.62+nz(p,547.,fp,1)*.38;
  return coverWood(smoothstep(.30,.52,cover+.28*(nz(p,133.,fp,0)-.5)+(uFlora==0?.10:0.))*smoothstep(.40,.50,nz(p+311.,1100.,fp,0)+.3*(nz(p,160.,fp,0)-.5)),p);
}
/* One layer of plants: the crown under this pixel, with parallax for depth at oblique angles.
   Each crown checks plant density at its own centre, so it's kept or dropped whole. */
vec2 toWorld(vec2 r,float tile){ float a=tile*2.399,c=cos(a),s=sin(a); return vec2(c*r.x+s*r.y,-s*r.x+c*r.y); }
float presence(vec4 cIn,vec2 q,float tile,float mode,float wood){
  vec4 c=textureLod(tCrown,rotT(q,tile)/tile,0.);
  vec2 cen=q+toWorld((c.ba-.5)*6.,tile)*tile/18.;
  vec4 mc=terrS(cen);
  float cov;
  /* Ferns take the empty shrub cells under the woods (fernCov). A preset's mats lie flat on the sand: no
     crown of their own from afar. */
  if(mode>.5) cov=shrubCov(cen,mc.b)+(uVeg>0&&uVegM.x>.5?0.:fernCov(mc.b,wood,cen));
  else cov=treeCov(mc.b,woodAt(cen));
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
bool shrubAt(vec2 q,float wood,out vec2 cen,out float r,out float h){
  cen=q; r=0.; h=0.;
  vec4 c=textureLod(tCrown,rotT(q,27.)/27.,0.);
  if(c.r<=0.) return false;
  cen=q+toWorld((c.ba-.5)*6.,27.)*1.5;
  /* Whether it grows is decided at its own foot, by the same rules as the plant shaders. Decided
     where its shadow falls instead, long evening shadows fell from plants that never grew. */
  vec4 mc=terrS(cen);
  float cov=shrubCov(cen,mc.b);
  if(mc.r<.5||mc.g>.5) return false;
  vec2 ip=floor(rotT(cen,27.)/27.*18.);
  vec2 k=h2c(ip+37.),u=hh(ip+71.3);
  /* A cell the shrubs leave empty may hold a fern. */
  if(c.g+.006>=cov){
    if(c.g+.006>=cov+fernCov(mc.b,wood,cen)) return false;
    /* A mat hides little sky: only right under its leaves. */
    vec2 fs=fernSize(k.x); r=fs.x*(uVeg>0&&uVegM.x>.5?.3:1.); h=fs.y; return true;
  }
  bool grass=u.y<grassShare(uFlora,mc.b);
  float sc=smallScale(grass,k.x);
  r=(grass?uShrubM.z*.55:uShrubM.x*.62)*sc;
  h=(grass?uShrubM.w:uShrubM.y)*2.*sc;
  return true;
}
/* Its shadow on the ground: a rounded plant throws a soft oval, stretched away from the sun (sd points
   toward it). The plants that can shade p stand sunward of it, so the cells searched are centred there,
   and each plant is placed and sized from the same random numbers as its card. This used to look the
   plants up through the crown texture at two points beside p; that put the shadows on the sunny side
   of the plants, cut square where a lookup point left the crown. A plant near the edge of the cells
   searched fades out before it can drop out of the search, so no shadow ends at a cell's edge. */
/* Its size, from the same random numbers as its card: grass tufts and shrubs differ. */
void smallPlant(bool grass,vec2 k,out float r,out float h){
  float sc=smallScale(grass,k.x);
  r=(grass?uShrubM.z*.55:uShrubM.x*.62)*sc; h=(grass?uShrubM.w:uShrubM.y)*2.*sc;
}
float shrubShadow(vec2 p,vec2 sd,float veg,float wood){
  float s=0.;
  float gHere=grassShare(uFlora,veg);
  /* Ferns may stand in the cells the shrubs leave empty (fernCov): only under woods. */
  bool ferns=fernCov(veg,wood,p)>0.;
  vec2 c=p+sd*.45;
  vec2 c0=floor(rotT(c,27.)/27.*18.);
  /* Grass or shrub depends on the plant cover at the plant's foot, which is read only for the few
     plants whose shadow could reach p, as either. */
  for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){
    vec2 ip=c0+vec2(i,j),jj=h2c(ip),k=h2c(ip+37.),u=hh(ip+71.3);
    vec2 cen=toWorld((ip+jj)/18.*27.,27.);
    float edge=1.-smoothstep(2.4,2.95,length(cen-c));
    if(edge<=0.) continue;
    /* Most plants are plainly grass or plainly shrub by the cover here; only those near the line are
       sized both ways. */
    float gd=u.y-gHere; int g0=gd<-.12?1:0, g1=gd>.12?0:1;
    float vv[2]; vv[0]=0.; vv[1]=0.;
    for(int g=g0;g<=g1;g++){
      float r,h; smallPlant(g==1,k,r,h);
      vec2 a=cen-sd*h*.12,b=cen-sd*h*.72,pa=p-a,ba=b-a;
      float t=clamp(dot(pa,ba)/max(dot(ba,ba),1e-4),0.,1.);
      /* A grass tuft is thin blades with light between them: its shadow is narrower and lighter than a
         shrub's. As solid as a shrub's, the sea oats on the Florida dunes threw rows of dark capsules
         (clip 2026-11-07a-089, 8 November). */
      float gw=g==1?.7:1.;
      vv[g]=(1.-smoothstep(r*.5*gw,r*1.05*gw,length(pa-ba*t)))*edge*(g==1?.45:1.);
    }
    float vF=0.;
    if(ferns){
      vec2 fs=fernSize(k.x), a=cen-sd*fs.y*.12, b=cen-sd*fs.y*.72, pa=p-a, ba=b-a;
      float t=clamp(dot(pa,ba)/max(dot(ba,ba),1e-4),0.,1.);
      /* A fern's fronds let light through: its shadow is lighter than a shrub's. A mat's runners lie on
         the sand with bare sand between them: only a faint, small shade. */
      bool mat=uVeg>0&&uVegM.x>.5;
      vF=(1.-smoothstep(fs.x*.4*(mat?.4:1.),fs.x*1.05*(mat?.45:1.),length(pa-ba*t)))*edge*(mat?.22:.8);
    }
    if(max(max(vv[0],vv[1]),vF)<=s) continue;
    /* Only now, for the few plants whose shadow reaches p: does this one grow? Same rules as the cards. */
    vec4 mc=terrS(cen);
    if(mc.r<.5||mc.g>.5) continue;
    float id=fract(k.y*7.13+jj.x*3.7), cs=shrubCov(cen,mc.b);
    if(id>cs){ if(vF>s&&id<=cs+fernCov(mc.b,wood,cen)) s=vF; continue; }
    s=max(s,u.y<grassShare(uFlora,mc.b)?vv[1]:vv[0]);
  }
  return s;
}
/* The ground at the plants' feet: litter, the low sand mounds beach plants sit on, and the dark seat
   of each stem. It's worked out from the same grids of plant cells the plant cards use (PLANT_GLSL in
   js/shaders/trees.js), so everything here lies under a plant that really stands there. This point's
   own cover rules out most cells cheaply; only a plant that reaches this point is checked at its own
   foot, by the same rules as its card.
   Wind clears loose leaves off open sand, so a shrub on the beach keeps only a few, lying downwind and
   half buried; what it gathers instead is blown sand, in a low mound round its stems. Under trees the
   fallen leaves stay, as a mat that covers the ground.
   lf.x: loose litter from shrubs and grass on open ground; lf.y: the mat under trees; lf.z: the share
   that is long narrow blades (palm leaflets, dead grass); lf.w: nearness to a stem.
   md: the mound's slope (xy) and height (z). pf: nearness to a palm, for its fallen fronds. */
void litterField(vec2 p,vec4 m,float fp,out vec4 lf,out vec3 md,out float pf){
  lf=vec4(0.); md=vec3(0.); pf=0.;
  float landK=smoothstep(.3,.6,m.r)*(1.-smoothstep(.4,.6,m.g));
  if(uCardD<=0.||landK<=0.||m.b<.004) return;
  /* Leaves and sand drift downwind before they settle, so both lie further out on one side. */
  const vec2 WD=vec2(.906,.423);
  float covS=shrubCov(p,m.b);
  float wood=woodAt(p);
  float covT=treeCov(m.b,wood);
  /* Far away a plant's skirt is smaller than a pixel, and past the plants' own range a shrub isn't drawn
     at all: there the average amount stands in for each plant's own. */
  float farS=max(smoothstep(.35,.8,fp),uCardS>0.?smoothstep(uCardS*.7,uCardS*.95,gT):1.);
  float farT=max(smoothstep(.35,.8,fp),smoothstep(uCardD*.7,uCardD*.95,gT));
  float sS=0.,sT=0.,sP=0.,sG=0.,foot=0.;
  float grassy=grassShare(uFlora,m.b);
  /* Mounds only where sand is loose: on the open beach and among the first plants, not under closed
     cover. Too small to see from far off. */
  float moundK=(1.-smoothstep(.45,.85,m.b))*(1.-smoothstep(.12,.35,fp))*(1.-farS);
  if(farS<1.&&covS>.002){
    vec2 c0=floor(rotT(p,27.)/27.*18.);
    for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){
      vec2 ip=c0+vec2(i,j),jj=h2c(ip),k=h2c(ip+37.),u=hh(ip+71.3);
      float id=fract(k.y*7.13+jj.x*3.7);
      if(id>covS*1.3+.1) continue;
      vec2 cen=toWorld((ip+jj)/18.*27.,27.);
      float rG,hG,rB,hB; smallPlant(true,k,rG,hG); smallPlant(false,k,rB,hB);
      /* Stops inside the two rings of cells searched, so nothing ends at a cell's edge. A plant plainly
         grass or plainly shrub by the cover here is reached as that; one near the line, as the larger. */
      float gd=u.y-grassy;
      float reach=min((gd<-.12?rG:gd>.12?rB:max(rG,rB))*2.1+.25,2.95);
      vec2 dv=p-cen;
      if(dot(dv,dv)>reach*reach) continue;
      vec4 mc=terrS(cen);
      if(id>shrubCov(cen,mc.b)||mc.r<.5||mc.g>.5) continue;
      bool grass=u.y<grassShare(uFlora,mc.b);
      float r=grass?rG:rB, d=length(dv);
      /* A few leaves close round the shrub and trailing downwind; a tuft keeps its own dead blades. */
      float R=min(r*(grass?1.35:2.1),2.9-.3*r);
      float f=1.-smoothstep(0.,R,length(dv-WD*.6*r));
      sS+=f*(grass?.4:1.); if(grass) sG+=f*.4;
      /* The stems' seat: dark only right at the foot. */
      foot=max(foot,(1.-smoothstep(.03*r,.34*r,d))*(grass?.55:1.));
      if(moundK>0.){
        /* A low dome of sand, a little longer downwind, its height set by the plant's size. */
        vec2 dm=dv-WD*.3*r; dm.x*=.85;
        float Rm=min(r*(grass?1.45:1.75)+.2,(2.8-.35*r)*.85), q=dot(dm,dm)/(Rm*Rm);
        /* Height falls off as the cube, so the slope fades smoothly to nothing at the edge; the slope
           seen by the light is gentler than the height's own, or the lit side read as a pale stain. */
        if(q<1.){ float H=(grass?.11:.24)*min(r,1.5)*moundK, a=1.-q; md.z+=H*a*a*a; md.xy+=H*a*a*(-6./(Rm*Rm))*dm*.6; }
      }
    }
  }
  if(farT<1.&&covT>.002){
    float stand=smoothstep(.40,.60,nzFixed(p+41.,900.,0)),tall=smoothstep(.40,.60,nzFixed(p+77.,620.,0));
    vec2 c0=floor(rotT(p,78.)/78.*18.);
    for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
      vec2 ip=c0+vec2(i,j),jj=h2c(ip),k=h2c(ip+37.);
      float id=fract(k.y*7.13+jj.x*3.7);
      if(id>covT*1.3+.1) continue;
      vec2 cen=toWorld((ip+jj)/18.*78.,78.);
      float sc=mix(.72,1.28,k.x)*mix(.68,1.32,tall)*mix(.72,1.,smoothstep(.22,.7,m.b))*treeAge(wood);
      /* The mat reaches the edge of the crown, thickest in the middle, with no edge of its own. */
      float R=min(3.6*sc,3.55);
      float d=length(p-cen), f=1.-smoothstep(.15*R,R,length(p-cen-WD*.2*R));
      if(f<=0.) continue;
      vec4 mc=terrS(cen);
      if(id>treeCov(mc.b,woodAt(cen))||mc.r<.5||mc.g>.5) continue;
      float palm=0.;
      palm=step(k.y,palmShare(stand,mc.b));
      sT+=f*mix(1.,.55,palm); sP+=f*palm;
      pf=max(pf,palm*(1.-smoothstep(.4,3.6*sc,d)));
      foot=max(foot,1.-smoothstep(.12,.55*sc,d));
    }
  }
  /* The average amounts: plant cover times the skirt's area over the cell's, as the sums above give. */
  sS=mix(sS,covS*mix(1.4,.4,grassy),farS); sG=mix(sG,covS*.4*grassy,farS);
  /* Where the woods are dense, the crowns meet and the mat runs on between the trees. */
  sT=mix(sT+smoothstep(.35,.9,covT)*.7,covT*.55+smoothstep(.35,.9,covT)*.4,farT); sP=mix(sP,(uVeg==0?(uFlora==0?1.:0.):min((uVegT.x+uVegT.w*.5)*1.6,1.))*covT*.2,farT); foot*=1.-max(farS,farT);
  lf=vec4(sS,sT,min((sP+sG)/max(sS+sT,1e-4),1.),foot)*landK;
  md*=landK; pf*=landK*(1.-farT);
}
/* The colour of one fallen leaf, blade or needle from a random t: the plant's own leaves, dried. Broad
   leaves go tan and brown, blades (palm leaflets, dead grass) straw, needles rust. A few are fresh. */
vec3 leafCol(float t,bool blade,bool ndl){
  if(blade) return t<.45?vec3(.46,.40,.27):t<.8?vec3(.36,.31,.21):vec3(.29,.23,.14);
  if(ndl) return t<.5?vec3(.31,.19,.10):t<.85?vec3(.22,.145,.085):vec3(.33,.27,.18);
  return t<.30?vec3(.38,.29,.18):t<.55?vec3(.27,.20,.12):t<.80?vec3(.33,.27,.19):t<.90?vec3(.19,.14,.09):t<.96?vec3(.42,.34,.17):vec3(.21,.20,.10);
}
/* One layer of fallen leaves on a grid of cells, each holding at most one leaf that stays inside it.
   ang turns the grid, so layers don't line up. Each leaf has its own size, so a layer doesn't read as
   cobbles. bury: sand drifted over the leaves, hiding parts of them. Each layer shows its leaves while
   they're a few pixels wide, and fades to their average colour and cover as they shrink toward a pixel,
   so it never sparkles. */
/* Always 0 (never set): added to a loop's count so the D3D compiler can't unroll it into copies. */
uniform int uZero;
void leafLayer(vec2 p,float cell,float ang,float seed,float prob,float bladeK,float needleK,vec3 avg,float fp,float bury,vec3 sandC,inout vec3 col,inout vec2 sl){
  float dl=1.-smoothstep(.55,1.1,fp/(.2*cell));
  float area=prob*mix(.22,.08,max(bladeK,needleK))*(1.-.6*bury);
  if(dl<1.) col=mix(col,avg,area*(1.-dl));
  if(dl<=0.) return;
  float c=cos(ang),s=sin(ang);
  vec2 q=vec2(c*p.x-s*p.y,s*p.x+c*p.y)/cell, ci=floor(q), f=fract(q);
  vec2 h=hh(ci+seed),g=hh(ci+seed+17.3),e=hh(ci+seed+41.9);
  if(h.x>=prob) return;
  float a=h.y*6.2832, ca=cos(a), sa=sin(a);
  vec2 o=f-(.45+.10*g);
  o=vec2(ca*o.x-sa*o.y,sa*o.x+ca*o.y);
  bool blade=e.x<bladeK, ndl=!blade&&e.y<needleK;
  float sz=mix(.5,1.05,fract(g.x*3.1+e.y));
  float L=(blade?.45:ndl?.42:.40)*sz, W=(blade?.055:ndl?.028:.23*(.7+.3*g.y))*sz;
  float x=o.x/L;
  float w=W*(1.-x*x)*(1.-.35*x)*(blade||ndl?1.:1.15);
  float d=(abs(o.y)-w)*cell, aa=max(fp*.7,.0008);
  float inL=step(abs(x),1.);
  float k=(1.-smoothstep(-aa,aa,d))*inL;
  if(!blade&&!ndl){ float sx=-o.x/L-1.; k=max(k,(1.-smoothstep(-aa,aa,(abs(o.y)-.012*sz)*cell))*step(0.,sx)*step(sx,.18)*min(1.,.024*cell/max(fp,1e-4))); }
  k*=min(1.,2.*W*cell/max(fp,1e-4))*dl;
  /* Partly buried: sand covers it in places, its edges first. */
  k*=1.-bury*smoothstep(.25,.75,fract(e.x*7.7+g.y*3.3)+.4*abs(x));
  float rim=(1.-smoothstep(0.,max(.03*cell,aa*1.5),d))*(1.-k)*inL*dl;
  col*=1.-.16*rim;
  if(k<=0.) return;
  vec3 lc=leafCol(fract(h.y*7.31+g.x*3.1),blade,ndl);
  float side=o.y/max(w,1e-4);
  lc*=(.84+.32*e.x)*(1.+.12*side*(e.y-.5)*2.);
  if(!blade&&!ndl) lc*=1.-.18*(1.-smoothstep(0.,max(.012*cell,aa),abs(o.y)*cell))*step(abs(x),.9)*min(1.,.012*cell/max(fp,1e-4));
  /* Dusted with sand where it lies on sand. */
  lc=mix(lc,sandC,.22*bury);
  col=mix(col,lc,k);
  sl=mix(sl,(e-.5)*.5,k);
}
/* Fallen palm fronds and coconuts under palms: a frond is a stalk two to four metres long with narrow
   leaflets angled back along both sides, dried to straw or grey-brown. Close up only. */
void palmDebris(vec2 p,float fp,float pf,inout vec3 a,inout vec2 sl){
  float near=1.-smoothstep(.03,.07,fp);
  if(near<=0.||pf<=0.) return;
  const float CF=3.1;
  for(int L=0;L<2;L++){
    float ang=float(L)*2.1+.4, c=cos(ang), s=sin(ang);
    vec2 q=vec2(c*p.x-s*p.y,s*p.x+c*p.y)/CF+float(L)*.37, ci=floor(q);
    vec2 h=hh(ci+211.+float(L)*19.), g=hh(ci+233.+float(L)*7.);
    if(h.x>pf*.75) continue;
    float fa=h.y*6.2832, len=.30+.16*g.x;
    vec2 dir=vec2(cos(fa),sin(fa)), o=(fract(q)-(.42+.16*g))*CF/CF;
    float u=dot(o,dir), v=dot(o,vec2(-dir.y,dir.x));
    /* The stalk bows a little; leaflets are longest in the middle of the frond. */
    v-=.06*(1.-pow(u/len,2.))*(g.y-.5);
    float t=u/len;
    if(abs(t)>1.) continue;
    float aa=max(fp*.7,.0008)/CF;
    float rib=1.-smoothstep(.004-aa,.004+aa,abs(v)-.004*(1.-.5*t));
    float span=.15*(1.-t*t)*(.7+.3*smoothstep(-1.,0.,t));
    float leafl=0.;
    if(abs(v)<span){
      /* Leaflets: thin stripes slanting back from the stalk toward the frond's base, with gaps. */
      float st=(u+abs(v)*.9)*CF/.045;
      float fs=abs(fract(st)-.5)*2.;
      float wl=.38+.1*fract(floor(st)*.618);
      leafl=(1.-smoothstep(wl-aa*CF/.045*2.,wl+aa*CF/.045*2.,fs))*step(.12,fract(floor(st)*.37+g.x));
      leafl*=1.-smoothstep(span*.75,span,abs(v));
    }
    float k=max(rib,leafl*.85)*near;
    if(k<=0.) continue;
    vec3 fc=mix(vec3(.40,.35,.24),vec3(.27,.22,.15),fract(g.x*5.3))*(.85+.3*fract(floor((u+abs(v))*CF/.045)*.71));
    a=mix(a*(1.-.25*k),fc,k);
    sl+=vec2(.08,.05)*(fract(g.y*9.1)-.5)*k;
  }
  /* Coconuts: a few near the trunk, rounded, dark, with a little shadow. */
  float nk=1.-smoothstep(.012,.035,fp);
  if(nk>0.&&pf>.35){
    vec2 q=p/.9, ci=floor(q), h=hh(ci+301.), g=hh(ci+317.);
    if(h.x<(pf-.35)*.5){
      vec2 o=fract(q)*.9-(.3+.4*g)*.9;
      float r=.10+.03*h.y, d=length(o*vec2(1.,1.15));
      float k=(1.-smoothstep(r-.01,r+.01,d))*nk;
      float shd=(1.-smoothstep(r,r*1.7,length(o+uSun.xz/max(uSun.y,.3)*.08)))*nk;
      a*=1.-.35*shd*(1.-k);
      vec3 cc=mix(vec3(.20,.13,.07),vec3(.34,.25,.12),g.x)*(.75+.5*(1.-smoothstep(-r,r,dot(o,uSun.xz))));
      a=mix(a,cc,k);
      sl+=o/max(r,1e-3)*.6*k;
    }
  }
}
/* Distance from p to the segment ab (x), which side of it p lies (y: -1 or 1), and how far along it (z). */
vec3 segSD(vec2 p,vec2 a,vec2 b){ vec2 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return vec3(length(pa-ba*h),ba.x*pa.y-ba.y*pa.x<0.?-1.:1.,h); }
/* Fallen wood on the forest floor. Branches: a crooked limb one to four metres long, thick at one end and
   tapering, with a side branch or two forking off toward the thin end. Now and then, where the woods are
   thickest, a whole fallen trunk, with a few stubs where its branches broke off. Grey-brown bark with
   furrows along it, and in damp woods a fur of moss on top; rounded shading, a dark seam where it presses
   into the leaves, and a short shadow. Leaves have fallen over parts of it. At most one branch in each 5 m
   cell and one trunk in each 24 m cell; each stays near its cell, so the four nearest cells of each size
   are all that can reach p. Whether one lies in a cell is decided by how wooded it is at the cell's centre,
   so a branch is never cut off where the leaf mat thins; it fades under palms, which drop fronds instead
   (palmDebris). Close up only. mat: the leaf mat here; palmK: the share of palm leaflets in it; damp: how
   mossy. */
void fallenWood(vec2 p,float fp,float mat,float palmK,float damp,vec3 leafC,inout vec3 a,inout vec2 sl){
  vec2 sd=uSun.xz/max(uSun.y,.22); sd*=min(1.,3.5/max(length(sd),1e-3));
  float sunK=smoothstep(.02,.15,uSun.y);
  float here=smoothstep(.02,.3,mat)*(1.-.85*palmK);
  if(here<=0.) return;
  float wood=woodAt(p);
  for(int L=0;L<2;L++){
    bool trunk=L==1;
    float near=trunk?1.-smoothstep(.16,.32,fp):1.-smoothstep(.045,.1,fp);
    if(near<=0.) continue;
    float C=trunk?24.:4., ang=trunk?2.31:.77, ca=cos(ang), sa=sin(ang);
    vec2 pr=vec2(ca*p.x-sa*p.y,sa*p.x+ca*p.y);
    vec2 c0=floor(pr/C-.5);
    for(int j=0;j<=1;j++)for(int i=0;i<=1;i++){
      vec2 ci=c0+vec2(i,j), h=hh(ci+(trunk?417.:389.));
      if(h.x>(trunk?.2:.75)) continue;
      vec2 g=hh(ci+(trunk?431.:397.)), e=hh(ci+(trunk?443.:409.));
      vec2 cen=(ci+.25+.5*g)*C, q=pr-cen;
      float len=trunk?7.+6.*e.x:1.2+2.6*e.x, r0=trunk?.16+.12*e.y:.042+.055*e.y*(.4+.6*e.x);
      if(dot(q,q)>(len*.62+.8)*(len*.62+.8)) continue;
      /* How wooded the cell's centre is: trunks only in thick woods. */
      vec4 mc=terrS(vec2(ca*cen.x+sa*cen.y,-sa*cen.x+ca*cen.y));
      if(mc.r<.5||mc.g>.5) continue;
      float ct=treeCov(mc.b,wood), ex=trunk?.2*smoothstep(.5,.9,ct):.75*smoothstep(.15,.6,ct);
      float exist=smoothstep(h.x-.03,h.x+.03,ex)*here;
      if(exist<=0.) continue;
      float nk=near*exist;
      /* The limb's own frame: x along it, y across. */
      float an=h.y*6.2832; vec2 ax=vec2(cos(an),sin(an)), ay=vec2(-ax.y,ax.x);
      vec2 lq=vec2(dot(q,ax),dot(q,ay));
      /* A crooked line: three pieces with kinks between. */
      vec2 P0=vec2(-len*.5,0.), P1=vec2(-len*.17,(g.x-.5)*.12*len), P2=vec2(len*.17,(e.y-.5)*.12*len), P3=vec2(len*.5,(g.y-.5)*.1*len);
      vec3 s0=segSD(lq,P0,P1), s1=segSD(lq,P1,P2), s2=segSD(lq,P2,P3);
      vec3 sb=s0; vec2 dA=P1-P0; float tb=s0.z/3.;
      if(s1.x<sb.x){ sb=s1; dA=P2-P1; tb=(1.+s1.z)/3.; }
      if(s2.x<sb.x){ sb=s2; dA=P3-P2; tb=(2.+s2.z)/3.; }
      /* Thick at the foot (x = -len/2), thin toward the tip, a little uneven. */
      float rr=r0*(1.-.62*tb)*(1.+.18*(vn(vec2(lq.x/(trunk?1.1:.35),e.x*13.))-.5));
      float d=sb.x-rr; vec2 dirA=normalize(dA); float side=sb.y;
      /* Side branches toward the tip (stubs on a trunk), with the shadow test the same way below. */
      float dS=9., rS=0.; vec2 dirS=vec2(1.,0.); float sS=1.;
      for(int b=0;b<3;b++){
        vec2 hb=hh(ci+float(b)*7.3+(trunk?451.:419.));
        if(hb.x>(trunk?.85:.62)) continue;
        float tx=-.35+.75*hb.y, rb=r0*(1.-.62*(tx*.5+.5))*(trunk?.45:.62);
        vec2 B0=vec2(tx*len*.5,mix(P1.y,P2.y,.5)*(1.-abs(tx)));
        float ba=(hb.x<(trunk?.42:.31)?1.:-1.)*(.45+.5*fract(hb.y*7.1));
        float bl=trunk?.35+.6*fract(hb.x*5.3):len*(.18+.3*fract(hb.x*5.3));
        vec2 B1=B0+vec2(cos(ba),sin(ba))*bl;
        vec3 sbS=segSD(lq,B0,B1);
        float rb2=rb*(1.-.55*sbS.z);
        if(sbS.x-rb2<dS){ dS=sbS.x-rb2; rS=rb2; dirS=normalize(B1-B0); sS=sbS.y; }
      }
      bool onS=dS<d;
      float dd=min(d,dS), R=onS?rS:rr;
      float aa=max(fp*.7,.001);
      /* Its shadow: the outline seen from the sun, which lifts it by about its height. */
      vec2 sdr=vec2(ca*sd.x-sa*sd.y,sa*sd.x+ca*sd.y), ls=vec2(dot(sdr,ax),dot(sdr,ay))*R*1.6;
      vec3 t0=segSD(lq+ls,P0,P1), t1=segSD(lq+ls,P1,P2), t2=segSD(lq+ls,P2,P3);
      float dsh=min(min(t0.x,t1.x),t2.x)-rr*1.05;
      float shd=(1.-smoothstep(-aa,aa+R*.5,dsh))*sunK*.5;
      /* The seam where it presses into the leaves, dark and damp. */
      float seam=1.-smoothstep(0.,R*1.1+aa,dd);
      a*=1.-(max(shd,seam*.45))*nk*step(0.,dd);
      float k=(1.-smoothstep(-aa,aa,dd))*nk*min(1.,2.*R/max(fp,1e-4));
      if(k<=0.) continue;
      /* Rounded: across the limb the surface turns from the sun side to the shade side. */
      float u=clamp((dd+R)/max(R,1e-4),0.,.96)*(onS?sS:side);
      vec2 nAx=onS?dirS:dirA, nAc=vec2(-nAx.y,nAx.x);
      vec2 nR=ax*nAc.x+ay*nAc.y, nW=vec2(ca*nR.x+sa*nR.y,-sa*nR.x+ca*nR.y);
      /* Bark: grey-brown, some limbs darker and browner, some bleached; furrows along it. */
      vec3 bark=mix(vec3(.29,.25,.20),vec3(.52,.50,.45),g.x*g.x)*mix(1.,.66,step(.8,e.y));
      float fur=vn(vec2(lq.x*(trunk?6.:14.),u*(trunk?5.:3.)+e.x*9.));
      bark*=.72+.45*fur+.18*(vn(vec2(lq.x*1.7,g.y*5.))-.5);
      /* Moss on top in damp woods, in patches; pale lichen spots elsewhere. */
      float moss=damp*smoothstep(.42,.7,vn(lq*(trunk?1.6:3.1)+e*9.)+.25*(1.-abs(u)))*(trunk?1.:.7);
      bark=mix(bark,mix(vec3(.05,.085,.025),vec3(.10,.13,.04),fur),moss);
      bark=mix(bark,vec3(.36,.37,.30),(1.-moss)*.5*step(.78,vn(lq*(trunk?9.:21.)+g*7.)));
      /* The broken tip and the foot show paler wood. */
      float endK=onS?0.:smoothstep(len*.5-R*.6,len*.5,abs(lq.x));
      bark=mix(bark,vec3(.36,.30,.22),endK*.6);
      /* Leaves have fallen over parts of it, more over thin branches. */
      float cov=smoothstep(.62,.92,vn(p*2.7+g*11.)+.3*vn(p*7.9))*(trunk?.4:.55);
      bark=mix(bark,leafC,cov);
      a=mix(a,bark,k);
      sl+=k*(1.-cov)*(-nW*u/sqrt(1.-u*u))*.55;
    }
  }
}
/* The litter laid over the ground's colour. Detail goes from single leaves and twigs close up, to a
   mottled average further off, to plain colour far away, so it never turns to noise. slope gets the
   litter's and the mound's relief. */
void litterShade(vec2 p,float fp,vec4 lf,vec3 md,float pf,inout vec3 alb,inout vec2 slope,inout float sandK){
  slope+=md.xy;
  float n1=nz(p,1.3,fp,0),n2=nz(p,3.1,fp,1),n3=nz(p,.63,fp,2),n4=nz(p,.29,fp,3),n5=nz(p,7.7,fp,1);
  /* The mat under trees, broken up at several sizes: ragged edges, thin patches where soil shows. */
  float T=lf.y*(.55+.9*n1)*(.8+.4*n5)+.16*(n2-.5)+.08*(n4-.5);
  float mat=smoothstep(.10,.70,T);
  /* A few loose leaves on open ground, never a carpet. */
  float S=lf.x*(.5+1.*n3)*(.7+.6*n2);
  float loose=smoothstep(.1,.9,S)*.36;
  float seat=smoothstep(.15,1.,lf.w);
  /* Sand on the mound is fresh, wind-sorted and a touch paler. */
  float mnd=smoothstep(.02,.2,md.z);
  if(mat<=0.&&loose<=0.&&seat<=0.&&mnd<=0.&&pf<=0.) return;
  vec3 sandC=alb;
  vec3 a=alb;
  float bladeK=lf.z, needleK=(uFlora>=2?.85:uFlora==1?.25:0.)*lf.y/max(lf.x+lf.y,1e-4);
  /* Under the mat, the layers of older leaves beneath: their colour, darker and browner, not the bare
     soil, so the top leaves read as a carpet rather than as cobbles on black. */
  vec3 avg0=mix(mix(vec3(.32,.255,.165),vec3(.38,.33,.22),bladeK),vec3(.26,.17,.10),needleK);
  vec3 soilC=mix(avg0*vec3(.62,.58,.54),alb*vec3(.62,.56,.48),.25);
  a=mix(a,soilC,mat*.85);
  /* The seat of the stems, in shade and damp. */
  a*=1.-.30*seat;
  /* The average colour of the leaves, worked out from the colours in leafCol. */
  vec3 avg=vec3(.32,.255,.165);
  avg=mix(avg,vec3(.38,.33,.22),bladeK);
  avg=mix(avg,vec3(.26,.17,.10),needleK);
  vec3 mot=avg*(.74+.52*n3)*(.86+.28*n4);
  /* On open sand, drifted sand covers parts of the leaves. */
  float bury=(1.-mat)*smoothstep(.3,.7,nz(p,.9,fp,2));
  float cover=max(mat*.94,loose);
  if(fp<.08){
    vec3 dc=a; vec2 ls=vec2(0.);
    float pm=mat*.96, pl=loose;
    /* Under trees, three overlapping layers; on open sand, two thin ones. */
    /* One call in a loop (uZero: see logPiece), not four inlined copies. */
    for(int i=0;i<4+uZero;i++){
      float cell=i==0?.075:i==1?.11:i==2?.16:.24, ang=i==0?.3:i==1?1.9:i==2?3.4:5.1, sd=i==0?1.:i==1?7.:i==2?13.:23.;
      float pr=i==0?pm:i==1?max(pm,pl):i==2?max(pm*.85,pl*.8):pm*.55;
      float bk=bladeK*(i==0?.6:i==1?.8:1.), nk=needleK*(i<2?1.:i==2?.7:.5), bu=i==1||i==2?bury:0.;
      leafLayer(p,cell,ang,sd,pr,bk,nk,mot,fp,bu,sandC,dc,ls);
    }
    float far=smoothstep(.05,.08,fp);
    a=mix(dc,mix(a,mot,cover*.7),far);
    slope+=ls*(1.-far);
  } else
  a=mix(a,mot,cover*.7);
  /* Twigs and bits of bark: thin, dark or bleached grey, each throwing a hairline shadow. Mostly under
     trees. */
  float tk=1.-smoothstep(.015,.05,fp);
  if(tk>0.){
    vec2 q=p/.45, ci=floor(q), h=hh(ci+61.), g=hh(ci+83.);
    if(h.x<mat*.4+loose*.15){
      vec2 cen=(.32+.36*g)*.45, dir=vec2(cos(h.y*6.2832),sin(h.y*6.2832));
      float hl=(.05+.13*g.x), w=.003+.005*g.y;
      vec2 o=fract(q)*.45-cen;
      float t=clamp(dot(o,dir),-hl,hl), d=length(o-dir*t)-w*(1.-.4*abs(t)/hl);
      vec2 os=o+uSun.xz/max(uSun.y,.2)*.012;
      float ts=clamp(dot(os,dir),-hl,hl), dsh=length(os-dir*ts)-w*1.4;
      float aa=max(fp*.7,.0008), fade=min(1.,2.*w/max(fp,1e-4));
      float k=(1.-smoothstep(-aa,aa,d))*fade*tk*(1.-.7*bury*step(.5,g.y));
      float ks=(1.-smoothstep(-aa,aa*2.,dsh))*fade*tk*.35;
      vec3 twc=g.x<.7?vec3(.14,.10,.07):vec3(.34,.30,.25);
      a=mix(a*(1.-ks),twc*(.8+.4*h.y),k);
    }
  }
  /* Fallen branches, and now and then a trunk, on the mat under the woods. */
  if(mat>.02&&fp<.32) fallenWood(p,fp,mat,bladeK,uFlora==0?.6:uFlora==1?.12:uFlora==3?.8:.55,mot,a,slope);
  palmDebris(p,fp,pf,a,slope);
  /* Seedlings and small grassy tufts where the mat thins, between the trees. */
  float gk=smoothstep(.1,.4,mat)*(1.-smoothstep(.55,.95,mat))*(1.-bladeK)*.45;
  if(gk>0.){
    vec3 gc=mix(vec3(.065,.085,.03),vec3(.13,.14,.055),n3);
    float near=1.-smoothstep(.008,.025,fp);
    float gcov=0.;
    if(near>0.){
      vec2 q=p/.32, ci=floor(q), h=hh(ci+101.), g=hh(ci+131.);
      if(h.x<gk*(.5+n2)){
        vec2 o=fract(q)*.32-(.4+.2*g)*.32;
        for(int b=0;b<4;b++){
          float an=h.y*6.2832+float(b)*1.7+g.x, bl=.03+.035*fract(g.y*5.3+float(b)*.37);
          vec2 dir=vec2(cos(an),sin(an));
          float t=clamp(dot(o,dir),0.,bl), d=length(o-dir*t)-.004*(1.-.7*t/bl);
          gcov=max(gcov,1.-smoothstep(-max(fp*.7,.0008),max(fp*.7,.0008),d));
        }
      }
    }
    a=mix(a,gc,mix(gk*.12,gcov,near));
  }
  alb=a;
  /* The mat holds the ground still: no wind ripples and no glints of bare grains under it. A few loose
     leaves don't; on the mound, sheltered sand is a little smoother. */
  sandK*=(1.-.85*mat)*(1.-.25*mnd);
}
/* Ground cover where the plants begin: on tropical coasts creeping vines (beach morning glory and the
   like: long runners with round leaves along them), elsewhere grass runners with short blades at their
   joints, spreading over the sand in patches that thicken inland until the shrubs take over. From far off
   the ground's own green (groundAlb) stands for it; nearer, its patches show as a faint green; close up,
   its runners and leaves. Returns how much of the ground it covers. */
float groundCover(vec2 p,float fp,float veg,inout vec3 alb,inout vec2 slope){
  float zone=smoothstep(.04,.22,veg)*(1.-smoothstep(.5,.85,veg));
  if(zone<=0.||fp>.3) return 0.;
  /* Patches: runners reach out from where the cover is thick, so the patch edges are ragged. */
  float pt=nz(p,17.,fp,0)*.5+nz(p,5.3,fp,1)*.32+nz(p,1.6,fp,2)*.18;
  float dens=smoothstep(.62-.18*zone,.80-.16*zone,pt)*zone;
  if(dens<=0.) return 0.;
  bool vine=uFlora==0;
  vec3 gA=vine?vec3(.050,.085,.030):vec3(.085,.088,.042), gB=vine?vec3(.10,.14,.045):vec3(.15,.14,.07);
  vec3 mot=mix(gA,gB,nz(p,.71,fp,3))*(.8+.4*nz(p,2.3,fp,1));
  float midK=1.-smoothstep(.12,.3,fp);
  float near=1.-smoothstep(.02,.05,fp);
  vec3 a=mix(alb,mot,dens*.3*midK*(1.-near));
  float cov=0.;
  if(near>0.){
    float aa=max(fp*.7,.0008);
    vec3 dc=alb;
    /* Runners wander in two directions that turn slowly across the patch, each broken into lengths;
       only where the cover is thick do they meet and cross. */
    for(int r=0;r<2;r++){
      float an=float(r)*1.9+.6+1.6*(nz(p,7.,fp,0)-.5), c=cos(an), s=sin(an);
      vec2 q=vec2(c*p.x-s*p.y,s*p.x+c*p.y);
      float sp=.85+.35*float(r);
      float wv=q.y+.22*sin(q.x*1.7+float(r)*2.)+.10*sin(q.x*4.3+1.)+.35*(nz(p,2.1,fp,1)-.5);
      float lid=floor(wv/sp), lt=(fract(wv/sp)-.5)*sp;
      vec2 hs=hh(vec2(lid,floor(q.x/2.3+lid*.37))+float(r)*13.);
      if(hs.x>dens*1.15-.08) continue;
      float stem=(1.-smoothstep(.0025-aa,.0025+aa,abs(lt)))*min(1.,.006/max(fp,1e-4));
      dc=mix(dc,gA*.75,stem); cov=max(cov,stem);
      /* Leaves (or, on grass runners, a few short blades) at the joints, on alternate sides. */
      float js=vine?.10:.16, sj=q.x/js+hs.y*7.; float k=floor(sj), fu=(fract(sj)-.5)*js;
      vec2 hk=hh(vec2(k,lid)+float(r)*7.);
      if(hk.x>.82) continue;
      float side=mod(k,2.)<1.?1.:-1.;
      if(vine){
        float R=(.028+.026*hk.y)*(.75+.35*dens);
        vec2 lo=vec2(fu,lt-side*R*.95);
        float d=length(lo*vec2(1.,1.12))-R;
        float lk=(1.-smoothstep(-aa,aa,d))*min(1.,2.*R/max(fp,1e-4));
        if(lk>0.){
          vec3 lc=mix(gA,gB,fract(hk.y*7.3))*(.78+.44*smoothstep(-R,R,dot(lo,uSun.xz)));
          dc=mix(dc,lc,lk); cov=max(cov,lk);
          slope+=lo/max(R,1e-3)*.3*lk;
        }
      } else {
        for(int b=0;b<2;b++){
          float bl=.05+.05*fract(hk.y*5.3+float(b)*.37), ba=side*(.5+.5*float(b))+(hk.y-.5)*.6;
          vec2 dir=vec2(cos(ba),sin(ba)*side), o=vec2(fu,lt);
          float t=clamp(dot(o,dir),0.,bl), d=length(o-dir*t)-.003*(1.-.7*t/bl);
          float lk=(1.-smoothstep(-aa,aa,d))*min(1.,.006/max(fp,1e-4));
          dc=mix(dc,mix(gA,gB,fract(float(b)*.37+hk.y))*(1.1-.4*t/bl),lk); cov=max(cov,lk);
        }
      }
    }
    a=mix(a,dc,near);
  }
  alb=a;
  return mix(dens*.3*midK,cov,near);
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
  /* Shrubs stand about 1.5 m apart on a grid; once a pixel is more than about half a metre across, their
     crowns lined up into rows, a woven pattern over open country a kilometre or two away. */
  hS*=1.-smoothstep(.35,.9,fp);
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
    if(cardS>0.) s1=max(s1,shrubShadow(p,sd,dens,wood)*cardS*.92);
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
    float covT=treeCov(dens,woodAt(p));
    float oT=standOcc(p,tT,3.4,covT)*cardK,oS=0.;
    vec2 sc_; float sr,shh;
    if(cardS>0.&&shrubAt(p,wood,sc_,sr,shh)){ float o=1.-smoothstep(.1*sr,1.3*sr,length(p-sc_)); oS=o*o*cardS; }
    float occ=max(oT*.6,oS)*nearAO;
    ao*=1.-.55*occ;
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
float capD(vec2 p,vec2 a,vec2 b){ vec2 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
/* Distance to a capsule's axis swept along s: the ground a lying log's shadow covers. */
float sweptD(vec2 p,vec2 a,vec2 b,vec2 s){
  vec2 e0=b-a,e1=s; float c0=e0.x*(p-a).y-e0.y*(p-a).x,c1=e1.x*(p-b).y-e1.y*(p-b).x,c2=-e0.x*(p-b-s).y+e0.y*(p-b-s).x,c3=-e1.x*(p-a-s).y+e1.y*(p-a-s).x;
  bool in1=(c0>=0.&&c1>=0.&&c2>=0.&&c3>=0.)||(c0<=0.&&c1<=0.&&c2<=0.&&c3<=0.);
  return in1?0.:min(min(capD(p,a,b),capD(p,b,b+s)),min(capD(p,b+s,a+s),capD(p,a+s,a)));
}
/* ---- Driftwood (TECHLOG 55) ----
   A log is a few round pieces, each a capsule (a cylinder with round ends): three for the trunk, bent and
   thinner toward one end, and on some a root wad, broken branch stubs and a few sticks lying beside it.
   Each piece is ray-cast here, in the ground pass: the view ray is followed back from the ground point it
   hit, so a log rises above the sand, hides the sand behind it, and is lit round, with its true outline;
   the ray from the ground to the sun gives its shadow. */
/* The first hit of the ray ro+rd*t on the capsule a-b of radius r (after Inigo Quilez), or -1. */
float capHit(vec3 ro,vec3 rd,vec3 pa,vec3 pb,float ra){
  vec3 ba=pb-pa,oa=ro-pa;
  float baba=dot(ba,ba),bard=dot(ba,rd),baoa=dot(ba,oa),rdoa=dot(rd,oa),oaoa=dot(oa,oa);
  float a=max(baba-bard*bard,1e-7),b=baba*rdoa-baoa*bard,c=baba*oaoa-baoa*baoa-ra*ra*baba,h=b*b-a*c;
  if(h>=0.){
    float t=(-b-sqrt(h))/a,y=baoa+t*bard;
    if(y>0.&&y<baba) return t;
    vec3 oc=y<=0.?oa:ro-pb; b=dot(rd,oc); c=dot(oc,oc)-ra*ra; h=b*b-c;
    if(h>0.) return -b-sqrt(h);
  }
  return -1.;
}
/* Where the ray ro+rd*t (t>=0) passes closest to the segment a-b: (distance, t, how far along a-b, 0 to 1). */
vec3 raySeg(vec3 ro,vec3 rd,vec3 a,vec3 b){
  vec3 ba=b-a,oa=ro-a; float baba=dot(ba,ba),bard=dot(ba,rd),baoa=dot(ba,oa),rdoa=dot(rd,oa);
  float h=clamp((baoa-bard*rdoa)/max(baba-bard*bard,1e-6),0.,1.);
  float t=max(bard*h-rdoa,0.);
  h=clamp(dot(oa+rd*t,ba)/baba,0.,1.);
  return vec3(length(oa+rd*t-ba*h),t,h);
}
/* Weathered wood at the point hp of piece a-b (radius r), normal n. lp: x a seed, y how brown (0 bleached
   silver, 1 brown), z how much bark is left, w which ends are broken ends (1 at a, 2 at b, 3 both). */
vec3 woodCol(vec3 hp,inout vec3 n,vec3 a,vec3 b,float r,vec4 lp,float h,float fp){
  vec3 ax=normalize(b-a),e1=normalize(cross(ax,vec3(0,1,0))+vec3(1e-4,0,0)),e2=cross(e1,ax);
  float s=dot(hp-a,ax)+fract(lp.w)*100.+lp.x*13.,th=atan(dot(n,e2),dot(n,e1)),u=(th+3.1416)*max(r,.04);
  float fine=1.-smoothstep(.015,.05,fp);
  vec3 c=mix(vec3(.63,.595,.53),vec3(.45,.37,.28),lp.y);
  /* Grain: long streaks along the wood, wandering a little; worn into ridges that catch the light. */
  float wv=.35*vn(vec2(s*.35,lp.x*3.));
  float g=vn(vec2(s*.8,(u+wv)*9.+lp.x*31.)),g2=vn(vec2(s*3.,(u+wv)*34.+lp.x*7.));
  c*=.84+.30*g+.14*g2*fine;
  float gd=(vn(vec2(s*.8,(u+wv+.006)*9.+lp.x*31.))-vn(vec2(s*.8,(u+wv-.006)*9.+lp.x*31.)))/.012;
  vec3 tA=normalize(cross(ax,n)+vec3(1e-5));
  n=normalize(n-tA*gd*.035*fine);
  /* Checks: deep cracks along the grain, several per log, each fading in and out along its length. */
  float cu=(u+wv)*7.,ci=floor(cu); cu+=.18*vn(vec2(s*2.2,ci*1.7+lp.x)); float ck=abs(fract(cu)-.5);
  float cw=.045+.04*vn(vec2(s*1.3,ci*5.1));
  /* Not on sticks: one crack along a thin stick reads as the dark seam of a metal tube. */
  float crack=(1.-smoothstep(cw,cw+.035+.08*(1.-fine),ck))*smoothstep(.12,.32,vn(vec2(s*1.1,ci*3.7+lp.x*5.)))*smoothstep(.07,.15,r);
  c*=1.-.62*crack*(1.-smoothstep(.5,1.,fp/max(r,.03)));
  n=normalize(n+tA*sign(fract(cu)-.5)*crack*.5*fine);
  /* Knots: dark ovals where branches were. */
  vec2 kc=vec2(s*.9,u*2.5),kf=fract(kc)-.5;
  c*=1.-.5*step(.84,hh(floor(kc)+lp.x*17.).x)*(1.-smoothstep(.10,.2,length(kf*vec2(1.,1.7))));
  /* Bark, on the fresher logs: patches of dark, rough bark not yet worn off. */
  float bark=lp.z*smoothstep(.0,.15,vn(vec2(s*.5,u*1.6+lp.x*3.))+.1*vn(vec2(s*4.,u*9.)));
  c=mix(c,vec3(.15,.10,.07)*(.75+.5*vn(vec2(s*9.,u*40.))),bark);
  /* Broken ends: paler wood, the growth rings showing. */
  float ea=step(.5,mod(lp.w,2.))*step(h,0.),eb=step(2.,lp.w)*step(1.,h);
  if(ea+eb>0.){
    vec3 d=hp-(ea>0.?a:b); float rr=length(d-ax*dot(d,ax))/max(r,.03);
    c=mix(c,vec3(.68,.62,.52)*(.9+.12*sin(rr*28.+6.*vn(d.xz*20.))*fine),smoothstep(.2,.6,abs(dot(n,ax))));
  }
  /* Underneath: darker, damp and stained with sand. */
  return c*mix(.72,1.,smoothstep(-.6,.35,n.y));
}
/* One piece of a log. The view ray starts at ro and reaches the ground at s0; P is that ground point. The
   nearest piece in front of the ground so far is kept in bt (t, cover), with its normal and colour; sh is
   the sun it hides from P, ao how much it darkens the sand around its foot. f fades the piece out once it
   gets thinner than about a pixel. */
/* The nearest log piece the ray hits so far: where, which piece, and its place along it. Its wood is
   coloured once, after every piece of the cell has been tried (woodCol is long, and the D3D compiler
   inlines it at every call). */
vec3 dbHp,dbA,dbB; vec4 dbLp; float dbR,dbH;
void logPiece(vec3 ro,vec3 rd,float s0,vec3 P,float fp,vec3 a,vec3 b,float r,vec4 lp,float f,
              inout vec2 bt,inout vec3 bN,inout vec3 bC,inout float sh,inout float ao){
  if(f<=0.) return;
  float pw=max(fp*.8,.002);
  vec3 q=raySeg(ro,rd,a,b);
  if(q.x<r+pw&&q.y<s0+r){
    float t=q.y; if(q.x<r){ float th=capHit(ro,rd,a,b,r); if(th>0.) t=th; }
    if(t<s0&&t<bt.x){
      vec3 hp=ro+rd*t,ba=b-a; float h=dot(hp-a,ba)/dot(ba,ba);
      vec3 n=normalize(hp-a-ba*clamp(h,0.,1.));
      bt=vec2(t,(1.-smoothstep(r-pw*.5,r+pw*.5,q.x))*f); bN=n; dbHp=hp; dbA=a; dbB=b; dbR=r; dbLp=lp; dbH=h;
    }
  }
  /* The shadow on the ground, softer further from the log; and the dark seam where it lies in the sand. */
  vec3 s=raySeg(P+vec3(0,.005,0),uSun,a,b);
  float pen=.012*s.y+pw*.5+r*.08, reach=1.-smoothstep(2.6,3.6,s.y*length(uSun.xz));
  sh=max(sh,(1.-smoothstep(r-pen,r+pen,s.x))*step(.001,s.y)*f*reach);
  vec2 ab=b.xz-a.xz; float hg=clamp(dot(P.xz-a.xz,ab)/max(dot(ab,ab),1e-6),0.,1.);
  float hc=mix(a.y,b.y,hg)-P.y, w=sqrt(max(r*r-hc*hc,0.)), dg=length(P.xz-a.xz-ab*hg)-w;
  ao=max(ao,(1.-smoothstep(0.,r*.9+.04,dg))*step(-r*.8,hc)*step(hc,r*1.2)*f);
}
/* At the back of the beach, above the wrack line: driftwood logs on temperate beaches, fallen palm fronds
   and coconuts on tropical ones. Fronds and coconuts lie flat, so they are drawn as part of the ground,
   with rounded shading and their sun shadows; logs are ray-cast (logPiece). At most one object in each
   12 m cell. cov is how much of the pixel they cover, dN and dK the normal of a log there and how much it
   covers, dT how far in front of the ground point the log is; dSh how much of the sun they hide. */
void beachDebris(vec3 P,vec3 rd,float fp,bool tropic,inout vec3 alb,inout vec2 sl,out float cov,out float dSh,out vec3 dN,out float dK,out float dT){
  cov=0.; dSh=0.; dN=vec3(0,1,0); dK=0.; dT=0.;
  vec2 p=P.xz;
  if(fp>.6) return;
  float fade=1.-smoothstep(.06,.12,fp);
  /* Objects lie above the wrack line and reach at most 10 m from their centres: below that, skip. */
  if(terrH(p)-uTide<1.05+uSwH*.75-.2-10.*max(gSlope,.02)) return;
  /* The view ray, followed back from the ground to 2 m above it, or at most 6 m across. */
  float s0=min(2.2/max(-rd.y,.01),6./max(length(rd.xz),.01));
  vec3 ro=P-rd*s0;
  /* The nine 12 m cells around the middle of that stretch of ray. A cell further out has its centre at
     least 13.8 m from that middle point, which is within 3 m of the ground point and of the ray: further
     than any log, its pieces and its shadow (faded out by 3.6 m) reach. */
  const float C=12.;
  vec2 pc=(p+ro.xz)*.5, c0=floor(pc/C)-1.;
  float hw=1.05+uSwH*.75;
  vec2 sxz=-uSun.xz/max(uSun.y,.12); sxz*=min(1.,4./max(length(sxz),1e-3));
  vec2 bt=vec2(1e9,0.); vec3 bN=vec3(0,1,0),bC=vec3(0.); float lSh=0.,lAo=0.;
  for(int j=0;j<=2;j++)for(int i=0;i<=2;i++){
    vec2 ci=c0+vec2(i,j),h1=hh(ci+71.3);
    if(h1.x>(tropic?.7:.34)) continue;
    vec2 h2=hh(ci+13.9);
    vec2 c=(ci+.15+.7*h2)*C;
    int kind=tropic?(h1.y<.5?2:h1.y<.88?1:0):0;   // 0 a log, 1 a frond, 2 coconuts
    vec2 h3=hh(ci+5.1);
    /* Most pixels are far from any object: skip before reading the terrain. */
    float len=1.5+7.*h3.y*h3.y;
    if(kind==0){ if(capD(c,p,ro.xz)>max(len*.5,4.6)+2.4&&length(p-c)>max(len*.5,4.6)+5.4) continue; }
    else if(dot(p-c,p-c)>39.) continue;
    float hy=terrH(c)-uTide; vec4 mc=terrS(c);
    if(mc.g>.2||hy<hw+.15) continue;
    if(kind==0&&(hy>hw+2.4||mc.b>.3)) continue;
    if(kind>0&&(mc.b<.015||mc.b>.8)) continue;
    /* Mostly lying along the shore, which runs along z. */
    float a=1.5708+(h3.x-.5)*(kind==0?1.3:4.);
    vec2 ax=vec2(cos(a),sin(a)),pr=vec2(-ax.y,ax.x),q=p-c;
    if(kind==0){
      /* Sizes from branches to whole trunks: most a few metres long and a hand or two thick, a few big
         trunks up to 8.5 m and 70 cm across. Three pieces, kinked, each thinner than the last; lying
         partly sunk in the sand. Most are bleached silver; some browner, some still with bark. */
      vec2 h4=hh(ci+27.7),h5=hh(ci+41.3),h6=hh(ci+55.9);
      float r=.06+.27*h2.x*h2.x*min(len/5.,1.)+.04*h4.x;
      vec4 lp=vec4(h4.x*7.+h5.y,h6.x*h6.x,step(.72,h6.y)*(.5+.5*h6.x),3.);
      float sink=.25+.55*h4.y, f=1.-smoothstep(r*.7,r*1.8,fp);
      vec2 X0=c-ax*len*.5, X1=c+ax*len*(-.5+.36+.08*h5.x)+pr*(h4.x-.5)*.06*len, X2=c+ax*len*(.22+.08*h5.y)+pr*(h5.x-.5)*.07*len, X3=c+ax*len*.5+pr*(h6.x-.5)*.10*len;
      /* All three pieces are equally thick, so each bend is a smooth elbow: any step in thickness between
         capsules shows as a ring, a pipe joint, even at 3%. The thin end lies deeper in the sand instead.
         The grain runs on across the bends: each piece's distance from the thick end goes in lp.w's
         fraction (in hundreds of metres; woodCol reads it). */
      float r0=r,r1=r,r2=r;
      vec3 A0=vec3(X0.x,terrH(X0)+r0*sink,X0.y), A1=vec3(X1.x,terrH(X1)+r1*sink,X1.y), A2=vec3(X2.x,terrH(X2)+r2*(sink+.08),X2.y), A3=vec3(X3.x,terrH(X3)+r2*(sink+.22),X3.y);
      float o1=length(A1-A0), o2=o1+length(A2-A1);
      /* Every piece goes through one call of logPiece, in a loop the D3D compiler can't unroll (uZero is
         always 0). With a call for each kind of piece it inlined logPiece seven times, and the view shader
         took minutes to compile on Windows. Pieces 0 to 2 are the trunk; 3 to 20 the root wad's nine roots,
         two pieces each; 21 and 22 branch stubs; 23 to 25 sticks beside it.
         A root wad grows at the thick end of some of the bigger ones: a tangle of thick roots of uneven
         length spreading from it, bending and drooping toward their tips; the lower ones are in the sand.
         Roots keep more dirt and bark, so they are browner. (A swollen butt or swellings at the bends were
         tried: as capsules they read as collars on a pipe.) Branch stubs are short and worn, on the trunk
         itself; sticks and branches are thrown up beside it. */
      bool roots=h5.y>.55&&r>.14;
      vec3 ax3=normalize(A0-A1), up3=normalize(vec3(0,1,0)-ax3*ax3.y), sd3=cross(ax3,up3), cr=A0+ax3*r*.3;
      vec4 lr=vec4(lp.x+3.,min(lp.y+.45,1.),max(lp.z,.35),0.);
      for(int k=0;k<26+uZero;k++){
        vec3 pa,pb; float pr2; vec4 plp; float pf=f;
        if(k<3){
          pa=k==0?A0:k==1?A1:A2; pb=k==0?A1:k==1?A2:A3; pr2=k==0?r0:k==1?r1:r2;
          plp=vec4(lp.xyz,k==0?1.:k==1?o1*.01:2.+o2*.01);
        } else if(k<21){
          if(!roots) continue;
          float fq=float((k-3)/2);
          vec2 hk=hh(ci+fq*3.17+.5),hm=hh(ci+fq*1.91+8.3);
          float ph=-.6+4.3*hk.x;
          vec3 rad=sd3*cos(ph)+up3*sin(ph);
          vec3 m1=cr+normalize(rad+ax3*(.2+.5*hm.x))*r*(.9+1.3*hk.y);
          float rr=r*(.4+.28*hk.y*hm.x);
          if(((k-3)&1)==0){ pa=A0-ax3*r*.3+rad*r*.25; pb=m1; pr2=rr; plp=lr; }
          else { pa=m1; pb=m1+normalize(rad*(.6+.6*hm.y)+ax3*(.6*hm.x-.25)+sd3*(hm.y-.5)*.8-vec3(0,.35+.5*hk.y,0))*r*(.5+2.6*hm.y*hm.y); pr2=rr*(.5+.2*hm.x); plp=vec4(lr.xyz,2.); }
        } else if(k<23){
          vec2 hk=hh(ci+float(k-21)*5.3+9.1);
          if(hk.x>.5) continue;
          float at=.15+.7*hk.y, side=hk.x<.25?1.:-1.;
          vec3 o=at<.36?mix(A0,A1,at/.36):at<.68?mix(A1,A2,(at-.36)/.32):mix(A2,A3,(at-.68)/.32);
          o+=(vec3(pr.x,0.,pr.y)*side*.5+vec3(0,.6,0))*r;
          vec3 dir=normalize(vec3(pr.x,0.,pr.y)*side*.9+vec3(0,.25+.4*hk.y,0)+vec3(ax.x,0.,ax.y)*(hk.y-.5)*.9);
          pa=o; pb=o+dir*min(r*(1.1+2.2*hk.x),.7); pr2=r*(.28+.1*hk.y); plp=vec4(lp.xyz,2.);
        } else {
          float fq=float(k-23);
          vec2 hk=hh(ci+fq*7.9+21.3),hl=hh(ci+fq*2.3+33.1);
          if(hk.x>.75) continue;
          vec2 sc=c+ax*(hk.y-.5)*len*1.1+pr*(hl.x-.5)*7.;
          float sa=hl.y*6.2832, sl2=.5+1.3*hk.x*hk.x, sr=.022+.035*hl.x;
          vec2 sd=vec2(cos(sa),sin(sa))*sl2*.5;
          float sy=terrH(sc)+sr*.45;
          pa=vec3(sc.x-sd.x,sy,sc.y-sd.y); pb=vec3(sc.x+sd.x,sy+.03*(hk.y-.5),sc.y+sd.y); pr2=sr;
          plp=vec4(lp.x+fq,.1+.45*hl.y,0.,0.); pf=1.-smoothstep(sr*.7,sr*1.8,fp);
        }
        logPiece(ro,rd,s0,P,fp,pa,pb,pr2,plp,pf,bt,bN,bC,lSh,lAo);
      }
    } else if(kind==1){
      /* A dry frond: a stiff midrib with leaflets angled toward its tip on both sides, narrowing to
         nothing at the tip. */
      float len=2.4+1.8*h3.y;
      vec2 A=c-ax*len*.5;
      for(int s=0;s<2;s++){
        vec2 pp=s==0?p:p-sxz*.13;
        vec2 qq=pp-A; float al=dot(qq,ax),ac=dot(qq,pr);
        float t=al/len; if(t<0.||t>1.) continue;
        float w=.45*sqrt(sin(3.1416*min(t*1.15,1.)))*(t<.08?t/.08:1.);
        float rib=1.-smoothstep(.022,.022+fp,abs(ac));
        float leaf=step(abs(ac),w)*step(.06,t)*step(.42,fract((al-abs(ac)*.75)/.085+h2.y));
        float f=max(rib,leaf*(1.-smoothstep(w-.05,w,abs(ac))))*fade;
        if(s==1){ dSh=max(dSh,f*.8); continue; }
        if(f>0.){
          vec3 fc=mix(vec3(.42,.35,.24),vec3(.27,.21,.14),h2.x)*(.85+.3*vn(vec2(al*3.,ac*2.)));
          alb=mix(alb,rib>.5?vec3(.40,.33,.24):fc,f); cov=max(cov,f);
        }
      }
    } else {
      /* One to three coconuts. */
      for(int n=0;n<3;n++){
        vec2 hn=hh(ci+float(n)*7.7);
        if(n>0&&hn.x<.5) continue;
        float r=.11+.04*hn.y; vec2 cc=c+(hn-.5)*1.6;
        float sd=length(p-cc+sxz*r);
        dSh=max(dSh,(1.-smoothstep(r*.8,r*1.1,sd))*fade);
        float d=length(p-cc);
        if(d<r+.1){
          float k=(1.-smoothstep(r-fp,r,d))*fade;
          vec2 nn=(p-cc)/r; float hz=sqrt(max(1.-dot(nn,nn),.05));
          vec3 nc=hn.x<.85?vec3(.27,.18,.10):vec3(.40,.38,.14);
          alb=mix(alb*(1.-.25*(1.-smoothstep(r,r+.1,d))*fade),nc*(.8+.3*vn((p-cc)*40.)),k);
          sl+=k*(-nn/hz)*.7; cov=max(cov,k);
        }
      }
    }
  }
  /* The sand at a log's foot is darker, in the seam and the shade under its curve. */
  alb*=1.-.45*lAo*(1.-cov);
  dSh=max(dSh,lSh);
  if(bt.y>0.){
    bC=woodCol(dbHp,bN,dbA,dbB,dbR,dbLp,dbH,fp);
    alb=mix(alb,bC,bt.y); dN=bN; dK=bt.y; dT=s0-bt.x;
    cov=max(cov,bt.y); sl*=1.-bt.y;
  }
  dSh*=1.-cov;
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
  /* The sand changes along the beach, over hundreds of metres: a little lighter or darker, warmer or
     greyer, as if from different sources. (The noise is stretched along the shore, which runs along z.) */
  vec2 aS=textureLod(tNoise,rotT(vec2(p.x*.3,p.y),420.)/420.,max(log2(max(fp,1e-3)*512./420.),0.)).rg-.5;
  sand*=(1.+.11*aS.x)*vec3(1.+.07*aS.y,1.+.02*aS.y,1.-.06*aS.y);
  float hy=y-uTide;
  bool tropic=uType==0||uFlora==0;
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
    /* It weaves a couple of metres nearer and farther from the water along the beach. The weave is set
       in metres: as a height it became a 17 m zigzag on flat beaches. */
    float dm=(hy-hw)/max(length(g3),.006)+2.2*(nz(vec2(p.x*.2,p.y),70.,fp,1)-.5);
    float halfM=.6+.9*n2;
    float band=1.-smoothstep(halfM*.3,halfM,abs(dm));
    /* Separate clumps with sand between, not a continuous strip, which reads as a path. Too small to
       see from far away, they fade into a faint, even darkening of the band. (fp is per 4K pixel in
       high-quality renders.) */
    float far=smoothstep(.015,.06,fp);
    float clump=mix(smoothstep(.54,.68,nz(p,1.9,fp,0)*.45+nz(p,.71,fp,2)*.35+nz(p,.29,fp,3)*.2),.3,far);
    /* The line comes and goes along the beach: whole stretches have none. */
    float wPres=band>0.?smoothstep(.34,.56,nz(vec2(p.x*.3,p.y)+19.,220.,fp,0)*.65+nz(p+5.,52.,fp,1)*.35):0.;
    float wr=band*clump*wPres*(.35+.65*smoothstep(.35,.6,nz(p,13.,fp,1)))*mix(1.,.6,far);
    /* Kelp and wood on temperate beaches; dark seagrass on tropical ones. */
    vec3 weed=tropic?mix(vec3(.065,.06,.04),vec3(.20,.18,.12),smoothstep(.35,.75,nz(p,.53,fp,2)))
                    :mix(vec3(.13,.11,.07),vec3(.30,.26,.18),smoothstep(.3,.7,nz(p,.53,fp,2)));
    sand=mix(sand,weed,wr*.7);
    /* An older line from a higher tide or a storm, higher up: thinner, more broken and bleached by the
       sun, on some stretches. */
    /* Not where the beach is nearly flat (a berm top): there the distance worked out from height wanders
       across the sand, and the line became a winding pale track that read as a footpath. Bleaching is
       drawn as the sand's own colour, greyed and a little lighter, so it shows on dark and pale sand alike. */
    float band2=(1.-smoothstep(halfM*.2,halfM*.7,abs(dm-3.5-4.*n5)))*smoothstep(.012,.03,length(g3));
    if(band2>0.){
      float wr2=band2*mix(smoothstep(.6,.72,nz(p+9.,1.6,fp,0)*.5+nz(p,.6,fp,2)*.5),.25,far)*smoothstep(.5,.66,nz(vec2(p.x*.3,p.y)+41.,170.,fp,1));
      sand=mix(sand,mix(sand,vec3(dot(sand,vec3(.3,.5,.2))),.6)*.92,wr2*.6);
    }
    /* Heavy minerals: dark lenses on the upper beach, drawn out along the shore, on some stretches of
       temperate beaches (tropical sand is coral and shell, with none). */
    float zone=smoothstep(hw*.45,hw*.8,hy)*(1.-smoothstep(hw+.5,hw+1.5,hy));
    if(!tropic&&zone>0.){
      float mk=smoothstep(.6,.76,nz(vec2(p.x*.3,p.y)+33.,280.,fp,1));
      if(mk>0.){
        float lens=smoothstep(.55,.75,nz(vec2(p.x*1.5,p.y*.45)+7.,31.,fp,0)*.75+nz(vec2(p.x*1.6,p.y*.6),9.,fp,0)*.25);
        sand=mix(sand,sand*vec3(.62,.60,.60),mk*lens*zone*.45);
      }
    }
    /* Swash marks: where each wave stopped, a thin line of scallops bulging up the beach, a few at
       different heights on the lower beach. Each arc's position is set in metres across the ground, from
       the slope over a few metres, so the lines don't wander where the beach is flat (when they followed
       height alone they became long dashed lines that read as cracks from the air). Too fine to see
       beyond about 40 m. (High-quality renders work at 4K, so fp is half what it is live.) */
    float swK=(1.-smoothstep(.025,.06,fp))*smoothstep(.015,.035,gSlope)*smoothstep(-.1,.1,hy)*step(hy,hw*.75+1.4*length(g3));
    if(swK>0.){
      float slm=max(length(g3),.006),wob=.12*(nz(p,3.3,fp,1)-.5);
      for(int k=0;k<3;k++){
        /* Arcs of uneven width (the cell coordinate is warped), uneven strength, and broken in places. */
        float fk=float(k),W=4.+3.5*hh(vec2(fk,7.)).x;
        float yy=p.y/W+fk*.37+.7*vn(vec2(p.y/(W*2.3),fk*3.1)),ci=floor(yy),t=fract(yy)*2.-1.;
        vec2 hr=hh(vec2(ci,fk*13.1+3.));
        float reach=hw*(.22+.16*fk+.10*hr.x);
        float dm=(hy-reach)/slm-(.35+.9*hr.y)*(1.-t*t)+wob;
        float on=step(.22,hr.y)*(.35+.65*hr.x)*smoothstep(-.15,.2,vn(p*vec2(.4,1.1)+fk*5.));
        float ln=(1.-smoothstep(.02,.045+fp*1.3,abs(dm)))*on;
        /* A dark line of fine grains, with a faint pale fringe of dried foam just above it. */
        sand*=1.-.11*swK*ln;
        sand*=1.+.05*swK*smoothstep(.02,.12,dm)*(1.-smoothstep(.12,.35,dm))*on;
      }
    }
    /* Shells and pebbles, densest along the tide line; on tropical beaches bleached coral rubble. */
    if(fp<.03){
      vec2 cg=p/.32, ci=floor(cg), hv=hh(ci), hv2=hh(ci+17.3);
      float dens=.10+.45*band*wPres+.12*(1.-smoothstep(.1,hw,hy));
      if(hv.x<dens){
        vec2 o=(.25+.5*hv2)-fract(cg);
        float r=(.045+.07*hv.y)*(tropic?1.25:1.);
        float d=length(o*vec2(1.,.7+.6*hv2.x));
        float s=1.-smoothstep(r*.6,r,d);
        vec3 pc=tropic?(hv2.y<.75?vec3(.86,.84,.79):vec3(.55,.50,.42))
                      :hv2.y<.45?vec3(.78,.74,.66):hv2.y<.8?vec3(.30,.28,.25):vec3(.12,.11,.10);
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
    /* The dark band at the water's edge: as high as the waves throw spray (uSwH, as in rockSurface), and
       none on a lake. It reached 3.5 m down, so every rock under shallow water had a near-black skirt,
       which outlined it seen from above (the audit, tech log 78, item 9). */
    float tide=(1.-smoothstep(.2,(.4+1.5*uSwH)*(1.+.6*n2),y))*smoothstep(-1.5,-.3,y)*smoothstep(.05,.5,uSwH);
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
    float fK=smoothstep(2.5,9.,fp);
    vec3 forest=mix(woodA,woodB,smoothstep(.28,.72,big*.5+mix(mdl,big,fK)*.3+mix(n5,.5,fK)*.2));
    float fineG=nz(p,5.1,fp,3)*.5+n3*.3+n4*.2;
    /* Far away the small noise layers (tiles of 23 to 71 m) repeat so many times across the picture that
       their pattern lined up into stripes, like ploughed fields running to the horizon; there the variety
       comes from the large patterns alone (woods and clearings, and the 431 m layer). */
    float farK=smoothstep(2.5,9.,fp);
    mdl=mix(mdl,big,farK); fineG=mix(fineG,.5,farK);
    vec3 ground=open*(.70+.60*smoothstep(.25,.75,mdl*.5+mix(n2,.5,farK)*.5))*(.72+.56*fineG);
    /* Far away, plant colour averages in. Up close, the crowns themselves supply it. */
    float nearK=1.-smoothstep(.6,2.4,fp);
    if(uCardD>0.) nearK*=1.-smoothstep(uCardD*.55,uCardD*.8,gT);
    vec3 v=mix(ground,forest,wood*(1.-nearK*.82));
    v*=.82+.36*mix(n2,.5,farK);
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
/* How near the waves this point is, 0 to 1: the share of the ground within about 25 m that the water
   has wetted lately (the simulation's wet marks, tFx.b, averaged). Beyond the simulated stretch, 1. Rock
   blackened by spray, or dark and wet, only near the sea: a low rock in the sand of the back beach, under
   3 m above the sea but far from the waves, showed as a black smudge (Broken coast, 23 November). */
float seaNear(vec2 xz,float w){ return w>0.?mix(1.,smoothstep(.04,.25,textureLod(tFx,dUV(xz),5.).b),min(w*4.,1.)):1.; }
float gSeaNear=1.;
void rockSurface(vec3 P,vec3 Ng,float fp,float k,inout vec3 alb,inout vec3 Nd){
  vec3 w=triW(Ng);
  vec4 big=triN(P,w,23.,fp),mid=triN(P,w,6.1,fp);
  vec3 g=vec3(0.);
  /* On steep faces the large stone texture's bumps are soft and round: from 100 m and more they read as
     smudges of soot, not stone (the author's "painted" rock, section 80). There the blocks below give the relief. */
  float stp0=1.-smoothstep(.35,.7,Ng.y);
  vec2 rA=triRock(P,w,37.,fp,g,mix(.6,.18,stp0)),rB=triRock(P,w,8.3,fp,g,mix(.8,.45,stp0));
  /* Close up, a finer layer of the same stone keeps the surface gritty rather than smooth like putty.
     It starts a little further out than it did (.035 m per pixel): low passes saw putty-smooth faces. */
  float fineK=1.-smoothstep(.02,.06,fp);
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
  r=mix(r,r3,smoothstep(.50,.74,mid.r)*.2);
  /* Rock is seldom one grey (the author, 23 November, Broken coast: "I don't often see that boring gray in
     nature"): over tens of metres it wanders between warmer browns and cooler blue-greys, and some beds
     are buff or rusty. */
  {
    float hueW=textureLod(tNoise,P.xz/210.+.71,0.).g*.6+big.b*.4;
    r*=mix(vec3(1.14,1.,.82),vec3(.88,.97,1.08),smoothstep(.35,.65,hueW));
    float bedC=textureLod(tNoise,vec2((P.y+dip+wob)*.043,.83),0.).r;
    r*=mix(vec3(1.),vec3(1.22,1.05,.8),smoothstep(.55,.8,bedC)*.7*(1.-uGranite));
  }
  float steepF=1.-smoothstep(.35,.7,Ng.y);
  /* Water running down steep faces leaves long dark streaks. (Round dark blotches alone made the cliffs
     look camouflaged.) */
  {
    vec2 tn=normalize(vec2(-Ng.z,Ng.x)+1e-4);
    float stk=smoothstep(.5,.72,textureLod(tNoise,vec2(dot(P.xz,tn)/9.,P.y/70.+.5),max(log2(max(fp,1e-3)*512./9.),0.)).g);
    r*=1.-.3*stk*steepF*(1.-uGranite);
  }
  if(uGranite>0.){
    /* Granite: pale grey with a pink cast and no beds. Rain draining down steep sides leaves dark streaks. */
    vec3 gr=mix(vec3(.25,.225,.205),vec3(.42,.385,.35),smoothstep(.3,.7,big.g*.6+mid.r*.4));
    vec2 tn=normalize(vec2(-Ng.z,Ng.x)+1e-4);
    float stk=smoothstep(.52,.70,textureLod(tNoise,vec2(dot(P.xz,tn)/14.,P.y/90.+.3),0.).g);
    gr*=1.-.38*stk*steepF;
    /* A coast's own shade of the stone (rockTone in js/scenes.js): the Alpine lake's mountains are a
       darker, cooler grey than Palm cove's boulders; pale like those, whole mountainsides read as plaster.
       Over hundreds of metres the tone wanders, as rock does from one buttress to the next. */
    gr*=uRockTone*(.8+.4*textureLod(tNoise,P.xz/430.+.13,0.).b);
    /* Seen from above (the author, 22 November, the Alpine lake's shore: "the rock ... looks unnatural, like the
       color/texture"), granite's tops are paler than its sides, bleached and weathered, and crusted with
       lichen: pale grey-green patches and small dark ones, a few metres and a hand's breadth across. */
    float upG=smoothstep(.55,.9,Ng.y);
    gr*=mix(1.,1.18,upG);
    /* Where a pixel covers more than the patches (from a height), the noise averages out and the patches
       would vanish: there they become the share of rock they cover, an even tint that still varies over
       tens of metres. */
    float pb=nz(P.xz,13.,fp,1), fk=smoothstep(.03,.2,fp);
    float l1=mix(smoothstep(.55,.64,pb*.45+nz(P.xz,3.3,fp,2)*.35+nz(P.xz,.85,fp,3)*.2),.5*smoothstep(.3,.7,pb),fk);
    float l2=mix(smoothstep(.62,.7,nz(P.xz+7.,2.1,fp,3)*.6+nz(P.xz,.6,fp,0)*.4),.18,fk);
    gr=mix(gr,vec3(.40,.41,.36)*max(uRockTone,vec3(.75))*1.15,l1*upG*.5);
    gr=mix(gr,vec3(.06,.065,.055),l2*upG*.45);
    r=mix(r,gr,uGranite);
  }
  /* Weathering tone, and a few wandering cracks from the stone texture. */
  r*=.75+.27*rA.y+.24*rB.y;
  r*=.82+.36*rC.y;
  float crA=smoothstep(.42,.66,big.r*.5+mid.b*.5);
  r*=1.-.30*rA.x*crA-.18*rB.x-.15*rC.x*fineK;
  /* Cliffs are built of beds: on steep faces each bed boundary is a recessed, shadowed line,
     and the beds weather to slightly different tones. */
  /* Their thickness varies with height (it was an even 1.9 m, which read as a stack of plates), and only
     some boundaries are marked strongly. */
  float bedY=(P.y+dip+wob*.35)/1.9+.55*sin(P.y*.23+.7)+.3*sin(P.y*.71+1.3);
  float bedT=fract(sin(floor(bedY)*12.9898)*43758.5453);
  float bF=fract(bedY);
  float bedL=(1.-smoothstep(.03,.17,bF))*(.5+.5*smoothstep(.3,.6,mid.b))*mix(.25,1.,bedT*bedT);
  /* Each bed's top edge is rounded back and catches the light from above; its foot is undercut where the
     softer layer beneath has worn away, and faces down into shadow. So the beds read by light and shade, as
     ledges, rather than as stripes of colour. */
  {
    float bK=steepF*(1.-uGranite)*(1.-smoothstep(.12,.45,fp))*mix(.35,1.,bedT);
    g+=vec3(0.,1.,0.)*bK*(.85*(1.-smoothstep(0.,.16,bF))-.5*smoothstep(.76,1.,bF));
  }
  r*=1.-steepF*(.26*bedL-.12*(bedT-.5))*(1.-smoothstep(.15,.6,fp))*(1.-uGranite);
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
    float stA0=stA,stB0=stB;
    stA*=(1.-smoothstep(.7,.95,abs(dot(Ng,nA))))*(1.-.6*uGranite);
    stB*=(1.-smoothstep(.7,.95,abs(dot(Ng,nB))))*(1.-.75*uGranite);
    float aa=max(fp,.004);
    float wA=.035+.06*stA,wB=.025+.04*stB;
    float cA=stA*(1.-smoothstep(wA,wA+aa,dA))*min(1.,wA*2.5/aa);
    float cB=stB*(1.-smoothstep(wB,wB+aa,dB))*min(1.,wB*2.5/aa);
    r*=1.-.62*max(cA,cB*.85)*jFade;
    /* Each block between joints and beds weathers to its own tone. */
    vec2 bt=hh(vec2(iA*1.73+bedI*.61,iB*2.31+bedI*7.7));
    r*=mix(1.,mix(.86+.30*bt.x,.76+.44*bt.x,uGranite),jFade);
    /* Granite seen from above (the Alpine lake's shore, 2 stars: "a flat pale sheet like concrete"): its
       main cracks are not hairlines but bands a hand to an arm wide holding soil, moss and grass, and they
       cut the bare rock into sheets. */
    if(uGranite>0.){
      float upC=smoothstep(.5,.85,Ng.y)*uGranite*jFade;
      float wfA=.08+.4*stA0*stA0, wfB=.05+.22*stB0*stB0;
      float fill=max(stA0*(1.-smoothstep(wfA*.4,wfA+aa,dA)),.8*stB0*(1.-smoothstep(wfB*.4,wfB+aa,dB)));
      float mos=nz(P.xz,1.7,fp,1);
      vec3 fillC=mix(vec3(.050,.046,.038),vec3(.075,.095,.035),smoothstep(.4,.65,mos));
      r=mix(r,fillC,fill*upC*.9);
    }
    /* Block edges are rounded, curving down into each joint, and each block sits at its own tilt. */
    float nF=1.-smoothstep(.05,.35,fp);
    if(nF>0.){
      float gA=.20+.22*stA,gB=.14+.16*stB;
      g+=(nA*sA*stA*max(1.-dA/gA,0.)*.9+nB*sB*stB*max(1.-dB/gB,0.)*.7)*nF;
      g+=vec3(bt.y-.5,0.,fract(bt.x*7.3)-.5)*.10*nF;
    }
    /* Each block is a flat facet of its own, turned a little sideways and up or down from the face as a
       whole, so the light falls on it at its own angle: a cliff is a mosaic of planes with sharp edges.
       Without this its shading came only from the land's shape, which on a near-vertical face is the
       same all the way up, and read as streaks smeared down the cliff. */
    /* On flat rock the edges of the thin beds crop out as low steps, all facing the same way across the
       shelf, each a gentle back rising to a short drop in shadow: a wave-cut shelf is ribbed like that,
       not smooth (Broken coast, the audit's item 4). Only some edges make a step. */
    {
      float fl=smoothstep(.6,.88,Ng.y)*(1.-uGranite)*(1.-smoothstep(.12,.5,fp));
      if(fl>0.){
        float sB=dot(P.xz,jA)/1.4+1.2*(textureLod(tNoise,P.xz/23.+.4,0.).r-.5);
        float fB=fract(sB), on=step(.4,hh(vec2(floor(sB),7.3)).x);
        float drop=smoothstep(.8,.96,fB);
        g+=vec3(jA.x,0.,jA.y)*fl*on*(.14-1.1*drop);
        r*=1.-.22*fl*on*drop;
      }
    }
    /* On flatter rock, a shelf or a slab top, the blocks are slabs each tilted a little its own way. */
    float fK=(1.-smoothstep(.3,.85,fp))*mix(.6,1.,steepF)*(1.-.4*uGranite);
    if(fK>0.){
      vec3 Nh=normalize(vec3(Ng.x,0.,Ng.z)+1e-4), Tf=vec3(-Nh.z,0.,Nh.x);
      vec2 fb=hh(vec2(iA*3.17+bedI*1.91,iB*1.37-bedI*5.3))*2.-1.;
      g+=mix(vec3(fb.x,0.,fb.y)*.2,Tf*fb.x*.42+vec3(0.,fb.y*.26,0.),steepF)*fK;
    }
  }
  /* Lichen on upward faces above the spray; black and green growth at the water */
  float upF=smoothstep(.45,.85,Ng.y);
  r=mix(r,vec3(.30,.285,.17),smoothstep(.58,.74,big.b*.5+mid.g*.5)*smoothstep(3.,9.,P.y)*upF*.55);
  /* Real sea rock is zoned and streaked, and close up these are what make it read as rock rather than
     moulded clay (seen on low passes: "rocks look very unnatural"). Streaks hang down steep faces below
     the ledges: dark where rain drains, pale where salt and birds' droppings dry. Orange lichen grows in
     patches on the faces the spray reaches, above the black band; just above the water a pale band of
     barnacles. Granite's own streaks are above. */
  /* Only close enough to see them, and only where they grow: these are extra texture reads on every rock
     pixel otherwise. */
  float stK=steepF*(1.-uGranite)*(1.-smoothstep(.25,1.2,fp));
  if(stK>.01){
    vec2 tn=normalize(vec2(-Ng.z,Ng.x)+1e-4);
    float sx=dot(P.xz,tn), sLod=max(log2(max(fp,1e-3)*512./3.2),0.);
    vec4 sA=textureLod(tNoise,vec2(sx/3.2,P.y/38.+.17),sLod);
    float hang=smoothstep(.3,.9,fract((P.y+dip+wob*.35)/1.9));
    r*=1.-.34*stK*smoothstep(.55,.78,sA.b)*(.5+.5*hang);
    r=mix(r,vec3(.36,.35,.32),stK*smoothstep(.66,.84,sA.a)*smoothstep(2.,6.,P.y)*.45);
  }
  float ornB=smoothstep(1.6,3.2,P.y)*(1.-smoothstep(9.,16.,P.y))*(1.-uGranite);
  if(ornB>0.){
    float orn=smoothstep(.56,.70,mid.a*.6+big.a*.4)*ornB;
    r=mix(r,vec3(.42,.22,.055),orn*(.45+.4*upF)*.7);
  }
  /* The black band is as high as the waves throw their spray (uSwH): on a calm shore, as at Palm cove, a
     band 3 m high blackened the foot of every boulder on the beach, so they were white on top and dark
     grey below (the author, 23 November: "weird two-toned dark gray + white"). A lake has none. */
  float bandH=.4+1.5*uSwH;
  /* Black lichen grows only at the top of the band. Below it, where every wave washes, the rock keeps
     its own colour, darker, with weed: brown and olive on the flatter surfaces, bright green in patches.
     The whole band was near black, so a wave-washed rock shelf was one flat dark grey (the author, 23 November,
     Broken coast: "that boring gray"). */
  float bTop=bandH*(1.+.6*mid.r);
  float splash=(1.-smoothstep(.2,bTop,P.y))*smoothstep(.05,.5,uSwH)*gSeaNear;
  float bUp=smoothstep(.3*bTop,.6*bTop,P.y);
  r=mix(r,vec3(.030,.031,.030)*(.7+.8*mid.r),splash*bUp*.8);
  float weed=smoothstep(.42,.68,big.g*.6+mid.g*.4);
  r=mix(r,mix(r*.8,vec3(.085,.066,.032)*(.8+.4*mid.b),weed*(.45+.5*upF)),splash*(1.-bUp)*.85);
  r=mix(r,vec3(.05,.085,.032),splash*(1.-bUp)*upF*smoothstep(.6,.78,big.b*.5+mid.r*.5)*.6);
  /* Below the black band, where the waves wash most, barnacles crust the steep faces grey. */
  float barn=smoothstep(-.3,.2,P.y)*(1.-smoothstep(.7,1.2+.5*mid.g,P.y))*smoothstep(.45,.6,mid.b*.7+big.r*.3);
  r=mix(r,vec3(.15,.145,.13)*(.7+.6*mid.a),barn*(.3+.4*steepF)*(1.-uGranite));
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
    vec3 rip=ripple(Q.xz,fp,mix(.65,1.,mq.g<.5?1.:0.)*(1.-mq.g)*(1.-mq.a*.7));
    float e=max(.42,fp*1.2);
    vec3 Nq=terrN(Q.xz,e);
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

/* ------ What every stage of the view needs: the ray, the surface under it, the ground there ------ */
/* The pictures the stages hand on to each other (see the stages below). */
uniform sampler2D tGA0,tGA1,tGB0,tGB1;
/* ---- A waterfall (fall in js/scenes.js; the land is cut for it in js/shaders/terrain.js, and
   fallMeasure in js/world.js finds its lip and foot) ----
   The land is one height for each spot, with no overhangs, so the water is drawn on the ground it runs
   over: a stream across the cliff top, then white water down the face. uFallA: the lip's x and height, the
   stream's place along the coast, on or off. uFallB: the foot's x and height, about where the lip is
   (as terrain.js has it).
   The white water is streaks of noise that travel with the flow. Along the stream they are placed by the
   time the water takes to get there (a): upstream of the lip, the distance at walking pace; on the face,
   the time a body sliding down has been falling, which grows with the square root of the drop. So the
   streaks stretch as they speed up, as falling water does. The sheet widens and tears into strands on its
   way down. Out: how much of the pixel is water, how white it is, and how wet the rock beside it. */
uniform vec4 uFallA[2],uFallB[2],uFallC[2];
/* Up to two falls (fallUniforms in js/world.js), each: uFallA the lip's x and height, the stream's place
   along the coast (z), on or off; uFallB the foot's x and height, about where the lip is; uFallC the way
   the water runs (+1 toward larger x), a width factor, how far upstream the stream is drawn, and the kind:
   0 a fall over a cliff, 1 a cascade down a stair of steps (white only where it drops, dark in the pools
   between, judged by how steep the ground is), 2 a thread far off on a mountainside, which wanders as it
   runs down. */
float fallZ(int i,float x){
  float dx=x-uFallB[i].z, dn=dx*uFallC[i].x;
  float z=uFallA[i].z+5.*sin(dx*.05)*smoothstep(-20.,-80.,dn);
  if(uFallC[i].w>1.5) z+=(22.*sin(dn*.0071+1.3)+7.*sin(dn*.029))*smoothstep(0.,60.,dn);
  /* A cascade wanders from side to side (fallZ in js/shaders/terrain.js, the same line). */
  else if(uFallC[i].w>.5) z+=6.*sin(dx*.032+.7)+2.5*sin(dx*.097+2.1);
  return z;
}
void fallOne(int i,vec3 P,float fp,float ny,inout float cov,inout float white,inout float wetK){
  vec4 A=uFallA[i],B=uFallB[i],C=uFallC[i];
  if(A.w<.5) return;
  float dir=C.x, up=dir*(A.x-P.x);
  if(up>C.z||dir*(P.x-B.x)>8.) return;
  float drop=max(A.y-P.y,0.), face=smoothstep(.6,3.,drop);
  /* A cascade is white only where it drops over a step, and dark, clear water in the runs and pools
     between (how steep the ground is says which). Whitening the whole way down because it had dropped
     from the top made it a white chute (the author, 22 November: "the waterfall at the top and bottom doesn't
     look very natural"). */
  bool casc=C.w>.5&&C.w<1.5;
  if(casc) face=smoothstep(.93,.72,ny);
  /* A far thread shows where the mountainside is steep; on the gentle slope below it is a faint stream,
     mostly hidden. (Drawn the same all the way down, it read as a road.) */
  float steepK=C.w>1.5?mix(.12,1.,smoothstep(.9,.72,ny)):1.;
  float fz=P.z-fallZ(i,P.x)+1.1*sin(drop*.23+1.7)*smoothstep(4.,16.,drop);
  float hw=casc?(1.6+.9*face+.4*sin(drop*.37+fz*.2))*C.y:(1.3+1.1*face+.055*min(drop,60.))*C.y;
  float x=abs(fz)/hw;
  if(x>3.2) return;
  float a=sqrt(drop/3.4)-max(up,0.)/1.7-uTime;
  float lod=clamp(log2(max(fp,.002)/.012),0.,7.);
  float n1=textureLod(tNoise,vec2(fz/2.6,a*.42),lod).r, n2=textureLod(tNoise,vec2(fz/.95+.37,a*1.05),lod+.5).g;
  float n3=textureLod(tNoise,vec2(fz/7.,a*.16+.5),lod).b;
  float strand=n1*.55+n2*.45;
  float edge=1.-smoothstep(.5,1.,x+(n1-.5)*.6+(n3-.5)*.3);
  /* A full sheet at the lip; lower down, gaps open where the strands thin. */
  float full=1.-smoothstep(6.,42.,drop)*.75;
  float veil=smoothstep(.22,.46,strand+.42*full);
  float upK=smoothstep(C.z,C.z*.86,up);
  float c=edge*mix(.92,veil,face)*upK*steepK;
  /* A fall over a cliff has its water as a sheet in the air (js/shaders/fall.js): on the rock behind it,
     only a film of water and a few white trickles. */
  if(C.w<.5) c*=mix(1.,.3,face);
  if(c<=cov) return;
  cov=c;
  /* On top: dark, glassy water with soft white riffles, whitening as it nears the lip. On the face: white,
     dimmer between the strands. */
  float rif=textureLod(tNoise,vec2(fz/9.,a*.11),max(lod-1.5,0.)).r*.6+n3*.4;
  /* Upstream the water is dark and clear, with a few bright riffles where it runs over stones (it was a
     pale grey ribbon), whitening only in the last few metres before the lip. */
  white=mix(max(smoothstep(.72,.9,rif)*.35,smoothstep(7.,1.,up)*.85),.58+.42*smoothstep(.3,.72,strand),face);
  /* Below a step the water is still churned: a little foam drifting on the pool. */
  if(casc) white=max(white*mix(.35,1.,face),.25*smoothstep(.55,.85,n2)*(1.-face));
  wetK=max(wetK,(1.-smoothstep(.9,casc?4.:2.8,x+(n3-.5)*.5))*(casc?.7+.3*face:.35+.65*face)*upK);
}
void fallAt(vec3 P,float fp,float ny,out float cov,out float white,out float wetK){
  cov=0.; white=0.; wetK=0.;
  fallOne(0,P,fp,ny,cov,white,wetK);
  fallOne(1,P,fp,ny,cov,white,wetK);
}
/* The view ray through this pixel; pa is the angle one pixel covers. */
vec3 viewRay(out float pa){ vec2 ndc=vUV*2.-1.+uJit; pa=2.*uTan/uResY; return normalize(uF+uR*ndc.x*uTan*uAspect+uU*ndc.y*uTan); }
/* The depth-buffer value of a point t along the ray. */
float viewDepth(float t,vec3 rd){ return clamp((uDA+uDB/max(t*dot(rd,uF),3.))*.5+.5,0.,1.); }
/* The surface where the view ray meets it, and the state of the water there: the point P, how far along
   the ray (t), the size of a pixel on the ground (fp), how far inside the solved region (w, wf), the
   ground's and the water's heights (T, eta), the water's depth and the film on the sand, the solver's
   pictures (rm0, rm1, fx, adv), and how much of the pixel is water (wa: 0 dry, 1 water). */
struct Surf{ vec3 P; float t,fp,cosI,w,wf,T,eta,dp,film,wa; vec2 uv; vec4 rm0,rm1,fx,adv; };
Surf surfAt(vec3 rd,float t,float pa){
  Surf s; vec3 P=uRo+rd*t; s.P=P; s.t=t; gT=t;
  float cosI=max(-rd.y,.03); s.cosI=cosI;
  float fp=pa*t/pow(cosI,.28); s.fp=fp;
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
  s.uv=uv; s.w=w; s.wf=wf; s.T=T; s.eta=eta; s.dp=dp; s.film=film; s.wa=wa; s.rm0=rm0; s.rm1=rm1; s.fx=fx; s.adv=adv;
  return s;
}
/* The ground's material (m, as terrS) and its normal at P, as every ground stage needs them. Also sets
   gSlope. */
vec3 groundBase(vec3 P,float fp,float w,out vec4 m){
  m=terrS(P.xz);
  vec3 N=terrN(P.xz,mix(26.,max(m.g>.3?uDx*.75:.3,min(fp*1.5,14.)),w));
  if(uType==2){ float bare=smoothstep(.62,.84,N.y); m.g=max(m.g,(1.-bare)*step(4.,P.y)*(1.-m.a*uMixed)); m.b*=bare; }
  gSlope=clamp(length(N.xz)/max(N.y,.05),.004,.5);
  return N;
}
/* Sun and sky reaching the ground at p. Close up on rock the sun's shadow edge is softened. */
vec2 litGround(vec2 p,float fp,float w,float rock){
  vec2 lit=litAt(p);
  if(rock>.2&&fp<.25&&w>=1.){
    vec2 tx=2.2/vec2(textureSize(tLit,0)),u0=dUV(p);
    lit.x=.2*lit.x+.2*(textureLod(tLit,u0+tx,0.).r+textureLod(tLit,u0-tx,0.).r+textureLod(tLit,u0+vec2(tx.x,-tx.y),0.).r+textureLod(tLit,u0+vec2(-tx.x,tx.y),0.).r);
  }
  return lit;
}
/* The foam at the surface: the foam field, and white water along the front of a very steep wave face in
   shallow water, which is breaking whatever the foam field says. Without it, such a wave reads as a glass
   ridge. */
float foamAt(Surf s,float wa){
  float foam=s.fx.r;
  if(s.w>0.&&wa>.5){
    float stp=length(s.rm1.xy);
    /* In deeper water it takes a steeper face to break. */
    float thr=mix(.20,.36,smoothstep(1.,4.,s.film));
    float crestF=smoothstep(thr,thr+.16,stp)*smoothstep(.05,.25,s.film)*(1.-smoothstep(5.,9.,s.film))*s.w;
    crestF*=smoothstep(.30,.62,textureLod(tNoise,s.P.xz/7.3+vec2(uSimT*.031,-uSimT*.017),0.).g*.7+textureLod(tNoise,s.P.xz/2.1,0.).a*.3);
    foam=max(foam,crestF*.95);
  }
  return foam;
}
/* A direction packed into two numbers and back (an octahedral map), to hand a normal from one stage to
   the next. */
vec2 octEnc(vec3 n){ n/=abs(n.x)+abs(n.y)+abs(n.z); return n.y>=0.?n.xz:(1.-abs(n.zx))*vec2(n.x>=0.?1.:-1.,n.z>=0.?1.:-1.); }
vec3 octDec(vec2 e){ vec3 n=vec3(e.x,1.-abs(e.x)-abs(e.y),e.y); if(n.y<0.) n.xz=(1.-abs(n.zx))*vec2(n.x>=0.?1.:-1.,n.z>=0.?1.:-1.); return normalize(n); }
`;

/* ====== The view, drawn in four stages, each a program of its own (renderHDR in js/frame.js) ======

   It used to be one program. Windows' shader compiler inlines every function, and its time grows with about
   the fourth power of the size: the one program took two minutes to compile at every start. Cut into
   stages, the slowest takes a few seconds, and they compile side by side. Each stage is VIEW_LIB (every
   function above; a stage keeps only those it calls) plus a short main below. Measured 13 November 2026:
   the whole ground in one program 67 s; as stages A, B and C 8, 5 and 3 s; the water 3 s.

   Z  (added 15 November 2026) a quarter-size first pass of the march, so A can skip the empty air.
        writes  z: how far along its ray each block of 4 x 4 pixels may start (r)
   A  finds the surface under each pixel (the march) and starts the ground: its colour, the plant cover on
      it, and the litter under the plants.
        writes  gA0: ground colour (rgb), how sandy (a)
                gA1: the slope litter adds (xy), distance along the ray (z; below 0 is sky), water (w)
                the depth buffer
   B  adds what lies on and shapes the ground: driftwood, wind ripples, the rock's surface.
        reads gA0, gA1; writes
                gB0: ground colour (rgb), how sandy (a)
                gB1: the detailed normal (xy, packed), driftwood (z), driftwood's shadow on the sand (w)
                the depth buffer, where driftwood stands in front of the ground
   C  lights the ground: snow, the canopy of distant woods, people's towels and shadows, wet sand; and draws
      the sky. Reads gA1, gB0, gB1; writes the picture (alpha: 1 ground and sky, 0 water, for FS_TAA).
   W  the water, foam, drifting spray and the haze of distance, laid over C's picture by blending: it
      writes the light it adds (rgb) and how much of what is under it still shows (a).

   A stage that needs something new from an earlier one gets it through gA or gB: add it to a spare
   channel there, or work it out again from the surface (surfAt, groundBase). Keep each stage small: a
   stage that grows past about 10 s to compile should be cut in two. tools/checks/start.js fails if any
   shader takes more than 30 s. */
/* Z: before A, at a quarter of the size each way: how far each block of pixels can go before it comes
   near the surface (march above). uConeK: the cone's radius in pixels (4; the block's half-diagonal is 2.8). */
const FS_VIEW_Z=VIEW_LIB+`
layout(location=0) out vec4 oZ;
void main(){ float pa; vec3 rd=viewRay(pa); gCone=pa*uConeK; oZ=vec4(march(uRo,rd),0.,0.,0.); }`;
const FS_VIEW_A=VIEW_LIB+`
layout(location=0) out vec4 oA0; layout(location=1) out vec4 oA1;
void main(){
  float pa; vec3 rd=viewRay(pa);
  if(uPre>.5){
    ivec2 zs=textureSize(tZ,0), q=clamp(ivec2(floor((gl_FragCoord.xy-2.)/4.)),ivec2(0),zs-2);
    gT0=min(min(texelFetch(tZ,q,0).r,texelFetch(tZ,q+ivec2(1,0),0).r),min(texelFetch(tZ,q+ivec2(0,1),0).r,texelFetch(tZ,q+ivec2(1,1),0).r));
  }
  float t=march(uRo,rd);
  oA0=vec4(0.);
  if(t<0.){ gl_FragDepth=1.; oA1=vec4(0.,0.,-1.,0.); return; }
  Surf s=surfAt(rd,t,pa);
  gl_FragDepth=viewDepth(t,rd);
  oA1=vec4(0.,0.,t,s.wa);
  /* Open water: nothing of the ground shows. */
  if(s.wa>=.999) return;
  vec3 P=s.P; float fp=s.fp;
  vec4 m; groundBase(P,fp,s.w,m);
  float rg;
  vec3 alb=groundAlb(P.xz,P.y,m,fp/pow(s.cosI,.18),rg);
  float sandness=(1.-m.g)*(1.-m.b);
  /* The ground at the plants' feet: litter, sand mounds, the seat of the stems (litterField). */
  vec2 litSl=vec2(0.);
  if(m.b>.01&&m.g<.5){ float gc=groundCover(P.xz,fp,m.b,alb,litSl); sandness*=1.-.8*gc; }
  if(m.b>.004&&m.g<.6&&uCardD>0.){
    vec4 lf; vec3 md; float pf;
    litterField(P.xz,m,fp,lf,md,pf);
    if(lf.x+lf.y+lf.w+md.z+pf>.002) litterShade(P.xz,fp,lf,md,pf,alb,litSl,sandness);
  }
  oA0=vec4(alb,sandness); oA1.xy=litSl;
}`;
const FS_VIEW_B=VIEW_LIB+`
layout(location=0) out vec4 oB0; layout(location=1) out vec4 oB1;
void main(){
  ivec2 px=ivec2(gl_FragCoord.xy);
  vec4 a1=texelFetch(tGA1,px,0);
  float t=a1.z;
  oB0=vec4(0.); oB1=vec4(0.,0.,0.,1.);
  if(t<0.){ gl_FragDepth=1.; return; }
  float pa; vec3 rd=viewRay(pa);
  if(a1.w>=.999){ gl_FragDepth=viewDepth(t,rd); return; }
  Surf s=surfAt(rd,t,pa);
  vec3 P=s.P; float fp=s.fp,T=s.T; vec4 fx=s.fx;
  vec4 a0=texelFetch(tGA0,px,0);
  vec3 alb=a0.rgb; float sandness=a0.a; vec2 litSl=a1.xy;
  vec4 m; vec3 N=groundBase(P,fp,s.w,m);
  /* Driftwood, fronds and coconuts at the back of the beach (beachDebris). */
  vec2 debSl=vec2(0.); float debCov=0.,debSh=0.,debK=0.,debT=0.; vec3 debN=vec3(0,1,0);
  if(sandness>.3&&m.g<.2) beachDebris(P,rd,fp,uType==0||uFlora==0,alb,debSl,debCov,debSh,debN,debK,debT);
  /* A log stands in front of the ground point: what is drawn later is hidden behind it. */
  gl_FragDepth=viewDepth(debK>.5?t-debT:t,rd);
  /* Wind ripples only on dry sand: the swash and the wet belt are smoothed by the water. */
  float dryR=smoothstep(.25,1.,T-uTide)*(1.-smoothstep(.04,.3,fx.b))*(1.-debCov);
  vec3 rp=ripple(P.xz,fp,.55*sandness*dryR);
  vec2 rip=rp.xy+litSl+debSl;
  rip+=(nzSlope(P.xz,29.,fp,.035)+nzSlope(P.xz,7.3,fp,.022))*sandness;
  rip+=(nzSlope(P.xz,71.,fp,.30)+nzSlope(P.xz,17.,fp,.34))*m.b*smoothstep(.6,2.4,fp);
  vec3 Nd=normalize(N+vec3(-rip.x,0.,-rip.y));
  if(debK>0.) Nd=normalize(mix(Nd,debN,debK));
  /* Ripple troughs hold darker grains, so the ripples still read under a cloudy sky. */
  float rpw=1.-smoothstep(.4,1.6,T-uTide);
  alb*=1.+(.03*rp.z/.55-.055*smoothstep(.1,.5,-rp.z/.55))*(.35+.65*rpw);
  if(m.g>.01){ gSeaNear=seaNear(P.xz,s.w); rockSurface(P,N,fp,m.g,alb,Nd); }
  /* debSh is the shadow on the sand behind the log. On the log itself (debK) its own normal shades it:
     the sand's shadow there drew sticks lying in their own shadow dark, like metal tubes. */
  oB0=vec4(alb,sandness); oB1=vec4(octEnc(Nd),debK,1.-.82*debSh*(1.-debK));
}`;
const FS_VIEW_C=VIEW_LIB+`
layout(location=0) out vec4 o;
void main(){
  ivec2 px=ivec2(gl_FragCoord.xy);
  vec4 a1=texelFetch(tGA1,px,0);
  float t=a1.z, wa=a1.w;
  float pa; vec3 rd=viewRay(pa);
  if(t<0.){
    vec4 e=textureLod(tEnv,envUV(rd),0.);
    vec3 L=e.rgb; float cov=e.a;
    /* The clouds as the cloud pass drew them for this pixel, rather than from the sky texture, which is far
       coarser than the screen. */
    /* Read through a small blur (four bilinear reads, about three of its texels across): each of its pixels
       starts its march at its own random point, which the live smoothing averages away over frames, but a
       single picture or a film frame kept as a pattern of dots along every cloud's edge (the audit of
       24 November, TECHLOG 78). */
    if(uCloudPx>0.&&rd.y>0.){
      vec2 cuv=gl_FragCoord.xy/vec2(uResY*uAspect,uResY), ct=.75/vec2(textureSize(tExtra,0));
      vec4 c=.25*(textureLod(tExtra,cuv+ct,0.)+textureLod(tExtra,cuv-ct,0.)+textureLod(tExtra,cuv+vec2(ct.x,-ct.y),0.)+textureLod(tExtra,cuv+vec2(-ct.x,ct.y),0.));
      L=c.rgb; cov=c.a;
    }
    float mu=dot(rd,uSun);
    if(uMoonLit>0.) L+=uSunE*uMoonK*moonDisc(rd,mu,pa)*(1.-cov);
    else L+=uSunE*smoothstep(.99985,.99996,mu)*(1.-cov)*6.;
    if(uStars>0.) L+=uStars*stars(rd,pa)*(1.-cov);
    o=vec4(L,1.);
    return;
  }
  /* Alpha marks water (0) apart from ground and sky (1), for the live smoothing (FS_TAA): foam and
     ripples travel with the water, which the smoothing can't follow, so there it leans on the new frame. */
  o=vec4(0.,0.,0.,1.-clamp(wa,0.,1.));
  if(wa>=.999) return;
  Surf s=surfAt(rd,t,pa);
  vec3 P=s.P; float fp=s.fp,T=s.T,w=s.w,y=P.y; vec4 fx=s.fx;
  vec4 b0=texelFetch(tGB0,px,0), b1=texelFetch(tGB1,px,0);
  vec3 alb=b0.rgb; float sandness=b0.a; vec3 Nd=octDec(b1.xy); float debK=b1.z;
  vec4 m; vec3 N=groundBase(P,fp,w,m);
  vec2 lit=litGround(P.xz,fp,w,m.g);
  float cs=cloudShadow(P);
  lit.x*=b1.w;
  /* Snow on high ground. The snowline wanders, and steep faces shed their snow, so peaks are streaked
     with dark rock. Snow smooths away the rock's small relief.
     the author, 18 November, on the Alpine lake: "mountains & snow don't look natural". The snow was a soft
     wash, thinning gradually with slope, so below the line it left pale smudges and on the peaks a smooth
     white like plastic. Snow lies or it doesn't: its edge is now sharp at the size of a few metres and
     ragged (fine noise moves it), so patches have outlines. On steep faces it stays only in streaks down
     the fall line, the gullies and ledges that hold it, with bare rock ribs between (noise stretched
     down the slope, as the rain streaks on rock are). Below the line only a few gullies keep a patch.
     Its surface has a faint grain of wind crust, and away from the sun it is blue from the sky (the
     lighting does that). */
  /* Beach vines (a preset's mats) seen from afar. the author, 22 November, on a low pass over Surf beach: "The
     green/plants are appearing like they are getting rendered in after the fact ... re-rendered
     differently so it almost looks like a wave [on] the ground as the camera moves". The vines lie flat,
     so from a shallow angle each one's card is a thin sliver, which the cards drop: they showed only
     near the camera, and the edge where they appeared travelled with it. The ground where they grow is
     now their green, as a patch of vines looks from afar, fully where a pixel is wider than a leaf or the
     cards end, and partly close up, under the plants that take over there. */
  if(uVeg>0&&uVegM.x>.5&&uCardS>0.&&m.r>.5&&m.g<.5){
    float mc=fernCov(m.b,0.,P.xz);
    if(mc>0.){
      float far=max(mix(.35,1.,smoothstep(.03,.15,fp)),smoothstep(uCardS*.6,uCardS*.9,length(P-uRo)));
      vec3 vine=vec3(.062,.092,.036)*(.85+.3*nz(P.xz,7.,fp,1));
      alb=mix(alb,vine,min(mc*1.6,.5)*far); sandness*=1.-min(mc*1.6,.6)*far;
    }
  }
  /* Between the tufts of a grass drift (shrubCov) the ground is a low sward of the same grass, so a drift
     reads as one patch, not a scatter of separate tufts on bare sand. */
  if(m.r>.5&&m.g<.5&&m.b>.02){
    float sw=grassDrift(P.xz)*(1.-smoothstep(.25,.6,zoneVeg(m.b)))*smoothstep(.02,.2,m.b)*smoothstep(.35,.7,grassShare(uFlora,m.b));
    if(sw>0.){
      vec3 gc=mix(vec3(.07,.10,.035),vec3(.16,.16,.07),nz(P.xz,2.3,fp,1))*(.75+.5*nz(P.xz,.31,fp,0));
      alb=mix(alb,gc,sw*.8); sandness*=1.-sw*.85;
    }
  }
  float snow=0.;
  if(uSnow>0.&&y>uSnow-500.){
    float sl=y+200.*(nz(P.xz,610.,fp,0)-.5)+60.*(nz(P.xz,97.,fp,1)-.5);
    float high=smoothstep(uSnow-90.,uSnow+90.,sl);
    vec2 tn=normalize(vec2(-N.z,N.x)+1e-4);
    float gl=textureLod(tNoise,vec2(dot(P.xz,tn)/26.,y/240.+.31),max(log2(max(fp,1e-3)*512./26.),0.)).r;
    float gl2=textureLod(tNoise,vec2(dot(P.xz,tn)/9.,y/90.+.77),max(log2(max(fp,1e-3)*512./9.),0.)).g;
    /* Slope from the surface itself: gSlope is for sizing detail and reads the far peaks as gentle. */
    float sN=sqrt(max(1.-N.y*N.y,0.))/max(N.y,.05);
    float hold=1.-smoothstep(.95,1.9,sN-.33*(gl-.5)-.25*(gl2-.5));
    float s0=high*hold+.3*(gl-.5)*high+.16*(nz(P.xz,61.,fp,1)-.5)+.16*(nz(P.xz,13.,fp,3)-.5)+.1*(nz(P.xz,4.1,fp,2)-.5);
    /* The edge is as sharp as the pixel allows: further off, where a pixel spans metres, it softens. */
    float ew=.04+.5*smoothstep(1.,12.,fp);
    snow=smoothstep(.5-ew,.5+ew,s0)*smoothstep(uSnow-300.,uSnow-200.,sl);
    vec3 sc=vec3(.84,.86,.9)*(.95+.07*nz(P.xz,9.,fp,3));
    alb=mix(alb,sc,snow);
    vec2 crust=nzSlope(P.xz,6.,fp,.08)+nzSlope(P.xz,1.7,fp,.05);
    Nd=normalize(mix(Nd,normalize(N+vec3(-crust.x,0.,-crust.y)),snow*.85)); m.b*=1.-snow;
  }
  /* A waterfall and its stream, on the ground they run over (fallAt above). */
  float fCov,fWhite,fWet; fallAt(P,fp,N.y,fCov,fWhite,fWet);
  /* Beside the water the rock stays wet, and moss grows on it, in patches. */
  if(fWet>0.&&fCov<.99) alb=mix(alb,mix(alb*.55,vec3(.045,.065,.03),.55*smoothstep(.45,.7,nz(P.xz,3.1,fp,2))),fWet*.8*(1.-fCov));
  if(fCov>0.){
    alb=mix(alb,mix(vec3(.035,.06,.065),vec3(.95,.97,.99),fWhite),fCov);
    Nd=normalize(mix(Nd,N+vec3(0.,.6,0.),fCov*.85)); m.b*=1.-fCov; sandness*=1.-fCov;
  }
  float cSh=1.,cAO=1.,cTr=0.;
  if(m.b>.01) canopy(P.xz,rd,fp,m.b,alb,Nd,cSh,cAO,cTr);
  /* Towels, trodden sand and footprints, and the shadows of people and umbrellas (js/people.js). */
  if(uPeopleN>0.){ float pSh=1.; peopleGround(P,fp,sandness,uSun,alb,pSh); cSh*=pSh; }
  float wetBelt=(1.-smoothstep(.12,.72+.5*nz(P.xz,29.,fp,0),T-uTide))*sandness;
  /* Rock the waves reach stays wet, as high as they run and splash (uSwH), and wet rock is darker and
     shiny (the author, 23 November: "it gets darker when it's wet!"). It darkened by only a quarter, less than
     wet sand, and only where the water had just been. */
  float wetRock=(1.-smoothstep(.15,.4+1.3*uSwH*(.6+.8*nz(P.xz,9.,fp,1)),y-uTide))*m.g*(1.-sandness);
  if(wetRock>0.) wetRock*=seaNear(P.xz,w);
  /* Rock pools: water left standing in the hollows of a flat shelf of rock that the waves wash over, from
     the waterline to about as high as they run. Dark, with the rock showing through, and a mirror for the
     sky. Without them a wave-cut shelf (Broken coast, the audit's item 4) read as a smooth lump. */
  float pool=0.;
  if(m.g>.3&&uSwH>.1&&w>0.){
    float hk=smoothstep(-.3,.1,y-uTide)*(1.-smoothstep(.5+.7*uSwH,1.+1.3*uSwH,y-uTide))*smoothstep(.9,.97,N.y);
    if(hk>0.){
      float pn=nz(P.xz,5.3,fp,2)*.55+nz(P.xz,1.7,fp,1)*.3+nz(P.xz,.6,fp,3)*.15;
      /* Only in a hollow: lower than the rock round it, 2.5 m each way. */
      float av=.25*(terrH(P.xz+vec2(2.5,0.))+terrH(P.xz-vec2(2.5,0.))+terrH(P.xz+vec2(0.,2.5))+terrH(P.xz-vec2(0.,2.5)));
      pool=smoothstep(.64,.68,pn+.5*smoothstep(.02,.25,av-y)-.25)*smoothstep(.0,.08,av-y)*hk*smoothstep(.3,.6,m.g)*seaNear(P.xz,w);
    }
  }
  float wet=clamp(max(max(max(fx.b,wetBelt*.72),max(wetRock*.85,pool)),max(fWet*.7,fCov*(1.-fWhite))),0.,1.);
  float wetS=wet*wet;
  vec3 al=alb*mix(1.,mix(.50,.55,m.g),wetS);
  al=mix(al,al*.6+vec3(.004,.008,.009),pool);
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
  /* On rock, the shade in hollows (lit.y) also takes some of the sun: the sun's baked shadows miss the
     ledges and gullies of a few metres, and deep in one the sun mostly doesn't reach (TECHLOG 79). */
  vec3 E=uSunE*ndl*lit.x*cs*cSh*mix(1.,lit.y,.5*m.g)+skyIrr(Nd)*lit.y*cAO;
  /* Light thrown back by the sunny ground and sea in front: a face turned from the sky takes some of
     their light and warmth, so the shaded side of a cliff over a beach is not lit by the sky alone
     (the audit, TECHLOG 78 and 79). The sky light (skyIrr) leaves out the ground below. */
  E+=(uSunE*max(uSun.y,0.)*vec3(.15,.14,.12)*cs+skyIrr(vec3(0,1,0))*.1)*(.5-.5*Nd.y)*lit.y*cAO;
  /* Driftwood's sides and underside are lit by the sunny sand around it, as the people are. */
  if(debK>0.) E+=debK*vec3(.45,.40,.33)*(uSunE*max(uSun.y,0.)*lit.x*cs*1.4+skyIrr(vec3(0,1,0))*lit.y*.7)*(.5-.5*Nd.y);
  vec3 Lg=al/PI*E;
  Lg+=al*vec3(.9,1.15,.42)/PI*uSunE*max(uSun.y,.12)*cTr*lit.x*cs*cSh+canopyGlow;
  /* Wet sand and wet rock are glossy, mirroring sky and sun. */
  vec3 Ng=normalize(mix(mix(Nd,N+vec3(0,2.,0),wetS*.82),vec3(0,1,0),pool));
  float nvg=max(dot(Ng,-rd),.02);
  float Fg=.025+.975*pow(1.-nvg,5.);
  vec3 Rg=reflect(rd,Ng); Rg.y=abs(Rg.y)+.01;
  float gloss=max(wetS*(sandness*.9+.5*m.g)*smoothstep(.72,1.,wet),pool*1.4);
  Lg+=env(normalize(Rg),3.2)*Fg*gloss*lit.y*(1.4);
  vec3 Hg=normalize(uSun-rd);
  float nh=max(dot(Ng,Hg),0.);
  Lg+=uSunE*.055*gloss*mix(pow(nh,240.),.06*pow(nh,30.),1.-uSunVis)*lit.x*cs;
  Lg+=uSunE*.0035*(1.-wetS)*sandness*pow(nz(P.xz,.41,fp,3),8.)*2.*ndl*lit.x;
  o.rgb=Lg;
}`;
/* W is laid over C's picture with blending (ONE, SRC_ALPHA): every step here mixes what is under it with
   something of its own, so it keeps the light it adds (L) and the share of what is under it that still
   shows (k), and never needs to read C's picture. */
const FS_VIEW_W=VIEW_LIB+`
layout(location=0) out vec4 o;
`+HAZE+`
void main(){
  ivec2 px=ivec2(gl_FragCoord.xy);
  vec4 a1=texelFetch(tGA1,px,0);
  float t=a1.z, wa=a1.w;
  /* The sky is left as it is. */
  if(t<0.){ o=vec4(0.,0.,0.,1.); return; }
  float pa; vec3 rd=viewRay(pa);
  Surf s=surfAt(rd,t,pa);
  vec3 P=s.P; float fp=s.fp,w=s.w,cosI=s.cosI;
  vec2 lit=litAt(P.xz);
  /* Where ground shows through the water's edge close up, the same softened shadow as the ground has. */
  if(wa<.999&&fp<.25&&w>=1.){ vec4 m; groundBase(P,fp,w,m); lit=litGround(P.xz,fp,w,m.g); }
  float cs=cloudShadow(P);
  vec3 L=vec3(0.); float k=1.; vec3 Nw=vec3(0,1,0);
  if(wa>.001){
    L=shadeWater(P,rd,t,fp,max(s.dp,s.film),s.film,s.rm1,s.fx,lit,cs,Nw)*wa;
    k=1.-wa;
  }
  /* Foam. On the ground only at the water's edge, within a few tens of centimetres of the water's height:
     the foam field is a map seen from above, and on a cliff it was drawn straight up the rock, in white
     stripes a cell wide (the author, 25 November: the "white vertical bars" at Sea cliffs' foot). */
  /* Where the water is heaped steeply against rock, its foam is laid along the slope, not straight down
     from above, and the foam field (a cell across) is read blurred: drawn from above, both ran in vertical
     streaks down the face. */
  vec3 Pf=P;
  if(wa>.001&&s.w>0.){
    float hx=.35;
    float e0=etaH(P.xz+vec2(hx,0.)),e1=etaH(P.xz-vec2(hx,0.)),e2=etaH(P.xz+vec2(0.,hx)),e3=etaH(P.xz-vec2(0.,hx));
    vec2 ge=vec2(e0-e1,e2-e3)/(2.*hx);
    /* (Not at the water's edge, where a dry side reads -100.) */
    float sl=min(min(e0,e1),min(e2,e3))>-50.?min(length(ge),6.):0.;
    if(sl>.3){
      Pf.xz+=ge/sl*(P.y-uTide)*(sqrt(1.+sl*sl)-1.)/sl;
      s.fx=textureLod(tFx,s.uv,max(log2(max(fp,1e-3)/uDx),0.)+log2(1.+sl));
    }
  }
  float foam=foamAt(s,wa)*mix(1.-smoothstep(.1,.45,P.y-s.eta),1.,wa);
  if(foam>.008){
    float al; vec3 Lf=foamShade(Pf,Nw,lit,cs,foam,fp,s.adv.xy,s.adv.zw,al);
    L=mix(L,Lf,al); k*=1.-al;
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
    float tr=clamp(1.-exp(-acc*(.55+.75/cosI*.4)),0.,.85);
    L=mix(L,mc*(.9+.6*pow(max(dot(rd,uSun),0.),6.)),tr); k*=1.-tr;
  }
  /* Aerial perspective */
  /* Aerial perspective: hazeK (js/shaders/common.js), with a layer of sea haze near the water. */
  float fg=hazeK(t,uRo.y,P.y,uFogB);
  vec3 rh=rd; rh.y=max(rh.y,.012); rh=normalize(rh);
  vec3 fc=min(env(rh,2.8),vec3(3.2));
  fc=mix(fc,textureLod(tEnv,vec2(.5),7.5).rgb,smoothstep(.06,.34,-rd.y));
  float mu=max(dot(rd,uSun),0.);
  fc+=uSunE*.012*pow(mu,18.)*(1.-smoothstep(.02,.2,-rd.y));
  L=mix(L,fc,fg); k*=1.-fg;
  o=vec4(min(L,vec3(120.)),k);
}`;
/* Answer images for training data (tools/groundtruth.js): instead of a colour, what is really at each
   pixel. uLabel 1: class (1 land, 2 rock, 3 water, 4 white water, 5 plants; sky is 0), water depth in
   metres, foam (0 to 1), distance from the camera (sky: -1). uLabel 2: the water's velocity across and
   along the shore in m/s (from tExtra, the solver's state), the ground height and the water surface
   height. */
const FS_LABEL=VIEW_LIB+`
layout(location=0) out vec4 o;
void main(){
  float pa; vec3 rd=viewRay(pa);
  float t=march(uRo,rd);
  if(t<0.){ gl_FragDepth=1.; o=uLabel==1?vec4(0.,0.,0.,-1.):vec4(0.); return; }
  Surf s=surfAt(rd,t,pa);
  gl_FragDepth=viewDepth(t,rd);
  float foam=foamAt(s,s.wa);
  vec4 mm=terrS(s.P.xz); float isW=step(.5,s.wa);
  float cls=isW>0.?(foam>.35?4.:3.):(mm.g>.5?2.:(mm.b>.5?5.:1.));
  if(uLabel==1) o=vec4(cls,max(s.eta-s.T,0.)*isW,clamp(foam,0.,1.)*isW,t);
  else { vec4 C=s.w>0.?textureLod(tExtra,s.uv,0.):vec4(0.); o=vec4(C.y*isW,C.z*isW,s.T,s.eta); }
}`;
/* The four stages, in the order they are drawn. */
const VIEW_STAGES=['viewZ','viewA','viewB','viewC','viewW'];

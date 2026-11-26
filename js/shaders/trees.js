'use strict';
/* ------ Baking the plant models into their texture of views ------ */
/* A leaf's outline. Its triangles make a four-sided shape with corners; the leaf itself is the smooth
   oval inside them, pointed at base and tip (u along the leaf, -1 to 1; v across, 0 at the midrib).
   Blades (u from 2 to 4) keep their shape. Used by the views of each model and by the full models. */
const LEAF_EDGE=`
bool offLeaf(vec2 uv){
  if(uv.y>1.5||uv.x>1.5) return false;
  float w=.92*pow(max(sin(1.5708*(uv.x+1.)),0.),.8)*(1.-.2*uv.x);
  return abs(uv.y)>w;
}`;
const VS_PLANT_BAKE=`#version 300 es
precision highp float;
layout(location=0) in vec3 aP; layout(location=1) in vec3 aM; layout(location=2) in vec4 aL; layout(location=5) in vec2 aU;
uniform vec3 uC,uR,uU,uF; uniform float uRad;
out vec3 vM; out vec4 vL; out vec2 vU;
void main(){ vec3 v=aP-uC; vM=aM; vL=aL; vU=aU; gl_Position=vec4(dot(v,uR)/uRad,dot(v,uU)/uRad,dot(v,uF)/uRad*.98,1.); }`;
const FS_PLANT_BAKE=HEAD+LEAF_EDGE+`
in vec3 vM; in vec4 vL; in vec2 vU; layout(location=0) out vec4 oA; layout(location=1) out vec4 oL;
void main(){ if(offLeaf(vU)) discard; oA=vec4(vM,1.); oL=vL; }`;

/* ------ Where plants grow. Cards and full 3D models both use this, so they always agree. ------ */
const PLANT_GLSL=`
uniform int uType,uShrub; uniform float TILE,uEdge,uGreenD;
uniform vec2 uDomMin,uDomSize,uFarMin,uFarSize;
uniform sampler2D tTerr,tTerrF,tLit,tLitF,tNoise;
const float CELLS=18.;
/* Greenery (a recipe lever) scales the plant-cover channel (b) wherever it's read, here and in the view
   shader, so plants, their shadows and the green of the ground stay in agreement. uGreenD is greenery
   minus 1, so a program never told it (0) grows plants as the coast does. More greenery never pushes
   cover past full. */
vec4 green(vec4 m){ m.b=min(m.b*(1.+uGreenD),max(m.b,1.)); return m; }
vec2 h2(vec2 p){ p=mod(p,CELLS); vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec2 hr(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec2 rotT(vec2 p,float tile){ float a=tile*2.399; float c=cos(a),s=sin(a); return vec2(c*p.x-s*p.y,s*p.x+c*p.y); }
vec2 toWorld(vec2 r,float tile){ float a=tile*2.399,c=cos(a),s=sin(a); return vec2(c*r.x+s*r.y,-s*r.x+c*r.y); }
float edgeW(vec2 uv){ vec2 e=min(uv,1.-uv); return smoothstep(0.,uEdge,min(e.x,e.y)); }
vec4 terrS(vec2 p){ vec2 uv=(p-uDomMin)/uDomSize; float w=edgeW(uv); vec4 f=textureLod(tTerrF,(p-uFarMin)/uFarSize,0.);
  if(w<=0.) return green(f); vec4 n=textureLod(tTerr,uv,0.); return green(mix(f,n,w)); }
float nz0(vec2 p,float tile,int ch){ vec4 v=textureLod(tNoise,rotT(p,tile)/tile,max(log2(2.*512./tile),0.)); return ch==0?v.r:v.g; }
vec2 plantPos(vec2 ip){ return toWorld((ip+h2(ip))/CELLS*TILE,TILE); }
/* Where plants grow (COVER_GLSL in js/shaders/view.js), shared with the view shader for shadows and litter.
   Here uType is the kind of plants, which the view shader calls uFlora. */
float nzFixed(vec2 p,float tile,int ch){ return nz0(p,tile,ch); }
#define uFlora uType
`+COVER_GLSL+`
#undef uFlora
/* Models: 0-1 palm, 2-3 broadleaf, 4 pine, 5 conifer, 6 shrub, 7 grass, 8-9 broadleaf, 10 fern */
bool plantGrows(vec2 ip,vec2 wp,out float ground,out float scale,out int model,out float yaw,out vec2 tint,out float lit){
  ground=0.;scale=1.;model=0;yaw=0.;tint=vec2(0.);lit=1.;
  vec2 j=h2(ip),k=h2(ip+37.),u=hr(ip+71.3);
  float id=fract(k.y*7.13+j.x*3.7);
  vec4 m=terrS(wp);
  if(m.r<.5||m.g>.5) return false;
  float e=4.;
  float sx=terrS(wp+vec2(e,0.)).r-terrS(wp-vec2(e,0.)).r, sz=terrS(wp+vec2(0.,e)).r-terrS(wp-vec2(0.,e)).r;
  if(length(vec2(sx,sz))/(2.*e)>.5) return false;
  /* The woods, with their clearings and a few lone trees left standing in them, as the plant cover
     shapes them (woodAt). */
  float wood=uShrub>0?0.:woodAt(wp);
  float cov=uShrub>0?shrubCov(wp,m.b):treeCov(m.b,wood);
  /* In the shrub layer, a cell the shrubs and grass leave empty may hold a fern (fernCov), under woods
     only: the woods are looked up only where the cover could be woods. */
  bool fern=false;
  if(id>cov){
    /* (A preset's mats grow out on the open dunes, where the cover is thin.) */
    if(uShrub==0||(m.b<.42&&!(uVeg>0&&uVegM.x>.5))) return false;
    if(id>cov+fernCov(m.b,woodAt(wp),wp)) return false;
    fern=true;
  }
  /* Woods grow in stands: one species dominates an area, trees are all tall or all young,
     and the colour drifts from place to place. Young trees also grow at the edges. */
  float stand=smoothstep(.40,.60,nz0(wp+41.,900.,0));
  float tall=smoothstep(.40,.60,nz0(wp+77.,620.,0));
  scale=mix(.72,1.28,k.x)*mix(.68,1.32,tall)*mix(.72,1.,smoothstep(.22,.7,m.b))*treeAge(wood);
  /* Four broadleaf shapes: two carry their crown on a bare trunk (2, 3), one has a deep crown that
     starts low (8), and one is a low tree of several stems (9). Each area favours one of them, so
     they grow in groups, with the others mixed in. */
  float bz=nz0(wp+523.,380.,0);
  float bpick=u.y<.55?bz:fract(u.y*3.7);
  int broad=bpick<.22?2:bpick<.38?3:bpick<.72?8:9;
  if(fern){ model=10; scale=groundScale(k.x); }
  else if(uShrub>0){
    model=u.y<grassShare(uType,m.b)?7:6;
    scale=smallScale(model==7,k.x);
  } else if(uVeg>0){
    /* A preset's own mix: palms (models 0, 1), its pine (4) and its conifer (5) by their shares, one
       growing more where the stands run one way and the other the other way; broadleaf trees for the rest. */
    float palmP=palmShare(stand,m.b), pineP=uVegT.y*mix(.55,1.45,1.-stand), conP=uVegT.z*mix(.55,1.45,stand);
    model=k.y<palmP?(u.y<.5?0:1):k.y<palmP+pineP?4:k.y<palmP+pineP+conP?5:broad;
  } else if(uType==0){
    /* Palms crowd the beach and thin out inland. */
    float palmP=palmShare(stand,m.b);
    model=k.y<palmP?(u.y<.5?0:1):broad;
  } else if(uType==1) model=k.y<mix(.88,.10,stand)?broad:4;
  /* Mountain forest: mostly spruce-like conifers, some pines, a few broadleaf trees by the water. */
  else if(uType==3) model=k.y<mix(.62,.9,stand)?5:(k.y<.95?4:broad);
  else model=k.y<mix(.12,.70,stand)?5:(k.y<mix(.5,.9,stand)?4:broad);
  ground=m.r-.1;
  yaw=u.x*6.28318;
  tint=vec2(mix(smoothstep(.05,.95,fract(u.y*5.7)),smoothstep(.40,.60,nz0(wp+191.,740.,0)),.6),fract(u.x*13.1));
  vec2 luv=(wp-uDomMin)/uDomSize; float lw=edgeW(luv);
  float lf=textureLod(tLitF,(wp-uFarMin)/uFarSize,0.).r;
  lit=.3+.7*(lw>0.?mix(lf,textureLod(tLit,luv,0.).r,lw):lf);
  return true;
}`;
const PLANT_TINT=`
/* Each plant its own build and shade. the author, 18 November, of a beach seen from above: "plants/vegetation
   looks a little bit unnatural, too perfect (maybe repeating patterns, colors, etc.)": each kind is a
   few models copied many times, and every copy was the same shape, only bigger or smaller. Now each is
   also wider or narrower (.8 to 1.22) and taller or squatter (.85 to 1.15), and lighter or darker
   (.8 to 1.2), from a hash of where it grows, so the card and the full model of a plant agree. */
vec3 plantVary(vec2 wp){
  vec3 p3=fract(vec3(wp.xyx)*vec3(.1031,.1030,.0973)+.37); p3+=dot(p3,p3.yzx+33.33);
  vec3 h=fract((p3.xxy+p3.yzz)*p3.zyx);
  return vec3(mix(.8,1.22,h.x),mix(.85,1.15,h.y),mix(.8,1.2,h.z));
}
/* Each model's own colour in a vegetation preset (js/vegetation.js): a factor on the green, and how much
   of its colour is taken out (grey-green sage and olive). All zero means not set: as the kind of plants. */
uniform vec4 uMTint[11];
vec3 plantTint(int type,vec2 t);
vec3 modelTint(int type,vec2 t,int m){
  vec3 c=plantTint(type,t); vec4 k=uMTint[m];
  if(k.r+k.g+k.b<=0.) return c;
  return mix(c,vec3(dot(c,vec3(.3,.59,.11))),k.w)*k.rgb;
}
vec3 plantTint(int type,vec2 t){
  vec3 a,b;
  if(type==0){ a=vec3(.030,.050,.024); b=vec3(.070,.094,.042); }
  else if(type==1){ a=vec3(.030,.044,.022); b=vec3(.072,.086,.038); }
  else if(type==3){ a=vec3(.020,.036,.026); b=vec3(.048,.068,.044); }
  else { a=vec3(.030,.046,.024); b=vec3(.070,.086,.040); }
  vec3 c=mix(a,b,t.x);
  /* Some plants are olive, some a cooler, darker green, some a light yellow-green, as plants of one kind
     differ with age, shade and soil. */
  if(t.y>.88) c=mix(c,vec3(.085,.085,.04),.42);
  else if(t.y<.10) c*=vec3(.84,.94,1.0);
  else if(t.y<.21) c=mix(c,c*vec3(1.28,1.20,.78),.65);
  return c;
}
/* The sun's direction in a turned model's frame, as weights on its four baked light directions */
vec4 sunWeights(vec3 sun,float yaw){
  float cy=cos(yaw),sy=sin(yaw);
  vec3 sm=vec3(cy*sun.x+sy*sun.z,sun.y,-sy*sun.x+cy*sun.z);
  vec4 w=max(vec4(dot(sm,vec3(.72,.69,0.)),dot(sm,vec3(-.72,.69,0.)),dot(sm,vec3(0.,.69,.72)),dot(sm,vec3(0.,.69,-.72))),vec4(0.));
  w=w*w; return w/max(w.x+w.y+w.z+w.w,1e-3);
}`;
const PLANT_SHADE=`
/* How much sky a leaf sees: its baked openness, and its four directional light values, which
   also carry which way it faces. Leaves facing down or buried in the crown see little sky. */
float skyVis(float amb,vec4 l){ return clamp(.5*amb+.5*dot(l,vec4(.3165)),0.,1.); }
/* Bark below hue .06 (palm trunks are paler), then foliage from deep green to dry straw */
vec3 plantShade(float bright,float hue,float sv,float vis,vec3 tint,float lit,vec3 sky,vec3 back,vec3 sunE){
  vec3 leaf=mix(tint,tint*vec3(1.42,1.26,.82)+vec3(.030,.024,.012),smoothstep(.25,1.,hue));
  /* Leaves that have turned: past .7 they yellow, and a narrow band at .925 is dry and brown (set per leaf
     in js/plants.js). Dead palm fronds, at .98, stay straw. */
  float dry=smoothstep(.89,.905,hue)*(1.-smoothstep(.945,.96,hue));
  leaf=mix(leaf,vec3(.17,.15,.05),smoothstep(.7,.86,hue)*(1.-smoothstep(.87,.89,hue))*.8);
  leaf=mix(leaf,vec3(.135,.095,.055),dry);
  leaf*=.42+1.25*bright;
  vec3 bark=mix(vec3(.105,.085,.066),vec3(.20,.172,.14),smoothstep(.005,.03,hue))*(.5+1.05*bright);
  float lf=smoothstep(.04,.08,hue);
  /* Leaves were darker than real ones, with a stronger sun to make up for it. That looked right in
     sunshine, but under cloud, where nothing made up for it, plants went black. */
  vec3 alb=mix(bark,leaf*1.4,lf);
  /* Under cloud, nearly all light is sky light, so a crown's shape comes from how much sky each
     part sees: open tops are bright and the inside falls dark. */
  vec3 E=sunE*vis*lit*mix(1.32,.94,lf)+sky*(.08+1.*sv);
  /* Leaves are waxy and mirror the sky a little, which turns them grey-green under cloud rather
     than black. Light also passes through them. */
  vec3 sheen=sky*sv*sv*.045*lf;
  vec3 thru=alb*vec3(.9,1.15,.42)*sky*.20*sv*lf;
  return alb/PI*E+(sheen+thru)/PI+alb/PI*back*vis*lit*lf*.71;
}`;
/* One texel per plant cell, read back once per shot to choose which plants get full 3D models. */
const FS_PLANT_LIST=HEAD+PLANT_GLSL+`
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1; uniform ivec2 uOrigin;
void main(){
  vec2 ip=vec2(uOrigin+ivec2(gl_FragCoord.xy));
  vec2 wp=plantPos(ip);
  float g,s,y,l; int m; vec2 t;
  if(!plantGrows(ip,wp,g,s,m,y,t,l)){ o0=vec4(0.); o1=vec4(0.); return; }
  o0=vec4(wp.x,g,wp.y,float(m)+s*.4);
  o1=vec4(y,t,l);
}`;

/* ------ One camera-facing card per plant, showing a pre-rendered view of its model ------ */
const VS_CARDS=`#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
#define PI 3.14159265359
`+PLANT_GLSL+PLANT_TINT+`
uniform ivec2 uOrigin; uniform int uGrid; uniform vec2 uJit;
uniform vec3 uRo,uR,uU,uF,uSun,uRef,uSunE; uniform float uTan,uAspect,uDA,uDB,uMaxD,uMeshD,uTime,uFogB,uCloudShade,uCloudT,uFreeView;
uniform vec2 uModel[11];
uniform sampler2D tEnv;
`+CLOUD_SHADOW+`
out vec2 vUV; flat out vec3 vTint,vSky,vFogC,vBack; flat out vec4 vW; flat out float vLit,vFade,vHand,vFog,vAz,vRow,vNear,vLayer,vFlat;
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
const float E[5]=float[5](6.,18.,32.,50.,84.);
void cull(){ gl_Position=vec4(2.,2.,2.,1.); vUV=vec2(0.); }
`+HAZE+`
void main(){
  ivec2 idx=uOrigin+ivec2(gl_InstanceID%uGrid,gl_InstanceID/uGrid);
  vec2 ip=vec2(idx),wp=plantPos(ip);
  vec2 corner=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1));
  vFade=0.;vHand=1.;vFlat=0.;vTint=vec3(0.);vLit=0.;vAz=0.;vRow=0.;vNear=0.;vLayer=0.;vW=vec4(0.);vSky=vec3(0.);vFogC=vec3(0.);vFog=0.;vBack=vec3(0.);
  vec2 toC=uRo.xz-wp; float dist=length(toC);
  if(dist>uMaxD){ cull(); return; }
  /* Close plants are drawn as full models instead, and hand over by dissolving. */
  if(uMeshD>0.&&dist<uMeshD*.8){ cull(); return; }
  /* Frustum test first: it costs no texture reads, and most of the grid fails it. */
  vec3 v0=vec3(wp.x,0.,wp.y)-uRo; float z0=dot(v0,uF);
  if(z0<-30.||abs(dot(v0,uR))>z0*uTan*uAspect+40.||abs(dot(v0,uU))>z0*uTan+130.){ cull(); return; }
  float ground,scale,yaw,lit; int model; vec2 tint;
  if(!plantGrows(ip,wp,ground,scale,model,yaw,tint,lit)){ cull(); return; }
  vec2 info=uModel[model];
  float fade=1.-smoothstep(uMaxD*.8,uMaxD,dist);
  vFade=fade;
  if(uMeshD>0.){ vHand=smoothstep(uMeshD*.8,uMeshD,dist); fade*=vHand; }
  float rad=info.x*scale;
  vec3 vary=plantVary(wp);
  vec3 C=vec3(wp.x,ground+info.y*scale*vary.y,wp.y);
  vec3 toCam=uRo-C; float len=length(toCam);
  vec3 F=-toCam/len;
  /* Which view of the model to show. Past 110 m, and always in top-down shots, it stays fixed for
     the whole shot, worked out from the middle of the drone's path, so plants never snap to a new
     view as the drone moves. Closer in it follows the camera, with neighbouring views blended. */
  float nearK=uFreeView*(1.-smoothstep(45.,110.,len));
  vec3 toV=normalize(mix(normalize(uRef-C),toCam/len,nearK));
  vAz=fract((atan(toV.z,toV.x)-yaw)/6.28318)*12.;
  float el=asin(clamp(toV.y,-1.,1.))*57.29578, row=0.;
  for(int i=0;i<4;i++){ if(el>=E[i]) row=float(i)+clamp((el-E[i])/(E[i+1]-E[i]),0.,1.); }
  vRow=row; vNear=nearK; vLayer=float(model);
  /* A preset's mats lie flat on the sand (fernCov). */
  vFlat=uVeg>0&&uVegM.x>.5&&model==10?1.:0.;
  vec3 cr=normalize(cross(F,vec3(0.,1.,0.))),cu=cross(cr,F);
  /* Wider or squatter as the model is (plantVary); seen from above, the card's height is also width. */
  float cuK=mix(vary.y,vary.x,abs(F.y));
  vec3 pos=C+(cr*(corner.x-.5)*vary.x+cu*(corner.y-.5)*cuK)*rad*2.-F*rad*.32;
  float sway=sin(uTime*(model<2?1.1:.75)+yaw*6.4+wp.x*.03)*corner.y*corner.y;
  pos+=cr*sway*rad*.012*fade;
  /* A mat lies on the sand, so its card does too: the view from above (row 4, first turn), laid flat and
     turned as the plant is, which is what the full model looks like from any angle. Standing up and
     facing the camera like the others, a mat covered far more sand than its model and looked like a dark
     bush, and where the models took over near the camera the patch thinned out, along a line that moved
     with the camera (the author, 22 November: "re-rendered differently so it almost looks like a wave"). The
     view from above is drawn with the camera's right along the model's -z and its up along -x. */
  if(vFlat>.5){
    float cy=cos(yaw),sy=sin(yaw);
    vec2 mxz=vec2(-(corner.y-.5),-(corner.x-.5))*rad*2.*vary.x;
    vec2 off=vec2(cy*mxz.x-sy*mxz.y,sy*mxz.x+cy*mxz.y);
    /* Tilted with the sand under it and lifted a hand's breadth, as its leaves are: laid level, most of it
       sank into the slope of a dune and only a corner showed. */
    float e=1.5, gx=(terrS(wp+vec2(e,0.)).r-terrS(wp-vec2(e,0.)).r)/(2.*e), gz=(terrS(wp+vec2(0.,e)).r-terrS(wp-vec2(0.,e)).r)/(2.*e);
    pos=vec3(wp.x+off.x,ground+.1+.1*scale+gx*off.x+gz*off.y,wp.y+off.y);
    vAz=0.; vRow=4.; vNear=0.;
  }
  vec3 v=pos-uRo; float z=dot(v,uF);
  gl_Position=vec4(dot(v,uR)/(uTan*uAspect),dot(v,uU)/uTan,uDA*z+uDB,z); gl_Position.xy-=uJit*gl_Position.w;
  vUV=corner;
  vW=sunWeights(uSun,yaw);
  vTint=modelTint(uType,tint,model)*vary.z;
  float cs=1.;
  cs=cloudShadow(C);
  vLit=lit*cs;
  vSky=textureLod(tEnv,envUV(normalize(vec3(0.,1.6,0.))),6.2).rgb*PI*.68;
  vec3 rh=F; rh.y=max(rh.y,.012); rh=normalize(rh);
  vec3 fc=min(textureLod(tEnv,envUV(rh),2.8).rgb,vec3(3.2));
  vFogC=mix(fc,textureLod(tEnv,vec2(.5),7.5).rgb,smoothstep(.06,.34,-F.y));
  vFog=hazeK(length(pos-uRo),uRo.y,pos.y,uFogB);
  vBack=vec3(1.,1.3,.42)*uSunE*max(uSun.y,.14)*pow(max(dot(F,uSun)*.5+.5,0.),4.)*1.5;
}`;
const FS_CARDS=HEAD+PLANT_SHADE+`
precision highp sampler2DArray;
in vec2 vUV; flat in vec3 vTint,vSky,vFogC,vBack; flat in vec4 vW; flat in float vLit,vFade,vHand,vFog,vAz,vRow,vNear,vLayer,vFlat; layout(location=0) out vec4 o;
uniform sampler2DArray tPA,tPL; uniform vec3 uSunE; uniform float uNoiseF;
float h1(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  /* Plants dissolve at the far end of their range, with noise fixed to the plant so it doesn't crawl. */
  if(vFade<1.&&h1(floor(vUV*200.)+vec2(vAz,vLayer)*17.)>vFade) discard;
  /* Handing over to the full model: the model keeps the pixels where this screen noise is below its
     fade, and the card keeps exactly the rest. With unrelated noise in each, about a quarter of the
     pixels had neither half way through, and the plant looked see-through. */
  if(vHand<1.&&fract(52.9829189*fract(dot(gl_FragCoord.xy+5.588238*uNoiseF,vec2(.06711056,.00583715))))<1.-vHand) discard;
  vec2 sc=vec2(1./12.,1./5.);
  vec2 gx=dFdx(vUV)*sc,gy=dFdy(vUV)*sc;
  float lod=.5*log2(max(dot(gx,gx),dot(gy,gy))*5760000.+1e-6);
  /* Neighbouring views are blended wherever the view follows the camera (vNear above 0), fully: as the
     camera moves, a plant turns smoothly from one view to the next. (The blend used to narrow with
     distance, so plants 45 to 110 m off snapped from view to view, a ripple across the woods as the
     camera passed.) Far plants keep one fixed view: one texture read. */
  float w=vNear>0.?.42:.001;
  float a0=floor(vAz),r0=floor(vRow);
  float ka=smoothstep(.5-w,.5+w,vAz-a0),kr=smoothstep(.5-w,.5+w,vRow-r0);
  float a1=mod(a0+1.,12.),r1=min(r0+1.,4.);
  vec4 s=vec4(0.),l=vec4(0.);
  for(int i=0;i<4;i++){
    float wt=((i&1)==0?1.-ka:ka)*((i&2)==0?1.-kr:kr);
    if(wt<.002) continue;
    vec3 tc=vec3((vec2((i&1)==0?a0:a1,(i&2)==0?r0:r1)+vUV)*sc,vLayer);
    s+=wt*textureGrad(tPA,tc,gx,gy);
    l+=wt*textureGrad(tPL,tc,gx,gy);
  }
  /* Distant mip levels average in empty space, so accept thinner coverage there. */
  /* A mat's card lies flat (VS_CARDS): its leaves are kept down to a thinner coverage, and from afar
     the ground under it carries its green (the view shader). */
  /* A mat's far views average its leaves with the sand between them: it is kept in that share of pixels,
     different ones each frame, which the smoothing (or a film's samples) averages back, so from afar a
     patch is as see-through as the full models near the camera, not a solid dark mat. */
  if(vFlat>.5){ if(s.a<.06+.88*fract(52.9829189*fract(dot(gl_FragCoord.xy+5.588238*uNoiseF,vec2(.06711056,.00583715))))) discard; }
  else if(s.a<mix(.56,.2,clamp(lod/5.,0.,1.))) discard;
  l/=s.a;
  vec3 m=s.rgb/s.a;
  vec3 L=plantShade(m.r,m.g,skyVis(m.b,l),dot(l,vW),vTint,vLit,vSky,vBack,uSunE);
  o=vec4(mix(L,vFogC,vFog),1.);
}`;

/* ------ Full 3D models for plants close to the drone ------ */
const VS_MESH=`#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
#define PI 3.14159265359
`+PLANT_TINT+`
layout(location=0) in vec3 aP; layout(location=1) in vec3 aM; layout(location=2) in vec4 aL;
layout(location=3) in vec4 iA; layout(location=4) in vec4 iB; layout(location=5) in vec2 aU; uniform vec2 uJit;
uniform vec3 uRo,uR,uU,uF,uSun,uSunE; uniform float uTan,uAspect,uDA,uDB,uMeshD,uTime,uCloudShade,uCloudT; uniform int uType;
uniform sampler2D tEnv,tNoise;
`+CLOUD_SHADOW+`
out vec3 vM,vTint,vSky,vBack,vP; out vec4 vL,vW; out float vLit,vFade,vCam; out vec2 vU;
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
void main(){
  float scale=fract(iA.w)/.4,yaw=iB.x,c=cos(yaw),s=sin(yaw);
  vec3 vary=plantVary(iA.xz);
  vec3 p=aP*scale*vary.xyx;
  vec3 pos=iA.xyz+vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);
  /* Wind: branches move a little, more toward the top and for leaves more than for wood. */
  float h=max(p.y,0.);
  float g=sin(uTime*.9+iA.x*.09+h*.25)+.5*sin(uTime*2.3+dot(aP,vec3(1.3,.7,1.1)));
  pos.xz+=vec2(.8,.5)*g*.012*h*smoothstep(.04,.08,aM.y);
  vec3 v=pos-uRo; float z=dot(v,uF);
  gl_Position=vec4(dot(v,uR)/(uTan*uAspect),dot(v,uU)/uTan,uDA*z+uDB,z); gl_Position.xy-=uJit*gl_Position.w;
  vP=aP; vM=aM; vL=aL; vU=aU; vW=sunWeights(uSun,yaw); vTint=modelTint(uType,iB.yz,int(floor(iA.w)))*vary.z;
  float cs=1.;
  cs=cloudShadow(iA.xyz);
  vLit=iB.w*cs;
  vSky=textureLod(tEnv,envUV(normalize(vec3(0.,1.6,0.))),6.2).rgb*PI*.68;
  vec3 F=normalize(v);
  vBack=vec3(1.,1.3,.42)*uSunE*max(uSun.y,.14)*pow(max(dot(F,uSun)*.5+.5,0.),4.)*1.5;
  vFade=1.-smoothstep(uMeshD*.8,uMeshD,length(iA.xz-uRo.xz));
  vCam=length(v);
}`;
const FS_MESH=HEAD+PLANT_SHADE+LEAF_EDGE+`
in vec3 vM,vTint,vSky,vBack,vP; in vec4 vL,vW; in float vLit,vFade,vCam; in vec2 vU; layout(location=0) out vec4 o; uniform vec3 uSunE; uniform sampler2D tNoise; uniform float uNoiseF;
void main(){
  float ign=fract(52.9829189*fract(dot(gl_FragCoord.xy+5.588238*uNoiseF,vec2(.06711056,.00583715))));
  /* Anything right at the lens thins out, so the drone can pass through a crown without the
     whole picture going dark. */
  if(ign>vFade*smoothstep(.9,2.,vCam)) discard;
  if(offLeaf(vU)) discard;
  float bright=vM.r;
  if(vM.g<.08){
    /* Bark: long furrows running up the stem */
    float s=dot(vP.xz,vec2(.71,.71));
    float g=textureLod(tNoise,vec2(s*1.3,vP.y*.11),0.).g*.6+textureLod(tNoise,vec2(s*4.1,vP.y*.31),0.).a*.4;
    bright*=.42+1.25*g;
  }
  /* A leaf's own detail, close up. the author, 18 November, in a low pass through a tropical wood: "leaves
     don't look very natural, bc lacking detail so close up". Each leaf was one flat colour. Now: a pale
     midrib, side veins running out toward the tip (parallel veins on blades: palm leaflets, grass), the
     leaf darker toward its edge and tip and lighter at the base, and faint mottling, its own on each
     leaf. All of it fades out where a leaf is only a few pixels wide, where it would only shimmer. */
  float hue=vM.g;
  if(vU.y<1.5&&hue>=.08){
    float fw=max(fwidth(vU.x),fwidth(vU.y));
    float dk=1.-smoothstep(.12,.35,fw);
    if(dk>0.){
      bool blade=vU.x>1.5;
      float au=blade?vU.x-3.:vU.x, av=abs(vU.y);
      float aa=max(fw,.01);
      float mid=1.-smoothstep(.035,.035+aa*1.5,av);
      float vein;
      if(blade){ float q=abs(fract(av*3.)-.5); vein=(1.-smoothstep(.06,.06+aa*3.,q))*smoothstep(.15,.3,av)*.6; }
      else { float q=abs(fract((au*.5+.5)*5.5-av*1.6)-.5); vein=(1.-smoothstep(.05,.05+aa*4.,q))*smoothstep(.07,.18,av)*(1.-smoothstep(.7,.92,av)); }
      float mot=textureLod(tNoise,vU*vec2(.35,.22)+fract(vP.xz*.173+vP.y*.31),0.).r;
      float k=1.+.22*mid+.09*vein-.17*smoothstep(.5,1.,av)-.08*smoothstep(.55,1.,au)+.07*(1.-smoothstep(-1.,-.5,au))+.16*(mot-.5);
      bright*=mix(1.,k,dk);
      hue+=(.06*mid+.03*vein)*dk;
    }
  }
  o=vec4(plantShade(bright,hue,skyVis(vM.b,vL),dot(vL,vW),vTint,vLit,vSky,vBack,uSunE),1.);
}`;

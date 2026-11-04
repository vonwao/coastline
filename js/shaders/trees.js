'use strict';
/* ------ Baking the plant models into their texture of views ------ */
const VS_PLANT_BAKE=`#version 300 es
precision highp float;
layout(location=0) in vec3 aP; layout(location=1) in vec3 aM; layout(location=2) in vec4 aL;
uniform vec3 uC,uR,uU,uF; uniform float uRad;
out vec3 vM; out vec4 vL;
void main(){ vec3 v=aP-uC; vM=aM; vL=aL; gl_Position=vec4(dot(v,uR)/uRad,dot(v,uU)/uRad,dot(v,uF)/uRad*.98,1.); }`;
const FS_PLANT_BAKE=HEAD+`
in vec3 vM; in vec4 vL; layout(location=0) out vec4 oA; layout(location=1) out vec4 oL;
void main(){ oA=vec4(vM,1.); oL=vL; }`;

/* ------ Where plants grow. Cards and full 3D models both use this, so they always agree. ------ */
const PLANT_GLSL=`
uniform int uType,uShrub; uniform float TILE,uEdge;
uniform vec2 uDomMin,uDomSize,uFarMin,uFarSize;
uniform sampler2D tTerr,tTerrF,tLit,tLitF,tNoise;
const float CELLS=18.;
vec2 h2(vec2 p){ p=mod(p,CELLS); vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec2 hr(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec2 rotT(vec2 p,float tile){ float a=tile*2.399; float c=cos(a),s=sin(a); return vec2(c*p.x-s*p.y,s*p.x+c*p.y); }
vec2 toWorld(vec2 r,float tile){ float a=tile*2.399,c=cos(a),s=sin(a); return vec2(c*r.x+s*r.y,-s*r.x+c*r.y); }
float edgeW(vec2 uv){ vec2 e=min(uv,1.-uv); return smoothstep(0.,uEdge,min(e.x,e.y)); }
vec4 terrS(vec2 p){ vec2 uv=(p-uDomMin)/uDomSize; float w=edgeW(uv); vec4 f=textureLod(tTerrF,(p-uFarMin)/uFarSize,0.);
  if(w<=0.) return f; vec4 n=textureLod(tTerr,uv,0.); return mix(f,n,w); }
float nz0(vec2 p,float tile,int ch){ vec4 v=textureLod(tNoise,rotT(p,tile)/tile,max(log2(2.*512./tile),0.)); return ch==0?v.r:v.g; }
vec2 plantPos(vec2 ip){ return toWorld((ip+h2(ip))/CELLS*TILE,TILE); }
/* Shrubs and grass grow in clumps and drifts with bare sand between, not spread evenly like a
   planted bed. The same function is in the main view shader, for their shadows. */
float shrubClump(vec2 wp){ return 1.75*smoothstep(.36,.66,nz0(wp,23.,0)*.62+nz0(wp,7.3,1)*.38); }
/* Models: 0-1 palm, 2-3 broadleaf, 4 pine, 5 conifer, 6 shrub, 7 grass */
bool plantGrows(vec2 ip,vec2 wp,out float ground,out float scale,out int model,out float yaw,out vec2 tint,out float lit){
  ground=0.;scale=1.;model=0;yaw=0.;tint=vec2(0.);lit=1.;
  vec2 j=h2(ip),k=h2(ip+37.),u=hr(ip+71.3);
  float id=fract(k.y*7.13+j.x*3.7);
  vec4 m=terrS(wp);
  if(m.r<.5||m.g>.5) return false;
  float e=4.;
  float sx=terrS(wp+vec2(e,0.)).r-terrS(wp-vec2(e,0.)).r, sz=terrS(wp+vec2(0.,e)).r-terrS(wp-vec2(0.,e)).r;
  if(length(vec2(sx,sz))/(2.*e)>.5) return false;
  float cover=nz0(wp,1730.,0)*.62+nz0(wp,547.,1)*.38;
  float wood=smoothstep(.30,.52,cover+.28*(nz0(wp,133.,0)-.5)+(uType==0?.10:0.));
  /* Clearings: gaps in the woods, with a few lone trees left standing in them. */
  wood*=smoothstep(.40,.50,nz0(wp+311.,1100.,0)+.3*(nz0(wp,160.,0)-.5));
  float cov=uShrub>0?smoothstep(.02,.55,m.b)*.7*(1.-.6*smoothstep(.6,.9,m.b))*shrubClump(wp):smoothstep(.22,.85,m.b)*mix(.07,1.08,wood);
  if(id>cov) return false;
  /* Woods grow in stands: one species dominates an area, trees are all tall or all young,
     and the colour drifts from place to place. Young trees also grow at the edges. */
  float stand=smoothstep(.40,.60,nz0(wp+41.,900.,0));
  float tall=smoothstep(.40,.60,nz0(wp+77.,620.,0));
  scale=mix(.72,1.28,k.x)*mix(.68,1.32,tall)*mix(.72,1.,smoothstep(.22,.7,m.b));
  /* Four broadleaf shapes: two carry their crown on a bare trunk (2, 3), one has a deep crown that
     starts low (8), and one is a low tree of several stems (9). Each area favours one of them, so
     they grow in groups, with the others mixed in. */
  float bz=nz0(wp+523.,380.,0);
  float bpick=u.y<.55?bz:fract(u.y*3.7);
  int broad=bpick<.22?2:bpick<.38?3:bpick<.72?8:9;
  if(uShrub>0){
    float grassy=uType==0?.3:uType==1?.62:.5;
    model=u.y<grassy?7:6;
    scale=model==7?mix(.7,1.5,k.x):mix(.55,1.45,k.x);
  } else if(uType==0){
    /* Palms crowd the beach and thin out inland. */
    float palmP=mix(.22,.94,stand)*mix(1.,.55,smoothstep(.45,.9,m.b))+.25*(1.-smoothstep(.25,.6,m.b));
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
vec3 plantTint(int type,vec2 t){
  vec3 a,b;
  if(type==0){ a=vec3(.030,.050,.024); b=vec3(.070,.094,.042); }
  else if(type==1){ a=vec3(.030,.044,.022); b=vec3(.072,.086,.038); }
  else if(type==3){ a=vec3(.020,.036,.026); b=vec3(.048,.068,.044); }
  else { a=vec3(.030,.046,.024); b=vec3(.070,.086,.040); }
  vec3 c=mix(a,b,t.x);
  if(t.y>.88) c=mix(c,vec3(.085,.085,.04),.42);
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
  vec3 leaf=mix(tint,tint*vec3(1.42,1.26,.82)+vec3(.030,.024,.012),smoothstep(.25,1.,hue))*(.42+1.25*bright);
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
uniform vec2 uModel[10];
uniform sampler2D tEnv;
out vec2 vUV; flat out vec3 vTint,vSky,vFogC,vBack; flat out vec4 vW; flat out float vLit,vFade,vHand,vFog,vAz,vRow,vNear,vLayer;
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
const float E[5]=float[5](6.,18.,32.,50.,84.);
void cull(){ gl_Position=vec4(2.,2.,2.,1.); vUV=vec2(0.); }
void main(){
  ivec2 idx=uOrigin+ivec2(gl_InstanceID%uGrid,gl_InstanceID/uGrid);
  vec2 ip=vec2(idx),wp=plantPos(ip);
  vec2 corner=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1));
  vFade=0.;vHand=1.;vTint=vec3(0.);vLit=0.;vAz=0.;vRow=0.;vNear=0.;vLayer=0.;vW=vec4(0.);vSky=vec3(0.);vFogC=vec3(0.);vFog=0.;vBack=vec3(0.);
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
  vec3 C=vec3(wp.x,ground+info.y*scale,wp.y);
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
  vec3 cr=normalize(cross(F,vec3(0.,1.,0.))),cu=cross(cr,F);
  vec3 pos=C+(cr*(corner.x-.5)+cu*(corner.y-.5))*rad*2.-F*rad*.32;
  float sway=sin(uTime*(model<2?1.1:.75)+yaw*6.4+wp.x*.03)*corner.y*corner.y;
  pos+=cr*sway*rad*.012*fade;
  vec3 v=pos-uRo; float z=dot(v,uF);
  gl_Position=vec4(dot(v,uR)/(uTan*uAspect),dot(v,uU)/uTan,uDA*z+uDB,z); gl_Position.xy-=uJit*gl_Position.w;
  vUV=corner;
  vW=sunWeights(uSun,yaw);
  vTint=plantTint(uType,tint);
  float cs=1.;
  if(uCloudShade>0.){ float c=textureLod(tNoise,wp/3400.+vec2(uCloudT*.0011,uCloudT*.0006),0.).r; cs=1.-uCloudShade*smoothstep(.47,.66,c); }
  vLit=lit*cs;
  vSky=textureLod(tEnv,envUV(normalize(vec3(0.,1.6,0.))),6.2).rgb*PI*.68;
  vec3 rh=F; rh.y=max(rh.y,.012); rh=normalize(rh);
  vec3 fc=min(textureLod(tEnv,envUV(rh),2.8).rgb,vec3(3.2));
  vFogC=mix(fc,textureLod(tEnv,vec2(.5),7.5).rgb,smoothstep(.06,.34,-F.y));
  vFog=1.-exp(-length(pos-uRo)*uFogB*exp(-max(pos.y,0.)*.00012));
  vBack=vec3(1.,1.3,.42)*uSunE*max(uSun.y,.14)*pow(max(dot(F,uSun)*.5+.5,0.),4.)*1.5;
}`;
const FS_CARDS=HEAD+PLANT_SHADE+`
precision highp sampler2DArray;
in vec2 vUV; flat in vec3 vTint,vSky,vFogC,vBack; flat in vec4 vW; flat in float vLit,vFade,vHand,vFog,vAz,vRow,vNear,vLayer; layout(location=0) out vec4 o;
uniform sampler2DArray tPA,tPL; uniform vec3 uSunE;
float h1(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  /* Plants dissolve at the far end of their range, with noise fixed to the plant so it doesn't crawl. */
  if(vFade<1.&&h1(floor(vUV*200.)+vec2(vAz,vLayer)*17.)>vFade) discard;
  /* Handing over to the full model: the model keeps the pixels where this screen noise is below its
     fade, and the card keeps exactly the rest. With unrelated noise in each, about a quarter of the
     pixels had neither half way through, and the plant looked see-through. */
  if(vHand<1.&&fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))<1.-vHand) discard;
  vec2 sc=vec2(1./12.,1./5.);
  vec2 gx=dFdx(vUV)*sc,gy=dFdy(vUV)*sc;
  float lod=.5*log2(max(dot(gx,gx),dot(gy,gy))*5760000.+1e-6);
  /* The blend between views narrows to nothing with distance: one texture read for far plants. */
  float w=mix(.001,.42,vNear);
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
  if(s.a<mix(.56,.2,clamp(lod/5.,0.,1.))) discard;
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
layout(location=3) in vec4 iA; layout(location=4) in vec4 iB; uniform vec2 uJit;
uniform vec3 uRo,uR,uU,uF,uSun,uSunE; uniform float uTan,uAspect,uDA,uDB,uMeshD,uTime,uCloudShade,uCloudT; uniform int uType;
uniform sampler2D tEnv,tNoise;
out vec3 vM,vTint,vSky,vBack,vP; out vec4 vL,vW; out float vLit,vFade,vCam;
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
void main(){
  float scale=fract(iA.w)/.4,yaw=iB.x,c=cos(yaw),s=sin(yaw);
  vec3 p=aP*scale;
  vec3 pos=iA.xyz+vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);
  /* Wind: branches move a little, more toward the top and for leaves more than for wood. */
  float h=max(p.y,0.);
  float g=sin(uTime*.9+iA.x*.09+h*.25)+.5*sin(uTime*2.3+dot(aP,vec3(1.3,.7,1.1)));
  pos.xz+=vec2(.8,.5)*g*.012*h*smoothstep(.04,.08,aM.y);
  vec3 v=pos-uRo; float z=dot(v,uF);
  gl_Position=vec4(dot(v,uR)/(uTan*uAspect),dot(v,uU)/uTan,uDA*z+uDB,z); gl_Position.xy-=uJit*gl_Position.w;
  vP=aP; vM=aM; vL=aL; vW=sunWeights(uSun,yaw); vTint=plantTint(uType,iB.yz);
  float cs=1.;
  if(uCloudShade>0.){ float n=textureLod(tNoise,iA.xz/3400.+vec2(uCloudT*.0011,uCloudT*.0006),0.).r; cs=1.-uCloudShade*smoothstep(.47,.66,n); }
  vLit=iB.w*cs;
  vSky=textureLod(tEnv,envUV(normalize(vec3(0.,1.6,0.))),6.2).rgb*PI*.68;
  vec3 F=normalize(v);
  vBack=vec3(1.,1.3,.42)*uSunE*max(uSun.y,.14)*pow(max(dot(F,uSun)*.5+.5,0.),4.)*1.5;
  vFade=1.-smoothstep(uMeshD*.8,uMeshD,length(iA.xz-uRo.xz));
  vCam=length(v);
}`;
const FS_MESH=HEAD+PLANT_SHADE+`
in vec3 vM,vTint,vSky,vBack,vP; in vec4 vL,vW; in float vLit,vFade,vCam; layout(location=0) out vec4 o; uniform vec3 uSunE; uniform sampler2D tNoise;
void main(){
  float ign=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  /* Anything right at the lens thins out, so the drone can pass through a crown without the
     whole picture going dark. */
  if(ign>vFade*smoothstep(.9,2.,vCam)) discard;
  float bright=vM.r;
  if(vM.g<.08){
    /* Bark: long furrows running up the stem */
    float s=dot(vP.xz,vec2(.71,.71));
    float g=textureLod(tNoise,vec2(s*1.3,vP.y*.11),0.).g*.6+textureLod(tNoise,vec2(s*4.1,vP.y*.31),0.).a*.4;
    bright*=.42+1.25*g;
  }
  o=vec4(plantShade(bright,vM.g,skyVis(vM.b,vL),dot(vL,vW),vTint,vLit,vSky,vBack,uSunE),1.);
}`;

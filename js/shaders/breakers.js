'use strict';
/* ------ Breakers: the lip and the white roller on a breaking crest ------
   The water is a height field, one surface height per point, so a wave in it can steepen and foam but
   never curl over: no lip, no falling curtain. This layer draws that part on top.

   FS_BRK runs over the water grid after each step and marks the shoulder of every breaking front: the
   cell where the surface changes from gentle behind to steep ahead, in water shallow enough to break.
   It stores the drop (the wave's height there), the direction the front faces, how long it has been
   breaking (the trail of white water behind it says so), and whether it plunges (a steep bed ahead, as
   on reef and rock, or a near-vertical face) or spills (a gently sloping beach).

   VS_LIP / FS_LIP draw one short ribbon per marked cell, in the vertical plane across the front: a
   curl from just behind the crest, over it and down to the foot of the face. Each ribbon meets the next
   marked cell's half way, with the same values, so the pieces join into one lip along the whole front.
   A plunging crest that has just started to break throws a lip of clear green water that turns white
   as it falls. A crest that has been breaking a while, and any spilling crest, carries a lumpy roller of
   white water tumbling down the front of the wave. js/shaders/spray.js throws spray up where it lands.
   TECHLOG.md section 43 has the story. */
const FS_BRK=HEAD+`
out vec4 o; uniform sampler2D tRM0,tS,tFx; uniform ivec2 uCells; uniform float uDx,uBreakD;
float E(vec2 c){ return textureLod(tRM0,(c+.5)/vec2(uCells),0.).x; }
vec4 St(vec2 c){ return texelFetch(tS,clamp(ivec2(floor(c+.5)),ivec2(0),uCells-1),0); }
void main(){
  vec2 p=floor(gl_FragCoord.xy);
  o=vec4(0.);
  vec4 C=St(p);
  /* Not the thin sheet of a wave running up the sand. */
  if(C.x<.15) return;
  /* Which way the front faces: downhill, measured across three cells so the top cell of a steep step
     still sees the drop just ahead of it. */
  vec2 g=vec2(E(p+vec2(1.5,0.))-E(p-vec2(1.5,0.)),E(p+vec2(0.,1.5))-E(p-vec2(0.,1.5)))/(3.*uDx);
  float gl=length(g); if(gl<.05) return;
  vec2 d=-g/gl;
  /* The crest moves the way it faces; water running back down over a step is not a breaking wave. */
  vec4 W=St(p-vec2(1.,0.)),Sv=St(p-vec2(0.,1.));
  if(dot(vec2(.5*(C.y+W.y),.5*(C.z+Sv.z)),d)<-.2) return;
  float eb=E(p-d),e0=E(p),a1=E(p+d),a2=E(p+2.*d),a3=E(p+3.*d),a4=E(p+4.*d),a5=E(p+5.*d);
  /* The shoulder of the front: gentle behind, steep ahead. Behind a spilling front the surface often
     keeps rising to a crest well back, so the highest point is no guide; the change of slope is, and
     each front has one. */
  float sBk=(eb-e0)/uDx, sF=(e0-a1)/uDx;
  if(!(sBk<.25&&sF>=.25)) return;
  float H=e0-min(min(min(a1,a2),min(a3,a4)),a5);
  float sA=max(max(max(e0-a1,a1-a2),a2-a3),a3-a4)/uDx;
  if(H<.12||sA<.3||e0-a3<.55*H) return;
  /* A front running into dry rock throws spray (js/shaders/spray.js), not a lip. */
  for(int k=1;k<=3;k++){ if(St(p+d*float(k)).x<.02) return; }
  /* Breaking: a steep front in water shallow enough for its height, or any very steep one. */
  float I=smoothstep(.28,.62,sA)*max(1.-smoothstep(uBreakD*.9,uBreakD*1.6,C.x),smoothstep(.75,1.25,sA));
  if(I<.03) return;
  /* Where along the cell the shoulder really is: where the slope passes 0.25, between the half cell
     behind and the half cell ahead. */
  float off=clamp((.25-sBk)/max(sF-sBk,1e-4),0.,1.)-.5;
  /* How long it has been breaking: a crest that has only just started has no trail of white water
     behind it yet. */
  float bub=max(textureLod(tFx,(p-3.*d+.5)/vec2(uCells),0.).g,textureLod(tFx,(p-5.*d+.5)/vec2(uCells),0.).g);
  float stage=smoothstep(.06,.34,bub);
  float bslope=(St(p+3.*d).w-C.w)/(3.*uDx);
  float plunge=max(smoothstep(.05,.18,bslope),smoothstep(1.,1.8,sA)*.7);
  /* A spilling front breaks when the simulation says so: fresh white water at its crest. Without it a
     steep but unbroken front drew a thin white line. A plunging lip is thrown before there's any, but
     only once the face stands nearly upright. */
  float fresh=max(textureLod(tFx,(p+.5)/vec2(uCells),0.).g,textureLod(tFx,(p+d+.5)/vec2(uCells),0.).g);
  I*=max(smoothstep(.02,.14,fresh),smoothstep(.3,.7,plunge)*smoothstep(.7,1.1,sA));
  if(I<.03) return;
  o=vec4(H*I,atan(d.y,d.x),floor(stage*63.+.5)+clamp(plunge,0.,.99),off);
}`;
/* Most cells of the strip aren't marked, and drawing a piece for every cell cost far too much. So first
   FS_BRKROW lists, for each row of the grid across the shore, the first BRK_K marked cells counting
   from the sea (a front crosses a row in a cell or two), and only those are drawn. Run per picture,
   only for the rows the camera can see. */
const BRK_K=6;
const FS_BRKROW=HEAD+`
out vec4 o; uniform sampler2D tBrk; uniform ivec2 uBand;
void main(){
  int k=int(gl_FragCoord.x), j=int(gl_FragCoord.y), n=0; float x=-1.;
  for(int i=uBand.y-1;i>=uBand.x;i--){ if(texelFetch(tBrk,ivec2(i,j),0).r>0.){ if(n==k){ x=float(i); break; } n++; } }
  o=vec4(x,0.,0.,1.);
}`;
const LIP_SEGS=12;
const VS_LIP=`#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
#define PI 3.14159265359
uniform sampler2D tBrk,tRow,tRM0,tLit,tEnv,tNoise,tLace;
uniform ivec2 uCells; uniform int uRow0,uK,uSegs;
uniform vec2 uDomMin,uDomSize,uJit; uniform float uDx,uTime,uTan,uAspect,uDA,uDB,uFogB,uCloudShade,uCloudT,uFar;
uniform vec3 uRo,uR,uU,uF,uSun;
`+CLOUD_SHADOW+`
out vec3 vP,vN,vT; out float vV,vS,vA,vHs,vStage,vK,vCap,vCs,vFog,vLump; out vec2 vLit; flat out vec3 vFogC;
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
struct Crest{ bool on; ivec2 q; vec2 P,d; float H,e,stage,plunge; };
/* A marked cell, if this one is. */
Crest crestAt(ivec2 q){
  Crest c; c.on=false; c.q=q; c.H=0.; c.P=vec2(0.); c.d=vec2(1.,0.); c.e=0.; c.stage=0.; c.plunge=0.;
  if(q.x<0||q.y<0||q.x>=uCells.x||q.y>=uCells.y) return c;
  vec4 v=texelFetch(tBrk,q,0);
  if(v.r<=0.) return c;
  c.on=true; c.H=v.r; c.d=vec2(cos(v.g),sin(v.g));
  float st=floor(v.b); c.stage=st/63.; c.plunge=v.b-st;
  vec2 cp=vec2(q)+c.d*v.a; c.P=uDomMin+(cp+.5)*uDx;
  c.e=textureLod(tRM0,(cp+.5)/vec2(uCells),0.).x;
  return c;
}
/* The next marked cell along the crest, on one side. */
Crest along(Crest c,ivec2 b,float side){
  vec2 t=vec2(-c.d.y,c.d.x)*side;
  vec2 want=c.P+t*uDx;
  Crest best=c; best.on=false; float bd=1.7*uDx;
  for(int k=0;k<3;k++){
    vec2 o2=t+c.d*(k==0?0.:(k==1?.8:-.8));
    ivec2 bb=b+ivec2(round(o2));
    if(bb==b) continue;
    Crest n=crestAt(bb);
    if(!n.on||dot(n.d,c.d)<.6) continue;
    float dd=length(n.P-want);
    if(dd<bd){ bd=dd; best=n; }
  }
  return best;
}
vec2 sP,sD; float sH,sE,sSt,sPl,sW;
void acc(Crest x,float w){ if(!x.on) return; sP+=x.P*w; sD+=x.d*w; sH+=x.H*w; sE+=x.e*w; sSt+=x.stage*w; sPl+=x.plunge*w; sW+=w; }
vec2 bez(vec2 a,vec2 b,vec2 c,vec2 d,float t){ float s=1.-t; return s*s*s*a+3.*s*s*t*b+3.*s*t*t*c+t*t*t*d; }
vec2 bezD(vec2 a,vec2 b,vec2 c,vec2 d,float t){ float s=1.-t; return 3.*s*s*(b-a)+6.*s*t*(c-b)+3.*t*t*(d-c); }
/* Clumps of tumbling white water: big and small, rolling forward and down the face. s runs along the
   crest in metres, a down the curl. */
float lumpAt(float s,float a){ return (textureLod(tLace,vec2(s*.045,a*.045-uTime*.05),0.).b-.5)*2.; }
`+HAZE+`
void main(){
  vP=vec3(0.); vN=vec3(0.,1.,0.); vT=vec3(1.,0.,0.); vA=0.; vV=0.; vS=0.; vHs=0.; vStage=0.; vK=0.; vCap=0.; vCs=1.; vFog=0.; vLit=vec2(1.); vFogC=vec3(0.); vLump=0.;
  ivec2 rk=ivec2(gl_InstanceID%uK,uRow0+gl_InstanceID/uK);
  float rx=texelFetch(tRow,rk,0).r;
  if(rx<0.){ gl_Position=vec4(2.,2.,2.,1.); return; }
  ivec2 b=ivec2(int(rx),rk.y);
  Crest c=crestAt(b);
  if(!c.on||c.H<.08){ gl_Position=vec4(2.,2.,2.,1.); return; }
  /* Three columns across the piece, drawn as two strips joined by a degenerate pair: the join with the
     piece before, the crest point itself, and the join with the piece after. */
  int nS=2*(uSegs+1), k0=gl_VertexID, i, col;
  if(k0<nS){ i=k0>>1; col=k0&1; }
  else if(k0==nS){ i=uSegs; col=1; }
  else if(k0==nS+1){ i=0; col=1; }
  else { int k1=k0-nS-2; i=k1>>1; col=1+(k1&1); }
  /* A marked cell on its own, with no neighbour along the crest, is no breaking front. */
  Crest l=along(c,b,-1.), r=along(c,b,1.);
  if(!l.on&&!r.on){ gl_Position=vec4(2.,2.,2.,1.); return; }
  /* Smoothed along the crest: marked cells sit up to half a cell either side of the true line, and the
     height jumps a little from one to the next, which made the white water hang in stripes down the
     face. The crest point averages 1:2:1 with its neighbours; a join between two pieces averages
     1:3:3:1 over the four cells round it, so both pieces work out exactly the same join. */
  sP=vec2(0.); sD=vec2(0.); sH=0.; sE=0.; sSt=0.; sPl=0.; sW=0.;
  float cap=1.;
  if(col==1){ acc(l,1.); acc(c,2.); acc(r,1.); }
  else {
    float side=float(col-1);
    Crest n=r, o=l;
    if(side<0.){ n=l; o=r; }
    if(n.on){ acc(o,1.); acc(c,3.); acc(n,3.); acc(along(n,n.q,side),1.); }
    else { acc(o,1.); acc(c,3.); sP+=vec2(-c.d.y,c.d.x)*side*uDx*.5*sW; sH*=.55; cap=0.; }
  }
  vec2 P=sP/sW, d=normalize(sD); float H=sH/sW, e=sE/sW, stage=sSt/sW, plunge=sPl/sW;
  /* Lip or roller: a plunging crest that has only just started to break throws a lip. */
  float k=clamp(plunge*(1.-stage),0.,1.);
  float v=float(i)/float(uSegs);
  vec2 t2=vec2(-d.y,d.x);
  float s=dot(P,t2);
  /* Neither is the same all along the crest: it bulges and reaches further in some places. */
  float nb=textureLod(tNoise,vec2(s*.017,uTime*.011),0.).g-.5, nr=textureLod(tNoise,vec2(s*.031+.4,uTime*.017),0.).r-.5;
  float bulge=1.+nb*.7, reach=1.+nr*.6;
  /* A spilling break starts as a small cap of white at the crest and grows down the face. */
  float hs=H*mix(mix(.4,1.,stage),1.,k);
  /* Profiles across the crest, in wave heights from the top of the crest, forward and up. The roller
     covers the whole face down to its foot, as the white water of a broken wave does: without it the
     face of a steep front showed as a wall of glass. */
  vec2 A=mix(vec2(-.42,-.05),vec2(-.24,-.08),k), B=mix(vec2(-.06,.17*bulge),vec2(.10,.34*bulge),k),
       Cc=mix(vec2(.46*reach,.10*bulge),vec2(1.05*reach,.32),k), D=mix(vec2(.90*reach,-1.0),vec2(1.05*reach,-1.0),k);
  vec2 q=bez(A,B,Cc,D,v), qd=bezD(A,B,Cc,D,v);
  vec3 d3=vec3(d.x,0.,d.y), t3=vec3(t2.x,0.,t2.y);
  vec3 T=normalize(d3*qd.x+vec3(0.,qd.y,0.));
  vec3 N=cross(t3,T);
  vec3 pos=vec3(P.x,e,P.y)+d3*q.x*hs+vec3(0.,q.y*hs,0.);
  /* Distance down the curl in metres, for the texture. */
  float a=0.; vec2 qp=A;
  for(int j=1;j<=32;j++){ if(j>i) break; vec2 qj=bez(A,B,Cc,D,float(j)/float(uSegs)); a+=length(qj-qp)*hs; qp=qj; }
  /* Pushed out along the surface's normal by the big clumps (the small ones are only in the shading);
     the normal follows their slopes. */
  float amp=min(hs*.2,.5)*(1.-k*.8)*sqrt(max(sin(v*PI),0.));
  float lump=lumpAt(s,a), eps=.25;
  float dls=(lumpAt(s+eps,a)-lump)/eps, dla=(lumpAt(s,a+eps)-lump)/eps;
  pos+=N*lump*amp;
  N=normalize(N-t3*dls*amp-T*dla*amp);
  /* Drawn only within uFar of the camera: faded out before that, so there's no edge. */
  cap*=1.-smoothstep(uFar*.6,uFar*.95,length(pos.xz-uRo.xz));
  vP=pos; vN=N; vT=T; vV=v; vS=s; vA=a; vHs=hs; vStage=stage; vK=k; vCap=cap; vLump=lump;
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
const FS_LIP=HEAD+`
in vec3 vP,vN,vT; in float vV,vS,vA,vHs,vStage,vK,vCap,vCs,vFog,vLump; in vec2 vLit; flat in vec3 vFogC; layout(location=0) out vec4 o;
uniform sampler2D tEnv,tNoise,tLace; uniform vec3 uRo,uSun,uSunE; uniform float uTime; uniform int uDbg;
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5); }
vec3 env(vec3 d,float lod){ return textureLod(tEnv,envUV(d),lod).rgb; }
vec3 skyIrr(vec3 n){ return textureLod(tEnv,envUV(normalize(n+vec3(0,.6,0))),6.2).rgb*PI*.68; }
float small(vec2 q){ return texture(tLace,q).b; }
void main(){
  vec3 V=normalize(uRo-vP), N=normalize(vN), T=normalize(vT), B=normalize(cross(T,N));
  /* Small clumps, in the shading only, faded out where they'd be smaller than a pixel. */
  float px=length(fwidth(vP))+1e-4;
  float fade=1.-smoothstep(.12,.45,px);
  vec2 sq=vec2(vS*.17+.3,vA*.17-uTime*.17); float e=.02;
  float l0=small(sq);
  vec2 sg=vec2(small(sq+vec2(e,0.))-l0,small(sq+vec2(0.,e))-l0)/e*.17;
  N=normalize(N+(B*sg.x+T*sg.y)*.55*fade*(1.-vK*.7));
  /* Seen from its inside, a lip is in the shade of the curl. A roller of foam has no inside: there
     the turn away from the camera would only draw a dark seam along its top. */
  float facing=dot(N,V);
  float inside=smoothstep(.15,-.15,facing)*vK;
  if(facing<0.) N=-N;
  /* Texture moves with the wave: across the crest it stays put, and down the curl it flows from the back
     of the crest toward the falling edge. Both directions in metres, so clumps are round, not streaks. */
  /* Filtered reads (not the finest level), so far away the texture averages out instead of sparkling. */
  float n1=texture(tLace,vec2(vS*.13+.7,vA*.13-uTime*.12)).b;
  float n2=texture(tNoise,vec2(vS*.045,vV*.42-uTime*.33)).g;
  float n3=texture(tLace,vec2(vS*.29+.5,vA*.29-uTime*.2)).b;
  /* The lip is clear water at its root and turns white as air gets into it on the way down. */
  float wLip=smoothstep(.30,.92,vV+(n2-.5)*.4)*.9+n3*.25*smoothstep(.15,.5,vV);
  float white=clamp(mix(wLip,1.,max(vStage,1.-vK)),0.,1.);
  /* Opacity: lower down the face the white water breaks into clumps with water between; the falling edge
     is ragged, in fingers; the ribbon fades out where the crest ends, and grows out of the water behind
     the crest. */
  float a=.97;
  float clumps=smoothstep(.34,.58,n1*.6+n3*.3+(1.-vV)*.3);
  a*=mix(1.,clumps,smoothstep(.5,.95,vV)*(1.-vK));
  a*=1.-smoothstep(.80,1.,vV+(n2-.5)*.34+(n3-.5)*.16);
  /* The back edge and the ends are ragged too, so seen from above they blend into the foam on the water
     instead of showing as straight lines. */
  a*=smoothstep(0.,.3,vV-.06+(n1-.5)*.3)*smoothstep(0.,.85,vCap+(n3-.5)*.5*(1.-vCap));
  /* White water is fluffy: seen edge-on it thins out, so its outline is soft rather than a hard line. */
  a*=mix(1.,smoothstep(.04,.42,abs(dot(normalize(vN),V))),1.-vK*.6);
  if(a<.004) discard;
  /* White water: lit like the foam on the water (foamShade in js/shaders/view.js). Light scatters so
     much inside foam that its brightness hardly depends on which way it faces, so it's lit with its
     normal bent well toward the sky. The hollows between clumps and the inside of the curl are in some
     shade, and with the sun behind it it glows. */
  vec3 Nl=normalize(N+vec3(0.,1.1,0.));
  float hollow=smoothstep(-.7,.5,vLump)*mix(.8,1.,l0);
  float diff=max(clamp((dot(Nl,uSun)+.42)/1.42,0.,1.),max(uSun.y,0.)*.75);
  float glow=pow(max(dot(-V,uSun),0.),3.)*.4;
  vec3 Ef=uSunE*(diff*mix(.8,1.,hollow)+glow)*vLit.x*vCs*mix(1.,.5,inside)+skyIrr(vec3(0.,1.,0.))*vLit.y*mix(.85,1.,hollow)*mix(1.,.6,inside);
  vec3 Lf=vec3(.91,.94,.95)*(.93+.07*l0)/PI*Ef;
  /* Clear water: sky in the surface, and green light coming through the thin sheet, brightest with the
     sun behind it. */
  float NV=max(dot(N,V),.02);
  float Fr=.02+.98*pow(1.-NV,5.);
  vec3 R=reflect(-V,N); R.y=abs(R.y)+.005;
  vec3 refl=env(normalize(R),2.)*mix(.5,1.,vLit.y);
  float back=pow(max(dot(-V,uSun),0.),4.);
  vec3 Lt=vec3(.10,.40,.34)*(skyIrr(vec3(0.,1.,0.))*vLit.y*.30+uSunE*max(uSun.y,.06)*vLit.x*vCs*(.10+.9*back))*mix(1.,.6,inside);
  vec3 Lw=Lt*(1.-Fr)+refl*Fr;
  vec3 L=mix(Lw,Lf,white);
  L=mix(L,vFogC,vFog);
  o=vec4(L*a,a);
  if(uDbg==1) o=vec4(vec3(vK,vCap*(1.-vK),vStage)*(.5+.5*fract(vS*.5))*2.,1.);
}`;

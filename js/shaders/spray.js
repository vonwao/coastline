'use strict';
/* ------ Spray thrown up where waves hit rock. Each particle is one texel: position and life in one
   texture, velocity and size in another. Dead particles test a random water cell each frame and
   come back to life if that cell is slamming into rock, so plumes follow the real flow.
   Two kinds: small droplets on real ballistic arcs, and faint mist that hangs low and drifts.
   One mist puff alone is almost invisible; only many together read as white. ------ */
const FS_SPRAY_STEP=HEAD+SIM_COMMON+`
layout(location=0) out vec4 oP; layout(location=1) out vec4 oV;
uniform sampler2D tP,tV;
vec3 h3(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
void main(){
  ivec2 i=ivec2(gl_FragCoord.xy);
  vec4 P=texelFetch(tP,i,0),V=texelFetch(tV,i,0);
  if(P.w>0.){
    bool mist=V.w>.6;
    if(mist){
      /* Air holds it up: it slows quickly, sinks gently and drifts with the onshore wind. */
      V.xyz+=(vec3(-1.3,-.35,.3)-V.xyz)*(1.-exp(-2.2*uDt));
    } else {
      V.y-=9.81*uDt;
      V.xyz*=exp(-.12*uDt);
    }
    P.xyz+=V.xyz*uDt;
    P.w-=uDt;
    if(P.y<-1.2) P.w=0.;
  } else {
    vec3 r=h3(vec3(vec2(i)+.5,mod(uT*97.3,1000.)));
    ivec2 c=ivec2(r.xy*vec2(uCells-2))+1;
    vec4 C=F(c);
    if(C.x>.04){
      vec4 E=F(c+ivec2(1,0)),W=F(c-ivec2(1,0)),N=F(c+ivec2(0,1)),S=F(c-ivec2(0,1));
      vec2 vel=vec2(.5*(C.y+W.y),.5*(C.z+S.z));
      vec2 gb=vec2(E.w-W.w,N.w-S.w)/(2.*uDx);
      float steep=length(gb),sp=length(vel);
      float hit=max(dot(vel,gb),0.)*smoothstep(.3,.9,steep);
      float e=C.x+C.w;
      vec2 ge=vec2(E.x+E.w-(W.x+W.w),N.x+N.w-(S.x+S.w))/(2.*uDx);
      float div=(C.y-W.y+C.z-S.z)/uDx;
      float crest=smoothstep(.14,.4,length(ge))*smoothstep(.2,.8,-div)*(1.-smoothstep(uBreakD*.8,uBreakD*1.4,C.x));
      vec3 q=h3(r*311.+vec3(i.yx,7.));
      vec3 q2=h3(q*173.+3.);
      /* Chances are per 1/60 s, so smaller time steps don't throw up more spray. */
      float kDt=min(uDt*60.,1.);
      float pHit=smoothstep(.15,1.5,hit)*kDt, pCrest=crest*.035*kDt;
      if(q.x<pHit||q.y<pCrest){
        bool big=q.x<pHit;
        bool mist=big&&q2.y<.13;
        vec2 away=steep>.01?-gb/steep:vec2(0.);
        /* A jet off a wall leaves at up to about twice the speed of the water hitting it, which
           caps ordinary hits near 5 m high and the rare hard one near 10 m. */
        float up=big?min(sp*(.55+1.7*q2.x*q2.x)+.5,14.):(.6+1.6*q2.x);
        vec2 side=(q2.zx-.5)*(big?3.4:1.6);
        V.xyz=vec3(vel.x*.25+away.x*q2.z*2.2+side.x,up,vel.y*.25+away.y*q2.z*2.2+side.y);
        if(mist){ V.w=mix(.75,2.1,q.z*q.z); V.xyz*=.45; P.w=.7+1.2*q2.x; }
        else { V.w=mix(.035,.13,q.z*q.z); P.w=3.; }
        P.xyz=vec3(uDomMin.x+(float(c.x)+r.z)*uDx,e+.1,uDomMin.y+(float(c.y)+q.y)*uDx);
      }
    }
  }
  oP=P; oV=V;
}`;
const VS_SPRAY=`#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D tP,tV,tLit,tEnv; uniform int uTexN;
uniform vec3 uRo,uR,uU,uF,uSun,uSunE; uniform float uTan,uAspect,uDA,uDB,uDensity,uResY;
uniform vec2 uDomMin,uDomSize,uJit;
out vec2 vUV; out vec4 vCol; out vec2 vN; flat out float vMist;
vec2 envUV(vec3 d){ return vec2(atan(d.z,d.x)/6.28318+.5,asin(clamp(d.y,-1.,1.))/3.14159+.5); }
void main(){
  ivec2 ti=ivec2(gl_InstanceID%uTexN,gl_InstanceID/uTexN);
  vec4 P=texelFetch(tP,ti,0),V=texelFetch(tV,ti,0);
  vec2 c=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1));
  vUV=c; vMist=0.;
  if(P.w<=0.){ gl_Position=vec4(2.,2.,2.,1.); vCol=vec4(0.); vN=vec2(0.); return; }
  bool mist=V.w>.6;
  vec3 toP=P.xyz-uRo; float z0=max(dot(toP,uF),1.);
  float px=z0*2.*uTan/uResY;
  vec3 pos; float a;
  if(mist){
    float s=V.w*(1.+.9*(1.-min(P.w/2.3,1.)));
    pos=P.xyz+(uR*(c.x-.5)+uU*(c.y-.5))*s*2.;
    a=smoothstep(0.,.8,P.w)*.075;
    vMist=1.;
  } else {
    /* A droplet smears along its path during the camera's shutter time. Too small to resolve, it
       covers part of a pixel: draw it one pixel wide and fainter in proportion. */
    float sp=length(V.xyz);
    vec3 ax=sp>.01?V.xyz/sp:uU;
    vec3 sd=normalize(cross(ax,normalize(toP)));
    float wd=max(V.w,px*1.15), ln=max(V.w*1.6+sp*.022,px*1.5);
    pos=P.xyz+sd*(c.x-.5)*wd+ax*(c.y-.5)*ln;
    a=.8*clamp((V.w/wd)*(.45+.55*min(V.w*1.6+sp*.022,ln)/ln),.08,1.);
  }
  vec3 v=pos-uRo; float z=dot(v,uF);
  gl_Position=vec4(dot(v,uR)/(uTan*uAspect),dot(v,uU)/uTan,uDA*z+uDB,z); gl_Position.xy-=uJit*gl_Position.w;
  vec2 luv=(P.xz-uDomMin)/uDomSize;
  float lit=textureLod(tLit,luv,0.).r;
  vec3 sky=textureLod(tEnv,envUV(vec3(0.,1.,0.)),6.2).rgb*3.14159*.68;
  float fw=pow(max(dot(normalize(toP),uSun),0.),6.);
  vec3 col=(uSunE*max(uSun.y,.2)*(.42+.58*lit)*(.85+1.4*fw)+sky)/3.14159*.92;
  vCol=vec4(col,a*uDensity);
  vN=P.xz*.013+vec2(float(ti.x),float(ti.y))*.137;
}`;
const FS_SPRAY=HEAD+`
in vec2 vUV; in vec4 vCol; in vec2 vN; flat in float vMist; layout(location=0) out vec4 o; uniform sampler2D tNoise;
void main(){
  vec2 q=vUV*2.-1.; float a;
  if(vMist>.5){
    float d=dot(q,q); if(d>=1.) discard;
    float n=textureLod(tNoise,vUV*.62+vN,0.).r*textureLod(tNoise,vUV*1.9+vN*1.7,0.).g;
    a=vCol.a*exp(-3.2*d)*(1.-d)*clamp(.15+3.4*n,0.,1.6);
  } else {
    a=vCol.a*(1.-q.x*q.x)*(1.-q.y*q.y);
  }
  if(a<=.001) discard;
  o=vec4(vCol.rgb*a,a);
}`;

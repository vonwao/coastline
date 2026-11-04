'use strict';
/* ------ Procedural coast. Height plus material masks ------ */
const TERRAIN_ROCK=`
mat2 rot2(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
/* Jointed rock: Voronoi cells, each one a tilted block, with a crack along every edge. */
float blocks(vec2 p,float cell,float amp,float crackD){
  vec2 x=p/cell,ic=floor(x),fc=x-ic; float F1=9.,F2=9.; vec2 id=vec2(0.),rn=vec2(0.);
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 g=vec2(i,j),r=g+hash22(ic+g)-fc; float dd=dot(r,r);
    if(dd<F1){F2=F1;F1=dd;id=ic+g;rn=r;} else if(dd<F2) F2=dd;
  }
  vec2 tilt=hash22(id+11.)-.5;
  float h=hash21(id+5.)-.5+dot(rn,tilt)*1.1;
  float crack=sqrt(F2)-sqrt(F1);
  return amp*(h-crackD*(1.-smoothstep(0.,.16,crack)));
}
vec2 rockRelief(vec2 q){
  vec2 w=vec2(fbm(q/24.,3),fbm(q/24.+7.,3))-.5, w2=vec2(fbm(q/6.5,3),fbm(q/6.5+3.,3))-.5;
  vec2 a=rot2(.6)*(q+w*16.+w2*8.);
  float big=blocks(a*vec2(1.,1.7),30.,5.5,.14)+blocks(rot2(1.1)*(q+w*6.+w2*4.),10.,2.4,.24);
  float fine=0.;
  if(uNear>.5){
    fine=blocks(rot2(2.1)*(q+w2*1.6),3.3,.85,.42);
    if(uTexel<.42) fine+=blocks(rot2(.4)*q,1.15,.26,.42)+(ridged(q/2.7,3)-.4)*.22;
  }
  return vec2(big,fine);
}
`;
const FS_TERRAIN=HEAD+NOISE+`
in vec2 vUV; layout(location=0) out vec4 o; uniform vec2 uMin,uSize; uniform float uSeed,uNear,uTexel; uniform int uType,uForm;

float fine(vec2 p,int o1,int o2){ return uNear>.5?fbm(p,o2):fbm(p,o1); }

vec4 tropical(vec2 p){
  vec2 q=p+uSeed*vec2(37.,91.);
  float sh=22.*sin(p.y/310.+uSeed)+10.*sin(p.y/127.+2.+uSeed*2.)+24.*(fbm(vec2(q.y/420.,uSeed),3)-.5);
  float d=p.x-sh+7.*(fbm(q/60.,3)-.5);
  float h,veg=0.,patchy=0.;
  if(d>=0.){
    float deep=.016*d+.055*pow(d,.72);
    float off=420.+180.*(fbm(q/520.,3)-.5);
    deep+=26.*smoothstep(off,off+280.,d);
    float bars=smoothstep(25.,70.,d)*(1.-smoothstep(230.,340.,d));
    deep-=1.5*bars*max(fbm(vec2(q.x/46.,q.y/170.),4)-.40,0.);
    h=-deep+(fine(q/16.,3,5)-.5)*.32*smoothstep(3.,28.,d);
    h+=(fbm(q/3.3,3)-.5)*.07*smoothstep(1.,12.,d);
    vec2 wp=q+40.*vec2(fbm(q/90.,3),fbm(q/90.+4.,3));
    float sg=fine(wp/34.,4,6);
    patchy=smoothstep(.535,.625,sg)*smoothstep(55.,120.,d)*(1.-smoothstep(390.,520.,d));
    h+=patchy*.3*fbm(q/2.2,3);
  } else {
    h=1.7*(1.-exp(d/15.));
    h+=(fine(q/28.,3,5)-.5)*1.1*smoothstep(-12.,-40.,d);
    float eN=16.*(fbm(q/34.,3)-.5)+7.*(fbm(q/4.5,4)-.5);
    float veM=smoothstep(-46.,-66.,d+eN);
    veg=smoothstep(-16.,-72.,d+eN*.8);
    float hv=smoothstep(.30,.95,veM);
    h+=hv*(1.1+1.5*fbm(q/23.,3));
    patchy=veg;
    h+=smoothstep(-400.,-1800.,d)*26.*fbm(q/300.,5);
    h+=smoothstep(-650.,-2700.,d)*420.*pow(fbm(q/1500.,4),1.5);
  }
  return vec4(h,0.,veg,patchy);
}

vec4 surf(vec2 p){
  vec2 q=p+uSeed*vec2(53.,29.);
  float sh=34.*sin(p.y/900.+uSeed)+16.*(fbm(vec2(q.y/300.,uSeed),3)-.5);
  float d=p.x-sh;
  float h,veg=0.,litter=0.;
  float yw=q.y;
  float cuspPh=yw*2.*PI/27.+4.*fbm(vec2(yw/70.,1.3),2);
  if(d>=0.){
    float deep=.032*d+.075*pow(d,.67);
    float rip=smoothstep(.30,.56,fbm(vec2(yw/210.,3.1),3));
    float bx=88.+50.*(fbm(vec2(yw/270.,7.),3)-.5);
    deep-=1.15*rip*exp(-pow((d-bx)/34.,2.));
    deep-=.55*exp(-pow((d-235.)/70.,2.))*fbm(vec2(yw/320.,2.),2)*2.;
    deep+=4.5*smoothstep(350.,900.,d);
    h=-deep+(fbm(q/21.,4)-.5)*.3*smoothstep(4.,40.,d);
    h+=.11*sin(cuspPh)*exp(-pow(d/11.,2.));
  } else {
    h=2.3*(1.-exp(d/19.));
    h+=.13*sin(cuspPh)*exp(-pow(d/8.,2.));
    float dn=smoothstep(-52.,-110.,d+22.*(fbm(q/70.,3)-.5));
    h+=dn*(7.5*fbm(q/42.,5)+.8*fbm(q/6.,3));
    float eS=18.*(fbm(q/48.,3)-.5)+6.*(fbm(q/5.,4)-.5);
    veg=smoothstep(-30.,-118.,d+eS)*(.55+.9*fbm(q/31.,3));
    litter=veg;
    float inland=smoothstep(-280.,-520.,d);
    veg=max(veg,inland*.97);
    h+=inland*(3.+3.*fbm(q/38.,3));
    h+=smoothstep(-500.,-3000.,d)*90.*fbm(q/620.,5);
    h+=smoothstep(-900.,-3400.,d)*520.*pow(fbm(q/1700.,4),1.6);
  }
  float pa=smoothstep(.55,.72,fbm(vec2(q.x/3.1,q.y/38.),4))*.42*smoothstep(-70.,-30.,d);
  return vec4(h,0.,veg,max(pa,litter));
}

`+TERRAIN_ROCK+`
/* form 0: high cliffs with a narrow bench. form 1: low cliffs and a wide wave-cut platform.
   form 2: a low headland behind a broad reef of ridges, channels and outcrops. */
vec4 rockyRaw(vec2 p){
  vec2 q=p+uSeed*vec2(71.,13.);
  int form=uForm;
  float coast=170.*(fbm(vec2(q.y/640.,uSeed),4)-.5)*(form==2?.6:1.);
  float cove=form==1?exp(-pow((p.y-60.)/72.,2.)):0.;
  float d=p.x-coast+58.*(fbm(q/88.,4)-.5)+15.*(ridged(q/27.,4)-.45)+58.*cove;
  if(form==0) d+=26.*(ridged(q/46.,3)-.42);
  /* Tilted beds of rock: each has a long gentle back and a short steep front. */
  float ang=(form==2?.82:.34)+uSeed*.37; vec2 sv=vec2(cos(ang),sin(ang));
  float warp=16.*(fbm(q/70.,3)-.5)+3.5*(fbm(q/15.,3)-.5);
  float bed=(dot(q,sv)+warp)/(form==2?19.:14.);
  float saw=fract(bed),scarp=saw<.78?saw/.78:(1.-saw)/.22;
  float bedK=smoothstep(.28,.66,fbm(q/65.,3));
  float ledge=(scarp-.45)*2.1*bedK;
  /* Surge channels cut along the beds */
  vec2 cq=rot2(ang)*q+11.*vec2(fbm(q/48.,3),fbm(q/48.+5.,3));
  float chan=smoothstep(.70,.90,ridged(vec2(cq.x/34.,cq.y/170.),3));
  float h,veg=0.,sand=0.;
  if(d>=0.){
    float Pw=(form==0?20.:form==1?62.:165.)*(.55+.9*fbm(q/190.,3));
    float pk=smoothstep(0.,Pw,d);
    float plat=mix(form==0?.55:.25,form==0?-1.25:-1.6,pk)+ledge-chan*(1.2+2.4*pk);
    float off=smoothstep(Pw*.82,Pw*1.1+26.,d);
    float past=max(d-Pw*.82,0.);
    h=mix(plat,-min(2.4+.20*past+.9*sqrt(past),32.),off);
    sand=smoothstep(.4,.8,cove)*smoothstep(52.,14.,d);
    h=mix(h,-(.055*d),sand);
  } else {
    float C=form==0?(26.+24.*fbm(q/230.,4)):form==1?(8.+15.*fbm(q/170.,4)):(3.5+7.*fbm(q/130.,4));
    float W=C*(.55+.75*fbm(q/40.,3))+2.;
    float prof=smoothstep(0.,W,-d);
    h=.55+ledge*(1.-prof)+C*pow(prof,.82);
    h+=prof*prof*(4.*ridged(q/43.,uNear>.5?5:3));
    h+=smoothstep(-200.,-2200.,d)*96.*fbm(q/650.,5);
    float inl=smoothstep(W+5.,W+24.,-d+12.*(fbm(q/31.,3)-.5));
    veg=inl*(.42+.92*fbm(q/23.,4));
    h+=veg*(.3+.5*fbm(q/7.,3));
    float bs=smoothstep(.4,.8,cove)*smoothstep(-36.,-12.,d);
    if(bs>0.){ sand=bs; h=mix(h,1.5*(1.-exp(d/10.)),bs); }
  }
  /* Stacks, skerries and half-drowned reefs, long in the direction of the beds */
  const float OC=62.;
  vec2 ic=floor(q/OC),fc=q/OC-ic;
  vec2 wr=7.*(vec2(fbm(q/12.,2),fbm(q/12.+9.,2))-.5);
  mat2 mr=rot2(ang);
  float keepP=form==0?.60:form==1?.50:.26, reach=form==0?170.:form==1?125.:300.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 g=vec2(x,y),jt=hash22(ic+g+3.),r=(g+jt-fc)*OC+wr;
    float cellD=d-r.x;
    if(jt.y<keepP) continue;
    float zoneK=smoothstep(-12.,3.,cellD)*(1.-smoothstep(reach-35.,reach,cellD));
    if(zoneK<=0.) continue;
    float kk=(jt.y-keepP)/(1.-keepP);
    float R=mix(7.,form==2?33.:25.,jt.x*jt.x);
    vec2 rr=mr*r*vec2(1.,1.+.9*jt.x);
    float rd=length(rr)/R;
    if(rd>=1.35) continue;
    rd+=(fbm(q/(R*.42)+jt*9.,3)-.5)*.75;
    if(rd>=1.) continue;
    float peak=form==0?mix(-1.,15.,kk*kk):form==1?mix(-1.,9.,kk*kk):mix(-1.4,6.5,kk*kk*kk);
    float bump=-6.5+(peak+6.5)*pow(1.-max(rd,0.)*max(rd,0.),.42)+ledge*.6;
    bump=min(bump,peak*(.62+.3*jt.x)+.4*ledge);
    bump=mix(-8.,bump,zoneK);
    if(bump>h){ h=bump; sand=0.; }
  }
  /* Rock is broken into big blocks, then cut into dipping ledges by its beds, then given fine relief.
     The ledges come after the big blocks: cut first, the blocks' sharp corners poked out of every
     ledge as rows of little teeth along the cliff faces. */
  float rockK=1.-sand;
  vec2 rel=rockRelief(q);
  float vK=rockK*(1.-.8*veg);
  float hIn=h;
  float wall=smoothstep(.5,1.7,length(vec2(dFdx(hIn),dFdy(hIn)))/uTexel);
  h+=rel.x*smoothstep(.8,5.,hIn)*vK*mix(1.,.34,wall);
  if(h>1.5&&veg<.5){
    float st=form==2?1.9:3.1, tilt=dot(q,sv)*.055;
    float xs=(h+tilt)/st;
    float xt=(floor(xs)+smoothstep(0.,.55,fract(xs)))*st-tilt;
    h=mix(h,xt,.72*smoothstep(1.5,3.5,h)*(1.-veg));
    if(form==0){ float xb=(h+tilt)/11.5; float xu=(floor(xb)+smoothstep(0.,.62,fract(xb)))*11.5-tilt; h=mix(h,xu,.5*smoothstep(4.,9.,h)*(1.-veg)); }
  }
  h+=rel.y*mix(.34,1.,smoothstep(1.,5.,hIn))*smoothstep(-3.2,.4,hIn)*vK*mix(1.,.12,wall);
  /* Pale sand collects in the low parts of the reef. */
  if(d>=0.) sand=max(sand,smoothstep(-1.4,-3.2,h)*smoothstep(.42,.58,fbm(q/34.,4)));
  return vec4(h,0.,veg,sand);
}
vec4 rocky(vec2 p){
  vec4 a=rockyRaw(p);
  float sl=length(vec2(dFdx(a.x),dFdy(a.x)))/uTexel;
  a.y=max(smoothstep(.34,.72,sl),a.x<3.2?1.:0.);
  a.y=max(a.y,(1.-a.z)*smoothstep(0.,.1,a.x));
  a.w*=1.-smoothstep(1.5,2.7,a.x);
  a.y*=1.-a.w;
  return a;
}
void main(){
  vec2 p=uMin+vUV*uSize;
  o = TERRAIN_KIND(p);
}`;
/* One program for each kind of coast (uType 0, 1, 2). As one shader that chose by uType, the D3D compiler
   took 27 s, most of the startup; apart, the three compile side by side in about 5 s. */
const FS_TERRAIN_KINDS=['tropical','surf','rocky'].map(f=>FS_TERRAIN.replace('TERRAIN_KIND',f));

const FS_TERRAIN_MIX=HEAD+NOISE+`
in vec2 vUV; layout(location=0) out vec4 o; uniform vec2 uMin,uSize; uniform float uSeed,uNear,uTexel,uHalf; uniform int uForm; uniform sampler2D tNoise;
/* Noise from the baked texture: as good for shapes this size, and it keeps the shader small. Full
   noise functions get unrolled by the D3D compiler, and this shader took a minute to compile with them. */
float fa(vec2 p){ return textureLod(tNoise,p/4.,0.).r; }
float ra(vec2 p){ float b=textureLod(tNoise,p/6.,0.).b; return b*b; }
`+TERRAIN_ROCK+`
/* Granite boulders, rounded by weathering, on a jittered grid. Each is a squat ellipsoid standing on
   the ground beneath it; where boulders overlap the higher one wins, leaving crevices between them.
   dens (0 to 1) thins them out and makes them smaller. dens is known only at the point being baked,
   not at each boulder's centre, so a boulder sinks smoothly into the ground as dens falls past its
   own threshold; a hard cut-off sliced boulders in half with sheer walls. */
float boulders(vec2 q,float cell,float rMin,float rMax,float dens,float base,float seed){
  float h=-99.;
  vec2 ic=floor(q/cell),fc=q/cell-ic;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 g=vec2(i,j),r=hash22(ic+g+seed);
    float on=smoothstep(0.,.3,dens-r.y);
    if(on<=0.) continue;
    vec2 c=(g+.12+.76*hash22(ic+g+seed+17.)-fc)*cell;
    float rad=mix(rMin,rMax,pow(r.x,1.6))*(.7+.3*dens);
    vec2 e=rot2(r.x*6.28)*c*vec2(1.,1.+.6*fract(r.x*7.31));
    float dd=dot(e,e)/(rad*rad);
    if(dd<1.){
      float tall=rad*(.5+.4*fract(r.y*13.7))*(.75+.25*dens);
      h=max(h,base+((tall+.8)*sqrt(1.-dd)-.8)*on);
    }
  }
  return h;
}
/* Coasts that mix sand and rock. form 3: a crescent bay between headlands. form 4: a broken coast of
   points and pocket beaches. form 5: a palm-fringed cove with a rocky point.
   rk says how rocky each stretch is. Beyond the simulated part, the coast swings out and back
   by hundreds of metres, so the view ends in distant headlands rather than a straight line. */
vec4 mixedCoast(vec2 p){
  vec2 q=p+uSeed*vec2(71.,13.);
  float y=p.y,yE=max(abs(y)-uHalf,0.);
  float nA=fa(vec2(y/150.,uSeed+q.x/500.)),nB=fa(q/95.);
  float coast,rk;
  if(uForm==3){
    float t=y/300.,at=abs(t);
    coast=-175.*exp(-t*t)+70.*exp(-pow((at-1.25)/.38,2.))+22.*(fa(vec2(y/90.,uSeed))-.5);
    rk=smoothstep(.78,1.08,at+(nB-.5)*.55);
  } else if(uForm==4){
    coast=150.*(fa(vec2(y/240.,uSeed))-.5)+70.*(fa(vec2(y/70.,uSeed+3.))-.5);
    rk=smoothstep(.40,.50,nA+(nB-.5)*.25);
  } else if(uForm==5){
    float t=(y-70.)/250.;
    coast=-150.*exp(-t*t)+85.*exp(-pow((y+330.)/85.,2.))+16.*(fa(vec2(y/80.,uSeed))-.5);
    rk=max(smoothstep(.5,.85,exp(-pow((y+330.)/120.,2.))),smoothstep(.60,.68,nB)*.9);
  } else {
    /* form 6, an alpine lake: a gently wandering shore with rocky stretches. */
    coast=70.*(fa(vec2(y/380.,uSeed))-.5)+25.*(fa(vec2(y/110.,uSeed+3.))-.5);
    rk=smoothstep(.56,.68,nB)*.85;
  }
  coast+=smoothstep(0.,1200.,yE)*(1500.*(fa(vec2(y/3600.,uSeed))-.5)+320.*(fa(vec2(y/700.,uSeed+9.))-.5));
  rk=mix(rk,smoothstep(.44,.56,fa(vec2(y/420.,uSeed+5.))),smoothstep(0.,300.,yE));
  /* A ragged shoreline where the coast is rocky. Not at Palm cove: there it folded the beach into
     pointed ridges, and its boulders make the shoreline ragged instead. */
  float d=p.x-coast+rk*(uForm==5?.3:1.)*(46.*(fa(q/88.)-.5)+15.*(ra(q/27.)-.45)+6.*(fa(q/8.)-.5))+(1.-rk)*7.*(fa(q/60.)-.5);
  float ang=.5+uSeed*.37; vec2 sv=vec2(cos(ang),sin(ang));
  float warp=16.*(fa(q/70.)-.5)+3.5*(fa(q/15.)-.5);
  float bed=(dot(q,sv)+warp)/14.;
  float saw=fract(bed),scarp=saw<.78?saw/.78:(1.-saw)/.22;
  float ledge=(scarp-.45)*2.1*smoothstep(.28,.66,fa(q/65.));
  vec2 cq=rot2(ang)*q+11.*vec2(fa(q/48.),fa(q/48.+5.));
  float chan=smoothstep(.70,.90,ra(vec2(cq.x/34.,cq.y/170.)));
  float cuspPh=y*2.*PI/27.+4.*fa(vec2(y/70.,1.3));
  float h,veg=0.;
  if(d>=0.){
    float deepB=uForm==5?.016*d+.055*pow(d,.72)+10.*smoothstep(300.,700.,d):.032*d+.075*pow(d,.67)+4.5*smoothstep(350.,900.,d);
    if(uForm!=5) deepB-=1.15*smoothstep(.30,.56,fa(vec2(y/210.,3.1)))*exp(-pow((d-88.-50.*(fa(vec2(y/270.,7.))-.5))/34.,2.));
    float hB=-deepB+(fa(q/21.)-.5)*.3*smoothstep(4.,40.,d)+.11*sin(cuspPh)*exp(-pow(d/11.,2.));
    float Pw=70.*(.55+.9*fa(q/190.)),pk=smoothstep(0.,Pw,d);
    float plat=mix(.25,-1.6,pk)+ledge-chan*(1.2+2.4*pk);
    float past=max(d-Pw*.82,0.);
    float hR=mix(plat,min(hB,-1.)-.5,smoothstep(Pw*.82,Pw*1.1+26.,d));
    rk*=1.-smoothstep(Pw*1.1,Pw*1.1+70.,d);
    /* Palm cove has no rock platform: its boulders stand straight on the sand of the seabed. */
    h=uForm==5?hB:mix(hB,hR,rk);
  } else {
    float hB=2.2*(1.-exp(d/17.))+.13*sin(cuspPh)*exp(-pow(d/8.,2.));
    hB+=smoothstep(-48.,-105.,d+22.*(fa(q/70.)-.5))*(uForm==5?2.5:6.5)*fa(q/42.);
    float eS=18.*(fa(q/48.)-.5)+6.*(fa(q/5.)-.5);
    float vB=smoothstep(-22.,-95.,d+eS)*(.55+.9*fa(q/31.));
    /* Rock shows only at the shore: a little way inland it all becomes the same hillside. */
    rk*=1.-.85*smoothstep(-110.,-260.,d);
    float C=(uForm==3?14.+26.*fa(q/170.):uForm==4?6.+18.*fa(q/170.):7.+12.*fa(q/170.));
    hB+=C*.9*smoothstep(-70.,-300.,d);
    float W=C*(.55+.75*fa(q/40.))+2.,prof=smoothstep(0.,W,-d);
    /* Palm cove's point is a low, rounded rise; its boulders, added below, give it its shape. */
    float hC=uForm==5?.55+C*.5*pow(prof,.8):.55+ledge*(1.-prof)+C*pow(prof,.82)+prof*prof*4.*ra(q/43.);
    float vC=smoothstep(W+5.,W+24.,-d+12.*(fa(q/31.)-.5))*(.42+.92*fa(q/23.));
    /* At Palm cove only the main point rises; small rocky patches on the beach are boulders on flat sand. */
    h=mix(hB,hC,uForm==5?smoothstep(.85,1.,rk):rk); veg=mix(vB,vC,rk);
    h+=veg*(.3+.5*fa(q/7.));
    float inland=smoothstep(-260.,-520.,d);
    veg=max(veg,inland*.97);
    h+=inland*(3.+3.*fa(q/38.));
    h+=smoothstep(-500.,-3000.,d)*90.*fa(q/620.);
    h+=smoothstep(-900.,-3400.,d)*(uForm==5?420.:520.)*pow(fa(q/1700.),1.6);
  }
  if(uForm==6){
    /* An alpine lake in a glacial valley. The lake shelves steeply to tens of metres; its far shore is
       about 800 m away. On both sides a narrow gravel shore gives way to forested slopes, then to bare
       rock and snowy peaks two kilometres high. */
    float dFar=d-820.-260.*(fa(vec2(y/1400.,uSeed+2.))-.5)-60.*(fa(vec2(y/300.,uSeed+4.))-.5);
    float eS=18.*(fa(q/48.)-.5)+6.*(fa(q/5.)-.5);
    if(d>=0.&&dFar<0.){
      float u=min(d,-dFar);
      h=-(.06*u+1.1*pow(u,.62))+(fa(q/21.)-.5)*.4*smoothstep(4.,40.,u);
      veg=0.;
    } else {
      float u=d<0.?-d:dFar;
      vec2 qm=q+(d<0.?0.:3100.);
      float ridge=ra(qm/1900.),hump=fa(qm/800.);
      h=1.4*(1.-exp(-u/10.))
        +smoothstep(0.,260.,u)*(25.+70.*fa(qm/180.))
        +smoothstep(120.,2600.,u)*(700.+1500.*ridge)*(.55+.6*hump)
        +smoothstep(300.,1800.,u)*240.*ra(qm/430.)
        +smoothstep(200.,1500.,u)*60.*ra(qm/120.);
      /* Forest from just above the shore to the treeline, which wanders with the slope's exposure. */
      veg=smoothstep(8.,40.,u+eS)*(.6+.8*fa(q/31.))*(1.-smoothstep(380.,620.,h+140.*(fa(qm/300.)-.5)));
    }
    rk*=1.-smoothstep(-60.,-160.,d);
  }
  float sand=1.-smoothstep(.25,.75,rk);
  /* Stacks and skerries: many off rocky stretches, a few breaking up the beaches. */
  const float OC=62.;
  vec2 ic=floor(q/OC),fc=q/OC-ic;
  vec2 wr=7.*(vec2(fa(q/12.),fa(q/12.+9.))-.5);
  mat2 mr=rot2(ang);
  float keepP=mix(.80,.46,rk),reach=mix(90.,190.,rk);
  if(uForm!=5) for(int iy=-1;iy<=1;iy++)for(int ix=-1;ix<=1;ix++){
    vec2 g=vec2(ix,iy),jt=hash22(ic+g+3.),r=(g+jt-fc)*OC+wr;
    float cellD=d-r.x;
    if(jt.y<keepP) continue;
    float zoneK=smoothstep(-12.,3.,cellD)*(1.-smoothstep(reach-35.,reach,cellD));
    if(zoneK<=0.) continue;
    float kk=(jt.y-keepP)/(1.-keepP);
    float R=mix(6.,24.,jt.x*jt.x);
    vec2 rr=mr*r*vec2(1.,1.+.9*jt.x);
    float rd=length(rr)/R;
    if(rd>=1.35) continue;
    rd+=(fa(q/(R*.42)+jt*9.)-.5)*.75;
    if(rd>=1.) continue;
    float peak=mix(-1.,mix(4.,12.,rk),kk*kk);
    float bump=-6.5+(peak+6.5)*pow(1.-max(rd,0.)*max(rd,0.),.42)+ledge*.6;
    bump=min(bump,peak*(.62+.3*jt.x)+.4*ledge);
    bump=mix(-8.,bump,zoneK);
    if(bump>h){ h=bump; sand=0.; }
  }
  if(uForm==5){
    /* Palm cove's rocks are granite boulders, rounded by weathering and piled against one another:
       many on the point, and a few small groups along the beach and in the shallows. Before, its rock
       rose with distance from the shore, so every narrow rocky patch came out as a pointed ridge. */
    float bz=rk*(1.-smoothstep(-80.,-130.,d))*(1.-smoothstep(20.,60.,d));
    bz=max(bz,smoothstep(.70,.77,fa(q/38.+3.3))*smoothstep(-15.,0.,d)*(1.-smoothstep(90.,130.,d))*.75);
    float dens=smoothstep(.12,.8,bz);
    /* Boulders thin out toward the edge of the detailed height map, where the view blends into the
       coarse one; otherwise a boulder half way across that blend is cut off by a sheer wall. */
    if(uNear>.5){ vec2 ue=min(p-uMin,uMin+uSize-p)/uSize; dens*=smoothstep(.05,.11,min(ue.x,ue.y)); }
    /* The ground between boulders is sand; only the boulders are rock. */
    sand=1.;
    if(dens>0.){
      float g0=h,bh;
      /* Far away, where the height map is too coarse for single boulders, a pile is a low smooth rise. */
      if(uNear>.5) bh=max(boulders(q,11.,3.,8.5,dens*.7,g0,51.),boulders(q+3.7,5.2,1.2,3.2,dens*.56,g0,83.));
      else bh=g0+dens*2.4;
      if(bh>h){ float up=bh-g0; h=bh; sand*=uNear>.5?1.-smoothstep(.05,.3,up):1.-.55*smoothstep(.1,.7,dens); veg*=1.-smoothstep(.3,1.2,up); }
    }
  }
  float rockK=1.-sand;
  vec2 rel=rockRelief(q);
  /* Blocky relief on worn granite boulders made spiky pinnacles: keep only a little. */
  if(uForm==5) rel*=vec2(.12,.3);
  float vK=rockK*(1.-.8*veg),hIn=h;
  float wall=smoothstep(.5,1.7,length(vec2(dFdx(hIn),dFdy(hIn)))/uTexel);
  /* Ledges and jointed blocks belong to sea cliffs. On the lake's mountains the ledges made whole faces
     stripy, and on ridges seen edge-on every 30 m block stood up as a tooth, so above the shore rocks
     both fade out. */
  float ledgeK=uForm==6?1.-smoothstep(15.,40.,h):1.;
  /* Big blocks before the ledges, as in rockyRaw(), so their corners don't poke out as teeth. */
  h+=rel.x*smoothstep(.8,5.,hIn)*vK*mix(1.,.34,wall)*ledgeK;
  if(h>1.5&&veg<.5&&uForm!=5&&ledgeK>0.){
    float tilt=dot(q,sv)*.055,xs=(h+tilt)/3.1;
    float xt=(floor(xs)+smoothstep(0.,.55,fract(xs)))*3.1-tilt;
    h=mix(h,xt,.72*smoothstep(1.5,3.5,h)*(1.-veg)*rockK*ledgeK);
  }
  h+=rel.y*mix(.34,1.,smoothstep(1.,5.,hIn))*smoothstep(-3.2,.4,hIn)*vK*mix(1.,.12,wall);
  if(d>=0.) sand=max(sand,smoothstep(-1.4,-3.2,h)*smoothstep(.42,.58,fa(q/34.)));
  return vec4(h,0.,veg,sand);
}
void main(){
  vec2 p=uMin+vUV*uSize;
  vec4 a=mixedCoast(p);
  float sl=length(vec2(dFdx(a.x),dFdy(a.x)))/uTexel;
  a.y=max(smoothstep(.34,.72,sl),a.x<3.2?1.:0.);
  a.y=max(a.y,(1.-a.z)*smoothstep(0.,.1,a.x));
  a.w*=1.-smoothstep(.5,.85,sl)*smoothstep(.2,1.,a.x);
  a.y*=1.-a.w;
  o=a;
}`;

/* ------ Baked sun visibility and ambient occlusion for one lighting setup ------ */
const FS_LIT=HEAD+`
in vec2 vUV; out vec4 o; uniform sampler2D tT; uniform vec3 uSun; uniform vec2 uSize; uniform float uMaxH;
void main(){
  vec4 t0=textureLod(tT,vUV,0.); float h0=max(t0.r,0.);
  float sh=1.;
  vec2 dir=uSun.xz/max(length(uSun.xz),1e-3);
  float tanE=uSun.y/max(length(uSun.xz),1e-3);
  float maxDist=(uMaxH-h0)/max(tanE,.03); maxDist=min(maxDist,max(uSize.x,uSize.y)*.5);
  float s=max(uSize.x,uSize.y)/float(textureSize(tT,0).x); s=max(s,.15);
  float dist=max(s*1.6,4.2);
  for(int i=0;i<30;i++){
    vec2 q=vUV+dir*dist/uSize;
    if(dist>maxDist) break;
    float hh=textureLod(tT,q,dist<s*14.?1.5:.5).r;
    float rayH=h0+dist*tanE+s*1.5;
    float pen=(hh-rayH)/(dist*.12+.5);
    sh=min(sh,clamp(1.-pen,0.,1.));
    if(sh<=0.) break;
    dist*=1.17;
  }
  float ao=1.;
  float l1=textureLod(tT,vUV,2.5).r, l2=textureLod(tT,vUV,4.5).r, l3=textureLod(tT,vUV,6.).r;
  float px=max(uSize.x,uSize.y)/float(textureSize(tT,0).x);
  ao-=clamp((l1-t0.r)/(px*7.),0.,1.)*.30;
  ao-=clamp((l2-t0.r)/(px*28.),0.,1.)*.22;
  ao-=clamp((l3-t0.r)/(px*80.),0.,1.)*.16;
  o=vec4(sh,clamp(ao,0.,1.),0.,1.);
}`;

/* ------ Readback helper ------ */
const FS_GRID=HEAD+`in vec2 vUV; out vec4 o; uniform sampler2D tT; void main(){ o=textureLod(tT,vUV,2.); }`;

'use strict';
/* ---------------------------------------------------------------- Camera shots ------- */
const FOV_TOP=deg(50), FOV_ANG=deg(54);
function vnorm(a){ const l=Math.hypot(a[0],a[1],a[2]); return [a[0]/l,a[1]/l,a[2]/l]; }
function vcross(a,b){ return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function rateShot(S,u=.5){
  const L=S.L,asp=canvas.width/canvas.height,c=cameraFor(S,u,0,asp);
  let inland=0,shore=0,water=0,n=0;
  for(let j=0;j<11;j++)for(let i=0;i<15;i++){
    const nx=(i+.5)/15*2-1,ny=(j+.5)/11*2-1;
    const rd=vnorm([c.F[0]+c.R[0]*nx*c.tan*asp+c.Up[0]*ny*c.tan,c.F[1]+c.R[1]*nx*c.tan*asp+c.Up[1]*ny*c.tan,c.F[2]+c.R[2]*nx*c.tan*asp+c.Up[2]*ny*c.tan]);
    n++;
    if(rd[1]>-.004) continue;
    const t=-c.ro[1]/rd[1],x=c.ro[0]+rd[0]*t,z=c.ro[2]+rd[2]*t;
    const G=groundAt(L,x,z),I=inlandAt(L,x,z);
    if(I>.4||x<L.domMin[0]) inland++;
    else if(G>-1.6&&G<1.4) shore++;
    else if(G<0) water++;
  }
  return {inland:inland/n,shore:shore/n,water:water/n};
}
function makeShot(L,lightKey,kind){
  kind=kind||(Math.random()<.46?'top':'angled');
  if(!lightKey){ const opts=kind==='top'?L.lights.filter(k=>k!=='golden'):L.lights; lightKey=pick(opts); }
  if(kind==='low') return buildLow(L,lightKey);
  if(kind==='canopy') return buildCanopy(L,lightKey);
  let best=null,bestScore=-1e9;
  for(let i=0;i<48;i++){
    const S=buildShot(L,lightKey,kind),r=rateShot(S);
    const lim=kind==='top'?.16:.13;
    const score=-Math.max(r.inland-lim,0)*6+Math.min(r.shore,.12)*5+Math.min(r.water,.3);
    if(score>bestScore){bestScore=score;best=S;}
    if(r.inland<=lim&&r.shore>=.05&&r.water>=.2) return S;
  }
  return best;
}
/* Where the plants begin, searching from inland toward the sea. */
function plantEdge(L,z){
  for(let x=L.domMin[0]+6;x<L.domMin[0]+L.domSize[0];x+=2){ if(inlandAt(L,x,z)<.25) return x; }
  return L.domMin[0]+20;
}
/* A fast pass close to the ground, along the edge of the plants. */
function buildLow(L,lightKey){
  const S={L,lightKey,kind:'low',noise:rnd(1000)};
  const dir=Math.random()<.5?1:-1, speed=rnd(7,13), dur=rnd(4.2,6.8), len=speed*dur;
  const z0=rnd(-L.domSize[1]*.3,L.domSize[1]*.3), z1=z0+dir*len;
  /* Some passes skim the front of the trees, others go right through their crowns. */
  /* On rocky coasts it follows the rock edge, because the woods behind it are too dense to fly in. */
  const off=L.kind==='rocky'?rnd(3,24):pick([rnd(-22,-6),rnd(-22,-6),rnd(-40,-22)]), xLo=L.domMin[0]+L.domSize[0]*.07;
  const x0=Math.max(plantEdge(L,z0)+off+rnd(-3,3),xLo), x1=Math.max(plantEdge(L,z1)+off+rnd(-3,3),xLo);
  let top=0;
  for(let i=0;i<=14;i++){ const t=i/14; top=Math.max(top,groundAt(L,x0+(x1-x0)*t,z0+(z1-z0)*t)); }
  const y=top+rnd(4.5,11);
  S.p0=[x0,y,z0]; S.p1=[x1,y+rnd(-.5,1.5),z1];
  const h=Math.atan2(z1-z0,x1-x0), tilt=pick([rnd(.08,.5),rnd(.08,.5),rnd(.08,.5),-rnd(.05,.25)]);
  S.yaw0=h-dir*tilt; S.yaw1=S.yaw0+rnd(-.04,.04); S.pitch=-deg(rnd(3,11)); S.fov=deg(60);
  S.steps=L.kind==='rocky'?40:38; S.maxH=L.maxH; S.nearH=maxGroundNear(L,(x0+x1)*.5,(z0+z1)*.5,380)+14;
  S.dur=dur; S.start=0;
  return S;
}
/* A slow glide over the tree tops along the edge of the woods, looking steeply down and out toward
   the beach and the water, so the crowns pass below with the shore beside them. */
function buildCanopy(L,lightKey,o){
  const S={L,lightKey,kind:'canopy',noise:rnd(1000)};
  const dir=Math.random()<.5?1:-1, speed=o?o.speed:rnd(3,6.5), dur=o?o.dur:rnd(5,7.5), len=speed*dur;
  const z0=rnd(-L.domSize[1]*.3,L.domSize[1]*.3), z1=z0+dir*len;
  const off=L.kind==='rocky'?rnd(-20,0):rnd(-24,2), xLo=L.domMin[0]+L.domSize[0]*.07;
  const x0=Math.max(plantEdge(L,z0)+off,xLo), x1=Math.max(plantEdge(L,z1)+off+rnd(-4,4),xLo);
  let top=0;
  for(let i=0;i<=14;i++){ const t=i/14; top=Math.max(top,groundAt(L,x0+(x1-x0)*t,z0+(z1-z0)*t)); }
  /* Trees stand up to about 20 m, so this keeps roughly 16 to 42 m of air above the crowns. */
  const y=top+rnd(36,62);
  S.p0=[x0,y,z0]; S.p1=[x1,y+rnd(-1.5,1.5),z1];
  const h=Math.atan2(z1-z0,x1-x0), turn=rnd(.45,1.15);
  S.yaw0=h-dir*turn; S.yaw1=S.yaw0+dir*rnd(-.06,.1); S.pitch=-deg(rnd(30,54)); S.fov=deg(58);
  S.steps=L.kind==='rocky'?40:38; S.maxH=L.maxH; S.nearH=maxGroundNear(L,(x0+x1)*.5,(z0+z1)*.5,380)+14;
  S.dur=dur; S.start=0;
  return S;
}
function buildShot(L,lightKey,kind){
  const S={L,lightKey,kind,noise:rnd(1000)};
  const dom=L.domSize, dx0=L.domMin[0], z0=L.domMin[1], zSpan=dom[1];
  const aspect=canvas.width/canvas.height;
  if(kind==='top'){
    const altMax=Math.min(dom[0]*.46/Math.tan(FOV_TOP/2)/1.05,(L.dx<.7?122:260));
    const altMin=L.dx<.7?(L.kind==='surf'?62:50):120;
    const alt=rnd(altMin,Math.max(altMin+1,altMax));
    const hw=alt*Math.tan(FOV_TOP/2)*aspect;
    const zLim=zSpan*.5-hw*1.25-40;
    const z=rnd(-Math.max(zLim,10),Math.max(zLim,10));
    const shore=shoreAt(L,z);
    const x=shore+alt*Math.tan(FOV_TOP/2)*(L.kind==='rocky'?rnd(.3,.85):rnd(-.05,.78));
    const yaw=pick([rnd(-.35,.35),Math.PI+rnd(-.35,.35),Math.PI*.5+rnd(-.5,.5),-Math.PI*.5+rnd(-.5,.5),rnd(.5,1.),-rnd(.5,1.)]);
    const speed=rnd(1.2,4.5)*(L.dx<.7?1:1.8);
    const dirA=rnd(Math.PI*2);
    const cz=Math.min(Math.max(z,z0+zSpan*.14),z0+zSpan*.86);
    const cx=Math.min(Math.max(x,dx0+dom[0]*.18),dx0+dom[0]*.82);
    const mg=maxGroundNear(L,cx,cz,alt*1.2)+12;
    const a1=alt*.5+.5*Math.max(alt,mg+35);
    S.p0=[cx-Math.cos(dirA)*speed*3,a1,cz-Math.sin(dirA)*speed*3];
    S.p1=[cx+Math.cos(dirA)*speed*3,a1+rnd(-3,5),cz+Math.sin(dirA)*speed*3];
    S.yaw0=yaw; S.yaw1=yaw+rnd(-.05,.05);
    S.pitch=-Math.PI/2; S.fov=FOV_TOP; S.steps=L.kind==='rocky'?30:(mg>25?22:13); S.maxH=mg; S.nearH=mg;
    S.dur=rnd(4.2,7);
  } else {
    const mode=pick(['along','along','along','sea','quarter','quarter']);
    let z=rnd(-zSpan*.28,zSpan*.28);
    const alongSign=Math.random()<.5?1:-1;
    if(mode==='along') z=-alongSign*rnd(zSpan*.08,zSpan*.26);
    const shore=shoreAt(L,z);
    const dist=(L.dx<.7?rnd(120,210):rnd(190,430))*(L.kind==='rocky'?1.1:1);
    const pitch=-deg(mode==='along'?rnd(11,30):rnd(14,40));
    let head,offs;
    if(mode==='along'){ head=alongSign*(Math.PI*.5-rnd(.14,.62)*(Math.random()<.82?1:-.5)); offs=rnd(25,90); }
    else if(mode==='sea'){ head=rnd(-.5,.5); offs=rnd(45,120); }
        else { head=(Math.random()<.5?1:-1)*rnd(.55,1.05); offs=rnd(10,60); }
    const T=[shore+offs,0,z];
    const hl=dist*Math.cos(pitch);
    const dir=[Math.cos(head),0,Math.sin(head)];
    const alt=dist*Math.sin(-pitch);
    const cx=T[0]-dir[0]*hl, cz=T[2]-dir[2]*hl;
    const mg=maxGroundNear(L,cx,cz,70);
    const camY=Math.max(alt,mg+26,maxGroundNear(L,T[0],T[2],130)+9);
    const speed=rnd(2.5,8.5)*(L.dx<.7?.8:1.2);
    const lat=vcross([0,1,0],dir);
    const mv=pick([[1,0],[.2,1],[.2,-1],[.7,.7]]);
    const vx=dir[0]*mv[0]+lat[0]*mv[1], vz=dir[2]*mv[0]+lat[2]*mv[1];
    S.p0=[cx-vx*speed*3,camY,cz-vz*speed*3];
    S.p1=[cx+vx*speed*3,camY+rnd(-4,6),cz+vz*speed*3];
    S.yaw0=head; S.yaw1=head+rnd(-.05,.05)-mv[1]*.015; S.pitch=pitch; S.fov=FOV_ANG;
    S.steps=L.kind==='rocky'?40:38; S.maxH=L.maxH; S.nearH=maxGroundNear(L,cx,cz,380)+14;
    S.dur=rnd(3,6.2);
  }
  S.start=0;
  return S;
}
/* ---- Calm mode: long, slow shots for a screen left running (?calm=1, or press C) ----
   Each shot lasts about half a minute to a minute and a quarter and drifts slowly; scenes change only
   by slow dissolves (frame.js). Fast low passes are left out. An ordinary shot's path is stretched to
   suit the longer time, lifted clear of any hill along the way, and checked at both ends as well as in
   the middle, so the water stays the subject for the whole shot. */
function makeCalmShot(L,lightKey){
  const r=Math.random(), kind=r<.40?'top':r<.86?'angled':'canopy';
  let S=null;
  for(let i=0;i<12;i++){
    if(kind==='canopy'){ S=buildCanopy(L,lightKey||pick(L.lights),{speed:rnd(1.,2.),dur:rnd(24,40)}); return S; }
    S=makeShot(L,lightKey,kind);
    S.dur=rnd(35,75);
    const speed=kind==='top'?rnd(.4,1.1)*(L.dx<.7?1:1.5):rnd(.7,1.9);
    stretchPath(S,speed*S.dur);
    S.yaw1=S.yaw0+(kind==='top'?rnd(-.3,.3):rnd(-.1,.1));
    if(calmOk(S)) break;
  }
  return S;
}
function stretchPath(S,len){
  const L=S.L,c=[0,1,2].map(i=>(S.p0[i]+S.p1[i])*.5);
  let vx=S.p1[0]-S.p0[0],vz=S.p1[2]-S.p0[2],l=Math.hypot(vx,vz);
  if(l<1e-3){ const a=rnd(Math.PI*2); vx=Math.cos(a); vz=Math.sin(a); l=1; }
  vx/=l; vz/=l;
  const dy=(S.p1[1]-S.p0[1])*.5;
  S.p0=[c[0]-vx*len*.5,c[1]-dy,c[2]-vz*len*.5]; S.p1=[c[0]+vx*len*.5,c[1]+dy,c[2]+vz*len*.5];
  /* Keep well above the ground everywhere along the longer path. */
  let need=0;
  for(let i=0;i<=12;i++){ const t=i/12,x=S.p0[0]+(S.p1[0]-S.p0[0])*t,z=S.p0[2]+(S.p1[2]-S.p0[2])*t,y=S.p0[1]+(S.p1[1]-S.p0[1])*t;
    need=Math.max(need,maxGroundNear(L,x,z,40)+(S.kind==='top'?35:24)-y); }
  if(need>0){ S.p0[1]+=need; S.p1[1]+=need; }
  /* The ray march's height limits were worked out around the middle of the old path: widen them to
     the whole path. */
  if(S.kind==='top'){
    const mg=Math.max(...[S.p0,S.p1].map(p=>maxGroundNear(L,p[0],p[2],p[1]*1.2)+12),S.maxH);
    S.maxH=mg; S.nearH=mg; S.steps=L.kind==='rocky'?30:(mg>25?22:13);
  } else S.nearH=Math.max(...[S.p0,S.p1].map(p=>maxGroundNear(L,p[0],p[2],380)+14),S.nearH);
}
function calmOk(S){
  const L=S.L,lim=S.kind==='top'?.2:.17;
  for(const u of [0,.5,1]){
    const r=rateShot(S,u); if(r.inland>lim||r.water<.15||r.shore<.03) return false;
    /* Stay away from the ends of the simulated stretch of coast. */
    const c=cameraFor(S,u,0,1), d=c.F[1]<-.05?Math.min(-c.ro[1]/c.F[1],600):400;
    const f=(c.ro[2]+c.F[2]*d-L.domMin[1])/L.domSize[1];
    if(f<.1||f>.9) return false;
  }
  return true;
}
function cameraFor(S,u,t,aspect){
  const e=u*u*(3-2*u); const k=.15*e+.85*u;
  const p=[0,1,2].map(i=>S.p0[i]+(S.p1[i]-S.p0[i])*k);
  const n=S.noise+t;
  const sway=(a,b)=>Math.sin(n*a+b)*.6+Math.sin(n*a*2.3+b*1.7)*.4;
  const sc=S.kind==='top'?.32:.42;
  p[0]+=sway(.43,1.3)*sc; p[1]+=sway(.31,4.2)*sc*.5; p[2]+=sway(.37,2.2)*sc;
  const yaw=S.yaw0+(S.yaw1-S.yaw0)*k+sway(.21,5.5)*.0022;
  const pit=S.pitch+sway(.27,3.1)*.0017;
  let F,Up,R;
  if(S.kind==='top'){
    F=[0,-1,0]; Up=[Math.cos(yaw),0,Math.sin(yaw)]; R=vcross(F,Up);
    const a=sway(.27,3.1)*.0025,b=sway(.23,8.1)*.0025;
    F=vnorm([F[0]+Up[0]*a+R[0]*b,F[1],F[2]+Up[2]*a+R[2]*b]);
    R=vnorm(vcross(F,Up)); Up=vcross(R,F);
  } else {
    F=[Math.cos(pit)*Math.cos(yaw),Math.sin(pit),Math.cos(pit)*Math.sin(yaw)];
    R=vnorm(vcross(F,[0,1,0])); Up=vcross(R,F);
    const roll=sway(.19,6.5)*.0028;
    const c=Math.cos(roll),s=Math.sin(roll);
    const r2=[R[0]*c+Up[0]*s,R[1]*c+Up[1]*s,R[2]*c+Up[2]*s]; Up=[Up[0]*c-R[0]*s,Up[1]*c-R[1]*s,Up[2]*c-R[2]*s]; R=r2;
  }
  return {ro:p,F,R,Up,tan:Math.tan(S.fov/2)};
}

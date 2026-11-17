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
/* What the camera really sees, ray by ray: a coarser cousin of the view shader's ray march, on the coast's
   height grid (groundAt). rateShot above only asks where each ray would meet sea level, which is right
   for the slideshow's own paths: they're built to stand clear of the land. A path written as numbers (a
   recipe, or the studio) can put a cliff right beside the drone, and rateShot looks straight through it.
   Here each ray stops at the first ground it meets. Ground within 60 m that rises to the upper half of
   the drone's height above the ground below it, or anything within 6 m, is "wall": rock or land standing
   close in the picture instead of lying under it. A cliff further off is scenery, and may be the subject.
   The rest is sorted as rateShot sorts it: water, shore and inland. */
function viewRate(S,u=.5){
  const L=S.L,asp=canvas.width/canvas.height,c=cameraFor(S,u,0,asp);
  const g0=Math.max(groundAt(L,c.ro[0],c.ro[2]),0), wallH=c.ro[1]-.5*(c.ro[1]-g0);
  const x0=L.domMin[0],z0=L.domMin[1],x1=x0+L.domSize[0],z1=z0+L.domSize[1];
  let wall=0,inland=0,shore=0,water=0,n=0;
  for(let j=0;j<11;j++)for(let i=0;i<15;i++){
    const nx=(i+.5)/15*2-1,ny=(j+.5)/11*2-1;
    const rd=vnorm([c.F[0]+c.R[0]*nx*c.tan*asp+c.Up[0]*ny*c.tan,c.F[1]+c.R[1]*nx*c.tan*asp+c.Up[1]*ny*c.tan,c.F[2]+c.R[2]*nx*c.tan*asp+c.Up[2]*ny*c.tan]);
    n++;
    const tSea=rd[1]<-.004?-c.ro[1]/rd[1]:1e9, tMax=Math.min(tSea,700);
    let t=0,hit=null;
    while(t<tMax){
      t=Math.min(t+Math.max(1.5,t*.03),tMax);
      const x=c.ro[0]+rd[0]*t,z=c.ro[2]+rd[2]*t;
      if(x<x0||x>x1||z<z0||z>z1) break;
      const g=groundAt(L,x,z);
      if(g>c.ro[1]+rd[1]*t){ hit=[x,g,z]; break; }
    }
    if(hit){
      if((hit[1]>wallH&&t<60)||t<6) wall++;
      else if(inlandAt(L,hit[0],hit[2])>.4) inland++;
      else shore++;
      continue;
    }
    if(tSea>=1e9) continue;
    const x=c.ro[0]+rd[0]*tSea,z=c.ro[2]+rd[2]*tSea, G=groundAt(L,x,z);
    if(inlandAt(L,x,z)>.4||x<x0) inland++;
    else if(G>-1.6) shore++;
    else water++;
  }
  return {wall:wall/n,inland:inland/n,shore:shore/n,water:water/n};
}
/* ---- Glare guard ----
   With the sun up but low, a camera looking toward it sees the sun's path on the water as a blaze of
   white, and the rest of the picture goes dark around it. Now and then that's beautiful; often, it's
   tiring. The first 10-minute calm film had it in most of its shots, and the slideshow faced a low sun in
   about half the shots that had one. So about one shot in eight under a low sun faces it (SUN_SHARE),
   chosen to; the rest are turned to have it beside or behind the camera.
   Facing it means the sun, or its reflection in level water (the middle of its path of glitter), is in
   the picture or just outside it. Only the camera's direction matters, since the sun is so far away.
   These never count: twilight (the sun's disc has set, and the glow is what's wanted), night (the moon's
   path is part of the night's look), cloud that hides the sun, and straight-down shots, which can't see a
   low sun's path. GLARE_EL: up to this height the path is a blaze; higher, it's a sparkle. */
const GLARE_EL=25, SUN_SHARE=1/8;
function lowSun(key){ const Li=LIGHTS[key]; return !!Li&&!!Li.sun&&Li.el>=-1&&Li.el<GLARE_EL&&(Li.night||0)<=.3&&(Li.sunVis??1)>=.4; }
/* Whether a candidate is the wrong way round: facing a low sun when it shouldn't, or, for the one shot in
   eight that should (sunOk), not facing it. */
function sunWrong(S,sunOk,us){ return S.kind!=='top'&&lowSun(S.lightKey)&&facesSun(S,us)!==sunOk; }
function facesSun(S,us=[.5]){
  if(S.kind==='top'||!lowSun(S.lightKey)) return false;
  const Li=LIGHTS[S.lightKey], asp=canvas.width/canvas.height, dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  for(const u of us){
    const c=cameraFor(S,u,0,asp);
    for(const d of [[Li.sun[0],-Li.sun[1],Li.sun[2]],Li.sun]){
      const z=dot(d,c.F); if(z<.05) continue;
      const x=dot(d,c.R)/(z*c.tan*asp), y=dot(d,c.Up)/(z*c.tan);
      if(Math.abs(x)<1.15&&Math.abs(y)<1.3) return true;
    }
  }
  return false;
}
/* sunOk: whether this shot is the one in eight that faces a low sun. Left out, it's decided here.
   w: passed to buildShot (a wide straight-down shot for reels); left out, the slideshow's own. */
function makeShot(L,lightKey,kind,sunOk,w){
  kind=kind||(Math.random()<.46?'top':'angled');
  if(!lightKey) lightKey=pickLight(L,kind);
  if(sunOk===undefined) sunOk=Math.random()<SUN_SHARE;
  /* A coast with no plants near the shore has no tree line to cross: a canopy glide instead. */
  if(kind==='crossing'){ const S=makeCrossing(L,lightKey,sunOk); if(S) return S; kind='canopy'; }
  if(kind==='low'||kind==='canopy'){
    /* One path at a time; a few tries for one the right way round. */
    let S;
    for(let i=0;i<8;i++){ S=kind==='low'?buildLow(L,lightKey):buildCanopy(L,lightKey); if(!sunWrong(S,sunOk,[0,.5,1])&&peopleClear(S)) break; }
    return S;
  }
  let best=null,bestScore=-1e9;
  for(let i=0;i<48;i++){
    const S=buildShot(L,lightKey,kind,w),r=rateShot(S);
    const lim=kind==='top'?.16:.13, wrong=sunWrong(S,sunOk)||(kind!=='top'&&!peopleClear(S));
    const score=-Math.max(r.inland-lim,0)*6+Math.min(r.shore,.12)*5+Math.min(r.water,.3)-(wrong?10:0);
    if(score>bestScore){bestScore=score;best=S;}
    if(!wrong&&r.inland<=lim&&r.shore>=.05&&r.water>=.2) return S;
  }
  return best;
}
/* ---- Shots of a coast's waterfalls (fall in js/scenes.js; fallMeasure in js/world.js) ----
   A random shot rarely catches one spot on a kilometre of coast, so the slideshow asks for these now and
   then on a coast that has a fall (chooseNext in js/frame.js; ?fall=1 shows nothing else). One of the
   coast's falls is chosen. A fall or cascade near the camera has three views: from out on the water with
   the whole drop in the picture; close in and low, near the foot; and from behind the lip, low along the
   stream. A thread far off across the water has two: from out on the water with a long lens, and from up
   the near slope, the whole valley in view. The camera drifts round, pushes in or rises, turning to keep
   the fall in the picture. calm: long and slow, for calm mode. */
function makeFallShot(L,lightKey,calm){
  const Fs=L.falls||[]; if(!Fs.length) return null;
  const F=pick(Fs), U=F;
  /* Left to the shot, any light but the dark ones. */
  for(let i=0;i<8&&(!lightKey||dimLight(lightKey));i++) lightKey=pickLight(L,'angled');
  const sunOk=Math.random()<SUN_SHARE;
  const dir=U.C[0], lip=[U.A[0],U.A[1],U.A[2]], foot=[U.B[0],0,U.A[2]], H=lip[1];
  const xLo=L.domMin[0]+L.domSize[0]*.04, xHi=L.domMin[0]+L.domSize[0]*.95, zLo=L.domMin[1]+L.domSize[1]*.06, zHi=L.domMin[1]+L.domSize[1]*.94;
  const clampZ=z=>Math.min(Math.max(z,zLo+10),zHi-10);
  let best=null;
  for(let i=0;i<14;i++){
    const side=Math.random()<.5?1:-1;
    let v,cam,tgt,fov;
    if(F.far){
      v=pick(['across','across','valley']);
      tgt=[(lip[0]+foot[0])*.5,H*.42,lip[2]];
      if(v==='across'){ cam=[rnd(L.domMin[0]+L.domSize[0]*.45,xHi-10),rnd(12,45),clampZ(lip[2]+rnd(-260,-40))]; fov=deg(rnd(34,44)); }
      else { const x=rnd(xLo+10,L.domMin[0]+L.domSize[0]*.25), z=clampZ(lip[2]+rnd(-320,-60)); cam=[x,groundAt(L,x,z)+rnd(28,50),z]; fov=FOV_ANG; }
    } else {
      v=pick(['sea','sea','sea','close','close','close','lip']);
      if(v==='sea'){ const d=rnd(100,170),a=side*rnd(.2,.7); cam=[foot[0]+dir*d*Math.cos(a),rnd(.35,.8)*H+4,foot[2]+d*Math.sin(a)]; tgt=[(lip[0]+foot[0])*.5,H*.48,lip[2]]; fov=deg(38); }
      else if(v==='close'){ const d=rnd(38,62),a=side*(U.kind===1?rnd(.05,.4):rnd(.3,.9)); cam=[foot[0]+dir*d*Math.cos(a),U.kind===1?rnd(14,26):rnd(8,18),foot[2]+d*Math.sin(a)]; tgt=[(lip[0]+foot[0])*.5,H*.42,lip[2]]; fov=deg(50); }
      /* Low over the stream, looking along it to the notch where it drops away, with the water beyond. */
      else { cam=[lip[0]-dir*rnd(40,70),H+rnd(9,15),lip[2]+side*rnd(2,8)]; tgt=[lip[0]+dir*10,H-8,lip[2]]; fov=FOV_ANG; }
    }
    const dur=calm?rnd(35,60):rnd(5.5,8), len=(calm?rnd(.6,1.3):rnd(2.5,5))*dur*(v==='sea'||v==='across'?1:.6);
    const dx=tgt[0]-cam[0], dz=tgt[2]-cam[2], hl=Math.hypot(dx,dz)||1, fwd=[dx/hl,dz/hl], lat=[-fwd[1],fwd[0]];
    /* Round the fall, toward it, or up. */
    const mv=pick(v==='lip'?['push']:['arc','arc','push','rise']);
    const m=mv==='arc'?[lat[0]*side*len,0,lat[1]*side*len]:mv==='push'?[fwd[0]*len*.6,rnd(-.05,.1)*len,fwd[1]*len*.6]:[fwd[0]*len*.15,len*.45,fwd[1]*len*.15];
    const S={L,lightKey,kind:'angled',fall:v,noise:rnd(1000),fov,steps:40,maxH:L.maxH,dur,start:0};
    S.p0=[cam[0]-m[0]*.5,cam[1]-m[1]*.5,cam[2]-m[2]*.5]; S.p1=[cam[0]+m[0]*.5,cam[1]+m[1]*.5,cam[2]+m[2]*.5];
    const aim=p=>{ const x=tgt[0]-p[0],y=tgt[1]-p[1],z=tgt[2]-p[2]; return [Math.atan2(z,x),Math.atan2(y,Math.hypot(x,z))]; };
    const a0=aim(S.p0),a1=aim(S.p1);
    S.yaw0=a0[0]; S.yaw1=a0[0]+Math.atan2(Math.sin(a1[0]-a0[0]),Math.cos(a1[0]-a0[0])); S.pitch=a0[1]; S.pitch1=a1[1];
    S.nearH=maxGroundNear(L,cam[0],cam[2],380)+14;
    /* Clear of the ground all the way, and inside the stretch of water that is simulated. */
    let ok=true;
    for(const u of [0,.25,.5,.75,1]){ const p=[0,1,2].map(k=>S.p0[k]+(S.p1[k]-S.p0[k])*u); if(p[1]<groundAt(L,p[0],p[2])+(v==='lip'?10:5)||p[1]<4||p[0]>xHi||p[0]<xLo||p[2]<zLo||p[2]>zHi) ok=false; }
    if(!ok) continue;
    if(!best) best=S;
    if(!sunWrong(S,sunOk,[0,.5,1])) return S;
  }
  return best;
}
/* Where the plants begin, searching from inland toward the sea. A path through the plants to the beach
   (beachPath in js/shaders/terrain.js) is only a few metres wide, so the plants either side of it count. */
function plantEdge(L,z){
  for(let x=L.domMin[0]+6;x<L.domMin[0]+L.domSize[0];x+=2){ if(Math.max(inlandAt(L,x,z),inlandAt(L,x,z-5),inlandAt(L,x,z+5))<.25) return x; }
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
/* ---- Crossing the tree line (PLAN.md L1) ----
   A slow flight from over the trees inland, across the edge of the plants and the beach, and out over the
   shallows ("in"); or the reverse, backing in from the sea over the beach and up over the trees, still facing
   the sea ("back"); or along
   the edge of the plants, with the trees on one side and the sand on the other ("edge").
   Its height isn't a straight line from p0 to p1. S.prof holds the height at CROSS_N+1 points along the
   path, worked out from the real plants under it (plantList, the same list the full 3D models use) and
   the ground: the drone flies clr metres above the crowns, dips after the tree line to low metres over
   the sand, and climbs or descends no steeper than CROSS_SLOPE, smoothed. It never comes within 4 m of a
   crown. S.cross keeps the numbers the profile is made from, so a recipe or a favourite flies the same
   path again: {v: variant ('in', 'back' or 'edge'), clr, low, rise (metres it climbs over the last third, out
   over the surf)}. */
const CROSS_N=64, CROSS_SLOPE=.32;
/* The tops of the plants near the path, as [x, z, top height, crown radius]. */
function crossTops(S){
  /* The plants of the shot's own vegetation preset; if it isn't baked yet, the profile is made again once
     it is (vegRefresh in js/vegetation.js). */
  if(typeof vegUse==='function'){ S.vegMade=vegUse(S)?vegOf(S):null; if(!S.vegMade) S.meshes=undefined; }
  if(!S.meshes) plantList(S,true);
  const out=[]; if(!S.meshes||!plantInfo) return out;
  for(let m=0;m<PLANT.COUNT;m++){
    const A=S.meshes[m], rad=plantInfo[m*2], cy=plantInfo[m*2+1];
    for(let i=0;i<A.length;i+=8){ const s=(A[i+3]-m)/.4; out.push([A[i],A[i+2],A[i+1]+s*(cy+rad*.92),s*rad*.8]); }
  }
  if(Q.has('nomesh')) S.meshes=null;
  return out;
}
function crossProfile(S){
  const L=S.L,c=S.cross,N=CROSS_N,tops=crossTops(S);
  const len=Math.hypot(S.p1[0]-S.p0[0],S.p1[2]-S.p0[2]), ds=len/N;
  /* Bin the plants on a 6 m grid, so each point checks only those near it. */
  const B=new Map(), key=(i,j)=>i*100003+j;
  for(const t of tops){ const k=key(Math.floor(t[0]/6),Math.floor(t[1]/6)); if(!B.has(k)) B.set(k,[]); B.get(k).push(t); }
  const yMin=new Float32Array(N+1), y=new Float32Array(N+1);
  for(let i=0;i<=N;i++){
    const k=i/N, x=S.p0[0]+(S.p1[0]-S.p0[0])*k, z=S.p0[2]+(S.p1[2]-S.p0[2])*k;
    const g=Math.max(groundAt(L,x,z),.8);
    let can=g;
    const bi=Math.floor(x/6), bj=Math.floor(z/6);
    for(let a=-3;a<=3;a++)for(let b=-3;b<=3;b++){ const A=B.get(key(bi+a,bj+b)); if(!A) continue;
      for(const t of A){ const d=Math.hypot(t[0]-x,t[1]-z); if(d<t[3]+2.5) can=Math.max(can,t[2]); } }
    yMin[i]=Math.max(g+4.5,can+4);
    /* Over trees, clr above their crowns; over sand, shrubs or water, low above the ground. */
    y[i]=(can>g+3?can+c.clr:g+c.low)+(c.rise||0)*smoothstep(.62,1,k);
  }
  /* No dips between trees: the highest need within 8 m either side. */
  const w=Math.max(1,Math.round(8/Math.max(ds,.1))), y2=new Float32Array(N+1);
  for(let i=0;i<=N;i++){ let m=y[i]; for(let j=Math.max(0,i-w);j<=Math.min(N,i+w);j++) m=Math.max(m,y[j]); y2[i]=m; }
  /* Climb and descend gently: never steeper than CROSS_SLOPE, raising the path where it would be. */
  for(let i=1;i<=N;i++) y2[i]=Math.max(y2[i],y2[i-1]-CROSS_SLOPE*ds);
  for(let i=N-1;i>=0;i--) y2[i]=Math.max(y2[i],y2[i+1]-CROSS_SLOPE*ds);
  /* Round off the corners, and stay clear of every crown. */
  for(let pass=0;pass<6;pass++){
    const t=y2.slice();
    for(let i=0;i<=N;i++){ const a=t[Math.max(0,i-1)],b=t[Math.min(N,i+1)]; y2[i]=Math.max((a+2*t[i]+b)*.25,yMin[i]); }
  }
  S.prof=y2; S.p0[1]=y2[0]; S.p1[1]=y2[N];
  S.maxH=L.maxH; S.steps=L.kind==='rocky'?40:38;
  S.nearH=Math.max(...[S.p0,S.p1].map(p=>maxGroundNear(L,p[0],p[2],380)+14),...Array.from(y2).map(v=>v+10));
}
function smoothstep(a,b,x){ const t=Math.min(Math.max((x-a)/(b-a),0),1); return t*t*(3-2*t); }
/* Places worth crossing: plants within reach of the shore, a beach between, and some variety in the edge
   of the plants (a bend, a gap, a tongue of scrub). Returns the best of a few tries. */
function crossPlace(L){
  let best=null,bs=-1e9;
  for(let i=0;i<14;i++){
    const z=rnd(-L.domSize[1]*.3,L.domSize[1]*.3), pe=plantEdge(L,z), sh=shoreAt(L,z), wid=sh-pe;
    if(wid<4||wid>170||inlandAt(L,pe-18,z)<.3) continue;
    const pes=[-50,-25,25,50].map(d=>plantEdge(L,z+d)-pe), shs=[-50,50].map(d=>shoreAt(L,z+d)-sh);
    const irr=pes.reduce((s,v)=>s+Math.abs(v),0)/4+Math.abs(shs[0]+shs[1])*.5;
    const sc=Math.min(wid,80)/80*.6+Math.min(irr/14,1)+rnd(.7);
    if(sc>bs){ bs=sc; best={z,pe,sh,wid}; }
  }
  return best;
}
/* o: calm (long and slow), pace, dur, v (a variant to try first). */
function buildCrossing(L,lightKey,o={}){
  const P=crossPlace(L); if(!P) return null;
  const v=o.v||pick(['in','in','in','back','back','edge','edge']);
  const S={L,lightKey,kind:'crossing',noise:rnd(1000)};
  const calm=!!o.calm, pace=o.pace||1;
  let dur=calm?(o.dur||rnd(32,55)):rnd(6.5,9.5);
  /* Over the trees it may go nearly to the inland edge of the simulated ground. */
  const xLo=L.domMin[0]+Math.max(12,L.domSize[0]*.025), xHi=L.domMin[0]+L.domSize[0]*.96;
  S.cross={v,clr:r2c(rnd(8,15)),low:r2c(rnd(6,14)),rise:0};
  if(v==='edge'){
    /* Along the edge: just over the sand side of the plant line, heading along the coast and turned out
       toward the sea a little, so the trees pass on one side and the beach opens on the other. */
    const dir=Math.random()<.5?1:-1, speed=calm?rnd(1.4,2.6)*pace:rnd(3.5,6), len=speed*dur;
    const z0=P.z-dir*len*.5, z1=P.z+dir*len*.5, off=rnd(-4,9);
    const x0=Math.max(plantEdge(L,z0)+off,xLo), x1=Math.max(plantEdge(L,z1)+off,xLo);
    S.p0=[x0,0,z0]; S.p1=[x1,0,z1];
    const h=Math.atan2(z1-z0,x1-x0), turn=rnd(.25,.75)*(Math.random()<.8?1:-.6);
    S.yaw0=h-dir*turn; S.yaw1=S.yaw0+dir*rnd(-.08,.08); S.pitch=-deg(rnd(14,26));
  } else {
    /* Across: through the edge of the plants on a slant, 15 to 40 degrees off straight out to sea, so the
       beach runs across the picture rather than straight ahead. */
    const sg=Math.random()<.5?1:-1, head=sg*rnd(.26,.7), dx=Math.cos(head), dz=Math.sin(head), back=v==='back';
    /* Most of the time over the trees and the beach. A first version spent half its time over plain sea,
       and only glimpsed the trees: now "in" ends just past the water's edge, and "back" starts over the
       dry sand, with the surf already in view. */
    const aMax=(P.pe-xLo-2)/dx;
    let a=Math.min(calm?rnd(45,85):rnd(10,22),aMax), b=back?Math.max(P.wid,6)*rnd(.35,.75)/dx:Math.max(P.wid,6)/dx+(calm?rnd(0,6):rnd(2,8));
    if(a<(calm?16:8)) return null;
    if(!calm){ const len=rnd(3.8,6.5)*dur; b=Math.min(b,Math.max(len-a,P.wid*.4/dx)); }
    else{
      /* 1.3 to 4.2 m/s. A reel gives the length of the shot: then the path is fitted to it, longer over the
         trees (then the sea) or shorter; otherwise the length is fitted to the path. */
      const lo=1.3*pace, hi=4.2*pace;
      if(o.dur){
        if(a+b<lo*dur){ const more=lo*dur-(a+b), ma=Math.min(more,Math.max(aMax-a,0)); a+=ma; b+=more-ma; }
        else if(a+b>hi*dur){ const cut=a+b-hi*dur, ca=Math.max(Math.min(cut,a-16),0); a-=ca; b=Math.max(b-(cut-ca),P.wid*.5/dx); }
      } else dur=(a+b)/Math.min(Math.max((a+b)/dur,lo),hi);
    }
    const A=[P.pe-dx*a,0,P.z-dz*a], Bp=[P.pe+dx*b,0,P.z+dz*b];
    if(A[0]<xLo-1||Bp[0]>xHi) return null;
    if(v==='in'){
      /* Looking a little further along the beach than it flies; steeply down on the crowns at first, with the
         beach ahead, then tilting up as it crosses the sand, and sometimes climbing over the surf at the end. */
      S.p0=A; S.p1=Bp; S.yaw0=head*1.3+rnd(-.08,.08); S.yaw1=S.yaw0+sg*rnd(0,.1);
      if(calm){ S.pitch=-deg(rnd(36,46)); S.pitch1=-deg(rnd(18,25)); if(Math.random()<.4) S.cross.rise=r2c(rnd(8,18)); }
      else S.pitch=-deg(rnd(26,34));
    } else {
      /* Back: facing the sea, backing in over the beach and rising over the trees, which come into the
         picture from below as the drone passes over them; tilting up a little as it climbs and backs away, so the
         beach stays in view (at a fixed tilt, the forest filled the picture by the end).
         Facing the land showed a wall of forest, and cost twice the drawing time. */
      S.p0=Bp; S.p1=A; S.yaw0=head*1.3+rnd(-.08,.08); S.yaw1=S.yaw0+sg*rnd(0,.1);
      S.pitch=-deg(rnd(22,30)); if(calm) S.pitch1=S.pitch+deg(rnd(4,8));
    }
  }
  S.fov=deg(calm?60:62); S.dur=dur; S.start=0;
  crossProfile(S);
  return S;
}
const r2c=x=>Math.round(x*10)/10;
/* A crossing is fine if the drone stays over the simulated stretch, nothing but plants stands close in the
   picture (cliffs and hills are checked by viewRate; plants by the profile), and a flight out to sea
   ends with water in view. */
function crossOk(S){
  const L=S.L;
  for(const u of [0,.5,1]){
    const c=cameraFor(S,u,0,1);
    const fz=(c.ro[2]-L.domMin[1])/L.domSize[1], fx=(c.ro[0]-L.domMin[0])/L.domSize[0];
    if(fz<.06||fz>.94||fx<.015||fx>.98) return false;
    const d=c.F[1]<-.05?Math.min(-c.ro[1]/c.F[1],600):400, f=(c.ro[2]+c.F[2]*d-L.domMin[1])/L.domSize[1];
    if(f<.08||f>.92) return false;
    const r=viewRate(S,u); if(r.wall>.1) return false;
    if(S.cross.v==='in'&&u===1&&r.water<.15) return false;
  }
  return peopleClear(S);
}
/* People on the beach (js/people.js) keep the camera at a distance; without them, any path is clear. */
function peopleClear(S){ return typeof peopleNearPath!=='function'||!peopleNearPath(S); }
function makeCrossing(L,lightKey,sunOk,o={}){
  let best=null;
  for(let i=0;i<10;i++){
    const S=buildCrossing(L,lightKey,o); if(!S) continue;
    if(!best) best=S;
    if(!crossOk(S)) continue;
    best=S;
    if(!sunWrong(S,sunOk,[0,.5,1])) return S;
  }
  return best;
}
/* w.high, for reels' wide opening shots (makeMove): a straight-down shot near its highest. Left out,
   nothing changes, down to the random numbers drawn. */
function buildShot(L,lightKey,kind,w){
  const S={L,lightKey,kind,noise:rnd(1000)};
  const dom=L.domSize, dx0=L.domMin[0], z0=L.domMin[1], zSpan=dom[1];
  const aspect=canvas.width/canvas.height;
  if(kind==='top'){
    const altMax=Math.min(dom[0]*.46/Math.tan(FOV_TOP/2)/1.05,(L.dx<.7?122:260));
    const altMin=L.dx<.7?(L.kind==='surf'?62:50):120;
    const alt=rnd(w&&w.high?Math.max(altMin,altMax*.85):altMin,Math.max(altMin+1,altMax));
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
    /* Looking along the coast was half of all angled shots, and the eye reads a shore running straight to
       the horizon as made; now a third, turned further out to sea, so the coast leaves the picture or
       bends away (the far coast ends within a few kilometres: farBend in js/shaders/terrain.js). */
    const mode=pick(['along','along','sea','quarter','quarter','quarter']);
    let z=rnd(-zSpan*.28,zSpan*.28);
    const alongSign=Math.random()<.5?1:-1;
    if(mode==='along') z=-alongSign*rnd(zSpan*.08,zSpan*.26);
    const shore=shoreAt(L,z);
    const dist=(L.dx<.7?rnd(120,210):rnd(190,430))*(L.kind==='rocky'?1.1:1);
    const pitch=-deg(mode==='along'?rnd(11,30):rnd(14,40));
    let head,offs;
    if(mode==='along'){ head=alongSign*(Math.PI*.5-rnd(.24,.66)*(Math.random()<.82?1:-.4)); offs=rnd(25,90); }
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
/* o (for reels, js/reel.js), all optional: kind ('top', 'angled', 'canopy' or 'crossing'), dur (seconds), pace
   ('slow', 'usual' or 'lively': how fast the drone drifts) and move (makeMove below). Left out, the shot is
   made as calm mode chooses, so films with a seed repeat. */
const PACE={slow:.6,usual:1,lively:1.6};
function makeCalmShot(L,lightKey,o){
  const r=Math.random(); let kind=r<.38?'top':r<.80?'angled':r<.88?'canopy':'crossing';
  if(o&&['top','angled','canopy','crossing'].includes(o.kind)) kind=o.kind;
  /* A reveal and a rise are angled; a wide shot is angled or straight down. */
  if(o&&o.move&&(o.move!=='wide'||kind==='canopy'||kind==='crossing')) kind='angled';
  /* Low over dark trees at night shows little: angled instead. */
  if(lightKey&&dimLight(lightKey)&&(kind==='top'||kind==='crossing')) kind='angled';
  /* A reel's movie can have any time of day. Straight down, a low sun's light is flat and dull, which is
     why the slideshow never shows golden hour from straight above: below 16 degrees, angled instead. */
  if(o&&kind==='top'&&LIGHTS[lightKey]&&LIGHTS[lightKey].el<16) kind='angled';
  /* Facing a low sun is decided once per shot, not per try (see the glare guard above). */
  const sunOk=Math.random()<SUN_SHARE;
  const pace=o&&PACE[o.pace]||1;
  if(o&&o.move){ const M=makeMove(L,lightKey,kind,o,sunOk,pace); if(M) return M; }
  if(kind==='crossing'){
    const C=makeCrossing(L,lightKey||pickLight(L,'crossing'),sunOk,{calm:true,pace,dur:o&&o.dur,v:o&&o.v});
    if(C) return C;
    kind='canopy';
  }
  let S=null;
  for(let i=0;i<12;i++){
    if(kind==='canopy'){
      const lk=lightKey||pickLight(L,'canopy');
      for(let j=0;j<8;j++){ S=buildCanopy(L,lk,{speed:rnd(1.,2.)*pace,dur:o&&o.dur||rnd(24,40)}); if(!sunWrong(S,sunOk,[0,.5,1])) break; }
      return S;
    }
    S=makeShot(L,lightKey,kind,sunOk);
    S.dur=o&&o.dur||rnd(35,75);
    const speed=(kind==='top'?rnd(.4,1.1)*(L.dx<.7?1:1.5):rnd(.7,1.9))*pace;
    stretchPath(S,speed*S.dur);
    S.yaw1=S.yaw0+(kind==='top'?rnd(-.3,.3):rnd(-.1,.1));
    if(calmOk(S)&&!sunWrong(S,sunOk,[0,1])) break;
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
  return peopleClear(S);
}
/* ---- Camera moves, for the opening and closing shots of a reel's movies ----
     wide    an establishing shot: angled from further out and higher, so a long stretch of the coast is
             in view, or straight down from near the highest a straight-down shot goes; slow.
     reveal  angled: the drone starts looking steeply down (58 to 72 degrees) at the water and the surf,
             and tilts up over the shot to an ordinary view (13 to 21 degrees down) along the coast or out
             to sea, as it drifts forward: the classic drone reveal of the coast and the horizon.
     rise    angled: the drone climbs 40 to 80% higher as it drifts back, tilting down to keep the same
             stretch of shore in the middle of the picture: a way to leave a place.
   The tilt (S.pitch to S.pitch1, in cameraFor) eases in and out and is done by 85% of the way, so the
   shot settles on its last view before the dissolve.
   Each try is checked from start to end as calm shots are (calmOk), and for rock or land standing close in
   the picture (viewRate). A reveal's first, steep view must be water and surf: no land, no rock. If no
   try passes, the shot is an ordinary calm shot of the same kind. */
function makeMove(L,lightKey,kind,o,sunOk,pace){
  const lk=lightKey||pickLight(L,kind), dur=o.dur||rnd(35,75);
  const B={wide:buildWide,reveal:buildReveal,rise:buildRise}[o.move];
  if(!B) return null;
  for(let i=0;i<(o.move==='wide'?16:40);i++){
    const S=B(L,lk,kind,dur,pace,sunOk);
    if(S&&!sunWrong(S,sunOk,[0,.5,1])&&moveOk(S,o.move)){ S.move=o.move; return S; }
  }
  return null;
}
function moveOk(S,move){
  const L=S.L, top=S.kind==='top';
  for(const u of [0,.5,1]){
    const r=rateShot(S,u);
    if(move==='reveal'&&u===0){ if(r.inland>.02||r.water<.4||r.water+r.shore<.8) return false; }
    else if(r.inland>(move==='wide'?.22:top?.2:.17)||r.water<.15||r.shore<.03) return false;
    const c=cameraFor(S,u,0,1), d=c.F[1]<-.05?Math.min(-c.ro[1]/c.F[1],600):400;
    const f=(c.ro[2]+c.F[2]*d-L.domMin[1])/L.domSize[1];
    if(f<.1||f>.9) return false;
    /* The drone itself stays over the simulated stretch, so the water close below it is the simulated sea. */
    const fz=(c.ro[2]-L.domMin[1])/L.domSize[1], fx=(c.ro[0]-L.domMin[0])/L.domSize[0];
    if(fz<.04||fz>.96||fx<.05||fx>1) return false;
  }
  for(const u of [0,.5,1]){ const v=viewRate(S,u); if(v.wall>(move==='reveal'&&u===0?.01:.05)) return false; }
  return peopleClear(S);
}
/* Above the ground everywhere along the path, by at least gap metres, and the ray march's limits widened
   to the whole path. */
function clearPath(S,gap){
  const L=S.L; let need=0;
  for(let i=0;i<=12;i++){ const t=i/12,x=S.p0[0]+(S.p1[0]-S.p0[0])*t,z=S.p0[2]+(S.p1[2]-S.p0[2])*t,y=S.p0[1]+(S.p1[1]-S.p0[1])*t;
    need=Math.max(need,maxGroundNear(L,x,z,40)+gap-y); }
  if(need>0){ S.p0[1]+=need; S.p1[1]+=need; }
  S.nearH=Math.max(...[S.p0,S.p1].map(p=>maxGroundNear(L,p[0],p[2],380)+14));
}
function buildWide(L,lk,kind,dur,pace,sunOk){
  if(kind==='top'){
    const S=makeShot(L,lk,'top',sunOk,{high:true});
    S.dur=dur; stretchPath(S,rnd(.3,.8)*(L.dx<.7?1:1.5)*pace*dur); S.yaw1=S.yaw0+rnd(-.15,.15);
    return S;
  }
  /* Angled: high, over the water off one end of the stretch, looking along the coast toward the other end
     and a little out to sea, so the shore runs away into the distance. */
  const S={L,lightKey:lk,kind:'angled',noise:rnd(1000)};
  const zSpan=L.domSize[1], big=L.dx>=.7, rocky=L.kind==='rocky';
  const sgn=Math.random()<.5?1:-1, head=sgn*(Math.PI*.5-rnd(.24,.55)), pitch=-deg(rnd(13,22));
  const alt=big?rnd(120,190):rnd(75,120), z=-sgn*rnd(.18,.34)*zSpan, x=shoreAt(L,z)+rnd(-20,60)*(rocky?1.2:1);
  const len=rnd(.5,1.1)*pace*dur, dx=Math.cos(head)*len, dz=Math.sin(head)*len;
  S.p0=[x-dx*.5,alt,z-dz*.5]; S.p1=[x+dx*.5,alt+rnd(-3,5),z+dz*.5];
  S.yaw0=head; S.yaw1=head+rnd(-.06,.06); S.pitch=pitch; S.fov=FOV_ANG;
  S.steps=rocky?40:38; S.maxH=L.maxH; S.dur=dur; S.start=0;
  clearPath(S,40);
  return S;
}
function buildReveal(L,lk,kind,dur,pace){
  const S={L,lightKey:lk,kind:'angled',noise:rnd(1000)};
  const zSpan=L.domSize[1], big=L.dx>=.7, rocky=L.kind==='rocky';
  const sgn=Math.random()<.5?1:-1, along=Math.random()<.7;
  const head=along?sgn*(Math.PI*.5-rnd(.2,.6)):rnd(-.5,.5);
  const z=along?-sgn*rnd(zSpan*.05,zSpan*.22):rnd(-zSpan*.25,zSpan*.25);
  const h=big?rnd(70,130):rnd(45,85), pitch0=-deg(rnd(58,72)), pitch1=-deg(rnd(13,21));
  /* Placed so the first, steep view looks down on the water just off the shore. */
  const ahead=h/Math.tan(-pitch0), x=shoreAt(L,z)+rnd(rocky?20:10,rocky?80:60)-Math.cos(head)*ahead;
  const len=rnd(.5,1.2)*pace*dur, dx=Math.cos(head)*len, dz=Math.sin(head)*len;
  S.p0=[x-dx*.3,h,z-dz*.3]; S.p1=[x+dx*.7,h+rnd(0,8),z+dz*.7];
  S.yaw0=head; S.yaw1=head+rnd(-.06,.06); S.pitch=pitch0; S.pitch1=pitch1; S.fov=FOV_ANG;
  S.steps=rocky?40:38; S.maxH=L.maxH; S.dur=dur; S.start=0;
  clearPath(S,30);
  return S;
}
function buildRise(L,lk,kind,dur,pace,sunOk){
  /* Built backwards from where it ends: an ordinary angled view, rated as the slideshow rates its own, so
     what comes into the picture below the drone as it backs away is what any angled shot shows. It starts
     lower and closer, by a little less than keeps the same angle to what it's looking at, so the place
     grows smaller in the picture as the drone leaves it. */
  const S=makeShot(L,lk,'angled',sunOk);
  const c=[0,1,2].map(i=>(S.p0[i]+S.p1[i])*.5), h1=c[1], k=1+Math.min(rnd(.45,.8)*Math.sqrt(pace),1), h0=h1/k;
  const D1=h1/Math.tan(-S.pitch), lb=D1*(1-1/k)*rnd(.5,.85), fx=Math.cos(S.yaw0)*lb, fz=Math.sin(S.yaw0)*lb;
  S.p0=[c[0]+fx,h0,c[2]+fz]; S.p1=c;
  /* The point in the middle of the picture stays in the middle: it tilts down a little as it climbs. */
  S.pitch1=S.pitch; S.pitch=-Math.atan2(h0,D1-lb);
  S.yaw1=S.yaw0+rnd(-.05,.05); S.dur=dur; S.start=0;
  clearPath(S,24);
  return S;
}
function cameraFor(S,u,t,aspect){
  const e=u*u*(3-2*u); const k=.15*e+.85*u;
  const p=[0,1,2].map(i=>S.p0[i]+(S.p1[i]-S.p0[i])*k);
  /* A crossing's height follows its profile (crossProfile above). */
  if(S.prof){ const f=Math.min(Math.max(k,0),1)*CROSS_N, i=Math.min(Math.floor(f),CROSS_N-1), a=f-i; p[1]=S.prof[i]*(1-a)+S.prof[i+1]*a; }
  const n=S.noise+t;
  const sway=(a,b)=>Math.sin(n*a+b)*.6+Math.sin(n*a*2.3+b*1.7)*.4;
  const sc=S.kind==='top'?.32:.42;
  p[0]+=sway(.43,1.3)*sc; p[1]+=sway(.31,4.2)*sc*.5; p[2]+=sway(.37,2.2)*sc;
  const yaw=S.yaw0+(S.yaw1-S.yaw0)*k+sway(.21,5.5)*.0022;
  /* A tilt over the shot (camera moves, above), eased in and out and finished by 85% of the way. */
  let pit=S.pitch;
  if(S.pitch1!==undefined&&S.kind!=='top'){ const v=Math.min(Math.max(u/.85,0),1); pit+=(S.pitch1-S.pitch)*v*v*(3-2*v); }
  pit+=sway(.27,3.1)*.0017;
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

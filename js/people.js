'use strict';
/* ---------------------------------------------------------------- People on the beach -------
   PLAN.md L6. A few people on some beaches show how big the place is and make it feel real; on wild
   coasts there are none. The "people" setting (a recipe's elements.people, the studio, or ?people= in the
   address) is "coast" (as the coast has it: a few on the sandy, easy-to-reach beaches, none on cliffs,
   reefs, rock shelves, broken coast or the lake), "none", "few" or "busy".
   - Where: groups of one to four, on dry sand above the reach of the waves and in front of the plants,
     most of them near a few places where people come onto the beach, some spread out along it. Each
     group has towels, people lying or sitting on them, often an umbrella, sometimes a cool box, and a
     trail of trodden sand and footprints down to the water. All of it is fixed to the coast (a random
     sequence seeded by the coast), so the same beach has the same people.
   - When: none at night, at twilight or in a storm; a few early and late in the day and under heavy
     cloud; all of them in the middle of the day. Which groups stay is fixed too, so going from a busy
     noon to evening, people leave rather than shuffle. Umbrellas only in sunshine.
   - Walkers (TECHLOG 53): alone or in pairs, along the firm wet sand by the water, now and then one
     higher up the beach. Each walks a stretch of the beach and back at 1.1 to 1.45 m/s, turning in a
     small loop at the ends; legs, knees and arms swing in the model (the planted foot keeps still while
     the body passes over it). Where they are is worked out from the shot's clock, so a film draws them
     the same every time. They like the morning and evening more than the sunbathers do.
   - Surfers: on coasts with real surf (sandy surf coasts and Crescent bay, swell over 0.7 m), a few
     in one to three groups at a peak just outside where the waves start to break. Most sit astride
     their boards facing the sea; some lie on them and paddle slowly round. Their height and tilt come
     from the simulated sea itself, read in the model pass, so they ride the swell.
   - The camera keeps PEOPLE_CLEAR (15) metres from every group (peopleNearPath, used by the shot
     builders): the figures (smooth lofted shells, TECHLOG 59) hold up from about 12 m, not closer. Walkers and surfers move, so instead any that would come that
     close to the camera at the same moment of the shot are left out of that whole shot (moversSkip).
   Drawn in two parts (js/shaders/people.js): towels, trails and shadows in the main view shader; the
   people, umbrellas and cool boxes as small models in a pass of their own. */
const PEOPLE_LEVELS=['coast','none','few','busy'];
const PEOPLE_COAST={'Surf beach':'few','Long sand coast':'few','Tropical lagoon':'few','Tropical shallows':'few','Palm cove':'few','Crescent bay':'few'};
/* 30 m until the figures were rebuilt to hold up at 12 to 20 m (TECHLOG 59). */
const PEOPLE_CLEAR=15;
function peopleLevel(S){
  const o=S.opt?.people; if(o&&o!=='coast') return o;
  const q=Q.get('people'); if(PEOPLE_LEVELS.includes(q)&&q!=='coast') return q;
  return PEOPLE_COAST[S.L.name]||'none';
}
/* Driftwood logs, where the view shader puts them (beachDebris in js/shaders/view.js: one 12 m cell in
   three, or in ten on tropical coasts, above the wrack line), so groups keep off them. Each is the line
   from end to end, its thickest radius, and whether it has a root wad (about 2 m across) at its first end.
   The tests on height, rock and plants are a little looser than the shader's: this coarse grid isn't its
   terrain, and a log missed here would lie under a towel. Kept on the coast. */
function driftLogs(L){
  if(L._logs) return L._logs;
  const fr=x=>x-Math.floor(x), hh=(x,y)=>{ let a=fr(x*.1031),b=fr(y*.1030),c=fr(x*.0973); const d=a*(b+33.33)+b*(c+33.33)+c*(a+33.33); a+=d;b+=d;c+=d; return [fr((a+b)*c),fr((a+c)*b)]; };
  const C=12, hw=1.05+L.Hs*.6*.75, tropic=L.type===0||L.flora===0, out=[];
  for(let j=Math.floor(L.domMin[1]/C)-1;j<=Math.ceil((L.domMin[1]+L.domSize[1])/C);j++)
    for(let i=Math.floor(L.domMin[0]/C)-1;i<=Math.ceil((L.domMin[0]+L.domSize[0])/C);i++){
      const h1=hh(i+71.3,j+71.3); if(h1[0]>(tropic?.7:.34)) continue;
      if(tropic&&h1[1]<.88) continue;   // a frond or coconuts: flat, nothing to keep off
      const h2=hh(i+13.9,j+13.9), h3=hh(i+5.1,j+5.1), h4=hh(i+27.7,j+27.7), h5=hh(i+41.3,j+41.3);
      const cx=(i+.15+.7*h2[0])*C, cz=(j+.15+.7*h2[1])*C, hy=groundAt(L,cx,cz);
      if(hy<hw-.05||hy>hw+2.6||rockAt(L,cx,cz)>.3||inlandAt(L,cx,cz)>.35) continue;
      const len=1.5+7*h3[1]*h3[1], a=Math.PI/2+(h3[0]-.5)*1.3, ax=Math.cos(a), az=Math.sin(a);
      const r=.06+.27*h2[0]*h2[0]*Math.min(len/5,1)+.04*h4[0];
      out.push({ax:cx-ax*len*.5,az:cz-az*len*.5,bx:cx+ax*len*.5,bz:cz+az*len*.5,r,root:h5[1]>.55&&r>.14});
    }
  return L._logs=out;
}
/* How far (x, z) is from the nearest log's surface (a root wad counts as 2 m round its end). */
function logClear(L,x,z){
  let d=1e9;
  for(const g of driftLogs(L)){
    const ex=g.bx-g.ax, ez=g.bz-g.az, t=Math.min(Math.max(((x-g.ax)*ex+(z-g.az)*ez)/(ex*ex+ez*ez),0),1);
    d=Math.min(d,Math.hypot(x-g.ax-ex*t,z-g.az-ez*t)-g.r);
    if(g.root) d=Math.min(d,Math.hypot(x-g.ax,z-g.az)-2);
  }
  return d;
}
/* ---- Where they are, for a coast and a level (kept on the coast) ---- */
function beachLayout(L,level){
  const key='_people_'+level; if(L[key]) return L[key];
  const r=mulberry(Math.floor(L.seed*7919)+(level==='busy'?17:3)), R=(a,b)=>a+(b-a)*r(), P=a=>a[Math.floor(r()*a.length)];
  /* Dry sand: above where the swash reaches now (the tide here is fixed at mid tide), which is below the
     high-tide wrack line; people sit between it and the plants. */
  const span=L.domSize[1], dry=.5+.55*L.Hs+(L.Hs>.8?.2:0);
  const acc=[]; for(let i=0,n=2+Math.floor(r()*3);i<n;i++) acc.push(R(-.36,.36)*span);
  const nG=level==='busy'?Math.round(R(22,28)):Math.round(R(8,11));
  const groups=[];
  /* Spots on driftwood are drawn again without using up a try, so the beach keeps as many groups as it
     had before people kept off the logs. */
  for(let t=0,onLog=0;t<nG*4+onLog&&groups.length<nG;t++){
    const z=r()<.68?P(acc)+R(-40,40):R(-.42,.42)*span;
    if(Math.abs(z)>.44*span) continue;
    const pe=plantEdge(L,z), sh=shoreAt(L,z);
    let xd=sh; while(xd>pe&&groundAt(L,xd,z)<dry) xd-=1;
    const lo=pe+4, hi=xd-1.5; if(hi-lo<3) continue;
    const x=lo+(hi-lo)*R(.12,.8);
    /* Not among the shrubs and grass that grow out onto the sand (they grow wherever there's any plant cover). */
    if([[0,0],[2.5,0],[-2.5,0],[0,2.5],[0,-2.5]].some(([a,b])=>inlandAt(L,x+a,z+b)>.015)) continue;
    const sl=(Math.abs(groundAt(L,x+2,z)-groundAt(L,x-2,z))+Math.abs(groundAt(L,x,z+2)-groundAt(L,x,z-2)))/4;
    if(sl>.22) continue;
    /* Not on driftwood: a group's towels, umbrella and cool box reach about 2 m from its middle. */
    if(logClear(L,x,z)<3.3){ if(onLog<nG*8) onLog++; continue; }
    if(groups.some(G=>Math.hypot(G.x-x,G.z-z)<(level==='busy'?6:9))) continue;
    groups.push(makeGroup(L,x,z,sh,r,R,P));
  }
  return L[key]=groups;
}
function makeGroup(L,x,z,sh,r,R,P){
  const n=P([1,2,2,2,3,3,4]), yaw=R(-.45,.45)+(r()<.25?Math.PI*.5*(r()<.5?1:-1):0);
  const ax=[Math.cos(yaw),Math.sin(yaw)], pp=[-ax[1],ax[0]];
  const y=groundAt(L,x,z);
  const G={x,z,y,yaw,h:r(),towels:[],people:[],umb:null,cool:null,trail:null,cast:[]};
  const pal=Math.floor(r()*6);
  for(let i=0;i<n;i++){
    const o=(i-(n-1)/2)*R(.95,1.15), jit=R(-.15,.15);
    const tx=x+pp[0]*o+ax[0]*jit, tz=z+pp[1]*o+ax[1]*jit, ty=yaw+R(-.12,.12);
    const pat=P([0,0,1,2]), col=r()<.6?pal:Math.floor(r()*6), size=r();
    G.towels.push([tx,tz,ty,pat*6+col+size*.99]);
    /* Most lie down, head inland; some sit up, facing the sea; now and then a towel is empty. */
    const kind=r()<.12?'none':r()<.32?'sit':'lie';
    if(kind==='none') continue;
    const sc=R(.9,1.08), top=r()<.45;
    const ofs=kind==='sit'?-.45:.05, px=tx+Math.cos(ty)*ofs, pz=tz+Math.sin(ty)*ofs;
    G.people.push({kind,x:px,z:pz,yaw:ty,skin:Math.floor(r()*4),swim:Math.floor(r()*8),extra:Math.floor(r()*8),sc,top});
    const c=Math.cos(ty),s=Math.sin(ty);
    if(kind==='lie') G.cast.push([px-c*.45*sc,pz-s*.45*sc,.16,.24],[px+c*.42*sc,pz+s*.42*sc,.1,.17]);
    else G.cast.push([px-c*.07,pz-s*.07,.42*sc,.22],[px-c*.12,pz-s*.12,.82*sc,.12],[px+c*.4,pz+s*.4,.2,.18]);
  }
  if(r()<.62){
    /* At the head of the towels, inland. */
    const ux=x-ax[0]*R(.7,1.1)+pp[0]*R(-.5,.5), uz=z-ax[1]*R(.7,1.1)+pp[1]*R(-.5,.5), h=R(1.85,2.05), rad=R(.92,1.08);
    G.umb={x:ux,z:uz,h,rad,col:Math.floor(r()*6),yaw:r()*6.283};
  }
  if(r()<.35){ const s=r()<.5?1:-1, o=(n/2+.45)*s; G.cool={x:x+pp[0]*o-ax[0]*R(.2,.8),z:z+pp[1]*o-ax[1]*R(.2,.8),yaw:yaw+R(-.3,.3),col:Math.floor(r()*8)}; G.cast.push([G.cool.x,G.cool.z,.3,.24]); }
  if(r()<.85){ const ez=z+R(-8,8); G.trail=[x+ax[0]*1.2,z+ax[1]*1.2,shoreAt(L,ez)+R(.5,3),ez]; }
  return G;
}
/* ---- Walkers ---- */
/* The gait: a stride takes WALK_T seconds, each foot is on the ground for WALK_B of it, legs WALK_LEG m. */
const WALK_T=1.0, WALK_B=.6, WALK_LEG=.88;
/* Levels above the sea where people walk, as fractions of the dry line (beachLayout): the lower three on
   the firm wet sand the waves have just left, the upper ones further up the beach. */
const WALK_LV=[.2,.3,.42,.72,.95];
/* The beach along z every 2 m: for each level, the x where the ground rises through it, smoothed over
   14 m; NaN where there's no open sand there (rock, plants, steep ground, no beach). Kept on the coast. */
function walkLine(L){
  if(L._walk) return L._walk;
  const span=L.domSize[1], z0=L.domMin[1]+.05*span, n=Math.floor(.9*span/2), dry=.5+.55*L.Hs+(L.Hs>.8?.2:0);
  const raw=WALK_LV.map(()=>new Float32Array(n).fill(NaN));
  for(let i=0;i<n;i++){
    const z=z0+i*2, sh=shoreAt(L,z), pe=plantEdge(L,z);
    if(sh<L.domMin[0]+41) continue;
    let k=0;
    for(let x=sh+2;x>pe+3&&k<WALK_LV.length;x-=.5){
      const g=groundAt(L,x,z);
      while(k<WALK_LV.length&&g>=WALK_LV[k]*dry){
        const sl=(Math.abs(groundAt(L,x+2,z)-groundAt(L,x-2,z))+Math.abs(groundAt(L,x,z+2)-groundAt(L,x,z-2)))/4;
        if(rockAt(L,x,z)<.15&&sl<.2&&inlandAt(L,x,z)<.02) raw[k][i]=x;
        k++;
      }
    }
  }
  const X=raw.map(a=>{ const b=new Float32Array(n).fill(NaN);
    for(let i=3;i<n-3;i++){ let s=0,ok=true; for(let j=-3;j<=3;j++){ const v=a[i+j]; if(v!==v){ ok=false; break; } s+=v; } if(ok) b[i]=s/7; }
    return b; });
  return L._walk={z0,n,X,dry};
}
function walkX(W,lv,z){
  const f=Math.min(Math.max((z-W.z0)/2,0),W.n-1.001), i=Math.floor(f), a=f-i, X=W.X[lv];
  const p=X[i],q=X[i+1]; return p!==p?q:q!==q?p:p+(q-p)*a;
}
/* Who walks this beach, and where: a fixed list for the coast and level. */
function beachWalkers(L,level){
  const key='_walkers_'+level; if(L[key]) return L[key];
  const W=walkLine(L), r=mulberry(Math.floor(L.seed*4241)+(level==='busy'?29:11)), R=(a,b)=>a+(b-a)*r(), P=a=>a[Math.floor(r()*a.length)];
  /* Unbroken stretches of each level at least 60 m long. */
  const runs=W.X.map(X=>{ const o=[]; let a=-1;
    for(let i=0;i<=W.n;i++){
      const ok=i<W.n&&X[i]===X[i], cut=ok&&a>=0&&Math.abs(X[i]-X[i-1])>=1.4;
      if(a>=0&&(!ok||cut)){ if(i-1-a>=30) o.push([a,i-1]); a=-1; }
      if(ok&&a<0) a=i;
    }
    return o; });
  const out=[], n=level==='busy'?Math.round(R(12,16)):Math.round(R(5,8));
  for(let t=0;t<n*4&&out.length<n;t++){
    const lv=r()<.78?P([0,1,1,2]):P([3,4]), rs=runs[lv]; if(!rs.length) continue;
    const tot=rs.reduce((s,[a,b])=>s+b-a,0); let k=r()*tot, run=rs[0];
    for(const q of rs){ if(k<q[1]-q[0]){ run=q; break; } k-=q[1]-q[0]; }
    const len=Math.min(run[1]-run[0],Math.round(R(50,190))), i0=run[0]+Math.floor(r()*(run[1]-run[0]-len+1));
    const pair=r()<.4, v=R(1.1,1.45), rr=R(.7,1.1), loop=2*len*2+2*Math.PI*rr;
    const ppl=[]; for(let j=0;j<(pair?2:1);j++){ const sc=R(.9,1.08); ppl.push({skin:Math.floor(r()*4),swim:Math.floor(r()*8),extra:Math.floor(r()*8),sc,top:r()<.62,ph:r(),sA:Math.min(.6,v*WALK_T*WALK_B/(2*WALK_LEG*sc))}); }
    out.push({lv,i0,len,v,r:rr,loop,s0:r()*loop,ppl,h:r()});
  }
  return L[key]=out;
}
/* Where walker w is at time T (seconds): along its stretch one way, round a small loop, back a lane over.
   Returns the middle of the walker (or pair), heading (dx, dz) and the distance walked. */
function walkAt(L,w,T){
  const W=walkLine(L), len=w.len*2, r=w.r;
  const s=((w.s0+w.v*T)%w.loop+w.loop)%w.loop;
  let zz,lane,dz,dl;
  if(s<len){ zz=s; lane=-r; dz=1; dl=0; }
  else if(s<len+Math.PI*r){ const a=(s-len)/r; zz=len+Math.sin(a)*r; lane=-Math.cos(a)*r; dz=Math.cos(a); dl=Math.sin(a); }
  else if(s<2*len+Math.PI*r){ zz=len-(s-len-Math.PI*r); lane=r; dz=-1; dl=0; }
  else { const a=(s-2*len-Math.PI*r)/r; zz=-Math.sin(a)*r; lane=Math.cos(a)*r; dz=-Math.cos(a); dl=-Math.sin(a); }
  const z=W.z0+w.i0*2+zz, x0=walkX(W,w.lv,z), slope=(walkX(W,w.lv,z+1)-walkX(W,w.lv,z-1))/2;
  const dx=dl+slope*dz, l=Math.hypot(dx,dz);
  return {x:x0+lane,z,dx:dx/l,dz:dz/l,s:w.s0+w.v*T};
}
/* ---- Surfers ---- */
function beachSurfers(L,level){
  const key='_surfers_'+level; if(L[key]) return L[key];
  const out=[]; L[key]=out;
  if(!(L.kind==='surf'||L.water==='surf')||L.Hs<.7) return out;
  const r=mulberry(Math.floor(L.seed*6113)+(level==='busy'?41:7)), R=(a,b)=>a+(b-a)*r();
  /* Waves start to break where the depth falls below 1.6 times the breaking depth (js/shaders/sim.js).
     Along the coast every 4 m, the first place that happens coming in from the sea (clear of the band
     at the outer edge where the simulation takes the swell in). */
  const bd=Math.max(L.Hs*1.35,.5), xSea=L.domMin[0]+L.domSize[0]-58*L.dx, span=L.domSize[1], brk=[];
  for(let z=L.domMin[1]+.14*span;z<L.domMin[1]+.86*span;z+=4){
    if(-groundAt(L,xSea,z)<1.75*bd) continue;
    let x=xSea; while(x>L.domMin[0]+5&&-groundAt(L,x,z)>=1.6*bd) x-=1;
    brk.push([x,z]);
  }
  if(brk.length<5) return out;
  const brkAt=z=>brk.reduce((b,q)=>Math.abs(q[1]-z)<Math.abs(b[1]-z)?q:b)[0];
  const nP=level==='busy'?2+Math.floor(r()*2):1+Math.floor(r()*2);
  for(let p=0;p<nP;p++){
    /* A peak: where the waves break furthest out, of a few places tried. */
    let pk=null; for(let k=0;k<6;k++){ const q=brk[Math.floor(r()*brk.length)]; if(!pk||q[0]>pk[0]) pk=q; }
    const n=level==='busy'?4+Math.floor(r()*4):2+Math.floor(r()*3);
    for(let i=0,t=0;i<n&&t<n*4;t++){
      const z=pk[1]+R(-24,24), x=brkAt(z)+R(5,19);
      if(x>xSea+8||-groundAt(L,x,z)<1.75*bd) continue;
      if(out.some(s=>Math.hypot(s.x-x,s.z-z)<4)) continue;
      const prone=r()<.3, a=r();
      out.push({x,z,prone,yaw:prone?0:a<.78?R(-.5,.5):a<.93?(r()<.5?1:-1)*R(1.2,1.8):Math.PI+R(-.4,.4),
        rz:R(5,11),rx:R(1.5,3.5),v:R(.35,.55),dir:r()<.5?1:-1,ph:r()*6.283,pc:R(1.3,1.7),
        skin:Math.floor(r()*4),suit:r()<.75?0:Math.floor(r()*8),board:Math.floor(r()*6),len:r()<.25?1.4:R(.95,1.08),sc:R(.92,1.06),h:r()});
      i++;
    }
  }
  return out;
}
/* Where surfer s is at time T: sitting ones drift a little; paddlers go slowly round a loop. */
function surfAt(s,T){
  if(!s.prone){ const a=T*.11+s.ph; return {x:s.x+.6*Math.sin(a),z:s.z+.6*Math.sin(a*.73+1.3),yaw:s.yaw+.25*Math.sin(T*.07+s.ph*2.)}; }
  const om=s.v/Math.max(s.rz,s.rx)*s.dir, a=T*om+s.ph;
  const x=s.x+s.rx*Math.cos(a), z=s.z+s.rz*Math.sin(a), dx=-s.rx*Math.sin(a)*s.dir, dz=s.rz*Math.cos(a)*s.dir;
  return {x,z,yaw:Math.atan2(dz,dx)};
}
/* The shot's clock for walkers and surfers: its own time plus its noise seed, so shots on the same coast
   find people in different places. */
const moversT=S=>(S.t||0)+(S.noise||0);
/* Walkers and surfers who would come within PEOPLE_CLEAR metres of the camera at the same moment of the
   shot: left out of the whole shot (worked out again if the shot's path changes). */
function moversSkip(S,P){
  const sig=S.p0+'|'+S.p1+'|'+S.dur+'|'+S.noise+'|'+S.kind;
  if(P._skipSig===sig) return P._skip;
  const skip=new Set(), L=S.L, CLR=Q.has('peopleclear')?+Q.get('peopleclear'):PEOPLE_CLEAR;   // ?peopleclear=: for close-up checks only
  if(S.p0&&S.p1&&S.dur&&(P.walkers.length||P.surfers.length)){
    const N=Math.max(20,Math.ceil(S.dur*2));
    for(let i=0;i<=N;i++){
      const u=i/N, c=cameraFor(S,u,0,1).ro, T=u*S.dur+(S.noise||0);
      for(const w of P.walkers){ if(skip.has(w)) continue; const q=walkAt(L,w,T); if(Math.hypot(c[0]-q.x,c[1]-groundAt(L,q.x,q.z)-.9,c[2]-q.z)<CLR) skip.add(w); }
      for(const s of P.surfers){ if(skip.has(s)) continue; const q=surfAt(s,T); if(Math.hypot(c[0]-q.x,c[1],c[2]-q.z)<CLR) skip.add(s); }
    }
  }
  P._skipSig=sig; P._skip=skip; return skip;
}
/* The walkers' people this frame, each {x, z, yaw, phase, p}, kept for the frame. */
function walkersNow(S,P){
  const T=moversT(S); if(P._wT===T&&P._wSig===P._skipSig) return P._wNow;
  const skip=moversSkip(S,P), out=[];
  for(const w of P.walkers){
    if(skip.has(w)) continue;
    const q=walkAt(S.L,w,T), yaw=Math.atan2(q.dz,q.dx);
    w.ppl.forEach((p,j)=>{
      const o=w.ppl.length>1?(j?.36:-.36):0;
      out.push({x:q.x-q.dz*o,z:q.z+q.dx*o,yaw,phase:q.s/(w.v*WALK_T)+p.ph,p});
    });
  }
  P._wT=T; P._wSig=P._skipSig; P._wNow=out; return out;
}
/* What someone wears and how their hair is, fixed to them by a hash of two of their numbers rather than
   drawn from the coast's random sequence, so nobody moves: bit 1 boardshorts, 2 a sun hat, 4 long hair,
   8 a t-shirt. It rides in the instance data as 8 times these bits on top of p.extra (js/shaders/people.js). */
function personLook(p,a,b){
  const h=k=>{ const s=Math.sin(a*12.9898+b*78.233+k*37.719)*43758.5453; return s-Math.floor(s); };
  const fem=!!p.top;
  return (!fem&&h(1)<.7?1:0)+(h(2)<(fem?.28:.16)?2:0)+(h(3)<(fem?.72:.08)?4:0)+(h(4)<(fem?.08:.2)?8:0);
}
/* ---- For one shot: who is there in this light, and the copies of each model to draw ---- */
function peopleFor(S){
  /* Kept on the shot, and worked out again if its setting or light changes. */
  const lvl=peopleLevel(S), key=lvl+'|'+S.lightKey;
  if(S._peopleK===key) return S.people;
  S._peopleK=key; S.people=null;
  const Li=LIGHTS[S.lightKey];
  if(lvl==='none'||!Li||Q.has('nopeople')) return null;
  const el=Li.el??30, dark=Li.dark||0, vis=Li.sunVis??1;
  if((Li.night||0)>.2||el<4||dark>.6||vis<.2) return null;
  let pres=el<10?.25:el<20?.45:el<32?.75:1;
  if(dark>.3) pres*=.35;
  if(S.lightKey==='morning') pres*=.55;
  const umb=vis>=.5&&el>=16&&dark<.3;
  const G=beachLayout(S.L,lvl).filter(g=>g.h<pres);
  /* Walkers like the cool of the morning and evening; surfers go out at first light. */
  let pw=el<10?.6:el<20?.85:el<32?.75:.55, ps=el<10?.7:el<32?.85:.7;
  if(dark>.3){ pw*=.45; ps*=.5; }
  const Wk=Q.has('nowalkers')?[]:beachWalkers(S.L,lvl).filter(w=>w.h<pw);
  const Sf=Q.has('nosurfers')?[]:beachSurfers(S.L,lvl).filter(s=>s.h<ps);
  if(!G.length&&!Wk.length&&!Sf.length) return null;
  /* By model (buildPeopleModels): a woman (one who wears a top) has her own shapes. */
  const inst=Array.from({length:10},()=>[]);
  for(const g of G){
    for(const p of g.people) inst[p.kind==='lie'?(p.top?7:0):(p.top?8:1)].push(p.x,groundAt(S.L,p.x,p.z)+.02,p.z,p.yaw,p.skin+.2,p.swim,p.extra+8*personLook(p,p.x,p.z),p.sc+(p.top?10:0),0,0,0,0);
    if(g.umb&&umb) inst[2].push(g.umb.x,groundAt(S.L,g.umb.x,g.umb.z)-.05,g.umb.z,g.umb.yaw,0,g.umb.col,0,1,0,0,0,0);
    if(g.cool) inst[3].push(g.cool.x,groundAt(S.L,g.cool.x,g.cool.z),g.cool.z,g.cool.yaw,0,0,g.cool.col,1,0,0,0,0);
  }
  S.people={groups:G,umb,inst:inst.map(a=>new Float32Array(a)),walkers:Wk,surfers:Sf};
  return S.people;
}
/* Whether the drone comes within PEOPLE_CLEAR metres of anyone along the path of shot S. */
function peopleNearPath(S){
  const P=peopleFor(S); if(!P) return false;
  for(let i=0;i<=10;i++){
    const c=cameraFor(S,i/10,0,1);
    for(const g of P.groups) if(Math.hypot(c.ro[0]-g.x,c.ro[1]-g.y,c.ro[2]-g.z)<PEOPLE_CLEAR) return true;
  }
  return false;
}
/* ---- The uniforms for the main view shader: the groups nearest the middle of the view ---- */
const PEOPLE_OFF={uPeopleN:0,uPBox:[1e9,1e9,-1e9,-1e9]};
function peopleUniforms(S,cam){
  const P=peopleFor(S); if(!P) return PEOPLE_OFF;
  const Li=LIGHTS[S.lightKey], sun=Li.sun, reach=2.2*Math.min(1/Math.max(sun[1],.15),6.7)+3.5;
  /* The middle of the view on the ground, or below the drone when it looks at the horizon. */
  const t=cam.F[1]<-.05?Math.min(cam.ro[1]/-cam.F[1],500):60, cx=cam.ro[0]+cam.F[0]*t, cz=cam.ro[2]+cam.F[2]*t;
  /* Each walker this frame is a group of its own with no towels: a column for the body and a disc for
     the head cast its shadow (a column's height is given negative, see pCast). */
  const score=g=>Math.hypot(g.x-cx,g.z-cz)*.6+Math.hypot(g.x-cam.ro[0],g.z-cam.ro[2])*.4;
  const pick=(A,n)=>A.map(g=>[score(g),g]).sort((a,b)=>a[0]-b[0]).slice(0,Math.max(n,0)).map(a=>a[1]);
  /* Groups first, so their towels never give way to a walker; walkers' shadows (only those within 300 m,
     too small to see beyond) take the slots left. */
  const walk=walkersNow(S,P).filter(w=>Math.hypot(w.x-cam.ro[0],w.z-cam.ro[2])<300)
    .map(w=>({x:w.x,z:w.z,walker:true,towels:[],trail:null,cast:[[w.x,w.z,-1.48*w.p.sc,.16*w.p.sc],[w.x,w.z,1.62*w.p.sc,.1*w.p.sc]]}));
  const ngr=Math.min(P.groups.length,PEOPLE_N.G), near=pick(P.groups,ngr).concat(pick(walk,PEOPLE_N.G-ngr));
  const reachW=1.7*Math.min(1/Math.max(sun[1],.15),6.7)+1;
  const pg=new Float32Array(PEOPLE_N.G*4),pi=new Float32Array(PEOPLE_N.G*4),ptr=new Float32Array(PEOPLE_N.G*4),pt=new Float32Array(PEOPLE_N.T*4),pc=new Float32Array(PEOPLE_N.C*4);
  let nt=0,nc=0,ng=0; const box=[1e9,1e9,-1e9,-1e9];
  for(const g of near){
    const casts=g.cast.slice(); if(g.umb&&P.umb) casts.unshift([g.umb.x,g.umb.z,g.umb.h-.1,g.umb.rad]);
    if(nt+g.towels.length>PEOPLE_N.T||nc+casts.length>PEOPLE_N.C) break;
    const rc=g.walker?reachW:reach;
    pg.set([g.x,g.z,rc,g.walker?1:0],ng*4); pi.set([nt,g.towels.length,nc,Math.min(casts.length,24)],ng*4);
    ptr.set(g.trail||[g.x,g.z,g.x,g.z],ng*4);
    for(const t of g.towels) pt.set(t,(nt++)*4);
    for(const c of casts) pc.set(c,(nc++)*4);
    const xs=[g.x-rc,g.x+rc], zs=[g.z-rc,g.z+rc];
    if(g.trail){ xs.push(g.trail[2]-1,g.trail[2]+1); zs.push(g.trail[3]-1,g.trail[3]+1); }
    box[0]=Math.min(box[0],...xs); box[1]=Math.min(box[1],...zs); box[2]=Math.max(box[2],...xs); box[3]=Math.max(box[3],...zs);
    ng++;
  }
  return {uPeopleN:ng,uPBox:box,uPG:pg,uPGI:pi,uPTr:ptr,uPT:pt,uPC:pc};
}
/* ---- The models ---- */
let peopleModels=null;
function buildPeopleModels(){
  const mk=f=>{ const v=[]; f(v); const a=new Float32Array(v);
    const vao=gl.createVertexArray(),vb=gl.createBuffer(),ib=gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,28,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,28,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,1,gl.FLOAT,false,28,24);
    gl.bindBuffer(gl.ARRAY_BUFFER,ib);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,4,gl.FLOAT,false,48,0); gl.vertexAttribDivisor(3,1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,4,gl.FLOAT,false,48,16); gl.vertexAttribDivisor(4,1);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5,4,gl.FLOAT,false,48,32); gl.vertexAttribDivisor(5,1);
    gl.bindVertexArray(emptyVAO);
    return {vao,ib,nV:a.length/7}; };
  /* An ellipsoid with smooth normals, optionally turned about the vertical (yaw) and tipped (pitch, about z). */
  const ell=(v,c,r,m,pitch=0,seg=10,rings=6)=>{
    const cp=Math.cos(pitch),sp=Math.sin(pitch);
    const pt=(i,j)=>{ const th=i/seg*Math.PI*2, ph=j/rings*Math.PI-Math.PI/2, x=Math.cos(ph)*Math.cos(th), y=Math.sin(ph), z=Math.cos(ph)*Math.sin(th);
      let p=[x*r[0],y*r[1],z*r[2]], n=[x/r[0],y/r[1],z/r[2]];
      p=[p[0]*cp-p[1]*sp,p[0]*sp+p[1]*cp,p[2]]; n=[n[0]*cp-n[1]*sp,n[0]*sp+n[1]*cp,n[2]];
      const l=Math.hypot(...n); return [c[0]+p[0],c[1]+p[1],c[2]+p[2],n[0]/l,n[1]/l,n[2]/l]; };
    for(let j=0;j<rings;j++)for(let i=0;i<seg;i++){
      const a=pt(i,j),b=pt(i+1,j),cc=pt(i+1,j+1),d=pt(i,j+1);
      v.push(...a,m,...b,m,...cc,m,...a,m,...cc,m,...d,m);
    }
  };
  /* A limb: a tapered tube from p to q, closed by small balls at the joints. */
  const limb=(v,p,q,r0,r1,m,seg=7)=>{
    const d=[q[0]-p[0],q[1]-p[1],q[2]-p[2]], L=Math.hypot(...d), u=d.map(x=>x/L);
    const a=Math.abs(u[1])<.9?[0,1,0]:[1,0,0];
    let e1=[u[1]*a[2]-u[2]*a[1],u[2]*a[0]-u[0]*a[2],u[0]*a[1]-u[1]*a[0]]; const l1=Math.hypot(...e1); e1=e1.map(x=>x/l1);
    const e2=[u[1]*e1[2]-u[2]*e1[1],u[2]*e1[0]-u[0]*e1[2],u[0]*e1[1]-u[1]*e1[0]];
    const ring=(c,r,i)=>{ const t=i/seg*Math.PI*2, n=[0,1,2].map(k=>e1[k]*Math.cos(t)+e2[k]*Math.sin(t)); return [c[0]+n[0]*r,c[1]+n[1]*r,c[2]+n[2]*r,...n]; };
    for(let i=0;i<seg;i++){ const A=ring(p,r0,i),B=ring(p,r0,i+1),C=ring(q,r1,i+1),D=ring(q,r1,i); v.push(...A,m,...B,m,...C,m,...A,m,...C,m,...D,m); }
    ell(v,q,[r1,r1,r1],m,0,6,4);
  };
  /* ---- Figures (TECHLOG 59): smooth shells lofted through rings, a man's and a woman's shape, posed ----
     A loft is a list of rings {c centre, u and w its two axes (unit), a and b its half-widths along them,
     m the material of the band up to the next ring}; a ring of zero size closes it. t0..t1: only part of
     the way round, an open sheet. Normals come from the finished grid, pointing away from each ring's
     centre, so the surface shades smoothly. */
  const V3={add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul:(a,k)=>[a[0]*k,a[1]*k,a[2]*k],
    dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    nz:a=>{ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; }};
  const loft=(v,R,seg=12,t0=0,t1=2*Math.PI)=>{
    const open=t1-t0<6.28, ns=open?seg+1:seg, N=R.length;
    const P=R.map(r=>{ const row=[]; for(let i=0;i<ns;i++){ const t=t0+(t1-t0)*i/seg, c=Math.cos(t)*r.a, s=Math.sin(t)*r.b;
      row.push([r.c[0]+r.u[0]*c+r.w[0]*s,r.c[1]+r.u[1]*c+r.w[1]*s,r.c[2]+r.u[2]*c+r.w[2]*s]); } return row; });
    const Nn=P.map((row,k)=>row.map((p,i)=>{
      const r=R[k];
      if(r.a<1e-5&&r.b<1e-5) return V3.nz(V3.sub(r.c,k?R[k-1].c:R[k+1].c));   // a closed end: along the path
      const ip=open?Math.min(i+1,ns-1):(i+1)%ns, im=open?Math.max(i-1,0):(i-1+ns)%ns, kp=Math.min(k+1,N-1), km=Math.max(k-1,0);
      let n=V3.nz(V3.cross(V3.sub(P[k][ip],P[k][im]),V3.sub(P[kp][i],P[km][i])));
      if(V3.dot(n,V3.sub(p,r.c))<0) n=V3.mul(n,-1);
      return n; }));
    const vt=(k,i,m)=>{ const j=open?i:i%ns; v.push(...P[k][j],...Nn[k][j],m); };
    for(let k=0;k<N-1;k++){ const m=R[k].m; for(let i=0;i<seg;i++){ vt(k,i,m); vt(k,i+1,m); vt(k+1,i+1,m); vt(k,i,m); vt(k+1,i+1,m); vt(k+1,i,m); } }
  };
  /* A limb from A to B: prof is [t, a, b, off] per ring (t 0 at A and 1 at B, beyond either for overlaps;
     a the half-width toward hint, the limb's front; b across; off shifts the ring toward hint). mat(t)
     gives each band's material. Both ends are closed by rounded caps of lengths cap. */
  const limbL=(v,A,B,hint,prof,mat,seg=12,cap=[.02,.02])=>{
    const d=V3.sub(B,A), L=Math.hypot(...d), dn=V3.mul(d,1/L), u=V3.nz(V3.sub(hint,V3.mul(dn,V3.dot(hint,dn)))), w=V3.cross(dn,u);
    const R=[], at=(t,a,b,off)=>R.push({c:V3.add(V3.add(A,V3.mul(d,t)),V3.mul(u,off||0)),u,w,a,b,m:mat(t)});
    const f=prof[0], l=prof[prof.length-1];
    for(const j of [1,.86,.6,.3]){ const k=Math.sqrt(1-j*j); at(f[0]-cap[0]/L*j,f[1]*k,f[2]*k,f[3]); }
    for(const p of prof) at(...p);
    for(const j of [.3,.6,.86,1]){ const k=Math.sqrt(1-j*j); at(l[0]+cap[1]/L*j,l[1]*k,l[2]*k,l[3]); }
    loft(v,R,seg);
  };
  /* Standing proportions, 1.72 m, facing +x (z across): the torso from the crotch to the neck as [y,
     depth, width, forward shift]; the head likewise from the chin to the crown; the joints. A woman's:
     narrower shoulders and waist, wider hips, a bust; slimmer limbs. */
  const FIG={
    m:{torso:[[.775,0,0,-.005],[.79,.045,.06,-.005],[.82,.085,.135,-.01],[.86,.105,.165,-.015],[.90,.115,.175,-.02],[.95,.11,.17,-.015],[.99,.102,.158,-.005],
        [1.05,.098,.148,0],[1.11,.102,.152,.005],[1.17,.11,.16,.01],[1.23,.118,.168,.015],[1.29,.118,.172,.012],[1.34,.112,.18,.005],[1.38,.104,.19,0],
        [1.405,.095,.188,-.004],[1.43,.085,.165,-.008],[1.455,.072,.13,-.01],[1.48,.062,.095,-.01],[1.50,.052,.065,-.008],[1.51,0,0,-.008]],
       band:[1.165,1.30], hipZ:.09, sh:[-.005,1.39,.185], el:[-.025,1.11,.212], wr:[.015,.855,.222], tip:[.035,.67,.222], limb:1, neck:.058, head:1},
    f:{torso:[[.775,0,0,-.005],[.79,.045,.06,-.005],[.82,.088,.135,-.01],[.86,.106,.165,-.016],[.90,.114,.174,-.02],[.95,.108,.166,-.016],[.99,.098,.148,-.006],
        [1.05,.09,.128,0],[1.11,.093,.134,.004],[1.16,.104,.145,.01],[1.22,.126,.154,.028],[1.27,.118,.156,.019],[1.31,.105,.162,.005],[1.36,.095,.172,0],
        [1.395,.087,.172,-.004],[1.42,.078,.15,-.007],[1.445,.066,.118,-.009],[1.47,.056,.085,-.009],[1.49,.047,.058,-.008],[1.50,0,0,-.008]],
       band:[1.15,1.29], hipZ:.095, sh:[-.005,1.38,.17], el:[-.025,1.10,.195], wr:[.012,.85,.205], tip:[.03,.67,.205], limb:.9, neck:.05, head:.95}};
  const HEAD=[[1.485,0,0,.045],[1.495,.03,.03,.05],[1.515,.06,.052,.03],[1.545,.085,.066,.015],[1.585,.098,.074,.01],[1.625,.102,.078,0],
    [1.665,.098,.076,-.005],[1.695,.085,.068,-.008],[1.715,.06,.05,-.01],[1.728,0,0,-.01]];
  const headAt=y=>{ for(let i=1;i<HEAD.length;i++) if(y<=HEAD[i][0]||i===HEAD.length-1){ const p=HEAD[i-1],q=HEAD[i],t=Math.min(Math.max((y-p[0])/(q[0]-p[0]),0),1); return [p[1]+(q[1]-p[1])*t,p[2]+(q[2]-p[2])*t,p[3]+(q[3]-p[3])*t]; } };
  const THIGH=[[-.17,.088,.09,-.005],[0,.088,.09,0],[.25,.08,.082,.004],[.5,.07,.072,.006],[.75,.06,.06,.004],[.92,.052,.052,0],[1,.05,.049,0]];
  const SHIN=[[0,.048,.047,0],[.1,.047,.046,-.004],[.28,.058,.052,-.014],[.45,.054,.048,-.01],[.7,.04,.038,-.004],[.9,.031,.031,0],[1,.032,.03,0]];
  const FOOT=[[0,.035,.035,0],[.2,.042,.042,.005],[.45,.032,.048,-.004],[.75,.022,.05,-.01],[1,.014,.042,-.012]];
  const UARM=[[-.12,.05,.052,0],[0,.05,.052,0],[.3,.047,.044,.004],[.65,.04,.038,0],[1,.034,.033,0]];
  const FARM=[[0,.035,.034,0],[.22,.039,.037,0],[.6,.031,.03,0],[1,.028,.019,0]];
  const HAND=[[0,.028,.017,0],[.3,.045,.016,0],[.62,.042,.013,0],[.85,.03,.01,0],[1,.012,.007,0]];
  const scaleP=(P,k)=>P.map(([t,a,b,o])=>[t,a*k,b*k,o*k]);
  /* One figure. sex 'm' or 'f'. pose: th (radians, about z) and tgt turn and move the standing torso,
     neck and head (pivoting at the hips, 0.88 m up); knee, ankle, el, wr, tip: the limb joints for side s
     (functions of s), or null to carry the standing ones along with the torso; foot: [forward, top] for the
     feet; hints for the limbs' fronts. suit: one material for the torso and limbs (a wetsuit). ids: the
     walker's joint numbers, for the vertex shader's swing. */
  const figure=(v,sex,pose)=>{
    const F=FIG[sex], th=pose.th||0, ct=Math.cos(th), st=Math.sin(th), tg=pose.tgt||[0,.88,0];
    const xf=p=>{ const x=p[0], y=p[1]-.88; return [x*ct-y*st+tg[0],x*st+y*ct+tg[1],p[2]+(tg[2]||0)]; };
    const xd=d=>[d[0]*ct-d[1]*st,d[0]*st+d[1]*ct,d[2]];
    const U=xd([1,0,0]), Wz=[0,0,1], suit=pose.suit, id=(k,s)=>pose.ids||(pose.armIds&&k===5)?16*(k+(s<0?0:1)):0;
    const zone=y=>suit!=null?suit:y<.965?1:y>=F.band[0]&&y<F.band[1]?8:11;
    loft(v,F.torso.map(([y,a,b,o])=>({c:xf([o,y,0]),u:U,w:Wz,a,b,m:zone(y)})),16);
    /* Neck, head, hair, a hat (shown only for some, js/shaders/people.js), long hair (likewise). */
    const hk=F.head, hc=[.01,1.6], hp=p=>xf([hc[0]+(p[0]-hc[0])*hk,hc[1]+(p[1]-hc[1])*hk,p[2]*hk]);
    limbL(v,xf([-.014,1.45,0]),xf([-.002,1.56,0]),U,[[0,F.neck,F.neck,0],[1,F.neck*.88,F.neck*.9,0]],()=>suit!=null&&pose.suitNeck?suit:0,10,[.015,.015]);
    loft(v,HEAD.map(([y,a,b,o])=>({c:hp([hc[0]+o,y,0]),u:U,w:Wz,a:a*hk,b:b*hk,m:0})),14);
    const hairR=(y0,y1,n,dd,m,t0,t1,extra)=>{ const R=[]; for(let i=0;i<=n;i++){ const y=y0+(y1-y0)*i/n, [a,b,o]=headAt(y), e=extra?extra(y):[0,0,0];
      R.push({c:hp([hc[0]+o+e[0],y,0]),u:U,w:Wz,a:(a+dd+e[1])*hk,b:(b+dd+e[2])*hk,m}); } return R; };
    const cap=hairR(1.655,1.715,4,.015,2); cap.push({c:hp([hc[0]-.01,1.744,0]),u:U,w:Wz,a:0,b:0,m:2});
    loft(v,cap,14);
    loft(v,hairR(1.545,1.665,4,.013,2),10,Math.PI*.5,Math.PI*1.5);
    /* Long hair: falls from the crown behind the neck to the shoulders. */
    const longR=[]; for(let i=0;i<=6;i++){ const y=1.665-(1.665-1.40)*i/6;
      if(y>1.52){ const [a,b,o]=headAt(y); longR.push({c:hp([hc[0]+o-.005,y,0]),u:U,w:Wz,a:(a+.02)*hk,b:(b+.022)*hk,m:15}); }
      else { const k=(1.52-y)/.12; longR.push({c:hp([-.05-.045*k,y,0]),u:U,w:Wz,a:(.07+.02*k)*hk,b:(.088+.03*k)*hk,m:15}); } }
    loft(v,longR,10,Math.PI*.58,Math.PI*1.42);
    /* A sun hat: a drooping brim and a crown. */
    const hatR=[[1.705,.088],[1.688,.19]].map(([y,r])=>({c:hp([-.005,y,0]),u:U,w:Wz,a:r*hk,b:r*hk,m:14}));
    loft(v,hatR,16);
    loft(v,[[1.70,.09],[1.765,.082],[1.79,.062],[1.797,0]].map(([y,r])=>({c:hp([-.005,y,0]),u:U,w:Wz,a:r*hk,b:r*hk,m:14})),14);
    /* Limbs: the joints, standing ones carried with the torso unless the pose gives its own. */
    const lk=F.limb, J=pose.joints||{};
    for(const s of [-1,1]){
      const hip=xf([0,.88,F.hipZ*s]);
      const knee=J.knee?J.knee(s):xf([.01,.47,(F.hipZ-.005)*s]), ankle=J.ankle?J.ankle(s):xf([0,.075,(F.hipZ-.01)*s]);
      const legH=pose.legHint?pose.legHint:U, mt=t=>suit!=null?suit:t<.7?13:0;
      limbL(v,hip,knee,legH,scaleP(THIGH,lk),t=>mt(t)+id(1,s),12,[.03,.045]);
      limbL(v,knee,ankle,pose.shinHint||U,scaleP(SHIN,lk),t=>(suit!=null&&t<.97?suit:0)+id(3,s),12,[.035,.03]);
      const [ff,fu]=pose.foot?pose.foot(s):[U,xd([0,1,0])], fa=V3.add(V3.add(ankle,V3.mul(ff,-.055)),V3.mul(fu,-.035)), fb=V3.add(V3.add(ankle,V3.mul(ff,.185)),V3.mul(fu,-.06));
      limbL(v,fa,fb,fu,scaleP(FOOT,lk),()=>id(3,s),10,[.02,.025]);
      const sh=J.sh?J.sh(s):xf([F.sh[0],F.sh[1],F.sh[2]*s]), el=J.el?J.el(s):xf([F.el[0],F.el[1],F.el[2]*s]), wr=J.wr?J.wr(s):xf([F.wr[0],F.wr[1],F.wr[2]*s]), tip=J.tip?J.tip(s):xf([F.tip[0],F.tip[1],F.tip[2]*s]);
      const aH=pose.armHint||U;
      limbL(v,sh,el,aH,scaleP(UARM,lk),t=>(suit!=null?suit:t<.55?12:0)+id(5,s),10,[.03,.03]);
      limbL(v,el,wr,aH,scaleP(FARM,lk),t=>(suit!=null&&t<.95?suit:0)+id(5,s),10,[.025,.02]);
      limbL(v,wr,tip,aH,scaleP(HAND,lk),()=>id(5,s),8,[.015,.008]);
    }
  };
  /* The poses. Lying on the back along +x, feet toward the sea, arms resting on the sand; sitting with
     knees up, facing the sea, forearms on the knees. */
  const LIE={th:Math.PI/2,tgt:[.02,.135,0],joints:{
    knee:s=>[.43,.11,.085*s],ankle:s=>[.825,.09,.08*s],el:s=>[-.21,.075,.215*s],wr:s=>[.045,.065,.225*s],tip:s=>[.23,.055,.225*s]},
    legHint:[0,1,0],shinHint:[0,1,0],armHint:[0,1,0],foot:()=>[[0,1,0],[-1,0,0]]};
  const SIT={th:.25,tgt:[0,.12,0],joints:{knee:s=>[.34,.35,.10*s],ankle:s=>[.62,.075,.095*s],
    el:s=>[.10,.44,.23*s],wr:s=>[.34,.46,.15*s],tip:s=>[.50,.45,.13*s]},
    legHint:[-.5,.85,0],shinHint:[.7,.7,0],armHint:[0,1,0],foot:()=>[[1,0,0],[0,1,0]]};
  /* Surfers in wetsuits (10): sitting astride the board, legs hanging in the water, hands on the thighs;
     lying on it and paddling, the arms (joints 5 and 6) hanging straight down from the shoulders at
     (0.42, 0.24), where the vertex shader wheels them round. */
  const SURF_SIT={th:-.06,tgt:[0,.09,0],suit:10,suitNeck:true,joints:{knee:s=>[.30,-.06,.25*s],ankle:s=>[.30,-.46,.24*s],
    el:s=>[.10,.37,.24*s],wr:s=>[.26,.18,.2*s],tip:s=>[.36,.12,.18*s]},legHint:[0,1,0],shinHint:[1,0,0],armHint:[1,0,0],foot:()=>[[.35,-.94,0],[.94,.35,0]]};
  const SURF_PRONE={th:-Math.PI/2+.18,tgt:[-.1,.165,0],suit:10,suitNeck:true,armIds:true,joints:{knee:s=>[-.5,.135,.1*s],ankle:s=>[-.885,.13,.1*s],
    sh:s=>[.42,.24,.2*s],el:s=>[.42,-.04,.22*s],wr:s=>[.44,-.30,.22*s],tip:s=>[.45,-.46,.22*s]},legHint:[0,-1,0],shinHint:[0,-1,0],armHint:[1,0,0],foot:()=>[[-1,0,0],[0,-1,0]]};
  const umbrella=v=>{
    limb(v,[0,0,0],[0,2.08,0],.018,.016,5,5);
    const N=8, rim=1.0, yR=1.8, yA=2.12, rm=.55, yM=2.04;
    for(let i=0;i<N;i++){
      const m=i%2?4:3, t0=i/N*Math.PI*2, t1=(i+1)/N*Math.PI*2;
      const A=[0,yA,0], M0=[Math.cos(t0)*rm,yM,Math.sin(t0)*rm], M1=[Math.cos(t1)*rm,yM,Math.sin(t1)*rm], R0=[Math.cos(t0)*rim,yR,Math.sin(t0)*rim], R1=[Math.cos(t1)*rim,yR,Math.sin(t1)*rim];
      const nrm=(a,b,c)=>{ const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[c[0]-a[0],c[1]-a[1],c[2]-a[2]]; let n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]]; if(n[1]<0) n=n.map(x=>-x); const l=Math.hypot(...n); return n.map(x=>x/l); };
      const tri=(a,b,c)=>{ const n=nrm(a,b,c); v.push(...a,...n,m,...b,...n,m,...c,...n,m); };
      tri(A,M0,M1); tri(M0,R0,R1); tri(M0,R1,M1);
    }
  };
  const cooler=v=>{
    /* A box: each face is two triangles, from its normal n and the two other axes. */
    const box=(c,s,m)=>{
      for(let ax=0;ax<3;ax++)for(const sg of [-1,1]){
        const n=[0,0,0]; n[ax]=sg; const a=(ax+1)%3, b=(ax+2)%3;
        const P=(i,j)=>{ const p=c.slice(); p[ax]+=sg*s[ax]; p[a]+=i*s[a]; p[b]+=j*s[b]; return p; };
        const q=[P(-1,-1),P(1,-1),P(1,1),P(-1,1)];
        for(const k of [0,1,2,0,2,3]) v.push(...q[k],...n,m);
      }
    };
    box([0,.16,0],[.25,.16,.16],6); box([0,.34,0],[.26,.025,.17],7);
  };
  /* Moving parts carry a joint number (16 per step added to the material): 1 and 2 the left and right
     thighs, 3 and 4 the shins with the feet, 5 and 6 the arms. The vertex shader swings them. */
  const J=(m,id)=>m+16*id;
  /* Walking, along +x, feet on the ground; joints at the hips (0.88 m), knees (0.47) and shoulders (about
     1.4), where the vertex shader swings them. */
  const walker=sex=>v=>figure(v,sex,{ids:true});
  /* A surfboard (material 9): a thin rounded slab 2 m long and half a metre wide along x, centred at
     (cx, cy), the nose (+x) pointed and lifted a little, the tail fuller; tipped by pitch about z. */
  const board=(v,cx,cy,pitch)=>{
    const W=.25,T=.036,cp=Math.cos(pitch),sp=Math.sin(pitch);
    const half=u=>u>0?W*Math.pow(Math.max(1-Math.pow(u,2.2),0),.6):W*Math.pow(Math.max(1-Math.pow(-u,3.5),0),.45);
    const at=(u,s,top)=>{ const w=half(u), th=T*Math.sqrt(Math.max(1-s*s,0))*Math.pow(Math.max(1-u*u,0),.25)+.003;
      return [u,(top?th:-.7*th)+.07*Math.pow(Math.max(u,0),2.5),s*w]; };
    const pt=(u,s,top)=>{ const e=.01,p=at(u,s,top),a=at(Math.min(u+e,1),s,top),b=at(Math.max(u-e,-1),s,top),c=at(u,Math.min(s+e,1),top),d=at(u,Math.max(s-e,-1),top);
      const du=[a[0]-b[0],a[1]-b[1],a[2]-b[2]],ds=[c[0]-d[0],c[1]-d[1],c[2]-d[2]];
      let n=[ds[1]*du[2]-ds[2]*du[1],ds[2]*du[0]-ds[0]*du[2],ds[0]*du[1]-ds[1]*du[0]]; if((n[1]<0)===top) n=n.map(x=>-x);
      const l=Math.hypot(...n)||1; n=n.map(x=>x/l);
      return [cx+p[0]*cp-p[1]*sp,cy+p[0]*sp+p[1]*cp,p[2],n[0]*cp-n[1]*sp,n[0]*sp+n[1]*cp,n[2]]; };
    const NU=18,NS=8;
    for(const top of [true,false]) for(let i=0;i<NU;i++) for(let j=0;j<NS;j++){
      const u0=-1+2*i/NU,u1=-1+2*(i+1)/NU,s0=-1+2*j/NS,s1=-1+2*(j+1)/NS;
      const A=pt(u0,s0,top),B=pt(u1,s0,top),C=pt(u1,s1,top),D=pt(u0,s1,top);
      v.push(...A,9,...B,9,...C,9,...A,9,...C,9,...D,9);
    }
  };
  /* Surfers, in wetsuits (10) on boards (9), facing +x with the water level at y = 0. Sitting astride:
     the board's nose rides up and its tail sinks under them; legs hang in the water. */
  const sitSurfer=v=>{ board(v,.35,.01,.13); figure(v,'m',SURF_SIT); };
  /* Lying on the board and paddling: the arms (joints 5 and 6, at the shoulders) wheel round. */
  const proneSurfer=v=>{ board(v,0,.035,.02); figure(v,'m',SURF_PRONE); };
  /* 0 lying, 1 sitting, 2 umbrella, 3 cool box, 4 walking, 5 surfer sitting, 6 surfer paddling (men's
     shapes), then the women's: 7 lying, 8 sitting, 9 walking. */
  peopleModels=[mk(v=>figure(v,'m',LIE)),mk(v=>figure(v,'m',SIT)),mk(umbrella),mk(cooler),mk(walker('m')),mk(sitSurfer),mk(proneSurfer),
    mk(v=>figure(v,'f',LIE)),mk(v=>figure(v,'f',SIT)),mk(walker('f'))];
  peopleTris=peopleModels.map(M=>M.nV/3);
}
let peopleTris=null;
function drawPeople(S,cam,asp,Li,dA,dB){
  const P=peopleFor(S); if(!P) return;
  if(!peopleModels) buildPeopleModels();
  const L=S.L, U=[];
  if(P.umb) for(const g of P.groups) if(g.umb&&U.length<64) U.push(g.umb.x,g.umb.z,g.umb.h-.1,g.umb.rad);
  /* Walkers and surfers move: their copies are made each frame. iC: phase of the stride or stroke (in
     cycles), the stride's half-angle (its sine), the board's length, and the kind (1 walker, 2 sitting
     surfer, 3 paddling). Indexed by model, as P.inst. */
  const dyn=Array.from({length:10},()=>[]), T=moversT(S), skip=moversSkip(S,P);
  for(const w of walkersNow(S,P)) dyn[w.p.top?9:4].push(w.x,groundAt(L,w.x,w.z),w.z,w.yaw,w.p.skin+.2,w.p.swim,w.p.extra+8*personLook(w.p,w.p.ph*97.1,w.p.sc*31.7),w.p.sc+(w.p.top?10:0),w.phase,w.p.sA,0,1);
  for(const s of P.surfers){
    if(skip.has(s)) continue;
    const q=surfAt(s,T); dyn[s.prone?6:5].push(q.x,0,q.z,q.yaw,s.skin+.2,s.suit,s.board,s.sc,T/s.pc+s.ph,0,s.len,s.prone?3:2);
  }
  use(PR.people,{uJit:renderJit,uRo:cam.ro,uR:cam.R,uU:cam.Up,uF:cam.F,uTan:cam.tan,uAspect:asp,uDA:dA,uDB:dB,uSun:Li.sun,uSunE:Li.sunE,uFogB:Li.fog,
    uCloudShade:Li.cloudShade,uCloudT:L.t,uDomMin:L.domMin,uDomSize:L.domSize,tEnv:Li.env,tNoise:noiseTex,tLit:L.lit,tTerr:L.terr,tRM0:L.rm0,uPU:U.length?new Float32Array(U.concat(new Array(64-U.length).fill(0))):new Float32Array(64),uPUN:U.length/4});
  for(let m=0;m<peopleModels.length;m++){
    const A=dyn[m].length?new Float32Array(dyn[m]):P.inst[m]; if(!A||!A.length) continue; const M=peopleModels[m];
    gl.bindVertexArray(M.vao); gl.bindBuffer(gl.ARRAY_BUFFER,M.ib); gl.bufferData(gl.ARRAY_BUFFER,A,gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES,0,M.nV,A.length/12);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,null); gl.bindVertexArray(emptyVAO);
}

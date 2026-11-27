'use strict';
/* ---------------------------------------------------------------- Plant models -------
   Real 3D plants, generated at load: trunks, branches and thousands of individual leaves.
   How much light reaches each leaf from five directions is worked out through a grid of foliage
   density, so crowns have dark interiors and bright outer leaves. Each model is then rendered
   from 60 viewpoints into a texture, and the scene draws one camera-facing card per plant that
   shows the matching view. */
const PLANT={FRAME:200,AZ:12,ROWS:5,COUNT:11};
let plantA=null,plantL=null,plantInfo=null;
const plantMesh=[];

/* Everything that makes a model, from here to the end of plantLib, is plain arithmetic with nothing from
   outside: it is kept inside one function so that a worker can run the same code (plantWorkerStart, below).
   It isn't indented, to keep the history of these lines readable. */
function plantLib(){
const PLANT_DIRS=[[.72,.69,0],[-.72,.69,0],[0,.69,.72],[0,.69,-.72],[0,1,0]];

function prng(a){ return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const v3={
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  mul:(a,k)=>[a[0]*k,a[1]*k,a[2]*k], dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  norm:a=>{ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; },
};
/* A number from 0 to 1 fixed to a point, for choices that mustn't use up the random sequence. */
function leafHash(p){ const s=Math.sin(p[0]*127.1+p[1]*311.7+p[2]*74.7)*43758.5453; return s-Math.floor(s); }
function randDir(r){ const y=r()*2-1,t=r()*6.28318,s=Math.sqrt(1-y*y); return [s*Math.cos(t),y,s*Math.sin(t)]; }
function basisOf(n){ const u=v3.norm(v3.cross(Math.abs(n[1])>.9?[1,0,0]:[0,1,0],n)); return [u,v3.cross(n,u)]; }

class PlantBuilder{
  constructor(){ this.pos=[]; this.rec=[]; }
  /* Each record is one leaf or bark facet: its triangles, and what its shading needs. */
  /* uv: where each vertex is on its leaf (leaf and blade, below), for the leaf's own detail close up
     (FS_MESH in js/shaders/trees.js); none for bark. */
  add(tris,n,area,bright,hue,woody,vn=null,uv=null){ this.rec.push({start:this.pos.length/3,count:tris.length/3,n,area,bright,hue,woody,c:null,vn,uv}); for(const v of tris) this.pos.push(v); }
  /* A pointed oval leaf, folded a little along its midrib: each half is its own shading record. */
  leaf(p,n,size,aspect,bright,hue,r){
    const [a,b]=basisOf(n); const t=r()*6.28318,c=Math.cos(t),s=Math.sin(t);
    const u=v3.add(v3.mul(a,c*size),v3.mul(b,s*size)), w=v3.add(v3.mul(a,-s*size*aspect),v3.mul(b,c*size*aspect));
    const at=(k,m)=>v3.add(p,v3.add(v3.mul(u,k),v3.mul(w,m)));
    const fold=v3.mul(n,size*.09);
    const tip=at(1,0),base=at(-1,0);
    for(const sg of [-1,1]){
      const L1=v3.add(at(-.42,sg*.98),fold),L2=v3.add(at(.34,sg*.74),fold);
      const nh=v3.norm(v3.add(n,v3.mul(v3.norm(w),sg*.34)));
      /* Along the leaf from base (-1) to tip (1); across from the midrib (0) to the edge (1, signed). */
      this.add([...base,...L1,...L2,...base,...L2,...tip],nh,size*size*aspect*1.1,bright+sg*.035,hue,false,null,[-1,0,-.42,sg*.98,.34,sg*.74,-1,0,.34,sg*.74,1,0]);
    }
  }
  /* Long thin leaf between two points, for palm leaflets and grass */
  blade(p0,p1,width,n,bright,hue){
    const d=v3.norm(v3.sub(p1,p0)),s=v3.mul(v3.norm(v3.cross(d,n)),width*.5);
    const m=v3.mul(v3.add(p0,p1),.5);
    const a=v3.add(m,s),b=v3.sub(m,s);
    /* A blade's place along it is kept 3 higher (2 to 4), which tells its parallel veins from a leaf's. */
    this.add([...p0,...a,...p1,...p0,...p1,...b],n,Math.hypot(p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2])*width*.5,bright,hue,false,null,[2,0,3,1,4,0,2,0,4,0,3,-1]);
  }
  /* A round stem through a list of points. The ring frame is carried along the path, so it never
     twists, and normals are per vertex, so the surface shades smoothly. */
  stem(pts,rad,bright,hue=0){
    const N=rad[0]>.09?9:rad[0]>.03?6:4;
    let d0=v3.norm(v3.sub(pts[1],pts[0])),[a,b]=basisOf(d0);
    const ringAt=(i)=>{
      const out=[];
      for(let k=0;k<=N;k++){ const t=k/N*6.28318,e=v3.add(v3.mul(a,Math.cos(t)),v3.mul(b,Math.sin(t))); out.push({e,p:v3.add(pts[i],v3.mul(e,rad[i]))}); }
      return out;
    };
    let prev=ringAt(0);
    for(let i=1;i<pts.length;i++){
      const d=v3.norm(v3.sub(pts[i],pts[i-1]));
      a=v3.norm(v3.sub(a,v3.mul(d,v3.dot(a,d)))); b=v3.cross(d,a);
      const cur=ringAt(i);
      for(let k=0;k<N;k++){
        const A=prev[k],B=prev[k+1],C=cur[k+1],D=cur[k];
        const n=v3.norm(v3.add(v3.add(A.e,B.e),v3.add(C.e,D.e)));
        this.add([...A.p,...B.p,...C.p,...A.p,...C.p,...D.p],n,0,bright,hue,true,[A.e,B.e,C.e,A.e,C.e,D.e]);
      }
      prev=cur;
    }
  }
  /* A curved limb from p along d. Returns where it ends and the way it's heading. */
  limb(p,d,len,r0,r1,bright,r,wander=.2,segs=4,hue=0){
    const pts=[p],rad=[r0]; let q=p,dir=d;
    const bend=[(r()-.5)*wander*2,(r()-.35)*wander,(r()-.5)*wander*2];
    for(let i=1;i<=segs;i++){
      dir=v3.norm(v3.add(dir,v3.add(bend,[(r()-.5)*wander,(r()-.5)*wander*.5,(r()-.5)*wander])));
      q=v3.add(q,v3.mul(dir,len/segs));
      pts.push(q); rad.push(r0+(r1-r0)*i/segs);
    }
    this.stem(pts,rad,bright,hue);
    return {q,dir};
  }
  tube(p0,p1,r0,r1,bright,r,hue=0){ this.stem([p0,v3.mul(v3.add(p0,p1),.5),p1],[r0,(r0+r1)*.5,r1],bright,hue); }
  /* A mass of leaves on the shell of an ellipsoid, thinning toward the centre */
  clump(c,rx,ry,count,leafSize,aspect,bright,hue,r){
    /* Each cluster of leaves has its own shade of green, and a few leaves in it have turned: some
       yellowing, some dry and brown (hue .925, which plantShade turns brown). Which ones is decided by a
       hash of the leaf's place rather than the random sequence, so every model keeps its shape. */
    const rB=r()*.34-.17,rH=hue+(r()-.5)*.24;
    for(let i=0;i<count;i++){
      const d=randDir(r),k=Math.pow(r(),.42);
      const p=[c[0]+d[0]*rx*k,c[1]+d[1]*ry*k,c[2]+d[2]*rx*k];
      const n=v3.norm(v3.add(v3.add(v3.mul(d,.85),v3.mul(randDir(r),.75)),[0,.45,0]));
      let b=bright+rB+.28*d[1]*k+.24*(r()-.5), h=Math.max(.1,rH+.14*(r()-.5));
      const hs=leafHash(p);
      if(hs<.045) h=Math.min(.86,h+.38+2.5*hs);
      else if(hs<.07){ h=.925; b*=.85; }
      this.leaf(p,n,leafSize*(.7+.6*r()),aspect,b,h,r);
    }
  }
  /* Light reaching each leaf, marched through a grid of leaf area */
  finish(){
    const P=this.pos,G=44;
    let lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];
    for(let i=0;i<P.length;i+=3) for(let k=0;k<3;k++){ lo[k]=Math.min(lo[k],P[i+k]); hi[k]=Math.max(hi[k],P[i+k]); }
    const dx=Math.max(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2])/G+1e-4;
    const grid=new Float32Array(G*G*G);
    const cell=(x,y,z)=>{ const i=Math.floor((x-lo[0])/dx),j=Math.floor((y-lo[1])/dx),k=Math.floor((z-lo[2])/dx); return (i<0||j<0||k<0||i>=G||j>=G||k>=G)?-1:i+G*(j+G*k); };
    const centres=[];
    for(const R of this.rec){
      let x=0,y=0,z=0; for(let i=0;i<R.count;i++){ const q=(R.start+i)*3; x+=P[q];y+=P[q+1];z+=P[q+2]; }
      R.c=[x/R.count,y/R.count,z/R.count]; centres.push(R.c);
      const q=cell(R.c[0],R.c[1],R.c[2]); if(q>=0) grid[q]+=R.area;
    }
    const k=.62/(dx*dx);
    const vis=(c,d)=>{ let tau=0,x=c[0]+d[0]*dx*1.2,y=c[1]+d[1]*dx*1.2,z=c[2]+d[2]*dx*1.2;
      for(let s=0;s<G;s++){ const q=cell(x,y,z); if(q<0) break; tau+=grid[q]; if(tau*k>5) break; x+=d[0]*dx;y+=d[1]*dx;z+=d[2]*dx; }
      return Math.exp(-tau*k); };
    /* Twelve floats a vertex: position, then brightness, hue, ambient, then four directional light values,
       then the place on the leaf (2 across for bark: none). */
    const nV=P.length/3,out=new Float32Array(nV*12);
    for(const R of this.rec){
      const v=PLANT_DIRS.map(d=>vis(R.c,d));
      const amb=(v[0]+v[1]+v[2]+v[3]+v[4]*2)/6;
      const bright=Math.min(Math.max(R.bright,.02),1);
      const shade=(nn)=>[0,1,2,3].map(i=>(R.woody?(.25+.75*v[i])*Math.max(v3.dot(nn,PLANT_DIRS[i]),.1):v[i]*(.32+.68*Math.max(v3.dot(nn,PLANT_DIRS[i]),0))));
      const flat=R.vn?null:shade(R.n);
      for(let i=0;i<R.count;i++){
        const a=(R.start+i)*3,o=(R.start+i)*12,l=flat||shade(R.vn[i]);
        out[o]=P[a];out[o+1]=P[a+1];out[o+2]=P[a+2];
        out[o+3]=bright;out[o+4]=R.hue;out[o+5]=amb;
        out[o+6]=l[0];out[o+7]=l[1];out[o+8]=l[2];out[o+9]=l[3];
        out[o+10]=R.uv?R.uv[i*2]:0;out[o+11]=R.uv?R.uv[i*2+1]:2;
      }
    }
    /* Card radius and crown height for the shader */
    const cy=(lo[1]+hi[1])*.5; let rad=0;
    for(let i=0;i<P.length;i+=3) rad=Math.max(rad,Math.hypot(P[i],P[i+1]-cy,P[i+2]));
    return {verts:out,nV,cy,rad:rad*1.03};
  }
}

/* ---- Species ---- */
/* Leaf shape for the trees and shrubs that take one (lf): size (half a leaf's length), aspect (width over
   length) and a factor on the number of leaves. Without it, the leaves are as they always were. */
const LEAF0={size:.165,aspect:.46,n:1};
function makeBroadleaf(seed,H,spread,flat,bright,hue,lf=LEAF0){
  const r=prng(seed),B=new PlantBuilder();
  const trunkH=H*.3,R0=H*.032;
  const branch=(p,d,len,rad,depth)=>{
    const end=rad*.66;
    const L=B.limb(p,d,len,rad,end,.34,r,depth>=3?.1:.2,depth>=3?4:3);
    if(depth===0){
      /* Each branch ends in leaf masses of quite different sizes. */
      const big=r()<.34;
      const s=(big?1.45+.8*r():.7+.7*r())*spread;
      B.clump(L.q,s,s*(.7+.32*r()),Math.round(((big?300:130)+110*r())*1.2*lf.n),lf.size,lf.aspect,bright+(r()-.5)*.14,hue,r);
      return;
    }
    const n=depth>=3?3+Math.floor(r()*2.4):2+Math.floor(r()*1.9);
    for(let i=0;i<n;i++){
      const a=r()*6.28318,tilt=(depth>=3?.7:.42)+r()*.72;
      const side=[Math.cos(a)*Math.sin(tilt),Math.cos(tilt)*(1-.42*flat),Math.sin(a)*Math.sin(tilt)];
      const nd=v3.norm(v3.add(v3.mul(L.dir,depth>=3?.28:.55),side));
      /* The strongest fork keeps most of the thickness; the others are thinner. */
      branch(L.q,nd,len*(.48+.5*r()),end*(i===0?.92:.68+.14*r()),depth-1);
    }
  };
  const lean=[(r()-.5)*.12,1,(r()-.5)*.12];
  const pts=[[0,-.4,0]],rad=[R0*1.75];
  for(let i=1;i<=6;i++){ const t=i/6; pts.push([lean[0]*trunkH*.5*t,trunkH*.5*t,lean[2]*trunkH*.5*t]); rad.push(R0*(1+.75*Math.pow(1-t,3))); }
  B.stem(pts,rad,.32);
  branch(pts[6],v3.norm(lean),trunkH*.82,R0,4);
  return B.finish();
}
/* A broadleaf tree with a deep, oval crown that starts low: a leader runs most of the way up, and
   limbs leave it at many heights, longest a little below the middle. The first two broadleaf models
   both carry their crown on top of a bare trunk, which repeated as rows of umbrellas. */
function makeOvalTree(seed,H,R,bright,hue,lf=LEAF0){
  const r=prng(seed),B=new PlantBuilder();
  const R0=H*.021,top=H*.8;
  const lean=[(r()-.5)*.12,1,(r()-.5)*.12];
  const at=t=>[lean[0]*top*t+.25*Math.sin(t*4.1+seed),top*t-.4*(1-t),lean[2]*top*t+.25*Math.cos(t*3.3+seed)];
  { const pts=[],rad=[]; for(let i=0;i<=9;i++){ const t=i/9; pts.push(at(t)); rad.push(R0*(1.55*(1-t)+.22)*(1+.6*Math.pow(1-t,5))); } B.stem(pts,rad,.32); }
  const nL=10+Math.floor(r()*4);
  for(let i=0;i<nL;i++){
    const f=Math.min(.96,.24+.72*i/(nL-1)+(r()-.5)*.05),p=at(f),a=i*2.39996+(r()-.5)*.9;
    const reach=R*Math.max(.25,1-1.3*Math.pow((f-.52)/.6,2))*(.6+.5*r());
    const dir=v3.norm([Math.cos(a),.2+.95*f+.2*(r()-.5),Math.sin(a)]);
    const L=B.limb(p,dir,reach,R0*(1.05-.75*f),R0*.22,.33,r,.24,3);
    const nc=2+Math.floor(r()*2.6);
    for(let k=0;k<nc;k++){
      const t=nc>1?.45+.55*k/(nc-1):1,c=v3.add(p,v3.mul(v3.sub(L.q,p),t));
      const s=(1.05+.9*r())*R/5.2;
      B.clump(v3.add(c,[(r()-.5)*1.3,(r()-.15)*.9,(r()-.5)*1.3]),s,s*(.68+.3*r()),Math.round((150+110*r())*s*s*lf.n),lf.size,lf.aspect,bright+(r()-.5)*.13,hue,r);
    }
  }
  B.clump(v3.add(at(1),[0,.5,0]),R*.4,R*.32,Math.round(60*R*R*.16*lf.n),lf.size,lf.aspect,bright+.05,hue,r);
  return B.finish();
}
/* A low tree of several stems leaning out from one base, with a broad, ragged crown, like the
   wind-pruned trees that grow just behind a beach. */
function makeMultiStem(seed,H,R,bright,hue,lf={size:.16,aspect:.46,n:1}){
  const r=prng(seed),B=new PlantBuilder();
  const n=3+Math.floor(r()*2),R0=H*.022;
  for(let s=0;s<n;s++){
    const a=s/n*6.28318+(r()-.5)*.9,tilt=.18+.26*r();
    const base=[Math.cos(a)*.25,-.4,Math.sin(a)*.25];
    const dir=[Math.cos(a)*Math.sin(tilt),Math.cos(tilt),Math.sin(a)*Math.sin(tilt)];
    const len=H*(.6+.25*r());
    const L=B.limb(base,dir,len,R0*(1.1+.3*r()),R0*.3,.32,r,.16,5);
    /* Side limbs along the upper part of each stem, each ending in a leaf mass */
    const m=4+Math.floor(r()*3);
    for(let k=0;k<m;k++){
      const t=.4+.6*k/(m-1),c=v3.add(base,v3.mul(v3.sub(L.q,base),t));
      const b=a+(r()-.5)*2.6,sd=v3.norm([Math.cos(b),.5+.6*r(),Math.sin(b)]);
      const q=B.limb(c,sd,R*(.25+.3*r()),R0*.45,R0*.15,.32,r,.25,3).q;
      const sz=(1.+.8*r())*R/5;
      B.clump(q,sz,sz*(.62+.25*r()),Math.round((170+110*r())*sz*sz*lf.n),lf.size,lf.aspect,bright+(r()-.5)*.14,hue,r);
    }
    const sz=(1.3+.6*r())*R/5;
    B.clump(L.q,sz,sz*.72,Math.round(220*sz*sz*lf.n),lf.size,lf.aspect,bright+.03,hue,r);
  }
  return B.finish();
}
function makeConifer(seed,H,R0,bright,hue){
  const r=prng(seed),B=new PlantBuilder();
  const lean=[(r()-.5)*.05,1,(r()-.5)*.05];
  const top=v3.mul(lean,H);
  { const pts=[],rad=[]; for(let i=0;i<=8;i++){ const t=i/8; pts.push(v3.add(v3.mul(lean,t*H),[0,-.4*(1-t),0])); rad.push(H*(.002+.015*(1-t))*(1+.5*Math.pow(1-t,5))); } B.stem(pts,rad,.32); }
  const whorls=Math.round(H*1.9);
  for(let w=0;w<whorls;w++){
    const f=w/(whorls-1),y=H*(.2+.8*f);
    const len=R0*Math.pow(1-f,.82)*(.8+.45*r())+.25;
    const n=4+Math.floor(r()*2);
    for(let i=0;i<n;i++){
      const a=r()*6.28318;
      const dir=v3.norm([Math.cos(a),-.14-.34*(1-f)+.22*f,Math.sin(a)]);
      const p0=v3.add(v3.mul(lean,y),[0,0,0]);
      const p1=v3.add(p0,v3.mul(dir,len));
      B.stem([p0,v3.mul(v3.add(p0,p1),.5),p1],[.05*(1-f)+.02,.03*(1-f)+.015,.012],.3);
      const m=Math.max(2,Math.round(len*1.5));
      for(let k=1;k<=m;k++){ const t=k/m,c=v3.add(p0,v3.mul(dir,len*t)); const s=(.28+.4*(1-t*.5))*(.65+.7*(1-f));
        B.clump([c[0],c[1]-.1*t,c[2]],s,s*.72,Math.round(22+20*r()),.135,.34,bright,hue,r); }
    }
  }
  return B.finish();
}
/* Wind-shaped pine: bare trunk, a few strong limbs, a flat irregular top. o (vegetation presets) can set
   the trunk's bend, where the limbs start (lo, as a share of the trunk), how flat the top is (flat: the
   clumps' height over width) and the needle tufts' shape. */
function makePine(seed,H,R0,bright,hue,o={}){
  const r=prng(seed),B=new PlantBuilder();
  const bk=o.bend??1, lo=o.lo??.55, fl=o.flat??.66, ns=o.needle??.15, na=o.aspect??.36, up=o.up??1;
  const bend=[(.10+.07*r())*bk,0,.05*(r()-.5)*bk];
  const trunk=t=>[bend[0]*H*t*t,H*.72*t-.4,bend[2]*H*t*t];
  { const pts=[],rad=[]; for(let i=0;i<=10;i++){ const t=i/10; pts.push(trunk(t)); rad.push(H*.022*(1-t*.66)*(1+.6*Math.pow(1-t,5))); } B.stem(pts,rad,.34); }
  const top=trunk(1);
  const limbs=(9+Math.floor(r()*5))*(o.limbs??1);
  for(let i=0;i<limbs;i++){
    const f=lo+(1-lo)*r(),p=trunk(f),a=r()*6.28318;
    const L=R0*(.45+.7*r());
    const dir=v3.norm([Math.cos(a)+.3*bk,(.28+.45*r())*up,Math.sin(a)]);
    const q=B.limb(p,dir,L,.14,.04,.3,r,.16,4).q;
    const m=3+Math.floor(r()*3);
    for(let k=0;k<m;k++){
      const c=v3.add(q,[(r()-.5)*L*.7,(r()-.3)*.6,(r()-.5)*L*.7]);
      const s=(.8+.9*r());
      B.clump(c,s,s*fl,Math.round(90+70*r()),ns,na,bright,hue,r);
    }
  }
  B.clump(v3.add(top,[0,.3,0]),R0*.42,R0*.26*fl/.66,190,ns,na,bright+.03,hue,r);
  return B.finish();
}
function makePalm(seed,H,bright,hue){
  const r=prng(seed),B=new PlantBuilder();
  const bx=(r()<.5?-1:1)*(.08+.1*r())*H,bz=(r()-.5)*.1*H;
  const trunk=t=>[bx*t*t,H*t-.3,bz*t*t];
  { const pts=[],rad=[]; for(let i=0;i<=14;i++){ const t=i/14; pts.push(trunk(t)); rad.push(.2-.085*t+.14*Math.pow(1-t,6)); } B.stem(pts,rad,.48,.03); }
  const top=trunk(1);
  const N=15+Math.floor(r()*6);
  for(let k=0;k<N;k++){
    const a=k*2.39996+r()*.4,age=k/N;
    const L=(4.6+1.5*r())*(H/14);
    const rise=.95-1.45*age+.4*(r()-.5);
    const hDir=[Math.cos(a),0,Math.sin(a)];
    const dead=age>.9;
    const pts=[];
    const m=11;
    for(let i=0;i<=m;i++){
      const t=i/m,x=L*t*(1-.13*t),y=L*(rise*t-(.72+.3*r()*.1)*t*t);
      pts.push(v3.add(top,[hDir[0]*x,y,hDir[2]*x]));
    }
    B.stem(pts,pts.map((_,i)=>.035*(1-i/m)+.008),dead?.45:.5,dead?.03:.3);
    for(let i=0;i<m;i++){
      const d=v3.norm(v3.sub(pts[i+1],pts[i])),side=v3.norm(v3.cross(d,[0,1,0])),n0=v3.norm(v3.cross(side,d));
      for(let j=0;j<4;j++){
        const t=(i+j/4)/m,p=v3.add(pts[i],v3.mul(v3.sub(pts[i+1],pts[i]),j/4));
        const len=(.24+1.05*Math.sin(Math.min(t*1.12+.06,1)*3.14159))*(H/14)*(.86+.28*r());
        for(const sg of [-1,1]){
          const o=v3.norm(v3.add(v3.add(v3.mul(side,sg),v3.mul(d,.52)),[0,-.42-.5*t+(r()-.5)*.25,0]));
          const q=v3.add(p,v3.mul(o,len));
          const nl=v3.norm(v3.add(n0,v3.mul(side,sg*.42)));
          B.blade(p,q,.085,nl,(dead?.34:bright)+.22*(.5-t)+.16*(r()-.5),dead?.98:Math.max(.1,hue+.25*age+.09*(r()-.5)));
        }
      }
    }
  }
  return B.finish();
}
/* o (vegetation presets): flat (height over width; 1 as it was), leaf (size, aspect), n (factor on the
   leaves), flowers (a share of leaves turned to blossom: very bright and yellow, as gorse flowers). */
function makeShrub(seed,R0,bright,hue,o={}){
  const r=prng(seed),B=new PlantBuilder();
  const fl=o.flat??1, ls=o.leaf?.[0]??.07, la=o.leaf?.[1]??.46, ln=o.n??1;
  const n=8+Math.floor(r()*6);
  for(let i=0;i<n;i++){
    const a=r()*6.28318,d=R0*Math.sqrt(r())*.72;
    const c=[Math.cos(a)*d,(.28+.52*r())*R0*(1-.45*d/R0)*fl,Math.sin(a)*d];
    B.tube([c[0]*.25,-.05,c[2]*.25],c,.035,.015,.34,r);
    const s=R0*(.3+.3*r());
    const k0=B.rec.length;
    B.clump(c,s,s*.78*Math.min(1,fl*1.15),Math.round((120+90*r())*ln),ls,la,bright,hue,r);
    if(o.flowers) for(let k=k0;k<B.rec.length;k++) if(leafHash(B.rec[k].n.map((v,j)=>v+k*.013+j))<o.flowers){ B.rec[k].hue=.86; B.rec[k].bright=Math.min(1,B.rec[k].bright*1.6+.2); }
  }
  return B.finish();
}
/* o (vegetation presets): n blades (420), spread (how far the blades lean out; 1 as it was), width (of
   a blade; 1 as it was), stiff (0 to 1: blades stand straighter), heads: seed stalks rising above the
   tuft, as sea oats carry (a number of stalks, their height over R0, and drooping panicles of flat
   spikelets in straw), runners (spinifex: blades on stems lying out over the sand). */
function makeGrass(seed,R0,bright,hue,o={}){
  const r=prng(seed),B=new PlantBuilder();
  const N=o.n??420, sp=o.spread??1, wd=o.width??1, st=o.stiff??0, base0=o.base??.5;
  /* Each blade arches out and over under its own weight, from a tilt that grows toward the tuft's edge,
     and tapers to a point; most are short and a few long, and some are dead straw. The tuft's base is an
     uneven oval, and the wind lays it a little to one side. Before, blades of much the same length rose
     on gentle curves, ending in wide tips: a tuft was a dome with a smooth round outline, like a
     hedgehog (the author, 23 November: "grassy plants are all round and look unrealistic"). */
  const ell=.65+.5*r(), wa=r()*6.28318, wind=(1-st)*.22, wx=Math.cos(wa)*wind, wz=Math.sin(wa)*wind;
  const n4=Math.round(N*.75);
  for(let i=0;i<n4;i++){
    const a=r()*6.28318,rr=Math.sqrt(r()),d=R0*base0*rr;
    const base=[Math.cos(a)*d,-.04,Math.sin(a)*d*ell];
    const L=R0*(.5+1.15*Math.pow(r(),1.8));
    const th0=Math.min(1.1,(.1+.5*rr+.3*r())*sp), bend=(.3+1.*r())*(1-.8*st)*Math.min(1.3,sp);
    const az=a+(r()-.5)*.9, hx=Math.cos(az), hz=Math.sin(az);
    const dead=r()<.12;
    const b0=dead?bright+.1+.1*r():bright+.3*(r()-.5), hu=dead?.98:Math.min(1,Math.max(.1,hue+.42*(r()-.5)));
    const side=[-hz,0,hx];
    let p0=base;
    for(let s=1;s<=4;s++){
      const t=s/4, th=Math.min(2.,th0+bend*t*t);
      const dir=v3.norm([hx*Math.sin(th)+wx*t,Math.cos(th),hz*Math.sin(th)+wz*t]);
      const q=v3.add(p0,v3.mul(dir,L/4));
      B.blade(p0,q,.055*(1.08-.9*t)*wd,v3.norm(v3.add(v3.cross(side,dir),[0,.25,0])),b0+.12*t,hu);
      p0=q;
    }
  }
  if(o.heads){
    const [n,hh]=o.heads;
    for(let i=0;i<n;i++){
      const a=r()*6.28318,d=R0*.25*Math.sqrt(r()), H=R0*hh*(.8+.35*r());
      const lean=[Math.cos(a)*.12+(r()-.5)*.1,0,Math.sin(a)*.12+(r()-.5)*.1];
      const pts=[]; for(let k=0;k<=6;k++){ const t=k/6; pts.push([Math.cos(a)*d+lean[0]*H*t*t,H*t-.04,Math.sin(a)*d+lean[2]*H*t*t]); }
      B.stem(pts,pts.map((_,k)=>.006*(1-k/6)+.003),bright*.9,.98);
      /* The panicle: the top third, branches drooping to one side, each hung with flat spikelets. */
      for(let k=0;k<9;k++){
        const t=.68+.3*k/8, p=v3.add(pts[Math.floor(t*6)],[0,(t*6%1)*H/6,0]);
        const b=a+(r()-.5)*1.6, len=.09+.12*r()*(1-t*.6);
        const dir=v3.norm([Math.cos(b)*.8,-.45-.4*r(),Math.sin(b)*.8]);
        for(let j=1;j<=3;j++){ const q=v3.add(p,v3.mul(dir,len*j/3)), q2=v3.add(q,[0,-.045,0]);
          B.blade(q,q2,.022,v3.norm([Math.cos(b),.2,Math.sin(b)]),bright+.18+.1*r(),.98); }
      }
    }
  }
  return B.finish();
}
/* A palm with fan-shaped leaves on long stalks, as the cabbage (sabal) palm: a straight trunk with the
   old leaf bases still on its upper part, and a dense round crown; or, low (o.low), a saw palmetto clump:
   short stems creeping along the ground, each with a tuft of fans standing up from it. */
function fanLeaf(B,base,dir,stalk,R,seg,bright,hue,r,droop){
  const tip=v3.add(base,v3.mul(dir,stalk));
  B.stem([base,v3.add(base,v3.mul(dir,stalk*.5)),tip],[.025,.018,.012],bright*.9,hue);
  const flat=v3.norm([dir[0],0,dir[2]]), side=v3.norm(v3.cross(flat,[0,1,0])), e1=v3.norm(v3.add(dir,[0,.35,0]));
  const nrm=v3.norm(v3.cross(side,e1));
  for(let s=0;s<seg;s++){
    const th=(s/(seg-1)-.5)*3.6+(r()-.5)*.08;
    const sd=v3.norm(v3.add(v3.mul(e1,Math.cos(th)),v3.mul(side,Math.sin(th))));
    const L=R*(.75+.25*Math.cos(th*.5))*(.9+.2*r());
    let p0=tip; const w=R*2.1/seg;
    for(let k=1;k<=3;k++){
      const t=k/3, q=v3.add(v3.add(tip,v3.mul(sd,L*t)),[0,-droop*L*t*t,0]);
      const b=bright+.1*(1-t)+.12*(r()-.5);
      B.blade(p0,q,w*(1.1-.55*t),v3.norm(v3.add(nrm,v3.mul(sd,.15))),b,(hue+.06*(r()-.5)));
      p0=q;
    }
  }
}
function makeFanPalm(seed,H,bright,hue,o={}){
  const r=prng(seed),B=new PlantBuilder();
  if(o.low){
    /* Saw palmetto: 3 to 5 stems lying on the sand, each lifting a tuft of fans 1 to 1.6 m. */
    const n=3+Math.floor(r()*3);
    for(let s=0;s<n;s++){
      const a=s/n*6.28318+(r()-.5)*.8, L=.4+.7*r(), tip=[Math.cos(a)*L,.06,Math.sin(a)*L];
      B.stem([[0,-.05,0],[Math.cos(a)*L*.5,.02,Math.sin(a)*L*.5],tip],[.07,.065,.06],.4,.025);
      const m=6+Math.floor(r()*5);
      for(let k=0;k<m;k++){
        const b=a+(r()-.5)*2.4, rise=.55+.4*r();
        const dir=v3.norm([Math.cos(b)*(1-rise),rise*1.4,Math.sin(b)*(1-rise)]);
        fanLeaf(B,tip,dir,H*(.45+.25*r()),H*(.32+.08*r()),22,bright,hue,r,.25+.2*r());
      }
    }
    return B.finish();
  }
  const bx=(r()-.5)*.06*H, bz=(r()-.5)*.06*H;
  const trunk=t=>[bx*t*t,H*t-.3,bz*t*t];
  { const pts=[],rad=[]; for(let i=0;i<=12;i++){ const t=i/12; pts.push(trunk(t)); rad.push(.17+.04*Math.pow(1-t,4)+(t>.55?.05:0)); } B.stem(pts,rad,.42,.02); }
  /* Old leaf bases (boots) on the upper trunk, crossing as a lattice */
  for(let k=0;k<60;k++){ const t=.58+.4*r(), c=trunk(t), a=r()*6.28318, d=[Math.cos(a),0,Math.sin(a)];
    const p=v3.add(c,v3.mul(d,.2)), q=v3.add(p,[d[0]*.14,.22,d[2]*.14]); B.blade(p,q,.09,v3.norm([d[0],.3,d[2]]),.34+.1*r(),.03); }
  const top=trunk(1), N=26+Math.floor(r()*8);
  for(let k=0;k<N;k++){
    const a=k*2.39996+r()*.4, age=k/N, rise=1.15-1.9*age+.25*(r()-.5);
    const dir=v3.norm([Math.cos(a),rise,Math.sin(a)]);
    const dead=age>.93;
    fanLeaf(B,top,dir,H*(.11+.04*r()),H*(.085+.02*r()),26,dead?.4:bright,dead?.98:hue+.12*age,r,dead?.9:.35+.3*age);
  }
  return B.finish();
}
/* Low runners over the sand with leaves along them: railroad vine and beach morning glory (o.round
   leaves), or a mat of succulent fingers, as ice plant and pigface (o.succulent). */
function makeMat(seed,R0,bright,hue,o={}){
  const r=prng(seed),B=new PlantBuilder();
  if(o.succulent){
    /* A carpet: fat fingers crowded along trailing stems, each clump of them a rosette, so the sand hardly
       shows through in the middle and the edge is ragged. */
    for(let c=0;c<110;c++){
      const a=r()*6.28318, d=R0*Math.pow(r(),.6), cx=Math.cos(a)*d, cz=Math.sin(a)*d, hu0=leafHash([cx,0,cz])<.2?.8:hue+.2*(r()-.5);
      for(let i=0;i<22;i++){
        const b=r()*6.28318, base=[cx+Math.cos(b)*.05*r(),.01+.03*r(),cz+Math.sin(b)*.05*r()];
        const up=.25+.55*r(), L=.06+.05*r();
        const q=v3.add(base,v3.mul(v3.norm([Math.cos(b),up,Math.sin(b)]),L));
        B.blade(base,q,.032,v3.norm([Math.cos(b)*.3,1,Math.sin(b)*.3]),bright+.12*(r()-.5)+.12*up,hu0+.06*(r()-.5));
      }
    }
    return B.finish();
  }
  /* Runners from the middle, each forking now and then, with a leaf on a stalk at every node, alternately
     to each side. The runners reach out mostly one way, as the plant spreads over open sand (with the
     wind, down the dune), some much further than others, and fork more; the leaves stand tilted up off the
     sand, each its own way. Spread evenly all round, of one length, with flat leaves, every plant was the
     same star lying on the sand, and from the middle distance they read as dark stickers (the audit, tech
     log 78, item 10). */
  const runner=(p0,a,L,depth)=>{
    const st=.07, m=Math.max(3,Math.round(L/st)); let p=p0; const pts=[p];
    for(let k=1;k<=m;k++){
      a+=(r()-.5)*.34; p=v3.add(p,[Math.cos(a)*st,0,Math.sin(a)*st]); p=[p[0],.015+.012*r(),p[2]]; pts.push(p);
      const sd=k%2?1:-1, c=v3.add(p,[-Math.sin(a)*sd*.06,.05+.08*r(),Math.cos(a)*sd*.06]);
      const ta=r()*6.28318, tilt=.55+1.3*r();
      B.leaf(c,v3.norm([Math.cos(ta)*tilt,1,Math.sin(ta)*tilt]),(o.leafSize??.055)*(.75+.5*r()),o.aspect??.9,bright+.18*(r()-.5),hue+.12*(r()-.5),r);
      if(depth>0&&r()<.16) runner(p,a+(r()<.5?1:-1)*(.45+.6*r()),L*(.3+.45*r()),depth-1);
    }
    B.stem(pts,pts.map(()=>.008),.4,.3);
  };
  const n=6+Math.floor(r()*4), a0=r()*6.28318;
  for(let s=0;s<n;s++){
    const back=s===0;
    runner([0,.02,0],back?a0+Math.PI+(r()-.5)*.8:a0+(s/(n-1)-.5)*3.4+(r()-.5)*.5,R0*(back?.3+.25*r():.35+.75*Math.pow(r(),.6)),2);
  }
  return B.finish();
}
/* Wind-sculpted cypress, as the Monterey cypress: a short leaning trunk, a few heavy limbs reaching out
   to the side, dense flat pads of tiny scale leaves in tiers, the top sheared flat by the wind. */
function makeCypress(seed,H,R,bright,hue){
  const r=prng(seed),B=new PlantBuilder();
  const lean=[.16+.08*r(),1,(r()-.5)*.1];
  const tr=t=>[lean[0]*H*.5*t,H*.45*t-.4,lean[2]*H*.5*t];
  { const pts=[],rad=[]; for(let i=0;i<=6;i++){ const t=i/6; pts.push(tr(t)); rad.push(H*.03*(1-.4*t)*(1+.5*Math.pow(1-t,4))); } B.stem(pts,rad,.32,.012); }
  const limbs=5+Math.floor(r()*3);
  for(let i=0;i<limbs;i++){
    const f=.5+.5*r(), p=tr(f), a=i/limbs*6.28318+(r()-.5)*.8+(Math.cos(i*1.7)>0?0:Math.PI*.15);
    const reach=R*(.55+.5*r())*(Math.cos(a)>0?1.15:.8);
    const dir=v3.norm([Math.cos(a),.25+.3*r(),Math.sin(a)]);
    const L=B.limb(p,dir,reach,H*.016,H*.005,.3,r,.22,4,.012);
    const pads=3+Math.floor(r()*3);
    for(let k=0;k<pads;k++){
      const t=.35+.65*k/(pads-1||1), c=v3.add(p,v3.mul(v3.sub(L.q,p),t));
      const s=(.9+.8*r())*R/5;
      const y=Math.min(c[1]+.4+.6*r(),H*.92);
      B.clump([c[0]+(r()-.5),y,c[2]+(r()-.5)],s*1.25,s*.32,Math.round(260*s*s),.07,.62,bright+(r()-.5)*.1,hue,r);
    }
  }
  /* The sheared top: a broad flat pad over the middle */
  B.clump([lean[0]*H*.25,H*.85,0],R*.45,R*.1,Math.round(500*R*R*.04),.07,.62,bright+.05,hue,r);
  return B.finish();
}
/* She-oak and ironwood (Casuarina): a pine-like tree whose "needles" are drooping jointed twigs, so the
   crown is soft, grey-green and wispy, open enough to see sky through. */
function makeCasuarina(seed,H,R,bright,hue){
  const r=prng(seed),B=new PlantBuilder();
  const tr=t=>[(r()-.5)*.02+.06*H*t*t,H*.9*t-.4,.03*H*t*t];
  const T=[]; for(let i=0;i<=10;i++) T.push(tr(i/10));
  B.stem(T,T.map((_,i)=>H*.018*(1-.75*i/10)+.02),.34,.02);
  const limbs=14+Math.floor(r()*6);
  for(let i=0;i<limbs;i++){
    const f=.3+.68*r(), p=T[Math.round(f*10)], a=r()*6.28318;
    const reach=R*(.35+.55*(1-Math.abs(f-.55)))*(.6+.5*r());
    const L=B.limb(p,v3.norm([Math.cos(a),.35+.4*r(),Math.sin(a)]),reach,.08,.02,.3,r,.2,3,.02);
    /* Tufts of drooping twigs along the outer part of the limb, each a fan of thin hanging strands. */
    for(let k=0;k<16;k++){
      const c=v3.add(v3.add(p,v3.mul(v3.sub(L.q,p),.35+.65*r())),[(r()-.5)*1.4,(r()-.2)*.9,(r()-.5)*1.4]);
      const b0=bright+.15*(r()-.5), h0=hue+.1*(r()-.5);
      for(let j=0;j<9;j++){
        const d=[(r()-.5)*.5,-.5-.5*r(),(r()-.5)*.5], q=v3.add(c,v3.mul(d,.5+.4*r())), m=v3.add(v3.mul(v3.add(c,q),.5),[(r()-.5)*.08,.06,(r()-.5)*.08]);
        const n=v3.norm([d[2],.3,-d[0]]);
        B.blade(c,m,.028,n,b0+.06*(r()-.5),h0); B.blade(m,q,.02,n,b0+.06,h0);
      }
    }
  }
  return B.finish();
}
/* Pandanus (screw pine): a forked trunk propped on stilt roots, each branch ending in a spiral tuft of
   long, drooping strap leaves. */
function makePandanus(seed,H,bright,hue){
  const r=prng(seed),B=new PlantBuilder();
  for(let k=0;k<7;k++){ const a=k/7*6.28318+(r()-.5)*.5, f=[Math.cos(a)*.9,-.3,Math.sin(a)*.9];
    B.stem([f,v3.add(f,[-Math.cos(a)*.45,.7,-Math.sin(a)*.45]),[Math.cos(a)*.12,1.4+.3*r(),Math.sin(a)*.12]],[.05,.05,.06],.36,.02); }
  const base=[0,1.4,0], tips=[];
  const fork=(p,d,len,rad,depth)=>{
    const L=B.limb(p,d,len,rad,rad*.8,.36,r,.18,3,.02);
    if(depth===0){ tips.push(L.q); return; }
    for(let i=0;i<2;i++){ const a=r()*6.28318; fork(L.q,v3.norm(v3.add(L.dir,[Math.cos(a)*.75,.15,Math.sin(a)*.75])),len*(.6+.25*r()),rad*.75,depth-1); }
  };
  fork(base,[0,1,0],H*.38,.16,2);
  for(const t of tips){
    for(let k=0;k<40;k++){
      const a=k*2.39996, rise=.9-1.5*(k/40)+.2*(r()-.5), L=H*(.18+.06*r());
      const dir=v3.norm([Math.cos(a),rise,Math.sin(a)]);
      let p0=t; for(let j=1;j<=4;j++){ const s=j/4, q=v3.add(v3.add(t,v3.mul(dir,L*s)),[0,-.5*L*s*s,0]);
        B.blade(p0,q,.08*(1.1-.6*s),v3.norm(v3.add(v3.cross(dir,[0,1,0]),[0,.6,0])),bright+.12*(r()-.5),k>36?.98:hue+.08*(r()-.5)); p0=q; }
    }
  }
  return B.finish();
}
/* An empty slot's stand-in: a single blade, quick to bake (the preset never grows it). */
function makeNothing(){ const B=new PlantBuilder(); B.blade([0,0,0],[0,.1,0],.01,[0,0,1],.4,.4); return B.finish(); }
/* A clump of ferns (the forest's understory): fronds rise from one crown and arch out and down. Each is a
   bare stalk at its foot, then paired leaflets (pinnae) angled toward the tip, longest a little below the
   middle, so the frond is a long narrow spear. Young fronds stand up in the middle; old ones lie lower and
   further out, and some of those have yellowed or dried brown from the tip. */
function makeFern(seed,R0,bright,hue){
  const r=prng(seed),B=new PlantBuilder();
  const N=15+Math.floor(r()*6);
  for(let f=0;f<N;f++){
    const a=f*2.39996+(r()-.5)*.7, age=r();
    const L=R0*(.72+.42*r())*(age<.1?.65:1);
    const rise=1.85-1.35*age+.3*(r()-.5), droop=.75+.45*age+.15*r();
    const hd=[Math.cos(a),0,Math.sin(a)], sd=[-hd[2],0,hd[0]], curl=(r()-.5)*.16;
    const m=14, pts=[];
    for(let i=0;i<=m;i++){
      const t=i/m, x=L*t*(.62+.38*(1-t*.4))*(.75+.25*age);
      const y=Math.max(L*.78*(rise*t-droop*t*t),.02+.03*(1-t));
      pts.push([hd[0]*(.03+x)+sd[0]*curl*L*t*t,y-.04,hd[2]*(.03+x)+sd[2]*curl*L*t*t]);
    }
    /* Old fronds yellow or dry from the tip; most stay green. */
    const fate=age>.72?r():1, dryFrom=fate<.18?.25+.5*r():fate<.42?.55+.4*r():2, yellow=fate<.3;
    const b0=bright+.14*(1-age)+.12*(r()-.5), h0=hue+.12*(r()-.5);
    B.stem(pts,pts.map((_,i)=>.011*(1-i/m)+.003),bright*.85,dryFrom<1?.03:.3);
    for(let i=0;i<m;i++){
      const d=v3.norm(v3.sub(pts[i+1],pts[i])), s=v3.norm(v3.cross(d,[0,1,0])), n0=v3.norm(v3.cross(s,d));
      for(let j=0;j<2;j++){
        const t=(i+j/2)/m; if(t<.12) continue;
        const u=(t-.12)/.88, env=Math.pow(u,.45)*Math.pow(1-u,.85)/.432;
        const len=R0*.16*env*(.88+.24*r());
        if(len<.012) continue;
        const p=v3.add(pts[i],v3.mul(v3.sub(pts[i+1],pts[i]),j/2));
        const dry=t>dryFrom, hu=dry?(yellow?.8:.925):Math.max(.1,h0+.06*(r()-.5)), br=(dry?b0*.85:b0)+.1*(r()-.5);
        for(const sg of [-1,1]){
          const o=v3.norm(v3.add(v3.add(v3.mul(s,sg),v3.mul(d,.34)),v3.mul(n0,-.1-.3*age-.15*u)));
          const nl=v3.norm(v3.add(n0,v3.mul(s,sg*.3)));
          const mid=v3.add(p,v3.mul(o,len*.55)), q=v3.add(p,v3.mul(o,len));
          B.blade(p,mid,len*.21,nl,br,hu);
          B.blade(mid,q,len*.15,nl,br+.03,hu);
        }
      }
    }
  }
  return B.finish();
}
return {makeBroadleaf,makeOvalTree,makeMultiStem,makeConifer,makePine,makePalm,makeShrub,makeGrass,makeFanPalm,makeMat,makeCypress,makeCasuarina,
  makePandanus,makeNothing,makeFern,PlantBuilder,LEAF0,prng,v3};
}
/* A new kind of plant: add its builder to the list above and here, or presets can't use it. */
const {makeBroadleaf,makeOvalTree,makeMultiStem,makeConifer,makePine,makePalm,makeShrub,makeGrass,makeFanPalm,makeMat,makeCypress,makeCasuarina,
  makePandanus,makeNothing,makeFern,PlantBuilder,LEAF0}=plantLib();
/* ---- In the live window the models are made off the main thread ----
   Making a preset's eleven models takes 150 to 400 ms of processor time (up to 110 ms for one tree), which
   held the picture up every time another coast's plants were prepared. A worker makes them instead: the
   same code (plantLib, turned to text) is given each model's one-line builder, also as text. The worker
   is made from text because a page opened from a file may not load a worker from a file. A builder must
   therefore use only what plantLib returns, with plain numbers and objects. If a worker can't be had, or
   fails, the model is made here as before. Tools (opt.sync) always make them here. */
let plantWorker=null,plantJobN=0;
const plantJobs=new Map();
function plantWorkerStart(){
  if(plantWorker!==null) return plantWorker;
  try{
    const src="'use strict';const LIB=("+plantLib.toString()+")();const K=Object.keys(LIB),V=K.map(k=>LIB[k]);"+
      "onmessage=e=>{ const id=e.data.id; try{ const M=new Function(...K,'\"use strict\";return ('+e.data.src+')()')(...V);"+
      " postMessage({id,verts:M.verts,nV:M.nV,cy:M.cy,rad:M.rad},[M.verts.buffer]); }catch(err){ postMessage({id,error:String(err&&err.message||err)}); } };";
    const w=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
    w.onmessage=e=>{ const j=plantJobs.get(e.data.id); if(!j) return; plantJobs.delete(e.data.id); if(e.data.error) j.fail(new Error(e.data.error)); else j.done(e.data); };
    w.onerror=e=>{ plantWorker=false; for(const j of plantJobs.values()) j.fail(new Error('the worker failed'+(e&&e.message?': '+e.message:''))); plantJobs.clear(); };
    plantWorker=w;
  }catch(e){ plantWorker=false; }
  return plantWorker;
}
/* One model from its builder: made by the worker if there is one, else here. */
function plantModelAsync(make){
  const w=plantWorkerStart();
  if(!w) return Promise.resolve().then(make);
  return new Promise((done,fail)=>{ const id=++plantJobN; plantJobs.set(id,{done,fail}); w.postMessage({id,src:make.toString()}); })
    .catch(e=>{ console.warn('[plants] a model was made on the main thread: '+e.message); return make(); });
}
function plantModels(){
  return [
    ()=>makePalm(11,15,.56,.28),
    ()=>makePalm(29,12.5,.60,.36),
    ()=>makeBroadleaf(41,13,1.,.25,.50,.26),
    ()=>makeBroadleaf(57,11.5,1.08,.55,.50,.32),
    ()=>makePine(73,17,5.2,.42,.22),
    ()=>makeConifer(89,15,3.1,.38,.16),
    ()=>makeShrub(101,1.7,.50,.34),
    ()=>makeGrass(113,1.05,.56,.6),
    /* Added after the shrub and grass, so the existing models keep their numbers. */
    ()=>makeOvalTree(131,12.5,5.6,.50,.30),
    ()=>makeMultiStem(149,8.5,4.6,.52,.36),
    ()=>makeFern(163,1.3,.47,.5),
  ];
}
/* Bake the eleven model slots into a set (its two texture arrays, its 3D models and their sizes): models is
   a vegetation preset's list of builders (js/vegetation.js), or the Classic mix. Baking another preset into
   a set reuses its textures. The globals plantA, plantL, plantInfo and plantMesh are the set being drawn
   (vegActivate in js/vegetation.js). */
async function buildPlants(models=plantModels(),set={},opt={}){
  const {FRAME,AZ,ROWS}=PLANT;
  const W=FRAME*AZ,H=FRAME*ROWS,N=PLANT.COUNT,levels=Math.floor(Math.log2(FRAME))-1;
  const mkArr=()=>{ const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY,levels,gl.RGBA8,W,H,N);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t; };
  if(!set.A){ set.A=mkArr(); set.L=mkArr(); }
  if(!set.mesh) set.mesh=[];
  const info=new Float32Array(N*2);
  /* Rendered at twice the size and averaged down, for clean leaf edges. */
  const tA=makeTex(W*2,H*2,{fmt:'RGBA8',mips:true}),tL=makeTex(W*2,H*2,{fmt:'RGBA8',mips:true});
  const fbo=makeFBO(tA,tL);
  const depth=gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER,depth); gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,W*2,H*2);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  const read=gl.createFramebuffer();
  const elev=[6,18,32,50,84];
  /* Live: the worker starts on all eleven now, and each is baked as it arrives. */
  const made=opt.sync?null:models.map(plantModelAsync);
  for(let m=0;m<N;m++){
    const M=opt.sync?models[m]():await made[m];
    info[m*2]=M.rad; info[m*2+1]=M.cy;
    const old=set.mesh[m]; if(old){ gl.deleteVertexArray(old.vao); gl.deleteBuffer(old.vb); gl.deleteBuffer(old.ib); }
    const vao=gl.createVertexArray(),vb=gl.createBuffer(),ib=gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,M.verts,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,48,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,48,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,48,24);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5,2,gl.FLOAT,false,48,40);
    /* Two more attributes, once per plant, for drawing many copies of this model in the scene. */
    gl.bindBuffer(gl.ARRAY_BUFFER,ib);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,4,gl.FLOAT,false,32,0); gl.vertexAttribDivisor(3,1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,4,gl.FLOAT,false,32,16); gl.vertexAttribDivisor(4,1);
    set.mesh[m]={vao,vb,ib,nV:M.nV};
    /* A bake for a new preset runs between frames of the live window, which leaves its own state behind:
       everything the bake needs is set here, at the start and after every frame it waits for. */
    const bakeState=()=>{ gl.bindFramebuffer(gl.FRAMEBUFFER,fbo); gl.bindVertexArray(vao); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); use(PR.plantBake,{uC:[0,M.cy,0],uRad:M.rad}); };
    bakeState();
    gl.viewport(0,0,W*2,H*2); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    for(let r=0;r<ROWS;r++)for(let a=0;a<AZ;a++){
      /* A large model's sixty views are drawn a row a frame, so the picture's own frames stay on time. */
      if(a===0&&r>0&&!opt.sync&&M.nV>40000){ gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(emptyVAO); await nextFrame(); bakeState(); }
      const el=deg(elev[r]),az=a/AZ*Math.PI*2;
      const toCam=[Math.cos(el)*Math.cos(az),Math.sin(el),Math.cos(el)*Math.sin(az)];
      const F=[-toCam[0],-toCam[1],-toCam[2]],Rt=vnorm(vcross(F,[0,1,0])),Up=vcross(Rt,F);
      gl.uniform3fv(PR.plantBake.u.uR.loc,Rt); gl.uniform3fv(PR.plantBake.u.uU.loc,Up); gl.uniform3fv(PR.plantBake.u.uF.loc,F);
      gl.viewport(a*FRAME*2,r*FRAME*2,FRAME*2,FRAME*2);
      gl.drawArrays(gl.TRIANGLES,0,M.nV);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(emptyVAO);
    for(const [src,dst] of [[tA,set.A],[tL,set.L]]){
      gl.bindTexture(gl.TEXTURE_2D,src); gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,src,1);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY,dst);
      gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,m,0,0,W,H);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
    gl.flush();
    /* opt.sync: all at once, for tools drawing a shot straight away (vegBakeNow); the call then finishes
       before it returns. */
    if(!opt.sync) await nextFrame();
    gl.useProgram(PR.plantBake.p);
  }
  for(const t of [set.A,set.L]){ gl.bindTexture(gl.TEXTURE_2D_ARRAY,t); gl.generateMipmap(gl.TEXTURE_2D_ARRAY); }
  set.info=info;
  gl.deleteFramebuffer(fbo); gl.deleteFramebuffer(read); gl.deleteRenderbuffer(depth); gl.deleteTexture(tA); gl.deleteTexture(tL);
  gl.bindVertexArray(emptyVAO);
  return set;
}

'use strict';
/* ---------------------------------------------------------------- Plant models -------
   Real 3D plants, generated at load: trunks, branches and thousands of individual leaves.
   How much light reaches each leaf from five directions is worked out through a grid of foliage
   density, so crowns have dark interiors and bright outer leaves. Each model is then rendered
   from 60 viewpoints into a texture, and the scene draws one camera-facing card per plant that
   shows the matching view. */
const PLANT={FRAME:200,AZ:12,ROWS:5,COUNT:10};
const PLANT_DIRS=[[.72,.69,0],[-.72,.69,0],[0,.69,.72],[0,.69,-.72],[0,1,0]];
let plantA=null,plantL=null,plantInfo=null;
const plantMesh=[];

function prng(a){ return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const v3={
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  mul:(a,k)=>[a[0]*k,a[1]*k,a[2]*k], dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  norm:a=>{ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; },
};
function randDir(r){ const y=r()*2-1,t=r()*6.28318,s=Math.sqrt(1-y*y); return [s*Math.cos(t),y,s*Math.sin(t)]; }
function basisOf(n){ const u=v3.norm(v3.cross(Math.abs(n[1])>.9?[1,0,0]:[0,1,0],n)); return [u,v3.cross(n,u)]; }

class PlantBuilder{
  constructor(){ this.pos=[]; this.rec=[]; }
  /* Each record is one leaf or bark facet: its triangles, and what its shading needs. */
  add(tris,n,area,bright,hue,woody,vn=null){ this.rec.push({start:this.pos.length/3,count:tris.length/3,n,area,bright,hue,woody,c:null,vn}); for(const v of tris) this.pos.push(v); }
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
      this.add([...base,...L1,...L2,...base,...L2,...tip],nh,size*size*aspect*1.1,bright+sg*.035,hue,false);
    }
  }
  /* Long thin leaf between two points, for palm leaflets and grass */
  blade(p0,p1,width,n,bright,hue){
    const d=v3.norm(v3.sub(p1,p0)),s=v3.mul(v3.norm(v3.cross(d,n)),width*.5);
    const m=v3.mul(v3.add(p0,p1),.5);
    const a=v3.add(m,s),b=v3.sub(m,s);
    this.add([...p0,...a,...p1,...p0,...p1,...b],n,Math.hypot(p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2])*width*.5,bright,hue,false);
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
    const rB=r()*.34-.17,rH=hue+(r()-.5)*.14;
    for(let i=0;i<count;i++){
      const d=randDir(r),k=Math.pow(r(),.42);
      const p=[c[0]+d[0]*rx*k,c[1]+d[1]*ry*k,c[2]+d[2]*rx*k];
      const n=v3.norm(v3.add(v3.add(v3.mul(d,.85),v3.mul(randDir(r),.75)),[0,.45,0]));
      const b=bright+rB+.28*d[1]*k+.24*(r()-.5);
      this.leaf(p,n,leafSize*(.7+.6*r()),aspect,b,Math.max(.1,rH+.14*(r()-.5)),r);
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
    /* Ten floats a vertex: position, then brightness, hue, ambient, then four directional light values */
    const nV=P.length/3,out=new Float32Array(nV*10);
    for(const R of this.rec){
      const v=PLANT_DIRS.map(d=>vis(R.c,d));
      const amb=(v[0]+v[1]+v[2]+v[3]+v[4]*2)/6;
      const bright=Math.min(Math.max(R.bright,.02),1);
      const shade=(nn)=>[0,1,2,3].map(i=>(R.woody?(.25+.75*v[i])*Math.max(v3.dot(nn,PLANT_DIRS[i]),.1):v[i]*(.32+.68*Math.max(v3.dot(nn,PLANT_DIRS[i]),0))));
      const flat=R.vn?null:shade(R.n);
      for(let i=0;i<R.count;i++){
        const a=(R.start+i)*3,o=(R.start+i)*10,l=flat||shade(R.vn[i]);
        out[o]=P[a];out[o+1]=P[a+1];out[o+2]=P[a+2];
        out[o+3]=bright;out[o+4]=R.hue;out[o+5]=amb;
        out[o+6]=l[0];out[o+7]=l[1];out[o+8]=l[2];out[o+9]=l[3];
      }
    }
    /* Card radius and crown height for the shader */
    const cy=(lo[1]+hi[1])*.5; let rad=0;
    for(let i=0;i<P.length;i+=3) rad=Math.max(rad,Math.hypot(P[i],P[i+1]-cy,P[i+2]));
    return {verts:out,nV,cy,rad:rad*1.03};
  }
}

/* ---- Species ---- */
function makeBroadleaf(seed,H,spread,flat,bright,hue){
  const r=prng(seed),B=new PlantBuilder();
  const trunkH=H*.3,R0=H*.032;
  const branch=(p,d,len,rad,depth)=>{
    const end=rad*.66;
    const L=B.limb(p,d,len,rad,end,.34,r,depth>=3?.1:.2,depth>=3?4:3);
    if(depth===0){
      /* Each branch ends in leaf masses of quite different sizes. */
      const big=r()<.34;
      const s=(big?1.45+.8*r():.7+.7*r())*spread;
      B.clump(L.q,s,s*(.7+.32*r()),Math.round(((big?300:130)+110*r())*1.2),.165,.46,bright+(r()-.5)*.14,hue,r);
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
function makeOvalTree(seed,H,R,bright,hue){
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
      B.clump(v3.add(c,[(r()-.5)*1.3,(r()-.15)*.9,(r()-.5)*1.3]),s,s*(.68+.3*r()),Math.round((150+110*r())*s*s),.165,.46,bright+(r()-.5)*.13,hue,r);
    }
  }
  B.clump(v3.add(at(1),[0,.5,0]),R*.4,R*.32,Math.round(60*R*R*.16),.165,.46,bright+.05,hue,r);
  return B.finish();
}
/* A low tree of several stems leaning out from one base, with a broad, ragged crown, like the
   wind-pruned trees that grow just behind a beach. */
function makeMultiStem(seed,H,R,bright,hue){
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
      B.clump(q,sz,sz*(.62+.25*r()),Math.round((170+110*r())*sz*sz),.16,.46,bright+(r()-.5)*.14,hue,r);
    }
    const sz=(1.3+.6*r())*R/5;
    B.clump(L.q,sz,sz*.72,Math.round(220*sz*sz),.16,.46,bright+.03,hue,r);
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
/* Wind-shaped pine: bare trunk, a few strong limbs, a flat irregular top */
function makePine(seed,H,R0,bright,hue){
  const r=prng(seed),B=new PlantBuilder();
  const bend=[.10+.07*r(),0,.05*(r()-.5)];
  const trunk=t=>[bend[0]*H*t*t,H*.72*t-.4,bend[2]*H*t*t];
  { const pts=[],rad=[]; for(let i=0;i<=10;i++){ const t=i/10; pts.push(trunk(t)); rad.push(H*.022*(1-t*.66)*(1+.6*Math.pow(1-t,5))); } B.stem(pts,rad,.34); }
  const top=trunk(1);
  const limbs=9+Math.floor(r()*5);
  for(let i=0;i<limbs;i++){
    const f=.55+.45*r(),p=trunk(f),a=r()*6.28318;
    const L=R0*(.45+.7*r());
    const dir=v3.norm([Math.cos(a)+.3,.28+.45*r(),Math.sin(a)]);
    const q=B.limb(p,dir,L,.14,.04,.3,r,.16,4).q;
    const m=3+Math.floor(r()*3);
    for(let k=0;k<m;k++){
      const c=v3.add(q,[(r()-.5)*L*.7,(r()-.3)*.6,(r()-.5)*L*.7]);
      const s=(.8+.9*r());
      B.clump(c,s,s*.66,Math.round(90+70*r()),.15,.36,bright,hue,r);
    }
  }
  B.clump(v3.add(top,[0,.3,0]),R0*.42,R0*.26,190,.15,.36,bright+.03,hue,r);
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
function makeShrub(seed,R0,bright,hue){
  const r=prng(seed),B=new PlantBuilder();
  const n=8+Math.floor(r()*6);
  for(let i=0;i<n;i++){
    const a=r()*6.28318,d=R0*Math.sqrt(r())*.72;
    const c=[Math.cos(a)*d,(.28+.52*r())*R0*(1-.45*d/R0),Math.sin(a)*d];
    B.tube([c[0]*.25,-.05,c[2]*.25],c,.035,.015,.34,r);
    const s=R0*(.3+.3*r());
    B.clump(c,s,s*.78,Math.round(120+90*r()),.07,.46,bright,hue,r);
  }
  return B.finish();
}
function makeGrass(seed,R0,bright,hue){
  const r=prng(seed),B=new PlantBuilder();
  for(let i=0;i<420;i++){
    const a=r()*6.28318,d=R0*.5*Math.sqrt(r());
    const base=[Math.cos(a)*d,-.04,Math.sin(a)*d];
    const lean=[Math.cos(a)*(.25+.7*r())+(r()-.5)*.5,0,Math.sin(a)*(.25+.7*r())+(r()-.5)*.5];
    const h=R0*(.55+.85*r());
    let p0=base;
    const b0=bright+.3*(r()-.5),hu=Math.min(1,Math.max(.1,hue+.42*(r()-.5)));
    const dn=v3.norm([lean[0]+.01,.6,lean[2]]);
    for(let s=1;s<=3;s++){
      const t=s/3,q=[base[0]+lean[0]*h*t*t*.72,h*t*(1-.22*t),base[2]+lean[2]*h*t*t*.72];
      B.blade(p0,q,.052*(1.15-t*.8),dn,b0+.12*t,hu);
      p0=q;
    }
  }
  return B.finish();
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
  ];
}
async function buildPlants(){
  const {FRAME,AZ,ROWS}=PLANT;
  const W=FRAME*AZ,H=FRAME*ROWS,N=PLANT.COUNT,levels=Math.floor(Math.log2(FRAME))-1;
  const mkArr=()=>{ const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY,levels,gl.RGBA8,W,H,N);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t; };
  plantA=mkArr(); plantL=mkArr(); plantInfo=new Float32Array(N*2);
  /* Rendered at twice the size and averaged down, for clean leaf edges. */
  const tA=makeTex(W*2,H*2,{fmt:'RGBA8',mips:true}),tL=makeTex(W*2,H*2,{fmt:'RGBA8',mips:true});
  const fbo=makeFBO(tA,tL);
  const depth=gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER,depth); gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,W*2,H*2);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  const read=gl.createFramebuffer();
  const elev=[6,18,32,50,84];
  const models=plantModels();
  for(let m=0;m<N;m++){
    const M=models[m]();
    plantInfo[m*2]=M.rad; plantInfo[m*2+1]=M.cy;
    const vao=gl.createVertexArray(),vb=gl.createBuffer(),ib=gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,M.verts,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,40,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,40,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,4,gl.FLOAT,false,40,24);
    /* Two more attributes, once per plant, for drawing many copies of this model in the scene. */
    gl.bindBuffer(gl.ARRAY_BUFFER,ib);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,4,gl.FLOAT,false,32,0); gl.vertexAttribDivisor(3,1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,4,gl.FLOAT,false,32,16); gl.vertexAttribDivisor(4,1);
    plantMesh[m]={vao,ib,nV:M.nV};
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    gl.viewport(0,0,W*2,H*2); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    use(PR.plantBake,{uC:[0,M.cy,0],uRad:M.rad});
    for(let r=0;r<ROWS;r++)for(let a=0;a<AZ;a++){
      const el=deg(elev[r]),az=a/AZ*Math.PI*2;
      const toCam=[Math.cos(el)*Math.cos(az),Math.sin(el),Math.cos(el)*Math.sin(az)];
      const F=[-toCam[0],-toCam[1],-toCam[2]],Rt=vnorm(vcross(F,[0,1,0])),Up=vcross(Rt,F);
      gl.uniform3fv(PR.plantBake.u.uR.loc,Rt); gl.uniform3fv(PR.plantBake.u.uU.loc,Up); gl.uniform3fv(PR.plantBake.u.uF.loc,F);
      gl.viewport(a*FRAME*2,r*FRAME*2,FRAME*2,FRAME*2);
      gl.drawArrays(gl.TRIANGLES,0,M.nV);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(emptyVAO);
    for(const [src,dst] of [[tA,plantA],[tL,plantL]]){
      gl.bindTexture(gl.TEXTURE_2D,src); gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,src,1);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY,dst);
      gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,m,0,0,W,H);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
    gl.flush();
    await nextFrame();
    gl.useProgram(PR.plantBake.p);
  }
  for(const t of [plantA,plantL]){ gl.bindTexture(gl.TEXTURE_2D_ARRAY,t); gl.generateMipmap(gl.TEXTURE_2D_ARRAY); }
  gl.deleteFramebuffer(fbo); gl.deleteFramebuffer(read); gl.deleteRenderbuffer(depth); gl.deleteTexture(tA); gl.deleteTexture(tL);
  gl.bindVertexArray(emptyVAO);
}

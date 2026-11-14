'use strict';
/* ---------------------------------------------------------------- Offline rendering --
   Renders one saved favourite to a video, with no time limit per frame. Each output frame averages
   several moments across the shutter time, which gives real motion blur, and each moment can be
   rendered above output resolution. The water runs in smaller time steps to match. Run by
   tools/prerender.js; adding ?hq=1 to the page also raises the detail settings. */

/* A minimal WebM file writer: enough for a single VP9 video track. */
function webmWriter(w,h,fps,frames,write){
  const vint=n=>{ for(let b=1;b<=8;b++){ if(n<Math.pow(2,7*b)-1){ const o=new Uint8Array(b); let v=n; for(let i=b-1;i>=0;i--){ o[i]=v%256; v=Math.floor(v/256); } o[0]|=1<<(8-b); return o; } } throw new Error('size'); };
  const idBytes=id=>{ const a=[]; for(let v=id;v>0;v=Math.floor(v/256)) a.unshift(v%256); return Uint8Array.from(a); };
  const join=p=>{ let n=0; for(const x of p) n+=x.length; const o=new Uint8Array(n); let k=0; for(const x of p){ o.set(x,k); k+=x.length; } return o; };
  const el=(id,body)=>join([idBytes(id),vint(body.length),body]);
  const uint=n=>{ const a=[]; let v=n; do{ a.unshift(v%256); v=Math.floor(v/256); }while(v>0); return Uint8Array.from(a); };
  const str=s=>new TextEncoder().encode(s);
  const f64=x=>{ const o=new Uint8Array(8); new DataView(o.buffer).setFloat64(0,x); return o; };
  write(el(0x1A45DFA3,join([el(0x4286,uint(1)),el(0x42F7,uint(1)),el(0x42F2,uint(4)),el(0x42F3,uint(8)),el(0x4282,str('webm')),el(0x4287,uint(4)),el(0x4285,uint(2))])));
  write(join([idBytes(0x18538067),Uint8Array.from([1,255,255,255,255,255,255,255])]));
  write(el(0x1549A966,join([el(0x2AD7B1,uint(1000000)),el(0x4D80,str('coastline')),el(0x5741,str('coastline')),el(0x4489,f64(frames*1000/fps))])));
  write(el(0x1654AE6B,el(0xAE,join([el(0xD7,uint(1)),el(0x73C5,uint(1)),el(0x83,uint(1)),el(0x86,str('V_VP9')),el(0xE0,join([el(0xB0,uint(w)),el(0xBA,uint(h))]))]))));
  return (ms,key,data)=>{
    const head=Uint8Array.from([0x81,0,0,key?0x80:0]);
    write(el(0x1F43B675,join([el(0xE7,uint(Math.round(ms))),el(0xA3,join([head,data]))])));
  };
}
async function renderFavourite(F,opt){
  const {sub=4,ss=2,secs=0,preroll=4,fps=30,bitrate=45e6,blur=true,snaps=[],onData,onSnap,onProgress}=opt;
  /* F: a saved favourite or a recipe (shotForRender in js/recipe.js). */
  const S=shotForRender(F); if(!S) throw new Error('Location not loaded: '+F.loc);
  const L=S.L;
  state.paused=true; state.next=null; state.cur=S; state.scale=ss; applyScale();
  bakeLit(L,S.lightKey);
  const acc=(()=>{ const t=makeTex(RT.w,RT.h); return {t,f:makeFBO(t)}; })();
  const frames=Math.round((secs||S.dur)*fps), simDt=1/(fps*sub*2);
  /* With blur off, every sample of a frame is at the same instant, and only the edges get smoothed.
     The water still takes the same steps, so with a fixed seed the waves match the blurred version. */
  const camSamples=blur?((sub>1&&S.kind==='low')?4:1):sub, moments=blur?sub:1; let sampleN=0;
  const stepSim=()=>{ simStep(L,simDt); foamStep(L,simDt); if(L.sp) sprayStep(L,simDt); };
  /* Let the waves and spray settle into the finer time step before the shot begins. */
  const rollSteps=Math.round(preroll/simDt);
  for(let i=0;i<rollSteps;i++){ stepSim(); if(i%16===15){ gl.flush(); await nextFrame(); } }
  const write=webmWriter(canvas.width,canvas.height,fps,frames,onData);
  let encErr=null;
  const enc=new VideoEncoder({output:(c)=>{ const d=new Uint8Array(c.byteLength); c.copyTo(d); write(c.timestamp/1000,c.type==='key',d); },error:e=>{ encErr=e; }});
  const cfg={codec:'vp09.00.40.08',width:canvas.width,height:canvas.height,bitrate,framerate:fps,latencyMode:'quality'};
  const sup=await VideoEncoder.isConfigSupported(cfg);
  if(!sup.supported) throw new Error('VP9 encoding not supported in this browser');
  enc.configure(cfg);
  const t0=performance.now();
  for(let f=0;f<frames;f++){
    gl.bindFramebuffer(gl.FRAMEBUFFER,acc.f); gl.viewport(0,0,RT.w,RT.h); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
    for(let j=0;j<2*sub;j++){
      simTime+=simDt; stepSim();
      if(j>=moments) continue;
      /* The shutter is open for half of each frame, the standard look for film. */
      rmPass(L); stepFFT(simTime);
      /* Low flights pass things very close to the lens, which need many more camera positions per
         frame, or the blur breaks into separate copies. The water can stay on the same step. */
      for(let q=0;q<camSamples;q++){
        const shotT=(f+(blur?(j+q/camSamples)/(2*sub):0))/fps;
        S.t=shotT; S.camT=S.noise+shotT;
        if(sub>1){ sampleN++; renderJit=[((sampleN*.7548777)%1-.5)*2/canvas.width,((sampleN*.5698403)%1-.5)*2/canvas.height]; renderNoiseF=sampleN%64; }
        renderHDR(S,shotT/S.dur);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND); gl.blendColor(0,0,0,1/(moments*camSamples)); gl.blendFunc(gl.CONSTANT_ALPHA,gl.ONE);
        use(PR.copy,{tI:RT.hdrA.t}); drawTo(acc.f);
        gl.disable(gl.BLEND);
        gl.flush();
      }
    }
    postProcess(S,acc.t,RT.ldrA.f);
    use(PR.final,{tI:RT.ldrA.t,uTx:[1/RT.w,1/RT.h],uTime:simTime,uSharp:ss>1?.28:.2}); drawTo(null,canvas.width,canvas.height);
    if(snaps.includes(f)&&onSnap) await onSnap(f,canvas.toDataURL('image/jpeg',.92));
    const vf=new VideoFrame(canvas,{timestamp:Math.round(f*1e6/fps),duration:Math.round(1e6/fps)});
    enc.encode(vf,{keyFrame:f%30===0}); vf.close();
    if(encErr) throw encErr;
    while(enc.encodeQueueSize>6) await new Promise(r=>setTimeout(r,5));
    if(onProgress) await onProgress(f+1,frames,(performance.now()-t0)/(f+1));
    await nextFrame();
  }
  await enc.flush(); enc.close();
  renderJit=[0,0]; renderNoiseF=0;
  gl.deleteFramebuffer(acc.f); gl.deleteTexture(acc.t);
  return {frames,msPerFrame:(performance.now()-t0)/frames,gl:gl.getError(),sim:COAST.readState(LOCATIONS.indexOf(L))};
}

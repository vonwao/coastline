'use strict';
/* ------------------------------------------------------- An even rhythm -------------
   A screen shows a new picture 60 times a second. Motion looks smooth when every picture stays up for
   the same number of those refreshes: one (60 a second), two (30) or three (20). It looks jerky when
   the number keeps changing, which is what happens when a frame costs the graphics chip a little more
   than the time it has. Measured 15 November 2026 on the Intel Arc 140T at a 3840x2160 screen: 90% of
   the time was spent in shots whose pictures stayed up for an uneven mix of one, two and three
   refreshes (TECHLOG 67).

   So each shot is given a rate it can hold, and a picture size that fits that rate:

   - The browser's timer (EXT_disjoint_timer_query_webgl2) says what each frame cost the chip, in
     milliseconds, whether or not the frame was on time. Per coast and kind of shot, the cost per million
     pixels is remembered (RH.hist, kept in this browser), so the next such shot starts at the right rate
     and size. A shot never seen before starts from the average of its kind.
   - At a cut (rhythmCut): 60 a second if the shot is expected to fit in RH_FIT[60] ms at RH_S60 of the
     full size or more; otherwise 30, at the largest size expected to fit in RH_FIT[30] ms. The size only
     changes at a cut, where it can't be seen, and not for small differences (making the targets again
     holds the picture for about a tenth of a second).
   - During the shot (rhythmSample): if it turns out dearer than expected, the picture is made smaller
     there and then when three seconds or more of the shot are left (a pause of a tenth of a second, against
     a stutter to its end); otherwise it drops to the next rate down. A long shot (calm mode) that turns
     out much cheaper than expected is made larger. A shot started on a guess may also go up to 60 in its
     first second.
   - Work behind the picture (building the next coast, js/world.js) asks how much time the chip has to
     spare in this frame (rhythmChunk) and does only that much. Its own cost is timed the same way.

   Without the timer (?notimer, or a browser without it) the cost is judged from late frames only: a shot
   that holds its rate is taken to fit, one that doesn't is taken to cost what its frames took.

   ?fps=30 or 60 fixes the rate, ?res= the size, ?min60= the smallest size worth 60 a second (0.6).
   Tools (?test) are left alone: they draw their own frames. */
const RH_KEY='coastline-rhythm-v1';
/* The part of a frame that doesn't depend on the picture's size (the sea), in ms. */
const RH_FIX=3;
/* A shot gets a rate if it is expected to cost less than this (ms); the rest of the refresh is left for
   the browser and for costs that vary along the camera's path. Mid-shot it loses the rate above RH_OUT. */
const RH_FIT={60:13.5,30:28.5,20:45}, RH_OUT={60:15,30:31.5,20:1e9};
const RH_S60=+(Q.get('min60')||.6), RH_SMIN=.5;
const RH={on:false,ext:null,active:null,rec:null,q:[],bq:[],unit:{},hist:{},gpu:'',saveT:0,used:0,starve:0,lastNow:0,lastS:null};
function rhythmInit(){
  RH.on=!TEST;
  if(!RH.on) return;
  RH.ext=Q.has('notimer')?null:gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const e=gl.getExtension('WEBGL_debug_renderer_info'); RH.gpu=String(e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
  /* What was learned before holds only for the same graphics chip. */
  try{ const o=JSON.parse(localStorage.getItem(RH_KEY)||'null'); if(o&&o.gpu===RH.gpu&&o.timer===!!RH.ext&&o.hist) RH.hist=o.hist; }catch(e){}
}
function rhythmSave(){ clearTimeout(RH.saveT); RH.saveT=setTimeout(()=>{ try{ localStorage.setItem(RH_KEY,JSON.stringify({gpu:RH.gpu,timer:!!RH.ext,hist:RH.hist})); }catch(e){} },4000); }
function rhythmKey(S){ return S.L.name+'|'+S.kind; }
/* What a shot is expected to cost, in ms per million pixels: what its coast and kind cost before, plus
   their usual spread; else the average of its kind on other coasts; else a first guess. */
function rhythmCostMP(S){
  const h=RH.hist[rhythmKey(S)]; if(h) return h[0]+h[1];
  const same=Object.keys(RH.hist).filter(k=>k.endsWith('|'+S.kind)).map(k=>RH.hist[k][0]+RH.hist[k][1]);
  return same.length?same.reduce((a,b)=>a+b,0)/same.length:S.kind==='top'?9:20;
}
/* A coast has been waiting to be built for a long time (the shots left it no time): the next shots leave
   it some. */
function rhythmRoom(){ return typeof COASTS!=='undefined'&&COASTS.busy&&performance.now()-(COASTS.since||0)>90000?3:0; }
/* The largest share of the full size at which a shot costing c ms per million pixels fits the rate. */
function rhythmFit(c,rate){ return Math.sqrt(Math.max(RH_FIT[rate]-rhythmRoom()-RH_FIX,1)/(c*canvas.width*canvas.height/1e6)); }
/* Would this shot hold 30 a second at the present size? (A dissolve can't change the size.) */
function rhythmFits(S){ return !RH.on||RH_FIX+rhythmCostMP(S)*RT.w*RT.h/1e6<=RH_FIT[30]; }
/* A shot is about to come on: its rate, and (resize) the picture size, which every shot on screen shares.
   also: a shot that stays on screen through a dissolve; the size must suit it too, by what it cost. */
function rhythmCut(S,resize,also){
  if(!RH.on||!S) return;
  const c=rhythmCostMP(S), guess=!RH.hist[rhythmKey(S)];
  let rate=FPS_FIX, s=state.scale;
  if(resize&&!Q.has('res')){
    if(!rate) rate=rhythmFit(c,60)>=RH_S60?60:30;
    let want=Math.min(1,Math.max(RH_SMIN,rhythmFit(c,rate>=45?60:rate>=25?30:20)));
    const alone=want;
    if(also&&also.rh&&also.rh.n>=8){ const r=capFor(also), a=state.scale*Math.sqrt(Math.max(RH_FIT[r>=45?60:r>=25?30:20]-RH_FIX,1)/Math.max(also.rh.hi-RH_FIX,1)); want=Math.min(want,Math.max(RH_SMIN,a)); }
    /* The present size stays unless it is too big, or more than a tenth smaller than it could be. */
    if(s>want||s<want*.9) s=Math.floor(want*50)/50;
    /* Held down for the shot it dissolves from: it may grow once that one has gone (frame, js/frame.js). */
    S.rhGrow=alone>s*1.15;
  }
  else if(!rate) rate=RH_FIX+c*RT.w*RT.h/1e6<=RH_FIT[60]-rhythmRoom()?60:30;
  if(Math.abs(s-state.scale)>.005){ state.scale=s; applyScale(); }
  S.rate=rate;
  S.rh={n:0,skip:3,ema:0,hi:0,px:RT.w*RT.h/1e6,guess,miss:0,seen:0};
  rhythmNote(S);
}
function rhythmNote(S){ const k=rhythmKey(S); if(S.rate&&S.rate<60) state.capBy[k]=S.rate; else delete state.capBy[k]; }
/* One frame of a shot cost the chip ms. */
function rhythmSample(S,ms){
  const h=S.rh; if(!h) return;
  if(h.skip>0){ h.skip--; return; }
  /* The timer counts everything the chip did between a frame's start and end, other programs' work too.
     One frame far above the rest is that, and counts for little; a lasting rise still shows in a few
     frames. (Measured: single frames of 60 to 140 ms among frames of 20, none of them late on screen.) */
  if(h.n>=3) ms=Math.min(ms,h.ema*1.4+2);
  h.ema=h.n?h.ema+(ms-h.ema)*.2:ms; h.n++;
  if(h.n>=5) h.hi=Math.max(h.hi,h.ema);
  if(FPS_FIX||S!==state.cur) return;
  const r=S.rate>=45?60:S.rate>=25?30:20, left=S.dur-S.t, may=!Q.has('res')&&!state.next&&!S.hold;
  /* The size that would fit the rate, by what the frames cost now. */
  const fit=x=>state.scale*Math.sqrt(Math.max(RH_FIT[r]-RH_FIX,1)/Math.max(x-RH_FIX,1));
  const resize=s=>{ state.scale=Math.floor(s*50)/50; applyScale(); h.n=0; h.skip=3; h.hi=0; h.px=RT.w*RT.h/1e6; };
  if(h.n>=5&&h.ema>RH_OUT[r]){
    /* Dearer than expected. With enough of the shot left, a smaller picture at the same rate; else the
       next rate down to its end. */
    const s=fit(h.ema);
    /* (In calm mode the shot stays on screen through a long dissolve after its end.) */
    if(may&&(left>3||CALM)&&s>=(r===60?RH_S60:RH_SMIN)) resize(s);
    else if(r>20){ S.rate=r===60?30:20; h.n=0; h.skip=2; rhythmNote(S); }
  }
  /* Much cheaper than expected, with a long stretch still to come: a larger picture. */
  else if(may&&left>8&&h.n>=30&&h.hi>0&&state.scale<1&&Math.min(1,fit(h.hi))>state.scale*1.25) resize(Math.min(1,fit(h.hi)));
  /* Started on a guess that was too careful: up to 60 while the shot is still new. */
  else if(h.guess&&r===30&&h.n>=5&&S.t<1.2&&h.ema<RH_FIT[60]-1.5){ S.rate=60; h.guess=false; rhythmNote(S); }
}
/* A shot has left the screen: remember what its kind costs on its coast, by its dearest stretch. */
function rhythmLearn(S){
  const h=S&&S.rh; if(!RH.on||!h||h.n<12||!h.hi) return;
  const c=Math.max((h.hi-RH_FIX)/h.px,1), k=rhythmKey(S), o=RH.hist[k];
  if(!o) RH.hist[k]=[+c.toFixed(2),+(c*.12).toFixed(2),1];
  else { const d=Math.abs(c-o[0]); o[0]=+(o[0]+(c-o[0])*.5).toFixed(2); o[1]=+(o[1]+(d-o[1])*.5).toFixed(2); o[2]++; }
  h.n=0; rhythmSave();
}
/* At the start of a frame that will be drawn. */
function rhythmBegin(now){
  if(!RH.on) return;
  const S=state.cur; RH.used=0;
  /* Late frames. With the timer they only back it up (the browser's own share isn't in its count); without
     it they are all there is. */
  if(S.rh&&RH.lastS===S&&!state.next){
    const gap=now-RH.lastNow, iv=1000/capFor(S), h=S.rh;
    /* Without the timer, a frame made late by work behind the picture says nothing about the shot. */
    const behind=!RH.ext&&(COASTS.busy||VEG.baking);
    h.seen++; if(gap>iv*1.4&&gap<250&&!behind) h.miss++;
    if(!RH.ext&&!behind) rhythmSample(S,gap>iv*1.1?Math.min(gap,120):iv*.8);
    if(h.seen>=40){ if(h.miss>=8&&!FPS_FIX&&S.rate>20){ S.rate=S.rate>=45?30:20; rhythmNote(S); } h.seen=0; h.miss=0; }
  }
  RH.lastNow=now; RH.lastS=S;
  if(!RH.ext) return;
  if(RH.active){ gl.endQuery(RH.ext.TIME_ELAPSED_EXT); gl.deleteQuery(RH.active); RH.active=null; }
  if(RH.q.length>8){ gl.deleteQuery(RH.q.shift().q); }
  RH.active=gl.createQuery(); gl.beginQuery(RH.ext.TIME_ELAPSED_EXT,RH.active);
  RH.rec={S,fade:!!state.next};
}
/* At its end: stop the timer, and collect the answers of earlier frames (they arrive a few frames late). */
function rhythmEnd(){
  if(!RH.on||!RH.ext) return;
  if(RH.active){ gl.endQuery(RH.ext.TIME_ELAPSED_EXT); RH.q.push({q:RH.active,S:RH.rec.S,fade:RH.rec.fade||!!state.next}); RH.active=null; }
  const bad=gl.getParameter(RH.ext.GPU_DISJOINT_EXT);
  while(RH.q.length&&gl.getQueryParameter(RH.q[0].q,gl.QUERY_RESULT_AVAILABLE)){
    const r=RH.q.shift(), ms=gl.getQueryParameter(r.q,gl.QUERY_RESULT)/1e6; gl.deleteQuery(r.q);
    if(!bad&&!r.fade) rhythmSample(r.S,ms);
  }
  while(RH.bq.length&&gl.getQueryParameter(RH.bq[0].q,gl.QUERY_RESULT_AVAILABLE)){
    const r=RH.bq.shift(), ms=gl.getQueryParameter(r.q,gl.QUERY_RESULT)/1e6; gl.deleteQuery(r.q);
    if(!bad&&r.units>0){ const u=ms/r.units, o=RH.unit[r.tag]; RH.unit[r.tag]=o?o+(u-o)*.3:u; }
  }
}
/* ---- Work behind the picture ---- */
/* The time the chip has to spare in this frame, in ms: the refresh, less what the shot's frames cost, less
   a margin. None in a dissolve or in a shot's first moments, when the cost isn't known. */
function rhythmSpare(){
  const S=state.cur, h=S&&S.rh; if(!h||state.next||state.paused||S.t<.5) return 0;
  if(!RH.ext) return h.miss?0:1.5-RH.used;
  if(h.n<3) return 0;
  return Math.max(0,Math.min(12,1000/capFor(S)-h.ema-2.5)-RH.used);
}
/* How many units of a kind of background work to do in this frame: as many as fit in the spare time, by
   what a unit of it has cost so far (first: a careful number while that isn't known). With no time to
   spare, one unit every tenth frame, so the work always ends. */
function rhythmChunk(tag,first,max){
  const spare=rhythmSpare(), u=RH.unit[tag];
  let n=u?Math.floor(spare/u):spare>1?first:0;
  if(n<1){ if(++RH.starve<10) return 0; n=1; }
  RH.starve=0; n=Math.min(n,max); RH.used+=n*(u||1);
  return n;
}
/* Do a piece of background work under the chip's timer, to learn what a unit of it costs. Not during a
   frame (one timer runs at a time): background work runs between frames. */
function rhythmTimed(tag,units,fn){
  if(!RH.ext||RH.active||RH.bq.length>6){ fn(); return; }
  const q=gl.createQuery(); gl.beginQuery(RH.ext.TIME_ELAPSED_EXT,q);
  try{ fn(); } finally { gl.endQuery(RH.ext.TIME_ELAPSED_EXT); RH.bq.push({q,tag,units}); }
}
/* For the on-screen readout (H). */
function rhythmText(S){
  const h=S&&S.rh; if(!RH.on||!h) return '';
  return RH.ext?` · chip ${h.ema.toFixed(0)} of ${(1000/capFor(S)).toFixed(0)} ms`:' · no chip timer';
}
rhythmInit();

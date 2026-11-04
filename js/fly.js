'use strict';
/* ---- Free flight: fly the drone yourself (press G) ----
   Keyboard: W and S forward and back, A and D sideways, E and Q up and down, arrow keys to turn and to
   tilt the camera, Shift to go fast. Drag with the mouse to look around. A gamepad works too: left stick
   to move, right stick to look, triggers for up and down. G again hands the drone back to the slideshow.

   The flight has momentum, like a real drone: it eases into speed and drifts to a stop. It keeps at least
   two metres above the ground and water, and inside the simulated area, where the waves are real. */
const FLY={on:false,keys:new Set(),v:[0,0,0],yaw:0,pitch:-.35,S:null,lastList:null,lastNear:0,drag:null};

function flyStart(){
  const C=state.next||state.cur; if(!C) return;
  const cam=cameraFor(C,Math.min(C.t/C.dur,1),C.camT!==undefined?C.camT:performance.now()*.001,1);
  /* Start where the slideshow's camera is, looking the same way. A straight-down shot starts tilted
     forward instead, which is easier to fly. */
  FLY.yaw=Math.atan2(cam.F[2],cam.F[0]);
  if(C.kind==='top'){ FLY.yaw=Math.atan2(cam.Up[2],cam.Up[0]); FLY.pitch=-.6; } else FLY.pitch=Math.asin(Math.max(-1,Math.min(1,cam.F[1])));
  const L=C.L;
  const S={L,lightKey:C.lightKey,kind:'angled',noise:0,p0:cam.ro.slice(),p1:cam.ro.slice(),yaw0:FLY.yaw,yaw1:FLY.yaw,
    pitch:FLY.pitch,fov:FOV_ANG,steps:L.kind==='rocky'?40:38,maxH:L.maxH,nearH:maxGroundNear(L,cam.ro[0],cam.ro[2],380)+14,dur:1e9,t:0,start:0,flying:true};
  FLY.S=S; FLY.v=[0,0,0]; FLY.lastList=cam.ro.slice(); FLY.lastNear=performance.now(); FLY.on=true;
  state.next=null; state.cur=S;
  toast('Flying: W A S D to move, E Q up and down, arrows or mouse to look, Shift fast, G to stop');
}
function flyStop(){
  FLY.on=false; FLY.keys.clear();
  if(state.cur&&state.cur.flying) cutTo(chooseNext(state.cur),0);
  toast('Back to the slideshow');
}
function toggleFly(){ if(FLY.on) flyStop(); else flyStart(); }

function flyUpdate(dt){
  if(!FLY.on||!state.cur||!state.cur.flying) return;
  const S=state.cur,L=S.L,k=FLY.keys;
  let fwd=(k.has('w')?1:0)-(k.has('s')?1:0), side=(k.has('d')?1:0)-(k.has('a')?1:0), up=(k.has('e')?1:0)-(k.has('q')?1:0);
  let turn=(k.has('arrowright')?1:0)-(k.has('arrowleft')?1:0), tilt=(k.has('arrowup')?1:0)-(k.has('arrowdown')?1:0);
  /* A gamepad, if one is connected. Small stick movements are ignored, so a resting stick doesn't drift. */
  const pads=navigator.getGamepads?navigator.getGamepads():[];
  for(const g of pads){ if(!g) continue;
    const dz=x=>Math.abs(x)<.12?0:x;
    side+=dz(g.axes[0]); fwd-=dz(g.axes[1]); turn+=dz(g.axes[2]||0)*1.4; tilt-=dz(g.axes[3]||0);
    up+=(g.buttons[7]?g.buttons[7].value:0)-(g.buttons[6]?g.buttons[6].value:0);
    break;
  }
  FLY.yaw+=turn*1.1*dt;
  FLY.pitch=Math.max(-1.45,Math.min(.35,FLY.pitch+tilt*.8*dt));
  const fast=k.has('shift')?3:1, sp=14*fast*(1+S.p0[1]/80);
  const cy=Math.cos(FLY.yaw),sy=Math.sin(FLY.yaw);
  const want=[(cy*fwd-sy*side)*sp,up*7*fast,(sy*fwd+cy*side)*sp];
  /* Ease toward the wanted speed: quick to respond, but never instant. */
  const a=1-Math.exp(-dt*2.2);
  for(let i=0;i<3;i++) FLY.v[i]+=(want[i]-FLY.v[i])*a;
  const p=S.p0;
  p[0]+=FLY.v[0]*dt; p[1]+=FLY.v[1]*dt; p[2]+=FLY.v[2]*dt;
  const m=40;
  p[0]=Math.max(L.domMin[0]+m,Math.min(L.domMin[0]+L.domSize[0]-m,p[0]));
  p[2]=Math.max(L.domMin[1]+m,Math.min(L.domMin[1]+L.domSize[1]-m,p[2]));
  p[1]=Math.max(Math.max(groundAt(L,p[0],p[2]),0)+2,Math.min(L.maxH>1000?1400:420,p[1]));
  S.p1=p.slice(); S.yaw0=S.yaw1=FLY.yaw; S.pitch=FLY.pitch;
  /* The height above which the view can skip the ground near the drone, and the list of nearby plants
     drawn as full models, both depend on where the drone is, so they're refreshed as it moves. */
  const now=performance.now();
  if(now-FLY.lastNear>400){ S.nearH=maxGroundNear(L,p[0],p[2],380)+14; FLY.lastNear=now; }
  if(Math.hypot(p[0]-FLY.lastList[0],p[2]-FLY.lastList[2])>25){ S.meshes=undefined; FLY.lastList=p.slice(); }
}
/* Keys go to the flight only while flying; G and F always work. */
function flyKey(e,down){
  if(!FLY.on) return false;
  const k=e.key.toLowerCase();
  if(['w','a','s','d','e','q','shift','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){
    if(down) FLY.keys.add(k); else FLY.keys.delete(k);
    e.preventDefault(); return true;
  }
  return false;
}
addEventListener('keyup',e=>flyKey(e,false));
addEventListener('blur',()=>FLY.keys.clear());
canvas.addEventListener('pointerdown',e=>{ if(FLY.on){ FLY.drag=[e.clientX,e.clientY]; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove',e=>{
  if(!FLY.on||!FLY.drag) return;
  FLY.yaw+=(e.clientX-FLY.drag[0])*.004; FLY.pitch=Math.max(-1.45,Math.min(.35,FLY.pitch-(e.clientY-FLY.drag[1])*.004));
  FLY.drag=[e.clientX,e.clientY];
});
canvas.addEventListener('pointerup',()=>{ FLY.drag=null; });

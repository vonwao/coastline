'use strict';
/* ---- Picking a beach to follow (press B) ----
   A small panel to choose a real beach by name instead of typing coordinates into the address. The
   search uses Open-Meteo's free place-name search (only the typed name is sent). The choice is kept in
   this browser, so the window comes back to the same beach next time; "Made-up sea" forgets it.
   An address with ?live= wins over the saved beach, and automated tools (?test) never use it. */
const BEACH_STORE='coastline-beach-v1';
/* A few to start from, with the compass direction each faces out to sea (approximate). */
const BEACHES=[
  {name:'Bondi Beach, Australia',lat:-33.89,lon:151.28,facing:110},
  {name:'Nazaré, Portugal',lat:39.60,lon:-9.08,facing:285},
  {name:'Malibu, California',lat:34.03,lon:-118.68,facing:190},
  {name:'Waikiki, Hawaii',lat:21.27,lon:-157.83,facing:200},
  {name:'Biarritz, France',lat:43.48,lon:-1.56,facing:300},
];
const FACINGS=[['','from the swell'],[0,'north'],[45,'north-east'],[90,'east'],[135,'south-east'],[180,'south'],[225,'south-west'],[270,'west'],[315,'north-west']];
function beachSaved(){ try{ return JSON.parse(localStorage.getItem(BEACH_STORE)||'null'); }catch(e){ return null; } }
/* At load, before the forecast is first asked for: follow the saved beach, unless told otherwise. */
(function(){
  const b=beachSaved();
  if(b&&!LIVE.on&&!Q.has('test')&&!Q.has('live')){ Object.assign(LIVE,{on:true,lat:b.lat,lon:b.lon,facing:b.facing??null}); LIVE.name=b.name; }
})();

const BP=document.createElement('div');
BP.id='beach'; BP.hidden=true;
BP.innerHTML=`<b>Follow a real beach</b><div id="bpNow"></div>
<div id="bpList"></div>
<form id="bpForm"><input id="bpQ" placeholder="Search for a place" autocomplete="off"><button>Search</button></form>
<div id="bpRes"></div>
<label>Faces out to sea: <select id="bpFace">${FACINGS.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>
<button id="bpOff">Made-up sea</button>
<p>The sea and sky follow the forecast there (from Open-Meteo.com); the coast itself is made up. The way the beach faces decides where the sun rises and sets. B or Esc closes this.</p>`;
document.body.append(BP);
const bp=id=>document.getElementById(id);

function beachDraw(){
  bp('bpNow').textContent=LIVE.on?`Now: ${LIVE.name||LIVE.lat.toFixed(2)+', '+LIVE.lon.toFixed(2)}${LIVE.info?' ('+LIVE.info+')':''}`:'Now: a made-up sea';
  bp('bpList').replaceChildren(...BEACHES.map(b=>beachButton(b,b.name)));
}
function beachButton(b,label){
  const B=document.createElement('button'); B.type='button'; B.textContent=label;
  if(LIVE.on&&Math.abs(LIVE.lat-b.lat)<1e-3&&Math.abs(LIVE.lon-b.lon)<1e-3) B.className='on';
  B.onclick=()=>beachGo(b); return B;
}
/* Follow a beach (or stop), remember it, and move on to a new scene once the forecast is in. */
async function beachGo(b){
  const fv=bp('bpFace').value;
  if(b){
    /* A chosen direction wins; otherwise a listed beach's own, otherwise the swell's. */
    const facing=fv!==''?+fv:b.facing??null;
    b={name:b.name,lat:b.lat,lon:b.lon,facing};
    try{ localStorage.setItem(BEACH_STORE,JSON.stringify(b)); }catch(e){}
    toast('Asking for the sea and sky at '+b.name);
    await liveStart(b.lat,b.lon,facing,b.name);
  } else {
    try{ localStorage.removeItem(BEACH_STORE); }catch(e){}
    liveStop(); toast('A made-up sea');
  }
  beachDraw();
  if(state.cur&&!state.next) cutTo(chooseNext(state.cur),CALM?rnd(3,4.5):1.2);
}
bp('bpForm').onsubmit=async e=>{
  e.preventDefault();
  const q=bp('bpQ').value.trim(); if(!q) return;
  bp('bpRes').textContent='Searching…';
  try{
    const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`,{signal:AbortSignal.timeout(15000)}).then(r=>r.json());
    const R=(r.results||[]).map(p=>({name:[p.name,p.admin1,p.country].filter((x,i,a)=>x&&a.indexOf(x)===i).join(', '),lat:p.latitude,lon:p.longitude}));
    if(R.length) bp('bpRes').replaceChildren(...R.map(b=>beachButton(b,b.name)));
    else bp('bpRes').textContent='No place by that name.';
  }catch(err){ bp('bpRes').textContent='Could not reach the search.'; }
};
bp('bpOff').onclick=()=>beachGo(null);
/* Typing in the panel mustn't work the simulation's keys. */
BP.addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Escape'){ BP.hidden=true; } });
function toggleBeach(){
  BP.hidden=!BP.hidden;
  if(!BP.hidden){ bp('bpFace').value=LIVE.on&&LIVE.facing!=null&&FACINGS.some(([v])=>v===LIVE.facing)?LIVE.facing:''; beachDraw(); }
}

'use strict';
/* ---- Rating scenes ----
   the author, 16 November: "Some scenes look pretty good, and others have weird issues ... we had a way to rate
   scenes and leave comments on them." The films page could already (tools/watch.html); this is the same
   for the live picture, so it works on the public page too, on a phone or a laptop.
     - The Rate button (top left, next to Menu; it shows while the mouse moves, or on a tap), or R, opens the
       panel. The scene stops while it is open, so the note stays with the scene it is about.
     - Stars (1 to 5) and a comment. Keys 1 to 5 rate the scene on screen without opening anything.
     - Each rating keeps the scene's whole recipe (recipeFromShot in js/recipe.js: coast, camera path,
       light, waves, plants) and a small picture of it, so the very scene can be found and shown again.
     - "Your ratings" lists them, newest first; each can be shown again or removed.
     - "Save ratings" writes them all to a file, coastline-ratings-<date>.json, in the Downloads folder.
   Ratings are kept in this browser (localStorage), as favourites are: each browser has its own until
   they are saved to a file. Not in the checks (?test) or in Wallpaper Engine. */
const RATE_KEY='coastline-ratings-v1';
function loadRatings(){ try{ return JSON.parse(localStorage.getItem(RATE_KEY))||[]; }catch(e){ return []; } }
function saveRatings(a){ try{ localStorage.setItem(RATE_KEY,JSON.stringify(a)); return true; }catch(e){ return false; } }
(function(){
  if(TEST) return;
  const st=document.createElement('style');
  st.textContent=`
  #rateBtn{position:fixed;left:84px;top:14px;z-index:6;background:rgba(8,14,17,.72);color:#e4eef0;border:1px solid #3a4c53;border-radius:6px;
    font:14px "Segoe UI",system-ui,sans-serif;padding:5px 12px;cursor:pointer;opacity:0;transition:opacity .4s;pointer-events:none}
  #rateBtn.show{opacity:1;pointer-events:auto}
  #rate{position:fixed;left:14px;top:14px;z-index:7;width:360px;max-width:calc(100% - 28px);max-height:calc(100% - 28px);overflow-y:auto;box-sizing:border-box;
    padding:12px 16px 14px;border-radius:10px;background:rgba(8,14,17,.92);color:#e4eef0;font:14px/1.45 "Segoe UI",system-ui,sans-serif}
  #rate[hidden]{display:none}
  #rate .top{display:flex;align-items:center;justify-content:space-between}
  #rate .top b{font-size:16px;font-weight:600}
  #rate .x{border:none;background:none;font-size:18px;line-height:1;padding:2px 6px;color:#9db0b6;cursor:pointer}
  #rate p{margin:6px 0;font-size:12.5px;color:#9db0b6}
  #rate .stars button{border:none;background:none;font-size:30px;line-height:1.1;padding:0 3px;color:#56656b;cursor:pointer}
  #rate .stars button.on{color:#f2c14e}
  #rate textarea{width:100%;box-sizing:border-box;min-height:70px;margin-top:6px;background:#1b2428;color:inherit;border:1px solid #3a4c53;border-radius:5px;
    font:inherit;font-size:14px;padding:6px 8px;resize:vertical}
  #rate .row{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
  #rate .row button{background:#1b2428;color:inherit;border:1px solid #3a4c53;border-radius:5px;padding:5px 11px;font:inherit;font-size:13.5px;cursor:pointer}
  #rate .row button.main{background:#2d6470;border-color:#58a3b2}
  #rate .item{display:flex;gap:9px;margin-top:10px;padding-top:10px;border-top:1px solid #26343a}
  #rate .item img{width:112px;height:63px;object-fit:cover;border-radius:4px;flex:none;background:#111}
  #rate .item .t{flex:1;min-width:0;font-size:12.5px;color:#b9d3d8}
  #rate .item .s{color:#f2c14e;font-size:14px}
  #rate .item .c{color:#e4eef0;white-space:pre-wrap;word-break:break-word}
  #rate .item .row{margin-top:4px}
  #rate .item .row button{padding:2px 8px;font-size:12px}`;
  document.head.appendChild(st);
  const btn=document.createElement('button'); btn.id='rateBtn'; btn.textContent='★ Rate'; document.body.appendChild(btn);
  const P=document.createElement('div'); P.id='rate'; P.hidden=true; document.body.appendChild(P);
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const describe=S=>`${S.L.name} · ${S.fall?'waterfall':S.kind} · ${LIGHTS[S.lightKey]?.label||S.lightKey}`;
  let cur=null, wasPaused=false, view='rate';

  /* A small picture of the scene on screen, copied straight after the next frame is drawn (grabNow in
     js/frame.js). If none comes within 6 seconds (the page can be busy just after it opens), the rating is kept without one. */
  function snap(){
    return new Promise(res=>{
      const t=setTimeout(()=>{ state.grab=null; res(''); },6000);
      state.grab=cv=>{ clearTimeout(t);
        try{ const w=320,h=Math.round(w*cv.height/cv.width), c=document.createElement('canvas'); c.width=w; c.height=h;
          c.getContext('2d').drawImage(cv,0,0,w,h); res(c.toDataURL('image/jpeg',.72)); }catch(e){ res(''); } };
    });
  }
  /* What is kept of a scene: its recipe, and what it is, in words. */
  function sceneOf(S){
    let recipe=null; try{ recipe=recipeFromShot(S); }catch(e){ console.warn('[rate] no recipe for this scene: '+e.message); }
    return {loc:S.L.name,kind:S.kind,fall:S.fall||null,light:S.lightKey,desc:describe(S),recipe};
  }
  async function open(){
    const S=state.next&&state.fade>.5?state.next:state.cur; if(!S) return;
    const thumb=await snap();
    wasPaused=state.paused; state.paused=true;
    cur={S,thumb,rating:0,comment:''};
    view='rate'; draw(); P.hidden=false; btn.classList.remove('show');
    setTimeout(()=>P.querySelector('textarea')?.focus(),30);
  }
  function close(){ P.hidden=true; cur=null; if(!wasPaused) state.paused=false; }
  function store(){
    if(!cur||(!cur.rating&&!cur.comment.trim())){ close(); return; }
    const all=loadRatings();
    all.push({id:Date.now().toString(36),at:new Date().toISOString(),rating:cur.rating,comment:cur.comment.trim(),scene:sceneOf(cur.S),thumb:cur.thumb});
    /* A full store: the oldest pictures go first, the ratings stay. */
    let ok=saveRatings(all);
    for(let i=0;!ok&&i<all.length;i++){ all[i].thumb=''; ok=saveRatings(all); }
    toast(ok?`Rated${cur.rating?' '+'★'.repeat(cur.rating):''}, ${all.length} in your list`:'Could not keep the rating in this browser');
    close();
  }
  function saveFile(){
    const all=loadRatings(); if(!all.length){ toast('Nothing rated yet'); return; }
    const a=document.createElement('a'), d=new Date().toISOString().slice(0,10);
    a.href=URL.createObjectURL(new Blob([JSON.stringify({saved:new Date().toISOString(),page:location.href.split(/[?#]/)[0],ratings:all},null,1)],{type:'application/json'}));
    a.download=`coastline-ratings-${d}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    toast(`Saved ${all.length} ratings to your Downloads folder`);
  }
  /* Show a rated scene again: its coast is built first if it was put away (COASTS in js/world.js). */
  function again(r){
    const R=r.scene.recipe; if(!R){ toast('That scene has no recipe to show again'); return; }
    const L=LOCATIONS.find(l=>l.name===r.scene.loc); if(!L){ toast('That coast is not here'); return; }
    const go=()=>{ try{ const S=shotFromRecipe(R); S.t=0; close(); cutTo(S,0); toast('Showing the rated scene again'); }catch(e){ toast('Could not show it: '+e.message); } };
    if(!L.ready){ toast('Bringing that coast back'); coastBuild(L,false).then(go,()=>toast('That coast could not be brought back')); } else go();
  }
  function draw(){
    const all=loadRatings();
    if(view==='list'){
      P.innerHTML=`<div class="top"><b>Your ratings (${all.length})</b><button class="x" data-do="close" title="Close (Esc)">×</button></div>
        <p>Kept in this browser. "Save ratings" writes them to a file in your Downloads folder.</p>
        <div class="row"><button data-do="back">Rate this scene</button><button class="main" data-do="file">Save ratings</button></div>`+
        all.slice().reverse().map(r=>`<div class="item">${r.thumb?`<img src="${r.thumb}" alt="">`:'<img alt="">'}<div class="t">
          <div class="s">${'★'.repeat(r.rating||0)}<span style="color:#56656b">${'★'.repeat(5-(r.rating||0))}</span></div>
          <div>${esc(r.scene.desc)} · ${esc(new Date(r.at).toLocaleString())}</div>${r.comment?`<div class="c">${esc(r.comment)}</div>`:''}
          <div class="row"><button data-do="again" data-id="${r.id}">Show again</button><button data-do="del" data-id="${r.id}">Remove</button></div></div></div>`).join('');
      return;
    }
    const n=all.length;
    P.innerHTML=`<div class="top"><b>Rate this scene</b><button class="x" data-do="close" title="Close (Esc)">×</button></div>
      <p>${esc(describe(cur.S))}</p>
      <div class="stars">${[1,2,3,4,5].map(k=>`<button data-star="${k}" class="${k<=cur.rating?'on':''}" title="${k} star${k>1?'s':''}">★</button>`).join('')}</div>
      <textarea placeholder="What's good or wrong in this scene? (optional)">${esc(cur.comment)}</textarea>
      <div class="row"><button class="main" data-do="save">Save</button><button data-do="close">Cancel</button><button data-do="list">Your ratings (${n})</button></div>
      <p>The scene stays paused until you save or cancel. Keys 1 to 5 rate without opening this.</p>`;
  }
  P.addEventListener('input',e=>{ if(cur&&e.target.tagName==='TEXTAREA') cur.comment=e.target.value; });
  P.addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.star){ cur.rating=+b.dataset.star===cur.rating?0:+b.dataset.star; P.querySelectorAll('.stars button').forEach((x,i)=>x.classList.toggle('on',i<cur.rating)); return; }
    const k=b.dataset.do;
    if(k==='close') close();
    else if(k==='save') store();
    else if(k==='list'){ view='list'; draw(); }
    else if(k==='back'){ if(!cur){ close(); open(); } else { view='rate'; draw(); } }
    else if(k==='file') saveFile();
    else if(k==='again'){ const r=loadRatings().find(x=>x.id===b.dataset.id); if(r) again(r); }
    else if(k==='del'){ saveRatings(loadRatings().filter(x=>x.id!==b.dataset.id)); draw(); }
  });
  /* Keys typed in the panel are its own; Esc closes it, Ctrl+Enter saves. */
  P.addEventListener('keydown',e=>{ if(e.key==='Escape') close(); else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) store(); e.stopPropagation(); });
  btn.addEventListener('click',()=>open());
  /* R opens the panel; 1 to 5 rate the scene on screen straight away. */
  addEventListener('keydown',e=>{
    if(window.IN_WALLPAPER||e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||!P.hidden) return;
    if(e.key.toLowerCase()==='r') open();
    else if(/^[1-5]$/.test(e.key)&&state.cur&&!document.getElementById('studio')){
      const S=state.next&&state.fade>.5?state.next:state.cur;
      snap().then(thumb=>{ const all=loadRatings(); all.push({id:Date.now().toString(36),at:new Date().toISOString(),rating:+e.key,comment:'',scene:sceneOf(S),thumb});
        if(!saveRatings(all)){ all[all.length-1].thumb=''; saveRatings(all); } toast(`Rated ${'★'.repeat(+e.key)}: ${describe(S)}`); });
    }
  });
  /* The button shows while the mouse moves, and on a tap on the picture (phones have no mouse). */
  let hideT;
  const poke=()=>{
    if(window.IN_WALLPAPER||!P.hidden) return;
    btn.classList.add('show'); clearTimeout(hideT);
    hideT=setTimeout(function h(){ if(btn.matches(':hover')) hideT=setTimeout(h,500); else btn.classList.remove('show'); },2600);
  };
  addEventListener('mousemove',poke);
  canvas.addEventListener('pointerdown',e=>{ if(e.pointerType!=='mouse') poke(); });
})();

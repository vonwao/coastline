'use strict';
/* ---- The menu ----
   The way from the simulation to everything else. A small Menu button shows in the top-left corner while
   the mouse moves; M opens the menu too, and Esc or a click on the picture closes it.
   Rebuilt 23 November after an audit (TECHLOG 73). the author, 22 November: "the menu is kind of confusing. I
   don't want to get rid of options... but I do want to simplify." Nothing was taken out; it is grouped by
   what you want to do, and says what is on:
     - Now: what is switched on (calm, sound, a beach being followed, a fixed light, favourites only,
       paused, flying), each with ✕ to switch it off. A remembered beach used to be followed silently.
     - Watch: switches for this window (calm, sound, full screen, favourites only, pause). A switch shows
       a dot, lit when on; everything else opens or plays something.
     - Light: one choice: any time (the usual mix), your own clock, a real beach, or one light for every
       shot. "Time of day", "Follow my clock" and "A real beach" were three groups.
     - Scenes (js/presets.js), Films (the demo reels, js/reel.js; and the movies of the one playing).
     - Your picks: ratings and favourites in one list (js/rate.js).
     - Make: the studio, flying the drone.
     - More pages: the wallpaper page, and the helper pages in tools/ when they're there (the public page
       carries only the page itself, so there it leaves those out).
     - Every key, in one list.
   Links that open the page anew keep calm and sound as they are (they used to drop sound and force
   calm). Not in the checks (?test) or in Wallpaper Engine, where it would pop up on the desktop. */
(function(){
  if(TEST) return;
  const st=document.createElement('style');
  st.textContent=`
  #menuBtn{position:fixed;left:14px;top:14px;z-index:6;background:rgba(8,14,17,.72);color:#e4eef0;border:1px solid #3a4c53;border-radius:6px;
    font:14px "Segoe UI",system-ui,sans-serif;padding:5px 12px;cursor:pointer;opacity:0;transition:opacity .4s;pointer-events:none}
  #menuBtn.show{opacity:1;pointer-events:auto}
  #menu{position:fixed;left:14px;top:14px;z-index:7;width:360px;max-width:calc(100% - 28px);max-height:calc(100% - 28px);overflow-y:auto;box-sizing:border-box;padding:12px 16px 14px;
    border-radius:10px;background:rgba(8,14,17,.92);color:#e4eef0;font:14px/1.45 "Segoe UI",system-ui,sans-serif;cursor:default}
  #menu[hidden]{display:none}
  #menu .top{display:flex;align-items:center;justify-content:space-between}
  #menu .top b{font-size:16px;font-weight:600}
  #menu h3{margin:13px 0 5px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#7f969d}
  #menu .row{display:flex;flex-wrap:wrap;gap:5px}
  #menu button,#menu a{background:#1b2428;color:inherit;border:1px solid #3a4c53;border-radius:5px;padding:4px 10px;font:inherit;font-size:13.5px;
    cursor:pointer;text-decoration:none;white-space:nowrap}
  #menu button:hover,#menu a:hover{background:#26343a}
  #menu .on{background:#2d6470;border-color:#58a3b2}
  #menu .sw::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:1px;border:1px solid #7f969d}
  #menu .sw.on::before{background:#9fe3f0;border-color:#9fe3f0}
  #menu .x{border:none;background:none;font-size:18px;line-height:1;padding:2px 6px;color:#9db0b6}
  #menu #mNow{margin-top:8px;padding:7px 9px;border-radius:6px;background:#141d21;font-size:13px}
  #menu #mNow .chip{display:inline-flex;align-items:center;gap:4px;margin:2px 4px 2px 0;padding:1px 4px 1px 8px;border-radius:10px;background:#24363c}
  #menu #mNow .chip button{border:none;background:none;padding:0 4px;font-size:13px;color:#9db0b6}
  #menu p{margin:8px 0 0;font-size:12.5px;color:#9db0b6}
  #menu .keys{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;margin-top:4px;font-size:12.5px;color:#b9cdd2}
  #menu .keys b{font-weight:600;color:#e4eef0;white-space:nowrap}`;
  document.head.appendChild(st);

  const here=location.href.split(/[?#]/)[0];
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  /* The page opened anew with these settings, keeping calm and sound as they are now, and the address's
     other settings except the ones that choose what plays and its light. */
  const open=(set,keepCalm=true)=>{
    const u=new URLSearchParams(location.search);
    for(const k of ['light','clock','hour','preset','reel','movie','take','studio','recipe','calm','sound']) u.delete(k);
    if(keepCalm&&CALM) u.set('calm','1');
    if(SOUND.on) u.set('sound','1');
    for(const [k,v] of Object.entries(set)) u.set(k,v);
    const q=u.toString(); return here+(q?'?'+q:'');
  };
  const reels=Object.keys(REELS).map(id=>{ try{ const I=reelInfo(id); return {id,title:I.title,min:Math.round(I.total/60),desc:REELS[id].subtitle||''}; }catch(e){ return null; } }).filter(Boolean);
  const playing=reelLiveCheck();
  const LIGHT_CHOICES=[['dawn','Dawn'],['sunrise','Sunrise'],['golden','Golden hour'],['sunset','Sunset'],['dusk','Dusk'],['moonlit','Moonlight'],['starry','Starlight']];
  const btn=document.createElement('button'); btn.id='menuBtn'; btn.textContent='☰ Menu'; btn.title='Menu (M)';
  const M=document.createElement('div'); M.id='menu'; M.hidden=true;
  M.innerHTML=`
    <div class="top"><b>Coastline</b><button class="x" data-do="close" title="Close (Esc)">✕</button></div>
    <div id="mNow"></div>
    <h3>Watch</h3>
    <div class="row">
      <button class="sw" data-do="calm" title="Long, slow shots joined by slow dissolves, for a screen left running (C)">Calm</button>
      <button class="sw" data-do="sound" title="The sound of the sea (S)">Sound</button>
      <button class="sw" data-do="full" title="Full screen (F, or double-click the picture)">Full screen</button>
      <button class="sw" data-do="favonly" title="Only the scenes you marked with L (P)">Favourites only</button>
      <button class="sw" data-do="pause" title="Stop the picture (Space)">Pause</button>
    </div>
    <h3>Light</h3>
    <div class="row">
      <button data-light="any" title="The usual mix: mostly day, sometimes sunrise, sunset or night">Any time</button>
      <button data-light="clock" title="Your own time of day: morning, golden hour, twilight, then moonlight">My clock</button>
      <button data-light="beach" title="A real beach's time of day, weather and waves, as they are now (B)">A real beach…</button>
    </div>
    <div class="row" style="margin-top:5px">${LIGHT_CHOICES.map(([k,l])=>`<button data-light="${k}" title="This light in every shot">${l}</button>`).join('')}</div>
    <h3>Scenes</h3>
    <div class="row">${PRESETS.map(P=>`<a href="${open({preset:P.id,calm:'1'},false)}" title="${esc(P.desc)}">${esc(P.name)}</a>`).join('')}</div>
    ${playing?`<h3>Now playing: ${esc(playing.R.title)}</h3>
    <div class="row">${playing.R.movies.map((Mv,i)=>`<button data-do="movie" data-m="${i}" title="${esc(Mv.subtitle)}">${i+1}. ${esc(Mv.title)}</button>`).join('')}</div>`:''}
    <h3>Films</h3>
    <div class="row">${reels.map(r=>`<a href="${open({reel:r.id,sound:'1'},false)}" title="${esc(r.desc)} (${r.min} minutes, with sound)">${esc(r.title)}</a>`).join('')}</div>
    <h3>Your picks</h3>
    <div class="row">
      <button data-do="picks" title="Your ratings and favourites: show one again, play favourites, save them to a file">Ratings and favourites <span id="mPickN"></span></button>
      <button data-do="rate" title="Rate the scene on screen, with a comment (R; keys 1 to 5 rate at once)">★ Rate this scene</button>
      <button data-do="fav" title="Add the scene on screen to your favourites, or take it out (L)">♥ Favourite</button>
    </div>
    <h3>Make</h3>
    <div class="row">
      <a href="${open({studio:'1'},false)}" title="A panel beside the picture that edits the scene on screen: coast, camera, light, waves, water">Studio</a>
      <button class="sw" data-do="fly" title="Fly the drone yourself: W A S D, E and Q up and down, the mouse to look, Shift for speed (G)">Fly the drone</button>
    </div>
    <h3>More pages</h3>
    <div class="row">
      <a href="wallpaper.html" title="The coast as your desktop wallpaper: how to set it up">Wallpaper</a>
      <span id="menuTools" hidden style="display:contents">
        <a href="tools/tour.html" title="Everything that's been built, with a button for each to see it">Guide</a>
        <a href="tools/watch.html" title="Recorded films of the simulation, to watch and rate clips">Films page</a>
        <a href="tools/compare.html" title="Before and after, side by side">Comparisons</a>
        <a href="tools/tv.html" title="The channel player for TVs, playing rendered calm films">TV player</a>
      </span>
    </div>
    <h3>Keys</h3>
    <div class="keys">
      <b>← →</b><span>scenes (in a film, its parts); N next</span>
      <b>Space</b><span>pause</span>
      <b>C · S · F</b><span>calm · sound · full screen (or double-click)</span>
      <b>B</b><span>a real beach</span>
      <b>R</b><span>rate the scene, with a comment; 1 to 5 rate at once</span>
      <b>L · P · E</b><span>favourite · favourites only · save favourites to a file</span>
      <b>G</b><span>fly the drone (W A S D, E Q, mouse, Shift)</span>
      <b>H</b><span>stats: frames a second, picture size</span>
      <b>T</b><span>smoothing between frames on or off</span>
      <b>M · Esc</b><span>this menu · close</span>
    </div>
    <p style="opacity:.6;font-size:.85em">Sea sounds include "Oceanwavescrushing" by Luftrum (freesound.org), CC BY 3.0, and recordings in the public domain (sounds/CREDITS.md).</p>`;
  document.body.append(btn,M);

  /* The helper pages: always there in the project folder (file://); elsewhere, only if tools/ answers. */
  const tools=M.querySelector('#menuTools');
  const showTools=on=>{ tools.hidden=!on; tools.style.display=on?'contents':'none'; };
  showTools(location.protocol==='file:');
  if(location.protocol!=='file:') fetch('tools/tour.html',{method:'HEAD'}).then(r=>showTools(r.ok)).catch(()=>{});

  /* Which light is chosen now: a beach being followed, the clock, one fixed light, or the usual mix. */
  const lightNow=()=>LIVE.on&&!LIVE.clock?'beach':LIVE.clock?'clock':FORCE_LIGHT&&LIGHT_CHOICES.some(([k])=>k===FORCE_LIGHT)?FORCE_LIGHT:'any';
  const lightName=k=>(LIGHT_CHOICES.find(([x])=>x===k)||[])[1]||k;
  function sync(){
    const on={calm:CALM,sound:SOUND.on,full:!!document.fullscreenElement,favonly:!!state.favOnly,pause:!!state.paused,fly:FLY.on};
    for(const [k,v] of Object.entries(on)) M.querySelector(`[data-do=${k}]`).classList.toggle('on',v);
    const ln=lightNow();
    M.querySelectorAll('[data-light]').forEach(b=>b.classList.toggle('on',b.dataset.light===ln));
    const S=state.next||state.cur;
    M.querySelector('[data-do=fav]').classList.toggle('on',!!(S&&S.favId));
    const nR=loadRatings().length, nF=loadFavs().length;
    M.querySelector('#mPickN').textContent=nR+nF?`(${nR+nF})`:'';
    /* Now: what is on, each with a switch off. */
    const chips=[];
    const chip=(label,k,title)=>chips.push(`<span class="chip" title="${esc(title)}">${esc(label)}<button data-off="${k}" title="Switch off">✕</button></span>`);
    if(playing) chips.push(`<span class="chip" style="padding-right:8px">Film: ${esc(playing.R.title)}</span>`);
    if(ln==='beach') chip(`Following ${LIVE.name||'a real beach'}`,'beach','Its time of day, weather and waves, as they are now. Remembered for next time.');
    else if(ln==='clock') chip('Light: your clock','light','The light follows your own time of day');
    else if(ln!=='any') chip(`Light: ${lightName(ln)}`,'light','This light in every shot');
    if(CALM) chip('Calm','calm','Long, slow shots and slow dissolves');
    if(SOUND.on) chip('Sound','sound','The sound of the sea');
    if(state.favOnly) chip('Favourites only','favonly','Only the scenes you marked with L');
    if(state.paused) chip('Paused','pause','The picture is stopped');
    if(FLY.on) chip('Flying','fly','You fly the drone');
    M.querySelector('#mNow').innerHTML=chips.length?chips.join(''):'The usual slideshow: scenes from every coast, at any time of day.';
  }
  const show=on=>{ M.hidden=!on; if(on){ btn.classList.remove('show'); sync(); } };
  window.toggleMenu=()=>show(M.hidden);
  btn.onclick=()=>show(true);
  /* A light: in place where it can be (stopping a beach), else the page opens anew with it. */
  function setLight(k){
    const ln=lightNow(); if(k===ln&&k!=='beach') return;
    if(k==='beach'){ show(false); if(BP.hidden) toggleBeach(); return; }
    if(ln==='beach'){ try{ localStorage.removeItem(BEACH_STORE); }catch(e){} }
    if(k==='any'){
      if(ln==='beach'&&!Q.has('light')&&!Q.has('clock')&&!Q.has('hour')){ beachGo(null); setTimeout(sync,50); return; }
      location.href=open({}); return;
    }
    location.href=open(k==='clock'?{clock:'1'}:{light:k});
  }
  M.addEventListener('click',e=>{
    const off=e.target.closest('[data-off]');
    if(off){ const k=off.dataset.off; if(k==='beach'||k==='light') setLight('any'); else act(k); setTimeout(sync,50); return; }
    const l=e.target.closest('[data-light]'); if(l){ setLight(l.dataset.light); return; }
    const d=e.target.closest('[data-do]'); if(!d) return;
    act(d.dataset.do,d); d.blur(); setTimeout(sync,50);
  });
  function act(k,d){
    if(k==='close') show(false);
    else if(k==='calm') toggleCalm();
    else if(k==='sound') toggleSound();
    else if(k==='full') toggleFull();
    else if(k==='favonly') toggleFavOnly();
    else if(k==='pause') togglePause();
    else if(k==='fly'){ show(false); toggleFly(); }
    else if(k==='fav'){ if(state.cur) toggleFav(); }
    else if(k==='picks'){ show(false); window.openPicks&&openPicks(); }
    else if(k==='rate'){ show(false); window.dispatchEvent(new KeyboardEvent('keydown',{key:'r'})); }
    else if(k==='movie'){ show(false); if(REEL_LIVE.on) reelJump(+d.dataset.m); }
  }
  /* Keys pressed in the menu are its own (Space or Enter on a focused button), not the simulation's. */
  M.addEventListener('keydown',e=>{ if(e.key==='Escape') show(false); else if(e.key.toLowerCase()==='m') show(false); e.stopPropagation(); });
  addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if(e.key.toLowerCase()==='m') window.toggleMenu();
    else if(e.key==='Escape'&&!M.hidden) show(false);
    else if(!M.hidden) setTimeout(sync,50);
  });
  canvas.addEventListener('pointerdown',()=>{ if(!M.hidden) show(false); });
  document.addEventListener('fullscreenchange',()=>{ if(!M.hidden) sync(); });

  /* The button shows while the mouse moves, and stays while the pointer is on it. */
  let hideT;
  const poke=()=>{
    if(window.IN_WALLPAPER||!M.hidden) return;
    btn.classList.add('show'); clearTimeout(hideT);
    hideT=setTimeout(function h(){ if(btn.matches(':hover')) hideT=setTimeout(h,500); else btn.classList.remove('show'); },2200);
  };
  addEventListener('mousemove',poke);
})();

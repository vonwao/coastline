'use strict';
/* ---- The menu ----
   The way from the simulation to everything else. Until now the page had only keys, and the other pages
   were reachable only from the guide, so opening index.html left no way to find them.
   A small Menu button shows in the top-left corner while the mouse moves, and goes with the pointer; M
   opens the menu too, and Esc or a click on the picture closes it. It holds:
     - this window's switches: calm, sound, following a real beach, full screen;
     - other ways to open it: the studio, following the clock, a ready-made scene (js/presets.js), a demo
       reel (js/reel.js), one time of day;
     - playing a reel, its movies, to jump to;
     - the helper pages in tools/ (the guide, films, comparisons, the TV player), when they're there. The
       public page carries only index.html, js/ and coasts/, so there it leaves them out.
   Not in the checks (?test) or in Wallpaper Engine, where it would pop up on the desktop. */
(function(){
  if(TEST) return;
  const st=document.createElement('style');
  st.textContent=`
  #menuBtn{position:fixed;left:14px;top:14px;z-index:6;background:rgba(8,14,17,.72);color:#e4eef0;border:1px solid #3a4c53;border-radius:6px;
    font:14px "Segoe UI",system-ui,sans-serif;padding:5px 12px;cursor:pointer;opacity:0;transition:opacity .4s;pointer-events:none}
  #menuBtn.show{opacity:1;pointer-events:auto}
  #menu{position:fixed;left:14px;top:14px;z-index:7;width:340px;max-height:calc(100% - 28px);overflow-y:auto;box-sizing:border-box;padding:12px 16px 14px;
    border-radius:10px;background:rgba(8,14,17,.9);color:#e4eef0;font:14px/1.45 "Segoe UI",system-ui,sans-serif;cursor:default}
  #menu[hidden]{display:none}
  #menu .top{display:flex;align-items:center;justify-content:space-between}
  #menu .top b{font-size:16px;font-weight:600}
  #menu h3{margin:12px 0 5px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#7f969d}
  #menu .row{display:flex;flex-wrap:wrap;gap:5px}
  #menu button,#menu a{background:#1b2428;color:inherit;border:1px solid #3a4c53;border-radius:5px;padding:4px 10px;font:inherit;font-size:13.5px;
    cursor:pointer;text-decoration:none;white-space:nowrap}
  #menu button:hover,#menu a:hover{background:#26343a}
  #menu button.on{background:#2d6470;border-color:#58a3b2}
  #menu .x{border:none;background:none;font-size:18px;line-height:1;padding:2px 6px;color:#9db0b6}
  #menu p{margin:10px 0 0;font-size:12.5px;color:#9db0b6}`;
  document.head.appendChild(st);

  const here=location.href.split(/[?#]/)[0];
  const open=q=>here+(q?'?'+q:'');
  /* Demo reels, with their length; and, while one plays, its movies. */
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const reels=Object.keys(REELS).map(id=>{ try{ const I=reelInfo(id); return {id,title:I.title,min:Math.round(I.total/60),desc:REELS[id].subtitle||''}; }catch(e){ return null; } }).filter(Boolean);
  const playing=reelLiveCheck();
  const btn=document.createElement('button'); btn.id='menuBtn'; btn.textContent='☰ Menu'; btn.title='Menu (M)';
  const M=document.createElement('div'); M.id='menu'; M.hidden=true;
  M.innerHTML=`
    <div class="top"><b>Coastline</b><button class="x" title="Close (Esc)">✕</button></div>
    <h3>This window</h3>
    <div class="row">
      <button data-do="calm" title="Long, slow shots joined by slow dissolves, for a screen left running (C)">Calm</button>
      <button data-do="sound" title="The sound of the sea (S)">Sound</button>
      <button data-do="beach" title="Follow a real beach's sea and sky, live (B)">A real beach…</button>
      <button data-do="full" title="Full screen (F, or double-click the picture)">Full screen</button>
    </div>
    <h3>Open as</h3>
    <div class="row">
      <a href="${open('studio=1')}" title="A panel beside the picture that edits the scene on screen: coast, camera, light, waves, water">Studio</a>
      <a href="${open('calm=1&clock=1')}" title="The light follows your own clock: morning, golden hour, twilight, then moonlight">Follow my clock</a>
      ${location.search?`<a href="${open('')}" title="The page with no options: the usual slideshow">Usual slideshow</a>`:''}
    </div>
    <h3>Ready-made scenes</h3>
    <div class="row">${PRESETS.map(P=>`<a href="${open('calm=1&preset='+P.id)}" title="${P.desc.replace(/"/g,'&quot;')} (calm)">${P.name}</a>`).join('')}</div>
    ${playing?`<h3>This reel: ${esc(playing.R.title)}</h3>
    <div class="row">${playing.R.movies.map((M,i)=>`<button data-do="movie" data-m="${i}" title="${esc(M.subtitle)}">${i+1}. ${esc(M.title)}</button>`).join('')}</div>`:''}
    <h3>Demo reels</h3>
    <div class="row">${reels.map(r=>`<a href="${open('reel='+r.id+'&sound=1')}" title="${esc(r.desc)} (${r.min} minutes, with sound)">${esc(r.title)}</a>`).join('')}</div>
    <h3>Time of day</h3>
    <div class="row">${[['sunrise','Sunrise'],['golden','Golden hour'],['sunset','Sunset'],['dusk','Dusk'],['moonlit','Moonlit night'],['starry','Starry night']]
      .map(([k,l])=>`<a href="${open('calm=1&light='+k)}" title="Calm, with this light in every shot">${l}</a>`).join('')}</div>
    <div id="menuTools" hidden>
      <h3>Other pages</h3>
      <div class="row">
        <a href="tools/tour.html" title="Everything that's been built, with a button for each to see it">Guide</a>
        <a href="tools/watch.html" title="Recorded films of the simulation, to watch and rate clips">Films</a>
        <a href="tools/compare.html" title="Before and after, side by side">Comparisons</a>
        <a href="tools/tv.html" title="The channel player for TVs, playing rendered calm films">TV player</a>
      </div>
    </div>
    <p>Keys: Space pause · ← → scenes (in a reel, movies) · L favourite · P play favourites · H stats · G fly the drone · M menu</p>
    <p style="opacity:.6;font-size:.85em">Sea sounds include "Oceanwavescrushing" by Luftrum (freesound.org), CC BY 3.0, and recordings in the public domain (sounds/CREDITS.md).</p>`;
  document.body.append(btn,M);

  /* The helper pages: always there in the project folder (file://); elsewhere, only if tools/ answers. */
  const tools=M.querySelector('#menuTools');
  if(location.protocol==='file:') tools.hidden=false;
  else fetch('tools/tour.html',{method:'HEAD'}).then(r=>{ tools.hidden=!r.ok; }).catch(()=>{});

  const sync=()=>{ M.querySelector('[data-do=calm]').classList.toggle('on',CALM);
    M.querySelector('[data-do=sound]').classList.toggle('on',SOUND.on);
    M.querySelector('[data-do=beach]').classList.toggle('on',LIVE.on&&!LIVE.clock); };
  const show=on=>{ M.hidden=!on; if(on){ btn.classList.remove('show'); sync(); } };
  window.toggleMenu=()=>show(M.hidden);
  btn.onclick=()=>show(true);
  M.querySelector('.x').onclick=()=>show(false);
  M.addEventListener('click',e=>{
    const d=e.target.closest('[data-do]'); if(!d) return;
    const k=d.dataset.do;
    if(k==='calm') toggleCalm();
    else if(k==='sound') toggleSound();
    else if(k==='beach'){ show(false); if(BP.hidden) toggleBeach(); return; }
    else if(k==='movie'){ show(false); if(REEL_LIVE.on) reelJump(+d.dataset.m); return; }
    else if(k==='full'){ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
    d.blur(); setTimeout(sync,50);
  });
  /* Keys pressed in the menu are its own (Space or Enter on a focused button), not the simulation's. */
  M.addEventListener('keydown',e=>{ if(e.key==='Escape') show(false); else if(e.key.toLowerCase()==='m') show(false); e.stopPropagation(); });
  addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if(e.key.toLowerCase()==='m') window.toggleMenu();
    else if(e.key==='Escape'&&!M.hidden) show(false);
  });
  canvas.addEventListener('pointerdown',()=>{ if(!M.hidden) show(false); });

  /* The button shows while the mouse moves, and stays while the pointer is on it. */
  let hideT;
  const poke=()=>{
    if(window.IN_WALLPAPER||!M.hidden) return;
    btn.classList.add('show'); clearTimeout(hideT);
    hideT=setTimeout(function h(){ if(btn.matches(':hover')) hideT=setTimeout(h,500); else btn.classList.remove('show'); },2200);
  };
  addEventListener('mousemove',poke);
})();

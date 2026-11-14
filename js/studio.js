'use strict';
/* ---- The studio (?studio=1): every lever of the scene on screen, in a panel ----
   The panel is built from SCHEMA (js/recipe.js), so a lever added there appears here. Whatever is on
   screen is what the panel edits: ← and → still browse scenes, and the panel follows. The shot loops
   instead of moving on. Scenes can be saved as recipes (files, text or a link) and collected into a
   playlist, which plays them in turn. The last scene worked on comes back when the studio is reopened. */
if(STUDIO) (function(){
  const LAST_KEY='coastline-studio-last-v1', LIST_KEY='coastline-studio-playlist-v1', DESC_KEY='coastline-studio-words-v1';
  const css=document.createElement('style');
  css.textContent=`
  #studio{position:fixed;right:0;top:0;bottom:0;width:372px;overflow-y:auto;background:rgba(8,13,16,.9);color:#dfe9ec;
    font:13px/1.4 "Segoe UI",system-ui,sans-serif;padding:10px 14px 40px;box-sizing:border-box;z-index:5}
  #studio[hidden]{display:none}
  #studio h2{font-size:13px;font-weight:600;margin:14px 0 4px;padding-top:8px;border-top:1px solid #24343b;color:#fff;letter-spacing:.02em}
  #studio .top{display:flex;align-items:center;gap:8px}
  #studio .top b{font-size:16px;flex:1}
  #studio .help{color:#8fa4aa;font-size:12px;margin:4px 0 0}
  #studio .row{display:grid;grid-template-columns:118px 1fr 64px;gap:6px;align-items:center;margin:2px 0}
  #studio .row label{color:#c3d3d7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help}
  #studio .row.off{opacity:.4}
  #studio input[type=range]{width:100%;margin:0;accent-color:#5fb3c2}
  #studio input[type=color]{width:100%;height:22px;padding:0 2px;background:#141d21;border:1px solid #33454c;border-radius:4px;box-sizing:border-box;cursor:pointer}
  #studio input[type=number],#studio input[type=text],#studio select,#studio textarea{background:#141d21;color:inherit;border:1px solid #33454c;border-radius:4px;font:inherit;font-size:12.5px;padding:2px 4px;box-sizing:border-box;width:100%}
  #studio textarea{height:120px;font:11px/1.35 Consolas,monospace;resize:vertical}
  #studio textarea.words{height:54px;font:12.5px/1.4 "Segoe UI",system-ui,sans-serif;margin-top:5px}
  #studio button{background:#1b2a30;color:inherit;border:1px solid #3a5059;border-radius:4px;font:inherit;font-size:12.5px;padding:3px 8px;cursor:pointer}
  #studio button:hover{background:#25383f}
  #studio button.on{background:#2d6470;border-color:#58a3b2}
  #studio .btns{display:flex;flex-wrap:wrap;gap:5px;margin:5px 0}
  #studio .fixed{display:grid;grid-template-columns:118px 1fr;gap:2px 6px;color:#9fb2b7;font-size:12px}
  #studio .warn{color:#e6c07a;font-size:12px;white-space:pre-wrap}
  #studio .pl{display:flex;flex-direction:column;gap:3px;margin:4px 0}
  #studio .pl div{display:flex;gap:5px;align-items:center}
  #studio .pl span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
  #studio .pl div.now span{color:#8fe0ee}
  #studio .presets{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:6px 0 4px}
  #studio .presets button{text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #studioTab{position:fixed;right:10px;top:10px;z-index:5;background:rgba(8,13,16,.8);color:#dfe9ec;border:1px solid #3a5059;border-radius:5px;font:13px "Segoe UI",system-ui,sans-serif;padding:4px 10px;cursor:pointer}`;
  document.head.append(css);
  const P=document.createElement('div'); P.id='studio';
  const tab=document.createElement('button'); tab.id='studioTab'; tab.textContent='Studio'; tab.hidden=true;
  document.body.append(P,tab);
  /* Keys typed in the panel are for the panel, not the simulation. */
  for(const ev of ['keydown','keyup']) P.addEventListener(ev,e=>e.stopPropagation());
  const el=(tag,props={},kids=[])=>{ const e=Object.assign(document.createElement(tag),props); e.append(...kids); return e; };
  const btn=(text,fn,title='')=>el('button',{textContent:text,title,onclick:fn,type:'button'});

  /* ---- Reading and setting each lever on the shot on screen ---- */
  const cur=()=>state.cur;
  function lightEdit(S){ const Li=LIGHTS[S.lightKey]; return Li?._preset?{preset:Li._preset,over:Object.assign({},Li._over)}:{preset:S.lightKey,over:{}}; }
  const FORMS=['high cliffs','low cliffs behind a platform','broad reef','crescent bay','broken coast','palm cove (granite)','alpine lake','real coast'];
  function getV(id){
    const S=cur(),L=S.L,[g,k]=id.split('.');
    if(id==='loc') return L.name;
    if(id==='camera.kind') return S.kind;
    if(g==='camera') return camKnobs(S)[k];
    if(id==='light.preset') return lightEdit(S).preset;
    if(g==='light') return lightGet(LIGHTS[S.lightKey],k);
    if(g==='waves') return waveGet(L,k);
    if(id==='water.sandColour') return L.waterOver?.sandColour||sandHex(L);
    if(g==='water') return L.waterOver?.[k]??1;
    if(id==='elements.greenery') return greenOf(S);
    if(id==='elements.flora') return S.opt?.flora||'coast';
    if(id==='elements.vegetation') return S.opt?.vegetation||'coast';
    if(id==='elements.cover') return S.opt?.cover||'coast';
    if(g==='elements') return S.opt?.[k]!==false;
    if(g==='sound') return S.sound?.[k]??1;
    if(id==='fixed.form') return L.real?'real coast':L.type===0?'tropical shore':L.type===1?'sandy surf beach':FORMS[L.form||0];
    if(id==='fixed.seed') return L.seed;
    if(id==='fixed.dx') return `${L.dx} m cells, ${L.nx} × ${L.nz} (${Math.round(L.domSize[0])} × ${Math.round(L.domSize[1])} m)`;
    if(id==='fixed.hmax') return L.hmax+' m';
  }
  function setV(id,v){
    const S=cur(),L=S.L,[g,k]=id.split('.');
    if(id==='loc'){ const L2=LOCATIONS.find(l=>l.name===v&&l.ready); if(L2) newShot(L2,S.kind); return; }
    if(id==='camera.kind'){ newShot(L,v); return; }
    if(g==='camera'){ setCamKnobs(S,{[k]:v}); return; }
    if(id==='light.preset'){ S.lightKey=v; return; }
    if(g==='light'){
      const E=lightEdit(S); E.over[k]=v;
      /* A lower sun needs more exposure, as the eye and camera adapt: keep the preset's own brightness
         against the usual curve for its sun height (skyLook in js/live.js). */
      if(k==='sunElevation'&&followExp.checked){ const B=LIGHTS[E.preset]; E.over.exposure=Math.min(40,Math.max(.05,skyLook(v).exposure*B.exposure/skyLook(B.el??30).exposure)); }
      S.lightKey=lightFor(Object.assign({preset:E.preset},E.over),L,[]); return;
    }
    if(g==='waves'){ applyWaves(L,{[k]:v},[]); return; }
    if(g==='water'){ const o=Object.assign({},L.waterOver||{}); o[k]=v; applyWater(L,o,[]); return; }
    if(g==='elements'){
      S.opt=Object.assign({},S.opt,{[k]:v}); if((k==='flora'||k==='cover'||k==='vegetation')&&v==='coast') delete S.opt[k];
      /* The plants near the drone are listed once per shot: list them again for the new mix. (A new
         vegetation is baked by the frame loop, about a second, and lists them again when it's done.) */
      if(k==='flora'||k==='greenery'||k==='cover'||k==='vegetation') S.meshes=undefined;
    }
    if(g==='sound'){ S.sound=Object.assign({},S.sound,{[k]:v}); }
  }
  /* A new path on a coast, keeping the light, elements and name of the shot on screen. */
  function newShot(L,kind,calm=false){
    const S0=cur(), S=calm?makeCalmShot(L,S0.lightKey):makeShot(L,S0.lightKey,kind);
    if(S0.opt) S.opt=Object.assign({},S0.opt);
    if(S0.sound) S.sound=Object.assign({},S0.sound);
    S.recipeName=S0.recipeName; S.t=0; S.hold=S0.hold;
    bakeLit(L,S.lightKey); cutTo(S,0); refresh(true);
  }

  /* ---- Controls, built from SCHEMA ---- */
  const ctl={};
  const followExp=el('input',{type:'checkbox',checked:true});
  const toSlider=(p,v)=>p.log?1000*Math.log(v/p.min)/Math.log(p.max/p.min):v;
  const fromSlider=(p,s)=>p.log?p.min*Math.pow(p.max/p.min,s/1000):+s;
  const fmt=(p,v)=>{ if(typeof v!=='number') return v; const d=p.step>=1?0:p.step>=.1?1:p.step>=.01?2:3; return v.toFixed(d); };
  let busy=null, throttleT=0, pend=null;
  function apply(id,v){
    /* Light and camera changes are drawn at most ten times a second while a slider moves. */
    pend=[id,v];
    const now=performance.now();
    if(now-throttleT>90){ throttleT=now; setV(...pend); pend=null; after(id); }
    else setTimeout(()=>{ if(pend){ throttleT=performance.now(); const [a,b]=pend; pend=null; setV(a,b); after(a); } },100);
  }
  function after(id){ refresh(false,id); redraw(); saveLast(); }
  function rowFor(p){
    const lab=el('label',{textContent:p.label,title:p.desc+(p.unit?` (${p.unit})`:'')+(p.applies==='gradual'?' Takes effect gradually.':'')});
    if(p.applies==='fixed'){ const v=el('span'); ctl[p.id]={p,set:x=>v.textContent=x}; return [lab,v]; }
    if(p.type==='choice'){
      const s=el('select'); s.onchange=()=>{ setV(p.id,s.value); after(p.id); };
      ctl[p.id]={p,el:s,set:x=>{
        const opts=p.id==='loc'?LOCATIONS.filter(l=>l.ready).map(l=>[l.name,l.name]):p.id==='light.preset'?Object.keys(LIGHTS).filter(k=>!k.startsWith('r:')&&k!=='test').map(k=>[k,LIGHTS[k].label?`${k} (${LIGHTS[k].label})`:k])
          :p.id==='elements.flora'?p.choices.map(c=>[c,c==='coast'?`as the coast (${FLORAS[cur().L.flora??cur().L.type]})`:c]):p.id==='elements.cover'?p.choices.map(c=>[c,c==='coast'?`as the coast (${COVERS[coverOf({L:cur().L})]})`:c])
          :p.id==='elements.vegetation'?p.choices.map(c=>[c,c==='coast'?`as the coast (${VEG_PRESETS[vegOf({L:cur().L})].name})`:VEG_PRESETS[c].name]):p.choices.map(c=>[c,c]);
        if(s.dataset.opts!==JSON.stringify(opts)){ s.replaceChildren(...opts.map(([v,t])=>el('option',{value:v,textContent:t}))); s.dataset.opts=JSON.stringify(opts); }
        s.value=x; }};
      const r=el('div',{className:'row'},[lab,s,el('span')]); return r;
    }
    if(p.type==='colour'){
      const c=el('input',{type:'color'}), t=el('span');
      c.oninput=()=>{ t.textContent=c.value; apply(p.id,c.value); };
      ctl[p.id]={p,el:c,set:x=>{ if(document.activeElement!==c) c.value=x; t.textContent=x; }};
      return el('div',{className:'row'},[lab,c,t]);
    }
    if(p.type==='bool'){
      const c=el('input',{type:'checkbox'}); c.onchange=()=>{ setV(p.id,c.checked); after(p.id); };
      ctl[p.id]={p,el:c,set:x=>c.checked=x};
      return el('div',{className:'row'},[lab,el('div',{},[c]),el('span')]);
    }
    const r=el('input',{type:'range',min:p.log?0:p.min,max:p.log?1000:p.max,step:p.log?1:p.step});
    const n=el('input',{type:'number',min:p.min,max:p.max,step:p.step});
    r.oninput=()=>{ busy=p.id; const v=fromSlider(p,r.value); n.value=fmt(p,v); if(p.applies==='gradual') return; apply(p.id,v); };
    r.onchange=()=>{ busy=null; const v=fromSlider(p,r.value); if(p.applies==='gradual'){ setV(p.id,v); after(p.id); } };
    n.onchange=()=>{ const v=Math.min(p.max,Math.max(p.min,+n.value)); if(isFinite(v)){ setV(p.id,v); after(p.id); } };
    ctl[p.id]={p,el:r,set:x=>{ if(busy!==p.id){ r.value=toSlider(p,x); } n.value=fmt(p,x); }};
    return el('div',{className:'row'},[lab,r,n]);
  }

  /* ---- Building the panel ---- */
  const T=(t,c='')=>el('div',{className:c,textContent:t});
  const top=el('div',{className:'top'},[el('b',{textContent:'Studio'}),btn('Hide',()=>{ P.hidden=true; tab.hidden=false; },'Hide this panel')]);
  P.append(top,T('Whatever is on screen is what you edit here. ← → browse scenes, H shows stats. Hover a name to see what it does. The shot loops; the sea goes on.','help'));
  tab.onclick=()=>{ P.hidden=false; tab.hidden=true; };
  /* Ready-made scenes (js/presets.js). A mood plays its few scenes in turn; whatever is on screen can be
     edited as usual. Playing one doesn't touch the saved playlist below. */
  const presetD=el('div',{className:'presets'});
  const presetInfo=T('Pick a mood to play it: each is a few scenes that take turns, with a new camera path every time round.','help');
  let presetSel=null;
  const presetActs=el('div',{className:'btns',hidden:true},[
    btn('Hold this scene',()=>{ stopList(); },'Stop moving on, to edit the scene on screen'),
    btn('Add to playlist',()=>{ if(presetSel) addToList(presetSel.recipes); },'Put this mood\'s scenes in the playlist below'),
    btn('Copy venue link',()=>{ if(presetSel) copy(presetLink(presetSel),'Link copied: it plays this mood in calm mode'); },'A link that plays just this mood, in calm mode, for a screen left running')]);
  for(const Pr of PRESETS){ const b=btn(Pr.name,()=>playPreset(Pr),Pr.desc); b.dataset.id=Pr.id; presetD.append(b); }
  P.append(el('h2',{textContent:'Ready-made scenes'}),presetD,presetInfo,presetActs);
  function playPreset(Pr){
    presetSel=Pr; presetPlay(Pr);
    const S=recipeNext(cur()); if(S){ S.t=0; bakeLit(S.L,S.lightKey); cutTo(S,0); }
    presetInfo.textContent=Pr.desc; presetActs.hidden=false; refresh(true);
  }
  /* Scene and time */
  const playB=btn('Stop camera',()=>{ const S=cur(); S.hold=!S.hold; refresh(); },'Stop or start the drone; the sea keeps moving');
  const seaB=btn('Freeze sea',()=>{ state.paused=!state.paused; refresh(); },'Freeze everything, sea included (Space)');
  const scrub=el('input',{type:'range',min:0,max:1000,step:1});
  const tRead=el('span');
  scrub.oninput=()=>{ const S=cur(); S.t=scrub.value/1000*S.dur; busy='scrub'; redraw(); tRead.textContent=`${S.t.toFixed(1)} s`; };
  scrub.onchange=()=>{ busy=null; };
  const g0=SCHEMA.find(g=>g.group==='scene');
  P.append(el('h2',{textContent:'Scene'}),...g0.params.map(rowFor),
    el('div',{className:'btns'},[btn('Random scene',()=>{ const S=chooseNext(cur()); S.t=0; cutTo(S,0); refresh(true); },'A new scene, chosen as the slideshow would'),
      btn('New path',()=>newShot(cur().L,cur().kind),'Another path of the same kind on this coast'),
      btn('Calm path',()=>newShot(cur().L,null,true),'A long, slow path, as calm mode makes them')]),
    el('div',{className:'row'},[el('label',{textContent:'Time in shot',title:'Where along its path the camera is'}),scrub,tRead]),
    el('div',{className:'btns'},[playB,seaB]));
  /* Describe a scene in words and let any chat AI write the recipe (recipePrompt in js/recipe.js). */
  const descI=el('textarea',{className:'words',placeholder:'Describe a scene, for example: a stormy dusk over a rocky cove, a slow low pass along the surf'});
  const replyI=el('textarea',{className:'words',spellcheck:false,placeholder:'Paste the AI\'s reply here'});
  const aiWarn=el('div',{className:'warn'});
  try{ descI.value=localStorage.getItem(DESC_KEY)||''; }catch(e){}
  descI.oninput=()=>{ try{ localStorage.setItem(DESC_KEY,descI.value); }catch(e){} };
  P.append(el('h2',{textContent:'Describe a scene'}),
    T('Write what you\'d like to see. "Copy prompt for an AI" copies instructions with every setting and your words: paste them into any chat AI (Claude, ChatGPT…), paste its reply in the second box and press "Use the reply".','help'),
    descI,el('div',{className:'btns'},[btn('Copy prompt for an AI',copyPrompt,'Copies complete instructions with your description, to paste into a chat AI')]),
    replyI,el('div',{className:'btns'},[btn('Use the reply',()=>useReply(replyI.value),'Read the recipe in the AI\'s reply and play it')]),aiWarn);
  /* A path set by hand is never moved by itself (that would fight the sliders), but if rock or land
     stands across the picture somewhere along it, a note says where, and "Fix path" finds the nearest
     clear path (pathCheck and fitPath in js/recipe.js). */
  const pathD=el('div',{className:'warn'}), fixB=btn('Fix path',fixPath,'Move the camera as little as will clear the view, all along the path');
  const pathBtns=el('div',{className:'btns'},[fixB]);
  let pathMsg='';
  function pathNote(){
    const c=pathCheck(cur());
    pathD.textContent=pathMsg||(c.ok?'':pathTrouble(c.worst)[0].toUpperCase()+pathTrouble(c.worst).slice(1)+'.');
    pathBtns.style.display=c.ok?'none':'';
  }
  function fixPath(){
    const S=cur(), f=fitPath(S);
    pathMsg=!f?'No path near this one is clear: try another heading or height, or "New path".':f.moves.length?fitNote(f)+'.':'';
    after('camera'); setTimeout(()=>{ pathMsg=''; },6000);
  }
  for(const g of SCHEMA){
    if(g.group==='scene') continue;
    const h=el('h2',{textContent:g.label});
    if(g.group==='fixed'){ P.append(h,el('div',{className:'fixed'},g.params.flatMap(rowFor))); continue; }
    P.append(h,...g.params.map(rowFor));
    if(g.group==='camera') P.append(pathD,pathBtns);
    if(g.group==='light') P.append(el('div',{className:'row'},[el('label',{textContent:'Exposure follows sun',title:'When the sun height changes, set the exposure to suit it, as a camera would'}),el('div',{},[followExp]),el('span')]),
      el('div',{className:'btns'},[btn('Back to the preset',()=>{ const S=cur(); S.lightKey=lightEdit(S).preset; after('light'); },'Undo the changes to this lighting setup')]));
    if(g.group==='waves') P.append(T('New waves roll in from offshore over half a minute or so.','help'),
      el('div',{className:'btns'},[btn('This coast\'s usual waves',()=>{ waveLayer(cur().L,'recipe',null); after('waves'); })]));
    if(g.group==='water') P.append(el('div',{className:'btns'},[btn('As this coast\'s water',()=>{ applyWater(cur().L,{},[]); after('water'); },'Clarity, foam, ripples and sand as this coast has them')]));
    if(g.group==='sound') P.append(T('Heard with sound on (S). Each scene keeps its own levels.','help'),
      el('div',{className:'btns'},[btn('Usual levels',()=>{ delete cur().sound; after('sound'); })]));
  }
  /* Recipes */
  const nameI=el('input',{type:'text',placeholder:'A name for this scene (optional)'});
  nameI.oninput=()=>{ cur().recipeName=nameI.value.trim()||undefined; saveLast(); };
  const txt=el('textarea',{spellcheck:false,title:'The scene as a recipe. Edit it and press "Use this text".'});
  const warnD=el('div',{className:'warn'});
  const fileI=el('input',{type:'file',accept:'.json,application/json',hidden:true});
  fileI.onchange=async()=>{ const f=fileI.files[0]; fileI.value=''; if(!f) return; try{ const j=JSON.parse(await f.text()); if(Array.isArray(j)) addToList(j); else loadRecipe(j); }catch(e){ warn('Could not read that file: '+e.message); } };
  P.append(el('h2',{textContent:'Recipe'}),nameI,
    el('div',{className:'btns'},[btn('Save file',()=>download(recipeName()+'.json',recipeFromShot(cur())),'Save this scene as a recipe file in Downloads'),
      btn('Load file',()=>fileI.click(),'Open a recipe file (or a playlist or favourites file, which go to the playlist)'),
      btn('Copy text',()=>copy(JSON.stringify(recipeFromShot(cur()),null,1),'Recipe copied')),
      btn('Copy link',()=>copy(linkFor(recipeFromShot(cur())),'Link copied: it opens this scene'),'A link that plays this scene by itself')]),
    txt,el('div',{className:'btns'},[btn('Use this text',()=>{ try{ loadRecipe(JSON.parse(txt.value)); }catch(e){ warn('That isn\'t a recipe: '+e.message); } },'Load the recipe in the box above, edited or pasted')]),
    warnD,fileI);
  /* Playlist */
  const listD=el('div',{className:'pl'});
  const playAllB=btn('Play all',()=>{ if(PLAYLIST.on) stopList(); else playList(); },'Play the playlist in turn, as the slideshow would');
  const listFile=el('input',{type:'file',accept:'.json,application/json',hidden:true});
  listFile.onchange=async()=>{ const f=listFile.files[0]; listFile.value=''; if(!f) return; try{ const j=JSON.parse(await f.text()); addToList(Array.isArray(j)?j:[j]); }catch(e){ warn('Could not read that file: '+e.message); } };
  P.append(el('h2',{textContent:'Playlist'}),
    el('div',{className:'btns'},[btn('Add this scene',()=>addToList([recipeFromShot(cur())])),playAllB,
      btn('Export',()=>download('coastline-playlist.json',loadList()),'Save the playlist to a file in Downloads'),
      btn('Import',()=>listFile.click(),'Add recipes from a file: a playlist, a recipe or saved favourites'),
      btn('Add favourites',()=>{ const f=loadFavs(); if(!f.length) warn('No favourites saved yet (press L on a scene you like).'); else addToList(f); },'Add the scenes saved with L'),
      btn('Clear',()=>{ saveList([]); drawList(); })]),listD,listFile);

  /* ---- Recipes in and out ---- */
  function recipeName(){ return (cur().recipeName||`${cur().L.name} ${cur().kind}`).replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-').toLowerCase()||'scene'; }
  function linkFor(R){ const u=new URL(location.href); u.search=''; u.searchParams.set('recipe',recipeToLink(R)); if(R.coast) u.searchParams.set('coast',R.coast); return u.href; }
  function download(name,obj){
    const a=el('a',{href:URL.createObjectURL(new Blob([JSON.stringify(obj,null,1)],{type:'application/json'})),download:name});
    document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); toast('Saved '+name+' to Downloads');
  }
  async function copy(t,msg){ try{ await navigator.clipboard.writeText(t); toast(msg); }catch(e){ txt.value=t; txt.select(); warn('Copying was refused by the browser: the text is in the box, selected.'); } }
  function warn(m){ warnD.textContent=m; }
  function loadRecipe(R){
    const S=shotFromRecipe(R); S.t=0; bakeLit(S.L,S.lightKey); cutTo(S,0);
    warn(S.warnings.length?'Changed while loading:\n· '+S.warnings.join('\n· '):''); refresh(true); saveLast();
    return S;
  }
  async function copyPrompt(){
    const d=descI.value.trim();
    if(!d){ aiWarn.textContent='Write a description first.'; descI.focus(); return; }
    const t=recipePrompt(d);
    try{ await navigator.clipboard.writeText(t); toast('Prompt copied: paste it into a chat AI'); aiWarn.textContent=`Copied (${t.length} characters). Paste it into a chat AI, then paste the reply below.`; }
    catch(e){ replyI.value=t; replyI.focus(); replyI.select(); aiWarn.textContent='The browser refused to copy: the prompt is in the box below, selected. Copy it (Ctrl+C), paste it into a chat AI, then replace it with the reply.'; }
  }
  /* The AI's reply: the recipe in it is checked as any recipe is. A list of recipes goes to the playlist,
     and the first is shown. */
  function useReply(text){
    let R;
    try{ R=recipeFromReply(text); }catch(e){ aiWarn.textContent=e.message; return null; }
    let more='';
    if(Array.isArray(R)){ addToList(R); more=` The reply held ${R.length} recipes: all went to the playlist, and the first is showing.`; R=R[0]; }
    let S;
    try{ S=loadRecipe(R); }catch(e){ aiWarn.textContent='That isn\'t a recipe: '+e.message; return null; }
    /* A recipe with no name of its own is named after the description. */
    if(!S.recipeName&&descI.value.trim()){ S.recipeName=descI.value.trim().slice(0,60); refresh(); saveLast(); }
    aiWarn.textContent=(S.warnings.length?`Playing "${S.recipeName||S.L.name}", with changes:\n· `+S.warnings.join('\n· '):`Playing "${S.recipeName||S.L.name}", as written.`)+more;
    return S;
  }
  const loadList=()=>{ try{ return JSON.parse(localStorage.getItem(LIST_KEY)||'[]'); }catch(e){ return []; } };
  const saveList=l=>{ try{ localStorage.setItem(LIST_KEY,JSON.stringify(l)); }catch(e){ warn('Could not save the playlist in this browser.'); } };
  function addToList(items){
    const l=loadList(); let n=0;
    for(const it of items){ try{ l.push(normRecipe(it)); n++; }catch(e){} }
    saveList(l); drawList(); toast(`Added ${n} to the playlist (${l.length})`);
  }
  function itemLabel(R){ const c=R.camera||{}; return R.name||`${R.loc||'any coast'} · ${c.kind||'any shot'} · ${R.light?.preset||'any light'}`; }
  function drawList(){
    const l=loadList();
    listD.replaceChildren(...(l.length?l.map((R,i)=>{
      const d=el('div',{className:PLAYLIST.on&&!PLAYLIST.preset&&PLAYLIST.i===i?'now':''},[el('span',{textContent:`${i+1}. ${itemLabel(R)}`,title:JSON.stringify(R)}),
        btn('▶',()=>{ PLAYLIST.i=i; loadRecipe(R); },'Show this one'),
        btn('✕',()=>{ const m=loadList(); m.splice(i,1); saveList(m); drawList(); },'Take it out')]);
      return d; }):[T('Empty. "Add this scene" puts the scene on screen here.','help')]));
  }
  function playList(){
    const l=loadList(); if(!l.length){ warn('The playlist is empty.'); return; }
    Object.assign(PLAYLIST,{on:true,list:l,i:-1,preset:null});
    const S=recipeNext(cur()); if(S){ S.t=0; bakeLit(S.L,S.lightKey); cutTo(S,0); }
    refresh(true);
  }
  function stopList(){ PLAYLIST.on=false; refresh(); }

  /* ---- Keeping the panel in step with the screen ---- */
  let shown=null;
  function refresh(all=false,skip=null){
    const S=cur(); if(!S) return;
    for(const id in ctl){
      if(id===skip&&!all) continue;
      const c=ctl[id],v=getV(id);
      if(v!==undefined) c.set(v);
      const off=(c.p.notFor&&c.p.notFor.includes(S.kind))||(id==='elements.spray'&&!S.L.sp)||(id==='elements.breakers'&&!S.L.brk);
      if(c.el){ c.el.disabled=off; c.el.closest('.row')?.classList.toggle('off',off); }
    }
    nameI.value=S.recipeName||'';
    playB.textContent=S.hold?'Start camera':'Stop camera'; playB.classList.toggle('on',!!S.hold);
    seaB.classList.toggle('on',state.paused); seaB.textContent=state.paused?'Unfreeze':'Freeze sea';
    const own=PLAYLIST.on&&!PLAYLIST.preset;
    playAllB.classList.toggle('on',own); playAllB.textContent=own?'Stop playlist':'Play all';
    for(const b of presetD.children) b.classList.toggle('on',PLAYLIST.on&&PLAYLIST.preset===b.dataset.id);
    if(document.activeElement!==txt) txt.value=JSON.stringify(recipeFromShot(S),null,1);
    if(S.L.grid) pathNote();
    if(all) drawList();
  }
  /* With the sea frozen nothing is drawn, so changes are drawn here. */
  function redraw(){
    if(!state.paused) return;
    const S=cur(); bakeLit(S.L,S.lightKey);
    renderView(S,Math.min(S.t/S.dur,1.2),RT.ldrA.f);
    use(PR.final,{tI:RT.ldrA.t,uTx:[1/RT.w,1/RT.h],uTime:simTime%FFT_P,uSharp:state.scale<.99?.34:.2}); drawTo(null,canvas.width,canvas.height);
  }
  let saveT=0;
  function saveLast(){ clearTimeout(saveT); saveT=setTimeout(()=>{ try{ localStorage.setItem(LAST_KEY,JSON.stringify(recipeFromShot(cur()))); }catch(e){} },400); }
  function tick(){
    const S=cur();
    if(S){
      if(S!==shown){ shown=S; refresh(true); if(!S.warnings) warn(''); }
      if(busy!=='scrub'){ scrub.value=Math.round(Math.min(S.t/S.dur,1)*1000); tRead.textContent=`${S.t.toFixed(1)} s`; }
      if(PLAYLIST.on&&!PLAYLIST.preset) for(const [i,d] of [...listD.children].entries()) d.classList?.toggle('now',PLAYLIST.i===i);
    }
    setTimeout(tick,250);
  }
  /* Start once the simulation is running. */
  (function wait(){
    if(!window.COAST||!COAST.ready){ setTimeout(wait,200); return; }
    document.getElementById('hint').style.display='none';
    /* Opened with ?preset=: that mood is playing. */
    if(PRESET0){ presetSel=PRESET0; presetInfo.textContent=PRESET0.desc; presetActs.hidden=false; }
    refresh(true); tick();
    if(cur().warnings?.length) warn('Changed while loading:\n· '+cur().warnings.join('\n· '));
  })();
  /* For checks and for scripts: the same levers the panel uses. */
  window.STUDIO_API={recipe:()=>recipeFromShot(cur()),load:loadRecipe,set:(id,v)=>{ setV(id,v); after(id); },get:getV,link:()=>linkFor(recipeFromShot(cur())),
    list:loadList,add:R=>addToList([R]),play:playList,stop:stopList,fixPath:()=>{ fixPath(); return {note:pathD.textContent,ok:pathCheck(cur()).ok}; },
    pathNote:()=>pathD.textContent,
    preset:id=>{ const Pr=presetById(id); if(Pr) playPreset(Pr); return !!Pr; },
    prompt:recipePrompt,reply:t=>{ replyI.value=t; const S=useReply(t); return {ok:!!S,warnings:S?S.warnings:null,message:aiWarn.textContent}; }};
})();

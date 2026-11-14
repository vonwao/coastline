'use strict';
/* ---- Wallpaper Engine ----
   project.json makes this folder a Wallpaper Engine web wallpaper: in Wallpaper Engine, choose "Open
   wallpaper", then "Open from file", and pick index.html (or project.json). Wallpaper Engine can't pass
   settings in the address the way ?calm=1 does, so it hands its own settings to the page through this
   listener, at startup and whenever they're changed:
     calm    long, slow shots and slow dissolves (on by default)
     sound   the sea's sound (off by default)
     beach   latitude, longitude and, optionally, the direction the beach faces, to follow that beach's
             real sea and sky; empty for the usual made-up conditions
   This was written without Wallpaper Engine to test it in: the page's side was tested by calling the
   listener the way Wallpaper Engine's documentation describes. */
window.wallpaperPropertyListener={
  applyUserProperties(p){
    /* On the desktop the menu button (js/menu.js) would pop up whenever the mouse moved. */
    window.IN_WALLPAPER=true;
    if(p.calm) CALM=!!p.calm.value;
    if(p.sound&&!!p.sound.value!==SOUND.on) toggleSound();
    if(p.beach){
      const [la,lo,fa]=String(p.beach.value||'').split(',').map(s=>parseFloat(s));
      if(isFinite(la)&&isFinite(lo)) liveStart(la,lo,isFinite(fa)?fa:null);
      else liveStop();
    }
  }
};

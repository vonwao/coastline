/* Night Coast: blue hour, moonrise and moonlight, then the first glow before dawn. About 13 minutes; for a
   bar after dark. 29 June 2026 is a full moon. (A moonless "Under the Stars" was tried and left out: five
   near-black, near-identical shots.) The format is in REELS.md. */
REEL({
  id: 'night-coast',
  title: 'Night Coast',
  subtitle: 'From blue hour to first light',
  seed: 7,
  date: '2026-06-29',
  movies: [
    { title: 'Blue Hour', coast: 'Crescent bay', length: 180, time: ['sunset+15', 'sunset+40'], weather: 'fair',
      camera: { kinds: ['angled'], pace: 'slow' },
      sound: { surf: 0.8, music: { style: 'dusk', level: 0.3 } } },
    { title: 'Moonrise', coast: 'Broken coast', length: 200, time: ['20:50', '21:30'], weather: 'clear',
      camera: { kinds: ['angled'], pace: 'slow' },
      sound: { surf: 0.8, insects: 0.3, music: { style: 'night', level: 0.3 } } },
    { title: 'Moonlight on the Cliffs', coast: 'Sea cliffs', length: 200, time: ['23:30', '00:10'], weather: 'fair',
      camera: { kinds: ['angled'], pace: 'slow' },
      sound: { surf: 0.8, music: { style: 'night', level: 0.3 } } },
    { title: 'Before Dawn', coast: 'Rock shelf', length: 180, date: '2026-06-30', time: ['sunrise-45', 'sunrise-15'], weather: 'fair',
      camera: { kinds: ['angled'], pace: 'slow', close: 'rise' },
      sound: { surf: 0.7, insects: 0.2, birds: 0.15, music: { style: 'dawn', level: 0.25 } } },
  ],
});

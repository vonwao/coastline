/* Surf and Stone: a big swell on rocky coasts, with faster shots. About 13 minutes. The format is in
   REELS.md. */
REEL({
  id: 'surf-and-stone',
  title: 'Surf and Stone',
  subtitle: 'A big swell on a rocky coast',
  seed: 11,
  shot: [25, 45],
  movies: [
    { title: 'The Swell Arrives', coast: 'Surge reef', length: 150, time: ['09:30', '10:00'], weather: 'fair', waves: 'big',
      camera: { kinds: { angled: 2, top: 2 }, pace: 'lively', open: 'wide' },
      sound: { surf: 1.2 } },
    { title: 'White Water', coast: 'Rock shelf', length: 150, time: ['11:00', '11:30'], weather: 'clear', waves: 'big',
      camera: { kinds: { top: 3, angled: 2 }, pace: 'lively' },
      sound: { surf: 1.3 } },
    { title: 'Cliffs in the Wind', coast: 'Sea cliffs', length: 170, time: ['14:00', '14:40'], weather: 'cloudy', waves: 'huge',
      camera: { kinds: ['angled'], pace: 'lively' },
      sound: { surf: 1.2, wind: 1.4 } },
    { title: 'The Long Beach', coast: 'Long sand coast', length: 150, time: ['16:30', '17:00'], weather: 'fair', waves: 'big',
      camera: { kinds: { angled: 2, top: 2 } },
      sound: { surf: 1.1 } },
    { title: 'Last Sets', coast: 'Broken coast', length: 170, time: ['sunset-50', 'sunset-20'], weather: 'fair', waves: 'big',
      camera: { kinds: { angled: 3, canopy: 1 }, close: 'rise' },
      sound: { surf: 1.1, music: { style: 'dusk', level: 0.2 } } },
  ],
});

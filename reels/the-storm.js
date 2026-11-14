/* The Storm: an afternoon on a rocky coast as a storm builds, breaks and clears into golden light.
   About 16 minutes. The format is in REELS.md. */
REEL({
  id: 'the-storm',
  title: 'The Storm',
  subtitle: 'An afternoon on the rocks',
  seed: 3,
  date: '2026-09-22',
  movies: [
    { title: 'Before', coast: 'Crescent bay', length: 150, time: ['13:30', '14:00'], weather: 'fair',
      camera: { kinds: { angled: 3, top: 1 }, open: 'wide' },
      sound: { birds: 0.25 } },
    { title: 'Clouds Gather', coast: 'Broken coast', length: 180, time: ['14:20', '14:50'], weather: ['cloudy', 'overcast'], waves: 'big',
      camera: { kinds: ['angled'] },
      sound: { wind: 1.3, music: { style: 'storm', level: 0.2 } } },
    { title: 'The Storm', coast: 'Sea cliffs', length: 240, time: ['15:00', '15:30'], weather: 'storm', waves: 'huge',
      camera: { kinds: { angled: 3, top: 1 }, pace: 'lively' },
      sound: { wind: 1.7, rain: 0.7 } },
    { title: 'It Passes', coast: 'Surge reef', length: 180, time: ['16:00', '16:30'], weather: ['storm', 'cloudy'], waves: 'big',
      camera: { kinds: { angled: 2, top: 1 } },
      sound: { wind: 1.3, rain: 0.3 } },
    { title: 'After the Rain', coast: 'Sea cliffs', length: 210, time: ['sunset-45', 'sunset-10'], weather: ['cloudy', 'fair'], waves: 'big',
      camera: { kinds: ['angled'], pace: 'slow', close: 'rise' },
      sound: { music: { style: 'dusk', level: 0.3 } } },
  ],
});

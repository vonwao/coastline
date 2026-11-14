/* Along the Shore: a summer day on the coast, from morning to the blue hour, in twenty minutes. For the
   first 4K video on YouTube (PLAN.md B2, cut to 20 minutes on 6 November). Daytime beaches show the people
   (walkers in the morning and evening, sunbathers at midday, surfers in the line-up), the flights over the
   tree line, then the rugged coasts in low sun. Natural sounds only, no music. The day is 29 June 2026,
   a full moon. The format is in REELS.md. */
REEL({
  id: 'along-the-shore',
  title: 'Along the Shore',
  subtitle: 'A summer day on the coast',
  seed: 5,
  date: '2026-06-29',
  shot: [35, 65],
  movies: [
    { title: 'Morning', coast: 'Crescent bay', length: 150, time: ['sunrise+30', 'sunrise+70'], weather: 'fair',
      camera: { kinds: { angled: 3, top: 1 }, open: 'wide', pace: 'slow' },
      sound: { surf: 0.9, birds: 0.35 } },
    { title: 'Morning Swell', coast: 'Surf beach', length: 150, time: ['08:40', '09:20'], weather: 'clear',
      camera: { kinds: { angled: 3, top: 1, crossing: 1 } },
      sound: { surf: 1, birds: 0.2 } },
    { title: 'The Lagoon', coast: 'Tropical lagoon', length: 150, time: ['10:40', '11:10'], weather: 'clear',
      camera: { kinds: { angled: 2, crossing: 2, top: 1 }, pace: 'slow' },
      sound: { surf: 0.7, birds: 0.25 } },
    { title: 'Over the Trees', coast: 'Palm cove', length: 150, time: ['12:20', '12:50'], weather: 'fair',
      camera: { kinds: { crossing: 3, canopy: 1, angled: 1 }, pace: 'slow' },
      sound: { surf: 0.8, birds: 0.3 } },
    { title: 'Afternoon', coast: 'Long sand coast', length: 150, time: ['15:20', '16:00'], weather: 'fair',
      camera: { kinds: { angled: 3, crossing: 1, top: 1 } },
      sound: { surf: 1, wind: 0.8 } },
    { title: 'Golden Hour', coast: 'Broken coast', length: 150, time: ['sunset-70', 'sunset-45'], weather: 'fair',
      camera: { kinds: { angled: 4, canopy: 1 }, pace: 'slow' },
      sound: { surf: 0.9, birds: 0.2 } },
    { title: 'Sunset', coast: 'Sea cliffs', length: 150, time: ['sunset-30', 'sunset+5'], weather: 'fair',
      camera: { kinds: ['angled'], pace: 'slow' },
      sound: { surf: 1, wind: 0.5 } },
    { title: 'Blue Hour', coast: 'Rock shelf', length: 150, time: ['sunset+12', 'sunset+40'], weather: 'clear',
      camera: { kinds: ['angled'], pace: 'slow', close: 'rise' },
      sound: { surf: 0.8, insects: 0.3 } },
  ],
});

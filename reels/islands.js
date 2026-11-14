/* Islands: clear water, white sand and palms, from morning to evening. About 15 minutes; for a spa or a
   bright room. The format is in REELS.md. */
REEL({
  id: 'islands',
  title: 'Islands',
  subtitle: 'Clear water, white sand, palms',
  seed: 5,
  movies: [
    { title: 'Turquoise', coast: 'Tropical shallows', length: 160, time: ['09:00', '09:30'], weather: 'clear', waves: 'small',
      camera: { kinds: { top: 2, angled: 1 }, pace: 'slow', open: 'reveal' }, water: { clarity: 1.3 },
      sound: { surf: 0.7, birds: 0.25, music: { style: 'day', level: 0.25 } } },
    { title: 'The Lagoon', coast: 'Tropical lagoon', length: 180, time: ['11:00', '11:30'], weather: 'clear',
      camera: { kinds: { top: 2, angled: 2 } },
      sound: { surf: 0.7, music: { style: 'day', level: 0.25 } } },
    { title: 'Palm Cove', coast: 'Palm cove', length: 180, time: ['13:30', '14:00'], weather: 'fair',
      camera: { kinds: { angled: 2, canopy: 2 } },
      sound: { surf: 0.8, birds: 0.3 } },
    { title: 'Late Light on the Lagoon', coast: 'Tropical lagoon', length: 170, time: ['sunset-75', 'sunset-45'], weather: 'fair',
      camera: { kinds: { angled: 3, top: 1 }, pace: 'slow' },
      sound: { surf: 0.7, music: { style: 'dusk', level: 0.25 } } },
    { title: 'Evening in the Cove', coast: 'Palm cove', length: 190, time: ['sunset-20', 'sunset+15'], weather: 'fair',
      camera: { kinds: ['angled'], pace: 'slow', close: 'rise' },
      sound: { surf: 0.7, insects: 0.2, music: { style: 'dusk', level: 0.3 } } },
  ],
});

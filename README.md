# Coastline

A live, never-repeating simulation of ocean water meeting the shore, seen from a drone. It runs in the
browser on the graphics card: the waves are simulated, not looped.

**Open it:** https://vonwao.github.io/coastline/ (works best in Chrome or Edge on a computer with decent graphics; startup takes
about 15 seconds). Press F for full screen, S for sound, C for calm mode, B to follow a real beach, G to
fly the drone yourself, H for stats, → for the next scene.

Address options: `?calm=1`, `?sound=1` (needs a click first), `?live=<latitude>,<longitude>[,<facing>]`
to follow a real beach's sea and sky, `?coast=pointlobos` (or `malibu`, `bondi`, `nazare`) for the
real-coast test.

This repository holds only the published page, built from a private project (version f8ff320).

## Credits

- Forecasts, and place search: [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0), asked for from
  your browser, with only the coordinates or the typed name sent.
- Real-coast test elevation data: NOAA NCEI coastal elevation models (public domain); Copernicus
  WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under
  COPERNICUS by the European Union and ESA, all rights reserved; EMODnet Bathymetry (CC BY 4.0).

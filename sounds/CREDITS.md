# Sea recordings: credits

The sea's sound (`js/sound.js`) is made from four field recordings from Wikimedia Commons. They were
downloaded on 5 November 2026, with no account. `tools/seasounds.js` cuts them into the pieces in
`sounds/sea.js`, filters out the wind rumble below the sea's own sound, and brings them to one loudness.
The originals are not kept in the project; the links below lead to them.

Three are free of any conditions (CC0 or public domain). One, the close waves, is CC BY 3.0. That
licence allows any use, commercial included, if the recording is credited. So the line under
"Credit to show" must go wherever the project's credits are shown, for example in the About text of a
sold or published version.

| Piece in `sea.js` | Recording | Recorded by | Licence |
|---|---|---|---|
| `near`, `wash`, `crash-shore-*` | [Oceanwavescrushing.ogg](https://commons.wikimedia.org/wiki/File:Oceanwavescrushing.ogg): medium waves on the stony shore of Kalundborg Fjord at Røsnæs, Denmark, from 2 metres | Luftrum ([Freesound 48412](http://www.freesound.org/people/Luftrum/sounds/48412/)) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0) |
| `distant` | [Ocean Waves on a Tropical Beach.ogg](https://commons.wikimedia.org/wiki/File:Ocean_Waves_on_a_Tropical_Beach.ogg): ocean waves by a tidal stream | J.D. Savanyu (Jarrod stanley) | [CC0](http://creativecommons.org/publicdomain/zero/1.0/) |
| `lap` | [17650 thoschi issyk-kul.ogg](https://commons.wikimedia.org/wiki/File:17650_thoschi_issyk-kul.ogg): small waves on the shore of Lake Issyk Kul, Kyrgyzstan | thoschi ([Freesound 17650](https://www.freesound.org/people/thoschi/sounds/17650/)) | [CC0](http://creativecommons.org/publicdomain/zero/1.0/) |
| `rocks`, `crash-rocks-*` | [Waves.ogg](https://commons.wikimedia.org/wiki/File:Waves.ogg): water among rocks on the shore of Lake Ontario, Webster, NY | Dsw4 | Public domain |

Direct file links, as downloaded:
- https://upload.wikimedia.org/wikipedia/commons/f/f1/Oceanwavescrushing.ogg
- https://upload.wikimedia.org/wikipedia/commons/6/64/Ocean_Waves_on_a_Tropical_Beach.ogg
- https://upload.wikimedia.org/wikipedia/commons/5/58/17650_thoschi_issyk-kul.ogg
- https://upload.wikimedia.org/wikipedia/commons/1/1f/Waves.ogg

## Credit to show

> Sea sounds include "Oceanwavescrushing" by Luftrum (freesound.org), licensed under CC BY 3.0,
> cut and filtered.

## Considered and left out

- *On a pebble beach.ogg* (earthcalling, public domain): good crashes, but it has steady tones at 250 to
  450 Hz, probably the doves its page mentions, which would come back with every wave.
- *Water on Rocks.ogg* (CC BY 3.0) and *Water over rocks as tide recedes.ogg* (public domain): mostly
  wind rumble.
- *Vagues et Sternes* (CC0): terns calling, and a steady hum.
- *Wave (Gravity Sound).wav*: music, not a recording of the sea.
- Recordings under CC BY-SA (Nauset Beach, Lake Okeechobee and others) were passed over while ones with
  fewer conditions would do. None under a non-commercial licence were considered.

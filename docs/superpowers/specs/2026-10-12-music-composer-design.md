# Music composer: a score per video, rendered in the browser

Date: 2026-10-12
Status: approved design, not yet planned

## Problem

Every video uses one of five fixed music beds (`drive`, `bright`, `calm`, `pulse`, `epic`), synthesized once by `scripts/make-audio.mjs` from simple oscillators. From the sixth video on, the music repeats, and it sounds thin. The beds are 48 s loops; a video is lined up to them by starting the bed at a bar chosen so its breakdown ends on the closing card (`Timing.musicFrom`, `MUSIC[*].breakAt`).

OneAPI's public catalog has no audio or music models (24 models, all text, checked 2026-10-12), so the music cannot come from a music-generation model without new gateway work.

## Goal

Each video gets its own music, composed for it:

- The AI director writes a score (genre, tempo, key, chords, energy per scene, special moments) alongside the plan, using the same OneAPI text model and key.
- The browser renders that score to audio in about a second, with real sampled instruments where they matter.
- The music is built on the video's own timeline: every card lands on a downbeat, the energy follows the story, the closing card lands on the final hit.

Success means: two videos from different briefs never share a track; a person listening without picture can hear the scene changes; and the user, listening in `/lab`, judges each genre as usable for a product promo.

## Non-goals

- Music-generation models (ElevenLabs Music, Lyria, MiniMax). Possible later as a premium option once a provider exists in the OneAPI gateway.
- Vocals or lyrics.
- Letting the person edit the score by hand. The editor keeps editing text only; "Another take" re-scores.

## Design

### 1. The score

The plan gains a `score` object. The director fills it; `src/director/rules.ts` validates it like the rest of the plan, replacing anything invalid with the genre's preset.

```ts
type Score = {
  genre: Genre;            // one of 8 templates (below)
  bpm: number;             // clamped to the genre's range
  key: PitchClass;         // "C" .. "B"
  mode: "major" | "minor";
  // One progression per scene, in roman numerals from the genre's allowed set,
  // one chord per bar; repeated to fill the scene.
  chords: string[][];
  energy: (0 | 1 | 2 | 3)[];          // per scene
  moments: { scene: number; kind: "drop" | "stop" | "riser" }[];
  seed: number;            // varies drum fills and voicings between takes
};
```

Genres: `trailer` (cinematic hits, braams, taiko), `synthwave`, `lofi` (lo-fi hip hop), `house`, `future-bass`, `corporate-pop`, `orchestral`, `ambient-tech`.

The AI chooses musical intent; the engine guarantees musicality. Chords are voiced with smooth voice leading inside the genre's register, every note is quantized to the grid, and nothing leaves the key except the borrowed chords a genre allows.

`plan.music` (the bed name) is replaced by `plan.score`. Plans saved before this change, which have `music` but no `score`, get the preset score of the genre closest to their bed (`drive` to `corporate-pop`, `bright` to `future-bass`, `calm` to `ambient-tech`, `pulse` to `house`, `epic` to `trailer`).

On "Another take", the genre must differ from the previous take's, as look and path already do. For a new video, genres used in the person's recent videos are avoided.

### 2. Arrangement and sync

The music is composed to the video's exact length; the bed offset (`musicFrom`, `breakAt`) goes away.

- `planTiming` keeps placing scenes on beats, now from `score.bpm`. Each scene is one section of the song. A card's landing frame (`moveWindow(i)[1]`) falls on the first beat of a bar.
- Energy selects layers per scene:

  | Energy | Layers |
  |---|---|
  | 0 | pad, texture |
  | 1 | + bass, hats |
  | 2 | + full drums |
  | 3 | + lead or brass, deeper sidechain |

- Moments:
  - `drop`: one beat of silence, an impact on the card's landing, then energy 3.
  - `stop`: the music cuts on the reveal and returns on the next bar.
  - `riser`: a noise or string riser over the beats before the scene.
- A camera move gets a fill or pickup on the beat before it lands.
- The close lands on the final hit; its chord rings out to the end of the video, fading over the last 0.5 s.
- Card cues (tick, pop, ding) are pitched to notes of the key, so they sound like part of the music. Whoosh and typing stay as recorded effects.
- Mix: the music ducks 2 to 3 dB under each cue. Master chain: bus compressor, then limiter; target about -14 LUFS integrated, peaks at or below -1 dBFS.

### 3. Instruments and samples

Allowed licenses: CC0 and CC-BY (with attribution). Every file's license is checked at its source and recorded.

- VCSL, Versilian Community Sample Library (CC0): percussion, orchestral, keys, mallets.
- Salamander Grand Piano (CC-BY 3.0): piano.
- Drum one-shots from Freesound, kept only when the file itself is CC0 or CC-BY.
- Synthesized with Tone.js: bass, leads, pads and plucks for the electronic genres.

`scripts/fetch-samples.mjs` downloads the chosen files, checks each against a manifest (source URL, license, SHA-256), trims and normalizes them, keeps every third or fourth note (the sampler pitch-shifts between), and encodes them. The output, `public/samples/`, is committed, so builds need no network. Budget: 20 MB or less in total. A genre loads only its own instruments.

Attribution for every CC-BY file goes in `public/samples/CREDITS.md`, the README, and the app footer.

### 4. Rendering and integration

New module `src/music/`:

| File | Responsibility |
|---|---|
| `score.ts` | `Score` type, genre list, validation and presets |
| `genres/<genre>.ts` | bpm range, allowed chords, register, drum patterns per energy, instrument palette |
| `arrange.ts` | score + `Timing` to a list of note and hit events in seconds; pure, no audio |
| `instruments.ts` | Tone.js samplers and synths per instrument, loaded from `public/samples/` |
| `render.ts` | events to audio with `Tone.Offline`, master chain, WAV encode, blob URL; cached by a hash of score and timing |

Rendering happens inside the composition: a hook renders the track under `delayRender` and hands its URL to `<Audio>`. The Player, the browser export (`@remotion/web-renderer`) and the CLI render (headless Chrome) all run the composition in a browser, so all three use the same path and the same audio.

`src/engine/soundtrack.tsx` plays the rendered track plus the cue effects. The five old beds and their part of `make-audio.mjs` are removed in phase 4; the cue effects stay.

Tone.js is added as a dependency (MIT).

A `/lab` page renders a sample video's score in any genre, with a chosen energy curve and seed, and plays it, for listening tests.

**Main risk:** `@remotion/media`'s `<Audio>` and the web-renderer's audio mixer must accept a blob URL created in the page. Phase 1 proves this before anything else is built. If they do not, the fallback is an `AudioBuffer`-to-data-URL path, or rendering the track in the exporter and passing it to `renderMediaOnWeb` as its own audio.

### 5. Error handling

- An invalid or missing score is replaced by the genre preset; a missing genre falls back to `corporate-pop`. Never silent because of a bad score.
- A sample that fails to load fails the render with a message naming the file, through `cancelRender`, rather than playing a track with a missing instrument.
- If audio rendering throws, the preview shows the error; export does not start.

### 6. Testing

- Unit (vitest):
  - Score validation and presets, including old plans with `music` only.
  - `arrange`: every card's landing frame is a downbeat; no note is outside the key except allowed borrowed chords; the same score and timing always give the same events; energy maps to the expected layers.
- Integration: render a plan in headless Chrome, decode the WAV, and check that its length equals the video's, that the energy envelope peaks within one frame of each card landing, and that the true peak stays at or below -1 dBFS.
- Listening: the user, through `/lab` and real exports. Claude cannot hear audio; structure and levels are checked by measurement, taste by the user.

## Phases

Each phase ends at a checkpoint.

1. **Spike.** Render a short Tone.js track to a blob URL inside the composition and play it in the Player, in a browser export and in a CLI render. Check the exported MP4's audio. Go or no-go for the rendering path.
2. **Samples and two genres.** Sample pipeline and manifest, `arrange` and `render` with `trailer` and `house` end to end, and `/lab`. The user listens and judges.
3. **Six more genres and the director.** Remaining genre templates; the director writes the score; validation; variety between takes.
4. **Polish.** Cues pitched to the key, mixing and mastering levels, removal of the old beds, credits in the app.

## Decisions made while building

- **2026-10-13: Web Audio directly, not Tone.js.** Rendering with Tone.js took 8 to 10 s for a 25 s soundtrack. Profiling showed the main thread idle: the cost was in the audio graph. Tone's voices each keep a dozen always-running signal nodes, and every node scheduled up front is processed in every 128-sample block whether it sounds or not (about 1,500 nodes for a house track). `render.ts` now builds notes from native nodes, created a second ahead of when they sound by suspending the offline render once a second. The same songs render in about 3 s in a busy dev page; Tone.js was removed as a dependency.
- **Every sample is CC0** (VCSL, including its Steinway B grand piano), so no attribution is required; the CC-BY allowance was not needed.
- **Cards land on the first beat of their scene** (they landed about five frames after it before), so the music's hit and the camera's arrival coincide.

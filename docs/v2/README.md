# OneMotion v2: what changed, what was verified, what is left

Status as of 2026-10-19, branch `feat/music-composer` (uncommitted working tree).
Every "verified" line below was run in this session; "not done" means not built, not "done in a document".

## 1. Root-cause audit (P0)

| Symptom | Root cause (file) | Fix |
|---|---|---|
| Custom briefs fail with "The concept has too few beats." | `normalizeConcept` threw below `MIN_BEATS = 2` (`src/bespoke/agent/concept.ts`); the concept prompt also demanded "Beats: 4 to 8" (`src/bespoke/agent/prompts.ts`) | One beat is a valid film; no prompt minimum; beats carry `moments` (shots/events inside a beat) |
| Long storyboards lose scenes silently | `MAX_BEATS = 10` sliced the array | Up to 40 beats; beyond that the shortest neighbouring pair is joined (never dropped) and a note is logged |
| Locked narration gets cut mid-word | `str(b.voice, 200)` / `str(b.says, 120)` hard slices | Limits raised (voice 2000, says 400) and `clip()` cuts only between words |
| Requested length ignored | per-beat clamp 12 s, total rescale to 60 s, silently | Per beat 180 s, total 300 s; any rescale is written into `concept.notes` and shown in the log |
| A schema slip was reported like a bad brief | `jsonStep` repaired JSON syntax only | `jsonStep(o, validate)`: a parsed answer that fails validation goes back once with its problems listed ("fix exactly these, keep the rest"); a second miss says it is the model's output, not the brief (`src/bespoke/agent/llm.ts`) |
| Quick mode refuses short plans | `MIN_SCENES = 3` throw (`src/director/rules.ts`) | Any plan with one usable scene is a film; an empty plan still errors |
| Narration can run past its scene | `filmTiming` rounded voiced beats to the nearest music beat (down by up to half a beat) (`src/bespoke/timing.ts`) | Voiced beats round up, plus a 0.3 s breath; test sweeps 60–180 BPM |
| Captions show "lima dolar" instead of "$5"; long lines fill the frame | captions used the TTS alignment words; one box per line (`runtime/Captions.tsx`) | Captions show the display words (char-level mapping, below) a phrase at a time |
| "OneAPI" mispronounced, no control | numbers-only `spoken()` | Pronunciation dictionary (below) |
| "Improve with AI" only rewrote the brief | no way to edit a finished film | AI Improve 2.0 (below) |
| Agents could not see continuous-scene timing | timing tool listed beats only | Timing tool lists each beat's `moments` |

Template (Quick) mode was checked too: `planTiming` already holds narrated scenes with `Math.ceil`, so the 7 s `MAX_SCENE` clamp in `rules.ts` does not cut voice in renders.

## 2. What was built

### Pronunciation (Part 6)
- `src/voice/spoken.ts`: `speech(display, lang, lexicon)` returns `{ display, tts, spans }`: pronunciations first (longest term first, word edges, capitals-only for acronyms, per-language entries win), then numbers/prices/domains (id, en). Each replacement keeps a display↔TTS span map.
- `displayWords()` puts ElevenLabs' per-character times back onto the words as written, so captions and `cue("b2:OneAPI")` use display text while the voice gets `wanapi`.
- Defaults: `OneAPI → wanapi`, `oneapi.id → wanapi` (editable). Studio-wide dictionary in Settings, per-video dictionary in the Narration pane; the video's entries win.
- A beat keeps `voice` (script, display) and `tts` (what was sent). Cache keys are the TTS text plus voice settings, so changing a pronunciation or the voice delivery re-records only the affected lines.
- Voice delivery (stability, similarity, style, speed) is sent as ElevenLabs `voice_settings`.
- Client-side preprocessing was chosen over ElevenLabs pronunciation-dictionary locators: it is inspectable ("Said as …" shown live), works for every model, and needs no dictionary objects on the person's ElevenLabs account. Not done: native locators.

### AI Improve 2.0 (Part 5)
- `src/bespoke/agent/revise.ts`: the editor model turns a note into a validated plan (areas, targets, beat edits, adds/removes, track, concrete design instructions). `applyRevision` enforces locks in code: a timing note can never change narration even if the model planned it; refused parts are listed for the person.
- Locks come from the UI (scope + checkboxes) and from the note itself (`inferLocks`: "without changing narration", "jangan ubah narasi", "keep the music"…).
- Only changed voice lines are re-recorded; music-only notes touch neither code nor voice; structure edits keep beat ids stable and regenerate the beats index; `brokenCues` finds code cues that no longer match a beat or word and sends them to the designer.
- If the edited code fails the check, the film comes back exactly as it was.
- Versions: `src/studio/history.ts` (IndexedDB, 20 per video), undo/redo in the top bar.
- Hand edits: narration line by line (re-record one line), music track/level/off. A line edit that would break a cue is either re-timed by the AI or refused, never saved broken.

### Motion craft (Parts 2, 7)
- The ten referenced skills were fetched and read (raw SKILL.md files). None were installed: installation runs third-party code (`npx skills add`), one has no license, several instruct agents to run scripts. Their concrete, frame-compatible rules were distilled into the designer prompt ("Motion craft" in `prompts.ts`, attributed) and the kit (`arriveE`, `moveE`, `panelE`, `settle`, `burst`, `weighty`, `stagger`, `wipeIn` in `kit/motion.ts`, unit-tested).
- Motion (motion.dev) was not added: its animations are wall-clock players; Remotion's `spring`/`interpolate` already cover deterministic use. One animation system, frame-based.
- The concept prompt's range now includes minimal monochrome, geometric/vector and brand-reveal directions and says most films need no 3D.

### Studio UI (Part 14)
Redesigned as an editor: library (left), stage with the preview and a beat timeline (scenes sized by length, voice bars, live playhead, click to seek, shift-click to target scenes for Improve), inspector (Create / Improve / Narration / Music / Details), top bar with undo/redo, model and Export. Graphite palette, one accent (OneAPI orange) for action/playhead/selection, Geist + Geist Mono + Bricolage Grotesque. Verified at 1512, 1100, 768 and 390 px (no horizontal overflow); reduced motion respected.

### Export (Parts 8, 12)
- `src/studio/renderTarget.ts`: picks MP4 (H.264/AAC) or falls back to WebM (VP9/Opus) when the OS lacks an AAC encoder (Windows N), checked before rendering.
- Render profiles change real encoder parameters: Eco (scale 2/3 → 720p, medium bitrate, prefer hardware), Balanced (1080p, high), High (1080p, very high), 4K (scale 2, very high, prefer hardware). Settings → Export.
- `NEXT_PUBLIC_REMOTION_LICENSE_KEY` is passed to every web render.
- Music mix: level and on/off per video.

### AI provider: OneAPI or your own endpoint (BYOK)
- Settings (gear in the top bar) is a page. OneAPI is first and recommended; "Your own endpoint" takes a base URL and a key.
- `POST /api/provider/detect` reads `{base}/models` (Bearer or `x-api-key`; tries `{base}/v1` when there is no version) and finds the API with one tiny request each: OpenAI Chat Completions, then OpenAI Responses, then Anthropic Messages. The API and the key header can also be set by hand.
- The agents speak Chat Completions; `src/server/translate.ts` converts requests and answers for Responses and Messages (tool calls, images, usage). Chat-style endpoints stream like OneAPI.
- The endpoint is a URL the person typed, so the server vets it like a website (`src/server/site.ts`): http(s), every resolved address public, the connection pinned to the checked address, no redirects. The desktop app also allows a local model server (localhost).
- With a custom endpoint, web search (a OneAPI service) is off and spend shows tokens, not dollars.
- Tested against local fake servers in both styles (`src/server/provider.test.ts`); not yet against a real third-party provider.

### Windows desktop app (Parts 9, 10)
See `desktop.md`. Electron 44.9.0 + electron-builder 26.15.3; NSIS per-user installer; the Next.js server runs from a standalone build in an Electron utility process; the window uses `onemotion://app` (fixed origin, so projects persist), no preload, sandboxed; a per-launch secret + Host check guard the loopback server.

## 3. Verified in this session

| Check | Result |
|---|---|
| Unit tests | 193 passing (`npm test`), typecheck and lint clean |
| Pronunciation: `OneAPI`/`oneapi.id` said as configured, display unchanged | unit tests + live "Said as" in the UI |
| Custom brief with 1 beat / 52 beats / long locked narration | unit tests (`concept.test.ts`) |
| "Improve animation timing without changing narration" keeps narration | unit test (`revise.test.ts`) |
| Narration never crosses into the next scene, 60–180 BPM | unit test (`timing.test.ts`) |
| Music in the export | browser export → H.264 1920x1080 + AAC, audio RMS −21.5 dBFS over 10 s |
| Electron renderer encodes H.264 (HW + SW), AAC, VP9, Opus | spike in Electron 44.9.0 |
| Local render in the desktop shell | MP4 exported through `onemotion://app` |
| Packaged `OneMotion.exe` with fuses on | starts server, scene check OK, no Node in renderer |
| Projects persist across app restarts | yes |
| Desktop server guard | 12/12 smoke checks (`npm run desktop:smoke`): no secret → 403, wrong host → 403 |
| Production build ships no browser source maps or obvious secrets | checked by `stage-desktop.mjs` |
| Installer | `dist-desktop/OneMotion Setup 0.2.0.exe`, 145 MB, unsigned |

## 4. Not verified / not done (honest list)

- **A real AI run end to end** (concept → build → Improve) with a OneAPI key: no key was available in this session. Creative-diversity acceptance (three distinct plans for three briefs) needs that run.
- **Narration with a real ElevenLabs recording**: alignment mapping is unit-tested against synthetic timings; an actual recording was not made (no key).
- **Installer on a clean Windows machine** (no Node): the packaged app was run from `win-unpacked` on this machine, not installed on a clean VM.
- **Code signing, auto-update** (electron-updater), **license activation**, **cloud render**, **local render companion for the web edition**, **beat detection on music**, **SFX library expansion**: not built. Designs and decisions in `architecture.md`.
- Fonts load from Google Fonts at runtime: the desktop app needs internet (it needs it for the AI anyway). Bundling fonts needs per-family license review.

## 5. Decisions that need the owner

1. **Licensing of the code.** The GitHub repo `oneapi-dev/onemotion` is public under MIT. Commits already published stay MIT for anyone who has them. Making it proprietary means: make the repo private, change `LICENSE`/`package.json` for future work (done only for `desktop/package.json`, which says UNLICENSED). Not changed here: it is your legal call.
2. **Remotion license**: free only at ≤ 3 people (contractors included). Above that: Automators ($0.01/render, $100/month minimum) or Enterprise. Ask Remotion whether model-written bespoke TSX counts as "user-supplied Remotion code" (their terms restrict that). See `licensing.md`.
3. **Bespoke code runs unsandboxed in the page** (your earlier choice). In the desktop app it has no Node access (sandboxed renderer, no preload), but it can still read localStorage (the OneAPI key). Keep, or reintroduce an iframe sandbox before commercial launch.
4. **Code-signing certificate** (OV or Azure Trusted Signing) before distributing the installer; SmartScreen will warn until reputation builds either way.

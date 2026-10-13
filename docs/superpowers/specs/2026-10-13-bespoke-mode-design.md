# Bespoke mode: the AI writes each video's code

Status: approved direction (2026-10-13), building phase 1.

## Why

The plan mode (the director fills a JSON plan for fixed card types) makes every
video the same video with different words. People notice: "beda text doang".
Prompting harder does not help, because the model can only pick from cards.

remotion-opus-skill (MIT, direkturcrypto) shows what works: in its code mode a
creative director invents a concept for this brief (a metaphor, a world, a
camera language, bespoke components), an agent writes a Remotion scene in TSX
for it, renders frames, looks at them, and fixes what it sees. Each film is
its own code, so no two look alike.

Bespoke mode brings that loop into OneMotion, as the default mode. Plan mode
stays as the fast, cheap option.

## Constraints that shape the design

- OneMotion runs in the browser with the person's own OneAPI key. Nothing
  renders on a server, and a hosted deployment has short request limits
  (`maxDuration` 300 s). An agent run takes minutes and many model calls.
- The code is written by a model and runs in the person's browser, where their
  OneAPI and ElevenLabs keys live. A brief or a scraped website can carry a
  prompt injection. Generated code must not be able to read those keys or send
  anything anywhere.
- The browser exporter (`@remotion/web-renderer`) is not Chrome. It does not
  draw CSS perspective, radial gradients, blend modes, `background-clip:text`,
  z-index stacking, or large blurs, and it re-rasterizes every inline `<svg>` on
  every frame (slow). Canvas is cheap (copied with `drawImage`).

## Shape

```
Studio (parent page, holds keys)
 ├─ agent loop (browser) ── /api/chat ──► OneAPI   (one completion per request, key in header, not stored)
 │    tools: timing, list/read/write/edit/delete_file, check, render_frames, contact_sheet, finish
 │    check ─────────────── /api/scene/check        (TypeScript typecheck + scene rules + transpile → JS modules)
 │    render_* / preview / export ──postMessage──►  sandbox iframe
 └─ sandbox iframe  (sandbox="allow-scripts": opaque origin, strict CSP, no network but our static files and fonts)
      runtime.js: React, Remotion, Player, web-renderer, @kit, music composer
      evaluates the compiled scene modules with a require() that knows only react, remotion and @kit
```

- **Model calls**: the browser runs the loop and keeps the conversation; each
  step is one call through `/api/chat`, a stateless proxy that adds the key
  from the request header (same rule as `/api/direct`). No step comes near the
  request limit, and a closed tab loses nothing that is not saved per step.
- **Check** runs on the server with the `typescript` package: forbidden
  imports and globals (`fetch`, `Date`, `Math.random`, `localStorage`, `eval`,
  dynamic `import()`, ...), numbers on screen that are not in the facts, then a
  real typecheck against the kit's types, then `transpileModule` to CommonJS.
  The browser only ever runs code that passed it.
- **Sandbox**: the iframe has no same-origin access (no storage, no cookies,
  no parent DOM), and its CSP allows connections only to this app's static
  files and Google Fonts. The parent never sends it a key. Messages are
  checked by source window on both sides. Static rules are a lint, not the
  security boundary; the iframe is.
- **Frames for the model**: the iframe renders stills with
  `renderStillOnWeb`, exactly what the export will draw, so the model judges
  the real output. Contact sheets are tiled on a canvas in the parent.

## The scene contract (what the model writes)

```tsx
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useFilm, Fit, Ink, Sfx, prog } from "@kit";

export const fonts = { "Space Grotesk": ["500", "700"], "JetBrains Mono": ["400"] };
export const background = "#F6F5F1";

export default function Scene() {
  const t = useCurrentFrame();
  const { W, H, beat, cue, brand, safe } = useFilm();
  ...
}
```

- `useFilm()` is the clock: `beats` from the concept, each with start and end
  frames, `cue("b3")`, `cue("b3+0.4")`, `cue("end")`, the format (`W`, `H`,
  `P` for portrait), the brand (name, url, logo, colours) and a safe box.
- Beat lengths come from the concept, are snapped to the music's beat grid,
  and, with a voice-over, stretch to the recorded line (as plan mode does).
- One format per run: the person's chosen format (landscape, portrait or
  square). Rendering both doubles the cost for a frame they did not ask for.

## @kit

Ported and adapted from remotion-opus-skill's kit (MIT, credited in the file
headers), plus what the browser exporter needs:

- motion math: `prog`, `pop`, `kf`, `hitEnv`, `seeded`, easings
- text: `Fit`/`fit`/`textW` (measured, never estimated), `Chars`, `Typewriter`,
  `Odometer`, `CountUp`, `Highlight`, `Strike`
- `Ink`: hand-drawn strokes on a canvas (SVG path data in, drawn on over time,
  with a seeded wobble), the cheap way to sketch diagrams, arrows and circles
- `Sfx`: a sound at a frame (whoosh, swoosh, impact, riser, tick, pop, ding,
  type, click); the scene places its own sound design
- shells: `Window` (mac, browser, terminal), `Phone`, `Cursor` (with its
  click), `Mark` (the brand's logo)
- `Grain`, `Burst`, `Whip`, `useHits` (punch, shake, flash)

## The run

1. **Concept** (one call): title, angle, metaphor, world, camera, 3 to 5
   components, palette, fonts, beats (`says` and `shows`), duration, score
   (genre, bpm, key, energy), and why it differs from the recent videos. The
   recent videos' metaphors and worlds are sent so it does not repeat them.
2. **Agent** (up to 16 steps): writes `scene/`, checks, renders a contact
   sheet, looks, fixes, at least two look-and-fix passes, then `finish`.
3. **Review** (optional, one call): a fresh look at labelled frames returns
   issues; the same agent session fixes them.
4. **Preview and export** in the sandbox, with music composed from the
   concept's score, the scene's own SFX, and the optional voice-over.

Files, concept and the agent's conversation are saved with the project after
every step, so a run resumes after a closed tab.

## Cost and model

The model must take images and tools. With Claude Sonnet 5.5 on OneAPI
($1.4 / $7 per 1M), a run is roughly 0.3 to 0.6 M input tokens and 30 to 50 k
output tokens, about $0.7 to $1.2; Opus 5.5 doubles that. The Studio shows
the running cost and stops at a budget the person sets.

## Phases

1. Infrastructure, proven with a hand-written scene: runtime bundle, sandbox
   iframe and its message protocol, preview, stills, export; `/api/scene/check`;
   kit v1.
2. Agent: `/api/chat`, concept and agent prompts, tools, the loop, saved
   sessions, Studio UI as the default mode with a live log and preview.
3. Sound and polish: concept score into the composer, voice-over beats, review
   step, budget, history for variety.

## Not doing (now)

- Both aspects per run.
- Word-level cues (needs ElevenLabs timestamps; beat-level cues first).
- Running generated code outside the sandbox, ever.

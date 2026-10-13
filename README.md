# OneMotion

Describe a video in one sentence ("MiMo V2.6 is now on OneAPI", "a 20 second promo for acme.com"). An AI director plans the video: the story, the scenes, the words on screen, the room, the camera path and the music. Your browser then renders it to an MP4. No render server is needed.

The AI calls run through [OneAPI](https://oneapi.id) with your own OneAPI API key. Briefs that name a model on OneAPI get that model's real prices and context window from OneAPI's public catalog.

## What a video looks like

Each video is one continuous camera move through a 3D room. The camera flies from card to card on the beat of the music.

- **Cards:** headline, announcement, spec sheet, bar chart, side-by-side comparison, chat thread, code editor, checklist, steps, feature tiles, big number, quote, offer, and closing call to action.
- **Rooms:** six looks with different card construction: `midnight`, `graphite`, `paper`, `sage`, `mono` and `ember`.
- **Camera paths:** three, `dolly`, `serpentine` and `staircase`.
- **Music:** a built-in library of 16 public-domain tracks (FreePD, CC0): uplifting acoustic, cinematic piano, tech electronic, drum and bass, 8-bit, retro synth, spacey ambient, epic orchestral, tense and funky beds. Each video plays one that fits its mood, starting on the track's first beat so the cuts land on its beats, and fading out at the end. With a paid ElevenLabs key a bespoke video gets music made for it instead; a composer that synthesizes a score is the last fallback.
- **Variety:** a new take never repeats the previous take's look, path or music. A new video avoids the ones used by your last video.

## Honesty rules

The director's answer is data (a JSON plan), never code. It is checked before anything is drawn:

- **Numbers:** every number on screen must appear in your brief, in the website text, or in OneAPI's catalog. Anything else is removed, along with the scene that carried it.
- **Text:** words are clipped to what each card can hold.
- **Scenes:** a scene missing what it needs is dropped. The video always ends on one call to action.
- **Durations:** each scene gets enough time for its words to be read. The whole video fits the length you asked for ("30 detik", "15-20 seconds"), or 12 to 25 seconds by default.

## Run it

You need Node.js 20 or newer and a OneAPI API key ([get one](https://oneapi.id/api-keys)).

```bash
npm install
cp .env.example .env.local   # optional; defaults point at OneAPI
npm run dev                  # http://localhost:3000
```

Open the app, add your key and pick a model under Settings, then describe a video. The key is kept in your browser's local storage and is sent only with each design request.

### Voiceover (optional)

Turn on **Narrate my videos** in Settings and add your own [ElevenLabs](https://elevenlabs.io) API key. The director then writes one spoken line per scene, in the brief's language only (no mixing), and your browser has ElevenLabs read it with the voice you pick. The key goes from your browser straight to ElevenLabs.

- Each scene holds until its line is spoken, and the music dips under the voice.
- Lines are stored in your browser, so re-exporting or editing one line does not pay for the others again.
- Numbers are written on screen as digits ("$5", "5x", "1M") and read out as words in Indonesian or English.
- Free ElevenLabs plans can use the built-in voices for non-commercial videos only. Native voices from the Voice Library (an Indonesian narrator, for example) and commercial use need a paid plan; add a library voice to your ElevenLabs account and it appears in the voice list.
- The command-line render has no voiceover: the recordings live in the browser that made them.

### Export

- **In the browser:** Export MP4 renders in the tab with WebCodecs (H.264 + AAC). This works in Chrome and Edge on desktop.
- **On your machine:** "Download plan" saves the video as JSON. Then render it with Remotion and headless Chrome:

  ```bash
  npm run render -- my-video.json
  ```

## How it works

```
src/
  director/   The AI director: prompt, the rules every plan must pass, fact checks
  engine/     The video: Remotion composition, camera rig, rooms, cards, soundtrack
  server/     OneAPI client and catalog; website reader (SSRF-guarded)
  studio/     The app: brief, preview (Remotion Player), editor, browser export
  app/        Next.js routes: /api/direct, /api/site, /api/catalog
scripts/
  make-audio.mjs   Synthesizes the sound effects (deterministic, no samples)
  fetch-music.mjs  Builds the music library (public/music) from scripts/music.json, checking every source file's SHA-256
  render.mjs       Command-line render
```

`POST /api/direct` takes the brief, the person's OneAPI key (header `X-OneAPI-Key`) and the chosen model. It sends one chat completion to OneAPI and returns a checked plan. `POST /api/site` reads a website named in a brief. It only connects to public addresses, pinned to the address it checked, and follows at most four redirects.

```bash
npm test          # director rules and fact checks
npm run typecheck
npm run lint
npm run audio     # regenerate public/audio and src/engine/music.ts
npm run music     # rebuild public/music and src/music/library.ts
```

## License

This project is MIT licensed.

The built-in music (`public/music`) is from FreePD and dedicated to the public domain under CC0 1.0; see `public/music/CREDITS.md`. The instrument samples (`public/samples`) are from VCSL, also CC0.

It is built on [Remotion](https://www.remotion.dev), which has its own license. Remotion is free for individuals and for companies of up to three people. Larger companies need a [Remotion company license](https://www.remotion.dev/license) to use this project.

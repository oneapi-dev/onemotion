# Motion by OneAPI

Describe a video in one sentence ("MiMo V2.6 is now on OneAPI", "a 20 second promo for acme.com"). An AI director plans the video: the story, the scenes, the words on screen, the room, the camera path and the music. Your browser then renders it to an MP4. No render server is needed.

The AI calls run through [OneAPI](https://oneapi.id) with your own OneAPI API key. Briefs that name a model on OneAPI get that model's real prices and context window from OneAPI's public catalog.

## What a video looks like

Each video is one continuous camera move through a 3D room. The camera flies from card to card on the beat of the music.

- **Cards:** headline, announcement, spec sheet, bar chart, side-by-side comparison, chat thread, code editor, checklist, steps, feature tiles, big number, quote, offer, and closing call to action.
- **Rooms:** six looks with different card construction: `midnight`, `graphite`, `paper`, `sage`, `mono` and `ember`.
- **Camera paths:** three, `dolly`, `serpentine` and `staircase`.
- **Music:** five beds (`drive`, `bright`, `calm`, `pulse`, `epic`). The cuts snap to the beat. The music's breakdown is lined up to end on the closing card, which lands on the track's final hit.
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
  make-audio.mjs   Synthesizes the music and sound effects (deterministic, no samples)
  render.mjs       Command-line render
```

`POST /api/direct` takes the brief, the person's OneAPI key (header `X-OneAPI-Key`) and the chosen model. It sends one chat completion to OneAPI and returns a checked plan. `POST /api/site` reads a website named in a brief. It only connects to public addresses, pinned to the address it checked, and follows at most four redirects.

```bash
npm test          # director rules and fact checks
npm run typecheck
npm run lint
npm run audio     # regenerate public/audio and src/engine/music.ts
```

## License

This project is MIT licensed.

It is built on [Remotion](https://www.remotion.dev), which has its own license. Remotion is free for individuals and for companies of up to three people. Larger companies need a [Remotion company license](https://www.remotion.dev/license) to use this project.

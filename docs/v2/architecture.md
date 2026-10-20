# Architecture: web, desktop, local and cloud rendering

## What exists now

```
                 shared: project schema (FilmState / Plan), AI director + designer,
                 kit + compositions (Remotion), timeline, voice, music
                        │
     ┌──────────────────┴───────────────────┐
  Web edition                          Desktop edition (Electron)
  next start / any Node host           same Next build (standalone) in a utility process
  renders in the browser (WebCodecs)   renders in its window (WebCodecs), files saved locally
```

One engine. There is no second renderer to keep in sync, and a project is the same JSON in both editions.

Projects live in the client's storage (localStorage plus IndexedDB). Moving a project between editions or machines needs an export/import. **Not built:** a `.onemotion` file holding FilmState, voice clips and assets.

## Render targets

| Mode | Status | Notes |
|---|---|---|
| Browser-local (web) | built | Chrome/Edge desktop. Long or 4K films need memory; the benchmark measures it. |
| Desktop-local | built | Same renderer, in Electron. Local assets never leave the machine. |
| Cloud render | **not built** | Plan below. |
| Local companion for the web edition | **not built** | Recommendation below: prefer the desktop app. |

### Cloud render (plan)

- `POST /api/render`: an authenticated user sends `{ project JSON, assets by hash, profile }`. Upload only what is needed, and ask first (private assets are never uploaded silently).
- Queue (one row per job: state, progress, attempt, quota charge). A worker runs headless Chromium (`@remotion/renderer`'s `renderMedia`, or the same web renderer in Playwright) and writes the MP4 to object storage. The client gets a signed URL.
- Workers are CPU containers. The benchmark shows renders on this machine are not CPU-bound (low average CPU), so a GPU is not assumed. Measure the worker before choosing hardware.
- Cost: price per render-second from the benchmark's realtime factor × instance price, plus egress for the MP4. Count Remotion Automators fees per render.
- Bespoke scenes are model-written code. On a shared server they **must** run in an isolated sandbox (container per job, no network except asset fetch, CPU/memory/time limits). Today they run unsandboxed in the person's own browser.

### Local companion (plan, not recommended first)

A browser page talking to a localhost renderer needs explicit pairing, an origin allowlist, CSRF tokens and per-request user consent, plus a signed installer anyway. The desktop app already gives local rendering with none of that attack surface. Build the companion only if users must stay in a browser.

## Commercial architecture (plan)

- **Keys:** never ship provider master keys. Today the person brings their own (BYOK) OneAPI and ElevenLabs keys, held in the client. For a hosted plan, route AI/TTS/music calls through a server proxy that meters usage per account. The server-side LLM proxy (`/api/chat`) is the starting point.
- **Entitlements:** a license/account service issues a signed, expiring entitlement token (plan, features, device count). The desktop app checks the signature offline with a public key, refreshes online, and keeps a grace period. Premium features that cost money (cloud render, hosted AI) are enforced server-side, where the cost happens. Client checks only gate UI.
- **Credentials on desktop:** keys sit in localStorage today. Move them to Electron `safeStorage` (DPAPI) behind a narrow IPC with a validated sender. That adds a preload, which model-written code could then reach, so it needs the bespoke iframe sandbox first.
- **Source protection:** no source maps ship, and secrets stay server-side. Packaged JavaScript is readable regardless. Keep proprietary prompts and logic that must stay private behind the hosted API, not in the binary.
- **Updates:** electron-updater over HTTPS with a signed installer (`publisherName`).

## Music

Built:
- Track choice from the 16-track CC0 library, ElevenLabs Music on paid plans, or a composed fallback.
- Per-video level and an on/off switch.
- Narration ducking (about −8 dB, 6-frame ramps).
- End fade.
- Scenes snap to the track's tempo.

Not built: beat and downbeat detection on uploaded tracks, user-uploaded music, loudness normalization of the final mix, and a limiter. A 10s export measured a −0.6 dBFS peak, with no clipping in that sample.

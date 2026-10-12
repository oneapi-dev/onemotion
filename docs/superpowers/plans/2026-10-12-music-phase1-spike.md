# Music composer, phase 1: rendering-path spike

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that audio rendered in the page with Tone.js plays through `<Audio>` in the Player, in the browser export and in the CLI render, at the right times.

**Architecture:** A hook renders a track with `Tone.Offline` under `delayRender`, encodes it to WAV, and hands a blob URL to `@remotion/media`'s `<Audio>`. The spike track is a timing probe: 1 kHz beeps on known frames, so the exported audio can be measured. Phases 2 to 4 get their own plan once this path is proven (spec: `docs/superpowers/specs/2026-10-12-music-composer-design.md`).

**Tech Stack:** tone@15.1.22, @remotion/media 4.0.534, Remotion web-renderer and CLI renderer, Python `wave` for measurement.

---

## Files

- Create `src/music/wav.ts`: encode an `AudioBuffer`-like object to a 16-bit PCM WAV `Blob`. Pure; unit tested.
- Create `src/music/wav.test.ts`.
- Create `src/music/useTrack.ts`: hook that renders a track in the page and returns its blob URL, holding the render with `delayRender` until ready.
- Create `src/music/probe.ts`: the spike track, beeps at given seconds, rendered with `Tone.Offline`.
- Modify `src/engine/soundtrack.tsx`: play the probe track instead of the music bed (spike only, on this branch).
- Scratch (not committed): `scratchpad/measure.py` finds beep onsets in a WAV.

## Task 1: WAV encoder

- [ ] **Step 1: Failing test** `src/music/wav.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

describe("encodeWav", () => {
  it("writes a 16-bit PCM WAV header and interleaved, clamped samples", async () => {
    const left = new Float32Array([0, 1, -1, 2]);
    const right = new Float32Array([0.5, -0.5, 0, -2]);
    const blob = encodeWav({ sampleRate: 48000, numberOfChannels: 2, length: 4, getChannelData: (c: number) => (c === 0 ? left : right) });
    const view = new DataView(await blob.arrayBuffer());
    const text = (o: number) => String.fromCharCode(...new Uint8Array(view.buffer, o, 4));
    expect(text(0)).toBe("RIFF");
    expect(text(8)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4 * 2 * 2);
    const s = (i: number) => view.getInt16(44 + i * 2, true);
    expect([s(0), s(1), s(2), s(3), s(4), s(5), s(6), s(7)]).toEqual([0, 16384, 32767, -16384, -32768, 0, 32767, -32768]);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/music/wav.test.ts`; expect FAIL (module missing).
- [ ] **Step 3: Implement** `src/music/wav.ts`

```ts
/** What encodeWav reads: the shape of a Web Audio AudioBuffer. */
export type PcmSource = { sampleRate: number; numberOfChannels: number; length: number; getChannelData(channel: number): Float32Array };

/** Encodes audio as a 16-bit PCM WAV file; samples outside -1..1 are clamped. */
export function encodeWav(audio: PcmSource): Blob {
  const channels = audio.numberOfChannels;
  const bytes = audio.length * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const text = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, bytes, true);
  const data = Array.from({ length: channels }, (_, c) => audio.getChannelData(c));
  let o = 44;
  for (let i = 0; i < audio.length; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), true);
      o += 2;
    }
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}
```

- [ ] **Step 4:** test passes.
- [ ] **Step 5:** commit `feat(music): WAV encoder`.

## Task 2: probe track and hook

- [ ] **Step 1:** `npm install tone@15.1.22`.
- [ ] **Step 2: Implement** `src/music/probe.ts`: `renderProbe(seconds, beeps)` with `Tone.Offline`: one `Tone.Synth` (sine, 30 ms envelope) through `toDestination()`, `triggerAttackRelease("B5", 0.05, t)` at each beep second; returns the rendered `AudioBuffer` (`ToneAudioBuffer.get()`). Tone is imported dynamically so server rendering of the page never loads it.
- [ ] **Step 3: Implement** `src/music/useTrack.ts`: `useTrack(key, render)` keeps a module cache `Map<string, Promise<string>>` of blob URLs; on mount it calls `delayRender("Composing the soundtrack")`, awaits the URL, stores it in state and calls `continueRender`; on failure `cancelRender(error)`.
- [ ] **Step 4: Wire** in `soundtrack.tsx`: replace the bed `<Audio src={file(t.music)} …>` and the `-end` hit with `<Audio src={url} />` when the URL is ready; beeps at every card landing frame (`moveWindow(i, t)[1] / 30` seconds) and at 0.5 s.
- [ ] **Step 5:** `npx tsc --noEmit`, `npx eslint`, `npx vitest run` clean.

## Task 3: prove it in all three paths

- [ ] **Step 1 (Player):** `npm run dev`; open the sample; no console errors; the audio request for the blob URL succeeds (Network shows `blob:`).
- [ ] **Step 2 (browser export):** export the sample plan; extract the audio: `ffmpeg -i x.mp4 -vn -c:a pcm_s16le x.wav`; run `measure.py x.wav`; each expected beep onset within 1 frame (33 ms).
- [ ] **Step 3 (CLI):** `npm run render -- video.json out.mp4`; same measurement.
- [ ] **Step 4: Decide.** All three pass: go to phase 2 plan. Any fails: record the failure, try the spec's fallback (data URL, or export-side audio), and report before building further.
- [ ] **Step 5:** commit the spike (`feat(music): render the soundtrack in the page (spike)`).

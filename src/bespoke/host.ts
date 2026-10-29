"use client";

import { renderMediaOnWeb, renderStillOnWeb } from "@remotion/web-renderer";
import { DIMENSIONS } from "@/engine/plan";
import type { FilmInput, FilmSpec } from "./film";
import { FilmComposition, filmFrames } from "./runtime/FilmComposition";
import { cueMisses } from "./kit/film";
import { coverage, flashes, FLAT_SPREAD, flatness, frozenBeats, stillness, qaLayouts, qaPrints, qaSeen, qaWarnings, sameLayouts, slideSheets, SPARSE_SHARE } from "./runtime/qa";
import { FILM_FPS, filmTiming } from "./timing";
import { profileOf, REMOTION_LICENSE_KEY, type RenderProfile, type Target } from "@/studio/renderTarget";

/** A film as the Studio holds it: the spec, the compiled scene, and recorded voice lines and a music bed as Blobs. */
export type WireFilm = { spec: FilmSpec; modules: Record<string, string>; voiceover?: Record<number, Blob>; music?: Blob };

const urls = new Map<Blob, string>();
/** Voice and music blobs as object URLs, made once per blob. */
const urlOf = (blob: Blob) => {
  let url = urls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    urls.set(blob, url);
  }
  return url;
};

export function toInput(film: WireFilm): FilmInput {
  const voiceover: Record<number, string> = {};
  for (const [i, blob] of Object.entries(film.voiceover ?? {})) voiceover[Number(i)] = urlOf(blob);
  return { spec: film.spec, modules: film.modules, voiceover, music: film.music ? urlOf(film.music) : undefined };
}

/**
 * renderStillOnWeb waits for each frame with requestAnimationFrame, which
 * never fires in a hidden tab, so the agents' renders stall the moment the
 * person switches tabs (the MP4 export has its own keepalive; stills do
 * not). While stills render, a frame requested in a hidden tab is answered
 * by a worker's tick instead: worker timers are not throttled.
 */
async function withBackgroundFrames<T>(run: () => Promise<T>): Promise<T> {
  if (typeof Worker === "undefined" || typeof document === "undefined") return run();
  const url = URL.createObjectURL(new Blob(["setInterval(() => postMessage(0), 16);"], { type: "application/javascript" }));
  const worker = new Worker(url);
  const waiting = new Map<number, FrameRequestCallback>();
  let next = 0;
  const raf = window.requestAnimationFrame;
  const cancel = window.cancelAnimationFrame;
  worker.onmessage = () => {
    const due = [...waiting.values()];
    waiting.clear();
    for (const cb of due) cb(performance.now());
  };
  window.requestAnimationFrame = (cb) => {
    if (!document.hidden) return raf.call(window, cb);
    const id = -++next;
    waiting.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (id < 0) waiting.delete(id);
    else cancel.call(window, id);
  };
  try {
    return await run();
  } finally {
    window.requestAnimationFrame = raf;
    window.cancelAnimationFrame = cancel;
    for (const cb of waiting.values()) raf.call(window, cb);
    waiting.clear();
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

const composition = (input: FilmInput) => {
  const { width, height } = DIMENSIONS[input.spec.format];
  return { id: "film", component: FilmComposition, width, height, fps: FILM_FPS, durationInFrames: filmFrames(input), defaultProps: input };
};

/** How empty a rendered still is: one flat colour, or nearly nothing on its background (a dot on a blank page). */
async function emptiness(image: Blob): Promise<"flat" | "sparse" | null> {
  try {
    const bmp = await createImageBitmap(image);
    const c = new OffscreenCanvas(96, 54);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, 96, 54);
    bmp.close();
    const px = ctx.getImageData(0, 0, 96, 54).data;
    if (flatness(px) < FLAT_SPREAD) return "flat";
    const share = coverage(px);
    return share < SPARSE_SHARE ? "sparse" : null;
  } catch {
    return null;
  }
}

/**
 * Where a bespoke film runs: in this page, next to the Studio. It holds
 * the film the preview shows, renders the stills the agents look at (with
 * the frame QA) and exports the MP4. Stills run one job at a time: agents
 * working in parallel share it, and the QA reads one render at a time.
 */
export class FilmHost {
  current: FilmInput | null = null;
  private listeners = new Set<(input: FilmInput | null) => void>();
  /** Called when a render starts: the preview pauses, so it does not take the CPU the render needs. */
  private renders = new Set<() => void>();

  onRender(fn: () => void): () => void {
    this.renders.add(fn);
    return () => this.renders.delete(fn);
  }

  private rendering() {
    for (const fn of this.renders) fn();
  }
  private queue: Promise<unknown> = Promise.resolve();

  show(film: WireFilm) {
    this.current = toInput(film);
    for (const l of this.listeners) l(this.current);
  }

  subscribe(fn: (input: FilmInput | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async stills(film: WireFilm, frames: number[], signal?: AbortSignal, quality = 0.82): Promise<{ images: Blob[]; warnings: string[]; seen: string }> {
    const run = this.queue.then(() =>
      withBackgroundFrames(async () => {
        signal?.throwIfAborted();
        this.rendering();
        const input = { ...toInput(film), qa: true };
        const comp = composition(input);
        qaWarnings.length = 0;
        qaSeen.length = 0;
        qaPrints.clear();
        qaLayouts.clear();
        cueMisses.clear();
        const images: Blob[] = [];
        for (const frame of frames) {
          const f = Math.max(0, Math.min(comp.durationInFrames - 1, Math.round(frame)));
          const still = await renderStillOnWeb({ composition: comp, inputProps: input, frame: f, signal: signal ?? null, delayRenderTimeoutInMilliseconds: 120_000, licenseKey: REMOTION_LICENSE_KEY });
          const image = await still.blob({ format: "jpeg", quality });
          images.push(image);
          const empty = await emptiness(image);
          if (empty === "flat") qaWarnings.push(`frame ${f}: the frame is nearly empty (one flat colour): something meaningful should be on screen`);
          else if (empty === "sparse") qaWarnings.push(`frame ${f}: the frame is nearly empty (almost nothing on the background): the beat's hero should fill 50 to 75 % of the frame width, with its supporting layers around it`);
        }
        const { beats } = filmTiming(film.spec.beats, film.spec.score);
        qaWarnings.push(...frozenBeats(beats, qaPrints));
        // One hold per beat, the one nearest two thirds in, for the layout comparison.
        const holds = beats.flatMap((b) => {
          const at = b.start + (b.end - b.start) * 0.65;
          const f = [...qaLayouts.keys()].filter((x) => x >= b.start + 15 && x < b.end).sort((x, y) => Math.abs(x - at) - Math.abs(y - at))[0];
          const layout = f === undefined ? undefined : qaLayouts.get(f);
          return layout ? [{ beat: b.id, frame: f, layout }] : [];
        });
        qaWarnings.push(...sameLayouts(holds), ...slideSheets(holds));
        return { images, warnings: [...new Set([...cueMisses, ...qaWarnings])].slice(0, 30), seen: [...new Set(qaSeen)].join(" ").slice(0, 4000) };
      }),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * The film scanned for flashing and for standing still: every `every`th frame rendered small. Its brightness in a
   * 4 x 4 grid is checked for three or more light/dark flashes in a second (runtime/qa.ts flashes); a 128 x 72 copy
   * measures how much of the film barely changes from sample to sample, up to its close (runtime/qa.ts stillness).
   * About a quarter of the film's frames.
   */
  async motionScan(film: WireFilm, signal?: AbortSignal, every = 4): Promise<{ flashing: string[]; still: ReturnType<typeof stillness> }> {
    const run = this.queue.then(() =>
      withBackgroundFrames(async () => {
        this.rendering();
        const input = toInput(film);
        const comp = composition(input);
        const samples: { frame: number; grid: number[] }[] = [];
        const lumas: { frame: number; luma: number[] }[] = [];
        const big = new OffscreenCanvas(128, 72).getContext("2d");
        if (!big) return { flashing: [], still: { share: 0, longest: null } };
        for (let f = 0; f < comp.durationInFrames; f += every) {
          signal?.throwIfAborted();
          // A quarter-size render, read straight from its canvas: the scan only needs brightness, and a full
          // 1080p render with a JPEG encode took seconds a frame on a busy film.
          const still = await renderStillOnWeb({ composition: comp, inputProps: input, frame: f, scale: 0.25, signal: signal ?? null, delayRenderTimeoutInMilliseconds: 120_000, licenseKey: REMOTION_LICENSE_KEY });
          // Scaled down with a real filter: a plain drawImage to a few pixels samples a handful of the frame's
          // pixels, so a line of type that happens to sit under one reads as a flash.
          const bmp = await createImageBitmap(await still.canvas(), { resizeWidth: 128, resizeHeight: 72, resizeQuality: "high" });
          big.drawImage(bmp, 0, 0);
          bmp.close();
          const lp = big.getImageData(0, 0, 128, 72).data;
          const luma: number[] = [];
          for (let i = 0; i < lp.length; i += 4) luma.push(0.2126 * lp[i] + 0.7152 * lp[i + 1] + 0.0722 * lp[i + 2]);
          lumas.push({ frame: f, luma });
          // The flash grid: each of its 4 x 4 regions is the mean of its 32 x 18 block.
          const grid: number[] = [];
          for (let ry = 0; ry < 4; ry++)
            for (let rx = 0; rx < 4; rx++) {
              let sum = 0;
              for (let y = ry * 18; y < ry * 18 + 18; y++) for (let x = rx * 32; x < rx * 32 + 32; x++) sum += luma[y * 128 + x];
              grid.push(sum / 576);
            }
          samples.push({ frame: f, grid });
        }
        const { timing } = filmTiming(film.spec.beats, film.spec.score);
        return { flashing: flashes(samples, FILM_FPS, every), still: stillness(lumas, timing.closeAt) };
      }),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  async exportMp4(film: WireFilm, onProgress: (p: number) => void, signal?: AbortSignal, target?: Target, profile: RenderProfile = profileOf()): Promise<Blob> {
    const input = toInput(film);
    this.rendering();
    const t = target ?? { container: "mp4", videoCodec: "h264", audioCodec: "aac" };
    const result = await renderMediaOnWeb({
      composition: composition(input),
      inputProps: input,
      container: t.container,
      videoCodec: t.videoCodec,
      audioCodec: t.audioCodec,
      videoBitrate: profile.videoBitrate,
      hardwareAcceleration: profile.hardwareAcceleration,
      scale: profile.scale,
      licenseKey: REMOTION_LICENSE_KEY,
      signal,
      onProgress: (p) => onProgress(p.progress),
    });
    return result.getBlob();
  }
}

"use client";

import { renderMediaOnWeb, renderStillOnWeb } from "@remotion/web-renderer";
import { DIMENSIONS } from "@/engine/plan";
import type { FilmInput, FilmSpec } from "./film";
import { FilmComposition, filmFrames } from "./runtime/FilmComposition";
import { qaWarnings } from "./runtime/qa";
import { FILM_FPS } from "./timing";

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

const composition = (input: FilmInput) => {
  const { width, height } = DIMENSIONS[input.spec.format];
  return { id: "film", component: FilmComposition, width, height, fps: FILM_FPS, durationInFrames: filmFrames(input), defaultProps: input };
};

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

  async stills(film: WireFilm, frames: number[], signal?: AbortSignal, quality = 0.82): Promise<{ images: Blob[]; warnings: string[] }> {
    const run = this.queue.then(async () => {
      signal?.throwIfAborted();
      this.rendering();
      const input = { ...toInput(film), qa: true };
      const comp = composition(input);
      qaWarnings.length = 0;
      const images: Blob[] = [];
      for (const frame of frames) {
        const f = Math.max(0, Math.min(comp.durationInFrames - 1, Math.round(frame)));
        const still = await renderStillOnWeb({ composition: comp, inputProps: input, frame: f, signal: signal ?? null, delayRenderTimeoutInMilliseconds: 120_000 });
        images.push(await still.blob({ format: "jpeg", quality }));
      }
      return { images, warnings: [...new Set(qaWarnings)].slice(0, 30) };
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async exportMp4(film: WireFilm, onProgress: (p: number) => void, signal?: AbortSignal): Promise<Blob> {
    const input = toInput(film);
    this.rendering();
    const result = await renderMediaOnWeb({
      composition: composition(input),
      inputProps: input,
      container: "mp4",
      videoCodec: "h264",
      videoBitrate: "high",
      signal,
      onProgress: (p) => onProgress(p.progress),
    });
    return result.getBlob();
  }
}

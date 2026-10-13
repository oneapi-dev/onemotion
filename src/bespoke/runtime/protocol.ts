import type { FilmSpec } from "../film";

/**
 * Messages between the Studio and the sandbox iframe. Voice lines travel as
 * Blobs: the sandbox has its own (opaque) origin and cannot open the
 * Studio's blob URLs.
 */
export type WireFilm = { spec: FilmSpec; modules: Record<string, string>; voiceover?: Record<number, Blob> };

export type ToSandbox =
  | { type: "ping" }
  | { type: "show"; film: WireFilm }
  | { type: "stills"; id: string; film: WireFilm; frames: number[]; quality?: number }
  | { type: "export"; id: string; film: WireFilm }
  | { type: "abort"; id: string };

export type FromSandbox =
  | { type: "ready" }
  | { type: "shown"; frames: number }
  | { type: "player-error"; message: string }
  | { type: "stills"; id: string; images: Blob[]; warnings: string[] }
  | { type: "progress"; id: string; progress: number }
  | { type: "exported"; id: string; blob: Blob }
  | { type: "failed"; id: string; message: string };

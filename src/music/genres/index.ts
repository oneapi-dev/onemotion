import { house } from "./house";
import { trailer } from "./trailer";
import type { GenreSpec } from "./types";

export const GENRES = ["trailer", "synthwave", "lofi", "house", "future-bass", "corporate-pop", "orchestral", "ambient-tech"] as const;
export type Genre = (typeof GENRES)[number];

const SPECS: Partial<Record<Genre, GenreSpec>> = { house, trailer };

/**
 * Genres not written yet play as the closest one that is, so any score a
 * director writes still sounds.
 */
const STAND_IN: Record<Genre, Genre> = {
  trailer: "trailer",
  orchestral: "trailer",
  "ambient-tech": "trailer",
  house: "house",
  synthwave: "house",
  lofi: "house",
  "future-bass": "house",
  "corporate-pop": "house",
};

export const playable = (genre: Genre): Genre => (SPECS[genre] ? genre : STAND_IN[genre]);
export const specOf = (genre: Genre): GenreSpec => SPECS[playable(genre)]!;
export const isGenre = (v: unknown): v is Genre => typeof v === "string" && (GENRES as readonly string[]).includes(v);

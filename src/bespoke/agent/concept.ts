import type { SiteInfo } from "@/director/input";
import { LIBRARY } from "@/music/library";
import { normalizeScore } from "@/music/score";
import type { FilmFormat, FilmSpec } from "../film";
import { FONT_NAMES } from "../kit/fonts";

/** The creative director's concept for one bespoke film. */
export type Concept = {
  title: string;
  language: string;
  angle: string;
  style: string;
  metaphor: string;
  world: string;
  camera: string;
  components: string[];
  typography: { display: string; text: string; mono: string | null };
  palette: { bg: string; ink: string; accent: string; support: string };
  brand: { name: string; url: string };
  beats: { id: string; says: string; shows: string; voice: string; seconds: number }[];
  score: unknown;
  /** A built-in track id, or "composed" for the composer. */
  music: string;
  /** Whether the film has a voice-over (false when the brief asks for none). */
  voiceover: boolean;
  /** The facts the film states, copied from the brief and the pages read: the agents' short list. */
  facts: string[];
  whyDifferent: string;
};

export class UnusableConceptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnusableConceptError";
  }
}

const MIN_BEATS = 2;
const MAX_BEATS = 10;
const MAX_SECONDS = 60;
const CLOSE_SECONDS = 3;
const HEX = /^#[0-9a-fA-F]{6}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const hex = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toUpperCase() : fallback);
const font = (v: unknown, fallback: string) => (typeof v === "string" && FONT_NAMES.includes(v.trim()) ? v.trim() : fallback);

/**
 * A concept checked and repaired: beats renumbered b1..bn with sane lengths
 * (the last one long enough to hold the brand), colours and fonts valid. A
 * concept with fewer than two beats cannot be built and throws.
 */
export function normalizeConcept(raw: unknown): Concept {
  if (!isRecord(raw)) throw new UnusableConceptError("The concept was not a JSON object.");
  const rawBeats = Array.isArray(raw.beats) ? raw.beats.filter(isRecord).slice(0, MAX_BEATS) : [];
  if (rawBeats.length < MIN_BEATS) throw new UnusableConceptError("The concept has too few beats.");
  const beats = rawBeats.map((b, i) => ({
    id: `b${i + 1}`,
    says: str(b.says, 120),
    shows: str(b.shows, 400),
    voice: str(b.voice, 200),
    seconds: Math.min(12, Math.max(0.8, typeof b.seconds === "number" && Number.isFinite(b.seconds) ? b.seconds : 2.5)),
  }));
  beats[beats.length - 1].seconds = Math.max(CLOSE_SECONDS, beats[beats.length - 1].seconds);
  const total = beats.reduce((a, b) => a + b.seconds, 0);
  if (total > MAX_SECONDS) for (const b of beats) b.seconds = Math.max(0.8, (b.seconds * MAX_SECONDS) / total);
  const typo = isRecord(raw.typography) ? raw.typography : {};
  const pal = isRecord(raw.palette) ? raw.palette : {};
  const brand = isRecord(raw.brand) ? raw.brand : {};
  return {
    title: str(raw.title, 120),
    language: /^[a-z]{2}$/.test(str(raw.language, 5)) ? str(raw.language, 5) : "en",
    angle: str(raw.angle),
    style: str(raw.style, 120),
    metaphor: str(raw.metaphor),
    world: str(raw.world),
    camera: str(raw.camera),
    components: Array.isArray(raw.components) ? raw.components.map((c) => str(c, 300)).filter(Boolean).slice(0, 6) : [],
    typography: { display: font(typo.display, "Space Grotesk"), text: font(typo.text, "Inter"), mono: typo.mono ? font(typo.mono, "JetBrains Mono") : null },
    palette: { bg: hex(pal.bg, "#F4F2EC"), ink: hex(pal.ink, "#151515"), accent: hex(pal.accent, "#FF4F1F"), support: hex(pal.support, "#2F6BFF") },
    brand: { name: str(brand.name, 60), url: str(brand.url, 80).replace(/^https?:\/\//, "").replace(/\/$/, "") },
    beats,
    score: raw.score,
    music: LIBRARY.some((t) => t.id === raw.music) || raw.music === "composed" ? String(raw.music) : "",
    voiceover: raw.voiceover !== false,
    facts: Array.isArray(raw.facts) ? raw.facts.map((f) => str(f, 240)).filter(Boolean).slice(0, 25) : [],
    whyDifferent: str(raw.why_different),
  };
}

/** The film a concept describes, in the chosen format, with the website's logo and colour when it was read. */
/**
 * The built-in track a film plays: the concept's pick, else one picked by the
 * seed from those the recent films did not use. "composed" keeps the composer.
 */
export function trackFor(concept: Concept, seed: number, recent: string[] = []): string | undefined {
  if (concept.music === "composed") return undefined;
  if (concept.music) return concept.music;
  const fresh = LIBRARY.filter((t) => !recent.includes(t.id));
  const pool = fresh.length ? fresh : LIBRARY;
  return pool[seed % pool.length]?.id;
}

export function filmSpecOf(concept: Concept, format: FilmFormat, site: SiteInfo | null, seed: number, recentTracks: string[] = []): FilmSpec {
  const track = LIBRARY.find((t) => t.id === trackFor(concept, seed, recentTracks));
  const colors = [site?.accent, concept.palette.accent, concept.palette.support].filter((c): c is string => typeof c === "string" && HEX.test(c));
  return {
    format,
    beats: concept.beats,
    brand: { name: concept.brand.name || site?.name || "", url: concept.brand.url || site?.domain || "", logo: site?.logo ?? null, colors: [...new Set(colors)] },
    // A built-in track sets the tempo the beats snap to.
    score: track ? { ...normalizeScore(concept.score, concept.beats.length, "corporate-pop", seed), bpm: track.bpm } : normalizeScore(concept.score, concept.beats.length, "corporate-pop", seed),
    ...(track ? { track: track.id } : {}),
  };
}

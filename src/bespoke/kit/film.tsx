import { createContext, useContext, type ReactNode } from "react";

/**
 * The film's clock and frame, for a bespoke scene: its beats in frames, a
 * cue() to place things on them, the format and the brand.
 */

export type Brand = {
  name: string;
  url: string;
  /** The brand's logo as an image URL the film can draw (a data URL), or null for none. */
  logo: string | null;
  /** The brand's own colours, strongest first; may be empty. */
  colors: string[];
};

/**
 * The second brand of a collaboration film. `lead` says how the two share
 * the film: "host" (the film's own brand leads, the partner joins) or
 * "equal" (co-branded, the same weight).
 */
export type Partner = Brand & { lead: "host" | "equal" };

export type Beat = {
  id: string;
  /** What this beat says (its idea, or its voice-over line) and what it shows. */
  says: string;
  shows: string;
  /** Its voice-over line as spoken, and whether it was recorded (when not, its word times are estimates). */
  voice: string;
  spoken: boolean;
  /** First frame of the beat and the frame after its last. */
  start: number;
  end: number;
  /** Every word of the line and the frames it is spoken. */
  words: BeatWord[];
};

export type BeatWord = { text: string; at: number; end: number };

export type Film = {
  fps: number;
  W: number;
  H: number;
  /** Portrait (taller than wide). */
  P: boolean;
  format: "landscape" | "portrait" | "square";
  total: number;
  beats: Beat[];
  /** A beat by id ("b3") or index. */
  beat: (id: string | number) => Beat;
  /**
   * The frame of a moment: "b3" (start of beat b3), "b3+0.4" or "b3-0.25"
   * (seconds after or before it), "b3.end" (its end), "b3@0.5" (halfway
   * through it), "end" (the last frame). "b3:word" is the frame the voice
   * says that word ("b3:word#2" its second time), and takes the same offsets
   * ("b3:word+0.2"). Put every visual beat on the word that names it.
   */
  cue: (c: string) => number;
  brand: Brand;
  /** The partner brand of a collaboration film, or null. */
  partner: Partner | null;
  /** Real images fetched for this film (logos, icons), by name, as image URLs the film can draw. */
  assets: Record<string, string>;
  /** Keep key content inside this box. */
  safe: { top: number; bottom: number; left: number; right: number };
};

const FilmContext = createContext<Film | null>(null);

export const FilmProvider = ({ value, children }: { value: Film; children: ReactNode }) => <FilmContext.Provider value={value}>{children}</FilmContext.Provider>;

export const useFilm = (): Film => {
  const f = useContext(FilmContext);
  if (!f) throw new Error("useFilm() must be used inside a bespoke film");
  return f;
};

// The word part may be a phrase ("b2:satu integrasi"): models cue on the words they mean, and a phrase is matched as a whole.
const CUE = /^([A-Za-z0-9_-]+)(?::([^#@+]+?)(?:#(\d+))?)?(\.end|@(\d*\.?\d+))?([+-]\d*\.?\d+)?$/;

/** A word as it compares: lower case, letters and digits only, accents dropped. */
export const normWord = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]/gu, "");

/** Cues that named a word their beat does not say, since the host last read them: each fell back to its beat's start. */
export const cueMisses = new Set<string>();

/** The cue() of a film: parses "b3", "b3+0.4", "b3.end", "b3@0.5", "end". Unknown beats throw, so a typo shows up in the check render; a word the beat does not say falls back to the beat's start (reported, never fatal: a voice line edited later must not stop the film). */
export function makeCue(beats: Beat[], total: number, fps: number) {
  return (c: string): number => {
    const s = c.trim();
    if (s === "end") return total - 1;
    const m = CUE.exec(s);
    if (!m) throw new Error(`cue("${c}"): use "b3", "b3:word", "b3+0.4", "b3.end", "b3@0.5" or "end"`);
    const b = beats.find((x) => x.id === m[1]);
    if (!b) throw new Error(`cue("${c}"): there is no beat "${m[1]}" (beats: ${beats.map((x) => x.id).join(", ")})`);
    let f = b.start;
    if (m[2]) {
      // One word, or a phrase: the frame of its first word where the whole phrase is said.
      const want = m[2].trim().split(/\s+/).map(normWord).filter(Boolean);
      const same = (w: BeatWord | undefined, x: string) => Boolean(w) && (normWord((w as BeatWord).text) === x || (x.length >= 3 && normWord((w as BeatWord).text).startsWith(x)));
      const hits = b.words.filter((_, i) => want.length > 0 && want.every((x, k) => same(b.words[i + k], x)));
      const w = hits[Math.max(0, Number(m[3] ?? 1) - 1)];
      if (!w) cueMisses.add(`cue("${c}"): beat ${b.id} does not say "${m[2]}" (it says: ${b.words.map((x) => x.text).join(" ")}); it fell back to the beat's start`);
      f = w ? w.at : b.start;
    } else if (m[4] === ".end") f = b.end;
    else if (m[5] !== undefined) f = b.start + (b.end - b.start) * Number(m[5]);
    if (m[6]) f += Number(m[6]) * fps;
    return Math.round(f);
  };
}

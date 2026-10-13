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

export type Beat = {
  id: string;
  /** What this beat says (its idea, or its voice-over line) and what it shows. */
  says: string;
  shows: string;
  /** First frame of the beat and the frame after its last. */
  start: number;
  end: number;
};

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
   * through it), "end" (the last frame).
   */
  cue: (c: string) => number;
  brand: Brand;
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

const CUE = /^([A-Za-z0-9_-]+)(\.end|@(\d*\.?\d+))?([+-]\d*\.?\d+)?$/;

/** The cue() of a film: parses "b3", "b3+0.4", "b3.end", "b3@0.5", "end". Unknown beats throw, so a typo shows up in the check render. */
export function makeCue(beats: Beat[], total: number, fps: number) {
  return (c: string): number => {
    const s = c.trim();
    if (s === "end") return total - 1;
    const m = CUE.exec(s);
    if (!m) throw new Error(`cue("${c}"): use "b3", "b3+0.4", "b3.end", "b3@0.5" or "end"`);
    const b = beats.find((x) => x.id === m[1]);
    if (!b) throw new Error(`cue("${c}"): there is no beat "${m[1]}" (beats: ${beats.map((x) => x.id).join(", ")})`);
    let f = b.start;
    if (m[2] === ".end") f = b.end;
    else if (m[3] !== undefined) f = b.start + (b.end - b.start) * Number(m[3]);
    if (m[4]) f += Number(m[4]) * fps;
    return Math.round(f);
  };
}

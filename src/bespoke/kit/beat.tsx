import { createContext, useContext, type ComponentType } from "react";
import { Sequence } from "remotion";
import { useFilm, type Beat, type Film } from "./film";

/**
 * Beats as their own pieces: each beat's component is written by its own
 * agent and runs on its own clock. Inside a beat, useCurrentFrame() is 0
 * at the beat's start, and useBeat().cue() answers in that local time.
 * <World> (world.tsx) renders them as stations of one world; <Beats> one
 * after another in the same place.
 */

export type BeatScope = {
  beat: Beat;
  /** The beat's length in frames (without the overlap into the next beat). */
  len: number;
  /**
   * A local frame in this beat: "gateway" (the frame the voice says that
   * word in this beat), "gateway#2", "gateway+0.2", "@0.5" (halfway),
   * "end" (the beat's last frame), or any film cue ("b4", "b4:word"),
   * converted to this beat's time.
   */
  cue: (c: string) => number;
  /**
   * When each of n things lands: n local frames spread evenly from cue `from` to cue `to` (12 % to
   * 70 % into the beat by default), so a hold is told in steps (the rows of a receipt, the points of
   * a list, the hops of a request) instead of shown all at once.
   */
  steps: (n: number, from?: string, to?: string) => number[];
};

/** @internal What <World> and <Beats> give each beat. */
export const BeatContext = createContext<BeatScope | null>(null);

export const useBeat = (): BeatScope => {
  const b = useContext(BeatContext);
  if (!b) throw new Error("useBeat() must be used inside a beat rendered by <World> (or <Beats>)");
  return b;
};

/** @internal A beat's scope: its length, and cue() in its own time. */
export function beatScope(film: Film, b: Beat): BeatScope {
  const len = b.end - b.start;
  const cue = (c: string) => {
    const s = c.trim();
    if (s === "end") return len - 1;
    const at = /^@(\d*\.?\d+)$/.exec(s);
    if (at) return Math.round(len * Number(at[1]));
    if (/^(b\d+|end)\b/.test(s)) return film.cue(s) - b.start;
    return film.cue(`${b.id}:${s}`) - b.start;
  };
  return {
    beat: b,
    len,
    cue,
    steps: (n, from = "@0.12", to = "@0.7") => {
      const a = cue(from);
      const z = cue(to);
      const k = Math.max(0, Math.floor(n));
      return Array.from({ length: k }, (_, i) => Math.round(k === 1 ? a : a + ((z - a) * i) / (k - 1)));
    },
  };
}

/**
 * Renders each beat's component during its beat, plus `overlap` frames into
 * the next one (room for an exit while the next beat enters). Put it where
 * the beats belong in your world: inside a camera, over a background.
 */
export const Beats = ({ of, overlap = 0 }: { of: Record<string, ComponentType>; overlap?: number }) => {
  const film = useFilm();
  return (
    <>
      {film.beats.map((b, i) => {
        const C = of[b.id];
        if (!C) return null;
        const scope = beatScope(film, b);
        return (
          <Sequence key={b.id} from={b.start} durationInFrames={scope.len + (i < film.beats.length - 1 ? overlap : 0)} layout="none" name={b.id}>
            <BeatContext.Provider value={scope}>
              <C />
            </BeatContext.Provider>
          </Sequence>
        );
      })}
    </>
  );
};

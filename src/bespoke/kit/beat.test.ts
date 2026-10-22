import { describe, expect, it } from "vitest";
import { beatScope, filmScope } from "./beat";
import type { Beat, Film } from "./film";

const film = { cue: (c: string) => (c === "b2:rows" ? 160 : 0) } as unknown as Film;
const scope = beatScope(film, { id: "b2", start: 100, end: 250 } as Beat);

describe("a beat's steps", () => {
  it("spreads n landings evenly over the hold, 12 % to 70 % in by default", () => {
    expect(scope.steps(3)).toEqual([18, 62, 105]);
    expect(scope.steps(1)).toEqual([18]);
    expect(scope.steps(0)).toEqual([]);
  });

  it("starts and ends on any cue, a word of the voice included", () => {
    expect(scope.steps(2, "rows", "@0.8")).toEqual([60, 120]);
  });
});

describe("useBeat() outside a beat", () => {
  const whole = filmScope({ total: 600, cue: (c: string) => (c === "b4:masuk" ? 420 : 0) } as unknown as Film);

  it("reads the film on its own clock: named beats, fractions and the end", () => {
    expect(whole.cue("b4:masuk")).toBe(420);
    expect(whole.cue("@0.5")).toBe(300);
    expect(whole.cue("end")).toBe(599);
  });

  it("throws on a bare word, naming the fix", () => {
    expect(() => whole.cue("masuk")).toThrow(/cue\("b4:masuk"\)/);
  });
});

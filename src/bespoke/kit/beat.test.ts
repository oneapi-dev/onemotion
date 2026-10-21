import { describe, expect, it } from "vitest";
import { beatScope } from "./beat";
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

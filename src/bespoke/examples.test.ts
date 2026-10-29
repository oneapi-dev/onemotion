import { describe, expect, it, vi } from "vitest";
import { checkScene } from "./check";
import { readExample } from "./examples";

vi.mock("server-only", () => ({}));

describe("example films", () => {
  it.each(["pattern", "onemotion", "kinetic", "kinetic-blocks", "look-newsroom", "look-pictogram", "look-map", "look-isometric", "look-math", "look-whiteboard", "look-print"])("%s passes the scene check", (name) => {
    const ex = readExample(name);
    expect(ex).not.toBeNull();
    const r = checkScene(ex!.files);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    // A whole-film check runs the TypeScript compiler: about 3 s on its own, longer while the rest of the suite runs.
  }, 20_000);
});

import { describe, expect, it, vi } from "vitest";
import { checkScene } from "./check";
import { readExample } from "./examples";

vi.mock("server-only", () => ({}));

describe("example films", () => {
  it.each(["pattern", "onemotion", "kinetic", "kinetic-blocks"])("%s passes the scene check", (name) => {
    const ex = readExample(name);
    expect(ex).not.toBeNull();
    const r = checkScene(ex!.files);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

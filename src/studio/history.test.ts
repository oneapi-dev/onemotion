import { describe, expect, it } from "vitest";
import type { FilmState } from "@/bespoke/agent/run";
import { pushVersion, type History } from "./history";

const v = (label: string) => ({ at: "", label, film: { summary: label } as FilmState });

describe("pushVersion", () => {
  it("drops the redo versions when a new edit follows an undo", () => {
    let h: History = { versions: [], index: -1 };
    for (const l of ["a", "b", "c"]) h = pushVersion(h, v(l));
    h = { ...h, index: 0 };
    h = pushVersion(h, v("d"));
    expect(h.versions.map((x) => x.label)).toEqual(["a", "d"]);
    expect(h.index).toBe(1);
  });

  it("keeps the newest twenty", () => {
    let h: History = { versions: [], index: -1 };
    for (let i = 0; i < 25; i++) h = pushVersion(h, v(String(i)));
    expect(h.versions).toHaveLength(20);
    expect(h.versions[0].label).toBe("5");
    expect(h.index).toBe(19);
  });
});

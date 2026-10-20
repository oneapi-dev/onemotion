import { describe, expect, it } from "vitest";
import { codeLines, difference, namesLength, sameness, thinness, tooShort } from "./floor";

const stub = "// Beat b1: its agent writes this file.\nexport default function Beat() {\n  return null;\n}\n";
const body = (n: number) => Array.from({ length: n }, (_, i) => `  const x${i} = ${i};`).join("\n");

describe("the quality floor", () => {
  it("calls a 50-line film of four beats thin (the fast model's sketch), and a real one not", () => {
    const sketch = { "scene/index.tsx": body(51), "scene/beats/b1.tsx": stub, "scene/beats/b2.tsx": stub };
    expect(codeLines(sketch)).toBe(51);
    expect(thinness(sketch, 4)).toMatch(/the film is thin: 51 lines of scene code for 4 beats/);
    expect(thinness({ "scene/index.tsx": body(900) }, 6)).toBeNull();
  });

  it("asks for a longer film only when the brief leaves the length open", () => {
    const four = [4, 4, 4, 4].map((seconds) => ({ seconds }));
    expect(tooShort(four, "A promo for the 50% bonus")).toBe(true);
    expect(tooShort(four, "A 15-second promo for the 50% bonus")).toBe(false);
    expect(namesLength("video 30 detik")).toBe(true);
  });

  it("finds beats in a row that look the same, and lets different ones through", () => {
    const flat = (v: number) => new Float32Array(48 * 27).fill(v);
    const same = sameness([
      { beat: "b1", frame: 60, sig: flat(200) },
      { beat: "b2", frame: 150, sig: flat(204) },
      { beat: "b3", frame: 240, sig: flat(90) },
    ]);
    expect(same).toHaveLength(1);
    expect(same[0]).toMatch(/b1 \(frame 60\) and b2 \(frame 150\) look nearly the same/);
    expect(difference(flat(0), flat(255))).toBe(255);
  });
});

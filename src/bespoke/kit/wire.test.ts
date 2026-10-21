import { describe, expect, it } from "vitest";
import { edgePoint, wirePoints } from "./wire";

describe("wires", () => {
  const left = { x: 0, y: 100, w: 200, h: 100 };
  const right = { x: 600, y: 100, w: 200, h: 100 };

  it("start and end on the edges of what they join, with the gap, never inside or off to the side", () => {
    expect(edgePoint(left, { x: 700, y: 150 }, 12)).toEqual({ x: 212, y: 150 });
    const [a, b] = wirePoints(left, right, false, 10);
    expect(a).toEqual({ x: 210, y: 150 });
    expect(b).toEqual({ x: 590, y: 150 });
  });

  it("turn once for an elbow: along x first, then down to the box", () => {
    const box = { x: 300, y: 500, w: 200, h: 80 };
    const pts = wirePoints(left, box, true, 0);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 200, y: 150 });
    expect(pts[1]).toEqual({ x: 400, y: 150 });
    expect(pts[2]).toEqual({ x: 400, y: 500 });
  });
});

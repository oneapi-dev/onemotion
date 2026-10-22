import { describe, expect, it } from "vitest";
import { gapSegment, inView, overview, worldCam, worldCamWithFinale, worldLayout, worldLegs, type Station, type WorldLayout } from "./world";

const W = 1920;
const H = 1080;
const LAYOUTS: WorldLayout[] = ["row", "column", "diagonal", "zigzag", "grid", "scatter"];
const ids = (n: number) => Array.from({ length: n }, (_, i) => `b${i + 1}`);
const overlap = (a: Station, b: Station) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("the world's stations", () => {
  it.each(LAYOUTS)("%s never puts two stations over each other, in either format", (layout) => {
    for (const [w, h] of [
      [W, H],
      [H, W],
    ])
      for (let n = 1; n <= 12; n++) {
        const s = worldLayout(ids(n), w, h, layout);
        expect(s).toHaveLength(n);
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlap(s[i], s[j]), `${layout} n=${n}: ${s[i].id} and ${s[j].id}`).toBe(false);
      }
  });

  it("leaves a gap the camera travels through between neighbours", () => {
    const [a, b] = worldLayout(ids(2), W, H, "row", 0.3);
    expect(b.x - (a.x + a.w)).toBeCloseTo(W * 0.3);
    expect(gapSegment(a, b)).toEqual({ x1: W, y1: H / 2, x2: W * 1.3, y2: H / 2 });
  });
});

describe("the world's camera", () => {
  // Three beats of 3 s each.
  const starts = [0, 90, 180];
  const ends = [90, 180, 270];
  const stations = worldLayout(ids(3), W, H, "row");
  const legs = worldLegs(starts, ends, ["swoop", "swoop", "whip"]);
  const cam = (t: number) => worldCam(t, stations, legs, 270);

  it("opens on the first station, framed exactly: the thumbnail", () => {
    expect(cam(0)).toMatchObject({ x: W / 2, y: H / 2, k: 1, r: -0, blur: 0 });
  });

  it("travels on the beat and lands just after it begins, then pushes in slowly while it holds", () => {
    const into2 = legs[0];
    expect(into2.a).toBeLessThan(90);
    expect(into2.b).toBeGreaterThan(90);
    expect(into2.b - into2.a).toBe(26);
    // Mid-move: between the stations, pulled back.
    const mid = cam((into2.a + into2.b) / 2);
    expect(mid.x).toBeGreaterThan(W / 2);
    expect(mid.x).toBeLessThan(stations[1].x + W / 2);
    expect(mid.k).toBeLessThan(0.9);
    // Landed on station 2, then a slow push that never goes past 3 %.
    expect(cam(into2.b)).toMatchObject({ x: stations[1].x + W / 2, y: H / 2, k: 1 });
    expect(cam(140).k).toBeGreaterThan(1);
    expect(cam(legs[1].a - 1).k).toBeLessThanOrEqual(1.03);
  });

  it("moves without a jump from frame to frame (a whip is fast, never a cut)", () => {
    for (let t = 1; t < 270; t++) {
      const a = cam(t - 1);
      const b = cam(t);
      const whip = t > legs[1].a && t <= legs[1].b;
      expect(Math.abs(b.x - a.x), `x at ${t}`).toBeLessThan(W * (whip ? 0.45 : 0.2));
      expect(Math.abs(Math.log(b.k / a.k)), `k at ${t}`).toBeLessThan(0.05);
    }
  });

  it("blurs only during a whip, and a cut jumps exactly on its beat", () => {
    const whip = legs[1];
    expect(whip.b - whip.a).toBe(12);
    expect(cam((whip.a + whip.b) / 2).blur).toBeGreaterThan(4);
    expect(cam(legs[0].a + 5).blur).toBe(0);
    const cut = worldLegs(starts, ends, ["cut", "cut", "cut"]);
    expect(cut[0]).toMatchObject({ a: 90, b: 90 });
    expect(worldCam(89, stations, cut, 270).x).toBe(W / 2);
    expect(worldCam(90, stations, cut, 270).x).toBe(stations[1].x + W / 2);
  });

  it("keeps a move inside short beats", () => {
    const short = worldLegs([0, 20, 40], [20, 40, 60], ["swoop", "swoop", "swoop"]);
    for (const l of short) expect(l.b - l.a).toBeLessThanOrEqual(12);
  });

  it("pulls back over the whole world for a finale, only in the last seconds", () => {
    const all = overview(stations, W, H);
    expect(all.k).toBeLessThan(0.5);
    expect(stations.every((s) => inView(s, all, W, H))).toBe(true);
    expect(worldCamWithFinale(150, stations, legs, 270, 0.03, all)).toEqual(cam(150));
    const end = worldCamWithFinale(269, stations, legs, 270, 0.03, all);
    expect(end.k).toBeCloseTo(all.k);
    expect(end.x).toBeCloseTo(all.x);
  });

  it("knows which stations the frame shows: only the one it holds, both while it travels", () => {
    const hold = cam(60);
    expect(stations.map((s) => inView(s, hold, W, H))).toEqual([true, false, false]);
    const travel = cam((legs[0].a + legs[0].b) / 2);
    expect(stations.map((s) => inView(s, travel, W, H))).toEqual([true, true, false]);
  });
});

describe("a dive", () => {
  const st = worldLayout(["b1", "b2"], W, H, "row");
  const legs = worldLegs([0, 150], [150, 300], ["swoop", "dive"]);
  const l = legs[0];

  it("zooms into the station it leaves, then the next one rushes up from far away and lands at scale 1", () => {
    const at = (p: number) => worldCam(Math.round(l.a + (l.b - l.a) * p), st, legs, 300, 0);
    expect(at(0.5).k).toBeGreaterThan(8);
    expect(at(0.5).x).toBeCloseTo(st[0].x + st[0].w / 2, 0);
    expect(at(0.6).k).toBeLessThan(0.8);
    expect(at(0.6).x).toBeCloseTo(st[1].x + st[1].w / 2, 0);
    expect(worldCam(l.b + 1, st, legs, 300, 0).k).toBeCloseTo(1, 2);
  });
});

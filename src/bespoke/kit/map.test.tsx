import { geoDistance, geoInterpolate } from "d3-geo";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilmProvider, type Film } from "./film";
import { MAX_LAT, MapStage, countryKey, densify, flight, mapCamAt, mapGeo, routeRuns, stepped, twoWords } from "./map";

const W = 1920;
const H = 1080;
const film = { fps: 30, W, H, P: false, format: "landscape", total: 300 } as unknown as Film;
const html = (node: React.ReactElement) => renderToStaticMarkup(<FilmProvider value={film}>{node}</FilmProvider>);
const world = () => mapGeo({ w: W, h: H, view: "world", detail: "110m" });

describe("map", () => {
  it("projects Paris inside France's mainland and outside Spain's", () => {
    const g = world();
    const [x, y] = g.px(2.35, 48.85);
    const fr = g.box("FRA")!;
    expect(fr).not.toBeNull();
    expect(x).toBeGreaterThan(fr[0][0]);
    expect(x).toBeLessThan(fr[1][0]);
    expect(y).toBeGreaterThan(fr[0][1]);
    expect(y).toBeLessThan(fr[1][1]);
    // The mainland, not France with French Guiana: a box a few dozen px wide at 1920.
    expect(fr[1][0] - fr[0][0]).toBeLessThan(80);
    const es = g.box("Spain")!;
    expect(y).toBeLessThan(es[0][1]);
  });

  it("finds countries by ISO3, numeric id, atlas name and common alias", () => {
    expect(countryKey("AUS")).toBe("036");
    expect(countryKey("36")).toBe("036");
    expect(countryKey("Australia")).toBe("036");
    expect(countryKey("USA")).toBe("840");
    expect(countryKey("Dem. Rep. Congo")).toBe("180");
    expect(countryKey("Kosovo")).toBe("Kosovo");
    expect(countryKey("Atlantis")).toBeNull();
  });

  it("interpolates zoom in log space: halfway from 1 to 4 is 2", () => {
    const g = world();
    const lin = (x: number) => x;
    const keys: [number, { lng: number; lat: number; zoom: number }, (x: number) => number][] = [
      [0, { lng: 10, lat: 20, zoom: 1 }, lin],
      [60, { lng: 10, lat: 20, zoom: 4 }, lin],
    ];
    expect(mapCamAt(30, keys, g).z).toBeCloseTo(2, 6);
    expect(mapCamAt(15, keys, g).z).toBeCloseTo(Math.SQRT2, 6);
    expect(mapCamAt(0, keys, g).z).toBeCloseTo(1, 6);
    expect(mapCamAt(60, keys, g).z).toBeCloseTo(4, 6);
    // rho 0 is a straight pan with the zoom still in log space.
    const f = flight({ x: 0, y: 0, z: 1 }, { x: 100, y: 0, z: 9 }, W, 0);
    expect(f(0.5).z).toBeCloseTo(3, 6);
  });

  it("pulls out toward the middle of a long flight and lands exactly on the next key", () => {
    const g = world();
    const keys: [number, { lng: number; lat: number; zoom: number }][] = [
      [0, { lng: -0.12, lat: 51.5, zoom: 4 }],
      [60, { lng: 151.2, lat: -33.9, zoom: 4 }],
    ];
    const mid = mapCamAt(30, keys, g);
    expect(mid.z).toBeLessThan(3);
    // Never past the whole view.
    expect(mid.z).toBeGreaterThanOrEqual(1);
    const end = mapCamAt(60, keys, g);
    const [sx, sy] = g.px(151.2, -33.9);
    expect(end.x).toBeCloseTo(sx, 6);
    expect(end.y).toBeCloseTo(sy, 6);
    expect(end.z).toBeCloseTo(4, 6);
  });

  it("frames a country with a fit key", () => {
    const g = world();
    const c = mapCamAt(0, [[0, { fit: "AUS" }]], g);
    const [x, y] = g.px(134, -25);
    expect(Math.hypot(c.x - x, c.y - y)).toBeLessThan(40);
    expect(c.z).toBeGreaterThan(3);
  });

  it("densifies a route along its great circle", () => {
    const a: [number, number] = [-0.12, 51.5];
    const b: [number, number] = [-74, 40.7];
    const pts = densify([a, b]);
    expect(pts).toHaveLength(41);
    expect(pts[0][0]).toBeCloseTo(a[0], 6);
    expect(pts[40][1]).toBeCloseTo(b[1], 6);
    // On the great circle: the steps add up to the arc's own length, and the middle is its midpoint.
    let sum = 0;
    for (let i = 1; i < pts.length; i++) sum += geoDistance(pts[i - 1], pts[i]);
    expect(sum).toBeCloseTo(geoDistance(a, b), 9);
    const m = geoInterpolate(a, b)(0.5);
    expect(pts[20][0]).toBeCloseTo(m[0], 6);
    expect(pts[20][1]).toBeCloseTo(m[1], 6);
    // London to New York bends north of both ends.
    expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThan(52);
  });

  it("splits a route at the antimeridian on a world view, and keeps it whole when the map is centred on the Pacific", () => {
    const sydneyHonolulu: [number, number][] = [
      [151.2, -33.9],
      [-157.9, 21.3],
    ];
    const atlantic = routeRuns(world(), sydneyHonolulu);
    expect(atlantic).toHaveLength(2);
    // Each piece ends at the map's edge, not across the frame.
    for (const run of atlantic) for (let i = 1; i < run.pts.length; i++) expect(Math.abs(run.pts[i][0] - run.pts[i - 1][0])).toBeLessThan(W / 4);
    const pacific = routeRuns(mapGeo({ w: W, h: H, view: "world", meridian: 160, detail: "110m" }), sydneyHonolulu);
    expect(pacific).toHaveLength(1);
  });

  it("keeps labels upright and the same size at any zoom", () => {
    const pins = [{ lng: 151.2, lat: -33.9, label: "Sydney", at: 0 }];
    const at = (zoom: number) => html(<MapStage t={60} detail="110m" cam={[[0, { lng: 151.2, lat: -33.9, zoom }]]} pins={pins} font="Inter" />);
    const size = (s: string) => /font-size:(\d+)px[^>]*>Sydney</.exec(s)?.[1];
    const near = at(6);
    const far = at(1);
    expect(size(near)).toBeDefined();
    expect(size(near)).toBe(size(far));
    expect(near).not.toMatch(/rotate/);
    // The pin sits at the frame's centre when the camera looks at it.
    expect(near).toContain(`left:${W / 2 - Math.max(5, Math.round(H * 0.0065))}px`);
  });

  it("cuts labels to two words", () => {
    expect(twoWords("  Gold   Coast Queensland ")).toBe("Gold Coast");
    const out = html(<MapStage t={60} detail="110m" pins={[{ lng: 153.4, lat: -28, label: "Gold Coast Queensland", at: 0 }]} />);
    expect(out).toContain(">Gold Coast<");
    expect(out).not.toContain("Queensland");
  });

  it("clamps latitudes past 85 degrees instead of projecting to infinity", () => {
    const g = mapGeo({ w: W, h: H, view: [-30, 50, 40, 89], projection: "mercator", detail: "110m" });
    const p = g.px(10, 89.9);
    expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
    expect(p).toEqual(g.px(10, MAX_LAT));
    expect(densify([[0, 89], [10, 88]]).every(([, lat]) => lat <= MAX_LAT)).toBe(true);
    const out = html(<MapStage t={60} view={[-30, 50, 40, 89]} detail="110m" pins={[{ lng: 10, lat: 89.9, label: "Pole", at: 0 }]} />);
    expect(out).not.toContain("NaN");
  });

  it("draws a route on over at least 36 frames, stroke divided by the zoom", () => {
    const routes = [{ path: [[151.2, -33.9], [115.2, -8.4]] as [number, number][], at: 0, dur: 10 }];
    const cam: [number, { lng: number; lat: number; zoom: number }][] = [[0, { lng: 135, lat: -20, zoom: 4 }]];
    const offset = (s: string) => Number(/stroke-dashoffset="([\d.e-]+)"/.exec(s)?.[1]);
    const mid = html(<MapStage t={18} detail="110m" cam={cam} routes={routes} />);
    expect(offset(mid)).toBeGreaterThan(0.2);
    expect(offset(html(<MapStage t={36} detail="110m" cam={cam} routes={routes} />))).toBe(0);
    expect(mid).toContain('stroke-width="0.75"');
    expect(html(<MapStage t={0} detail="110m" cam={cam} routes={routes} />)).not.toContain("<path");
  });

  it("steps overlays at 15 fps while the camera stays smooth", () => {
    expect([0, 1, 2, 3, 4, 5].map((t) => stepped(t))).toEqual([0, 0, 2, 2, 4, 4]);
    expect(stepped(7, 12, 24)).toBe(6);
    expect(stepped(7, 30, 30)).toBe(7);
    const pins = [{ lng: 30, lat: 10, at: 0 }];
    const cam: [number, { lng: number; lat: number; zoom: number }][] = [
      [0, { lng: 0, lat: 0, zoom: 1 }],
      [30, { lng: 0, lat: 0, zoom: 2 }],
    ];
    const a = html(<MapStage t={4} detail="110m" stepped cam={cam} pins={pins} />);
    const b = html(<MapStage t={5} detail="110m" stepped cam={cam} pins={pins} />);
    // The pin (an overlay) holds for two frames; the camera (canvas transform, so the pin's place) still moves: same drop, different place.
    expect(a).not.toBe(b);
  });
});

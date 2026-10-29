// Editorial maps: Natural Earth countries (world-atlas TopoJSON, bundled with the kit: no tiles, no
// network), projected with d3-geo once per stage, then moved by a camera. Land is drawn on one canvas
// (cheap to export); routes are SVG drawn on with pathLength=1; pins and labels sit outside the scaled
// layer, upright and the same size at any zoom. Recipes after iart-ai's map-animation skills
// (vector-maps.md); the camera flight is van Wijk and Nuij's smooth zoom-and-pan (as d3.interpolateZoom).
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { spring, useDelayRender } from "remotion";
import { geoEqualEarth, geoInterpolate, geoMercator, geoPath, type GeoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world110 from "world-atlas/countries-110m.json";
import { useFilm } from "./film";
import { clamp01, inOut, mix, outE, prog } from "./motion";

// ------------------------------------------------------------------ cadence

/**
 * Frame t stepped to `rate` drawings a second (15 at 30 fps holds every frame twice): the "on twos"
 * cadence of news maps. Use it for overlays (pins, routes, labels), never for the camera.
 */
export const stepped = (t: number, rate = 15, fps = 30) => {
  const step = Math.max(1, Math.round(fps / rate));
  return Math.floor(t / step) * step;
};

// --------------------------------------------------------------------- data

/** The atlas scale: 1:110m (bundled, world views) or 1:50m (loaded on demand: regional views, small islands such as Bali). */
export type MapDetail = "110m" | "50m";
type Detail = MapDetail;
type Country = { key: string; id: string; name: string; f: GeoJSON.Feature };

const decode = (topo: unknown): Country[] => {
  const t = topo as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const fc = feature(t, t.objects.countries) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, { name: string }>;
  return fc.features.map((f) => {
    const id = f.id === undefined ? "" : String(f.id);
    const name = f.properties?.name ?? "";
    return { key: id || name, id, name, f };
  });
};

const DATA: Partial<Record<Detail, Country[]>> = {};
const countries = (d: Detail): Country[] => {
  if (d === "50m" && DATA["50m"]) return DATA["50m"];
  return (DATA["110m"] ??= decode(world110));
};

let loading50: Promise<void> | null = null;
/** @internal Loads the 1:50m countries (740 kB, its own chunk) once; until then maps draw the 1:110m set. */
export const loadDetail = (): Promise<void> =>
  (loading50 ??= import("world-atlas/countries-50m.json").then((m) => {
    DATA["50m"] = decode((m as { default?: unknown }).default ?? m);
  }));

// ISO 3166-1 alpha-3 to the numeric ids world-atlas keys its countries by.
const ISO =
  "AFG004 ALB008 ATA010 DZA012 ASM016 AND020 AGO024 ATG028 AZE031 ARG032 AUS036 AUT040 BHS044 BHR048 BGD050 ARM051 BRB052 BEL056 BMU060 BTN064 BOL068 BIH070 BWA072 BRA076 BLZ084 IOT086 SLB090 VGB092 BRN096 BGR100 MMR104 BDI108 BLR112 KHM116 CMR120 CAN124 CPV132 CYM136 CAF140 LKA144 TCD148 CHL152 CHN156 TWN158 COL170 COM174 COG178 COD180 COK184 CRI188 HRV191 CUB192 CYP196 CZE203 BEN204 DNK208 DMA212 DOM214 ECU218 SLV222 GNQ226 ETH231 ERI232 EST233 FRO234 FLK238 SGS239 FJI242 FIN246 ALA248 FRA250 PYF258 ATF260 DJI262 GAB266 GEO268 GMB270 PSE275 DEU276 GHA288 KIR296 GRC300 GRL304 GRD308 GUM316 GTM320 GIN324 GUY328 HTI332 HMD334 VAT336 HND340 HKG344 HUN348 ISL352 IND356 IDN360 IRN364 IRQ368 IRL372 ISR376 ITA380 CIV384 JAM388 JPN392 KAZ398 JOR400 KEN404 PRK408 KOR410 KWT414 KGZ417 LAO418 LBN422 LSO426 LVA428 LBR430 LBY434 LIE438 LTU440 LUX442 MAC446 MDG450 MWI454 MYS458 MDV462 MLI466 MLT470 MRT478 MUS480 MEX484 MCO492 MNG496 MDA498 MNE499 MSR500 MAR504 MOZ508 OMN512 NAM516 NRU520 NPL524 NLD528 CUW531 ABW533 SXM534 NCL540 VUT548 NZL554 NIC558 NER562 NGA566 NIU570 NFK574 NOR578 MNP580 FSM583 MHL584 PLW585 PAK586 PAN591 PNG598 PRY600 PER604 PHL608 PCN612 POL616 PRT620 GNB624 TLS626 PRI630 QAT634 ROU642 RUS643 RWA646 BLM652 SHN654 KNA659 AIA660 LCA662 MAF663 SPM666 VCT670 SMR674 STP678 SAU682 SEN686 SRB688 SYC690 SLE694 SGP702 SVK703 VNM704 SVN705 SOM706 ZAF710 ZWE716 ESP724 SSD728 SDN729 ESH732 SUR740 SWZ748 SWE752 CHE756 SYR760 TJK762 THA764 TGO768 TON776 TTO780 ARE784 TUN788 TUR792 TKM795 TCA796 UGA800 UKR804 MKD807 EGY818 GBR826 GGY831 JEY832 IMN833 TZA834 USA840 VIR850 BFA854 URY858 UZB860 VEN862 WLF876 WSM882 YEM887 ZMB894";
const ISO3: Record<string, string> = Object.fromEntries(ISO.split(" ").map((s) => [s.slice(0, 3), s.slice(3)]));

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Names people write for countries world-atlas spells otherwise (values: numeric id, or the atlas's name). */
const ALIAS: Record<string, string> = {
  usa: "840", us: "840", "united states": "840", america: "840", uk: "826", britain: "826", "great britain": "826", england: "826",
  "south korea": "410", korea: "410", "republic of korea": "410", "north korea": "408", "czech republic": "203", "ivory coast": "384",
  "cote d ivoire": "384", drc: "180", "dr congo": "180", "democratic republic of the congo": "180", "republic of the congo": "178",
  uae: "784", bosnia: "070", "bosnia and herzegovina": "070", "north macedonia": "807", swaziland: "748", "east timor": "626",
  "western sahara": "732", "central african republic": "140", "dominican republic": "214", "south sudan": "728",
  "equatorial guinea": "226", "solomon islands": "090", "falkland islands": "238", "vatican city": "336", holland: "528",
  xkx: "Kosovo", kosovo: "Kosovo",
};

/** The atlas key (numeric id, or name for the few without one) of a country given as ISO3, numeric id or name. */
export function countryKey(idOrName: string, list: Country[] = countries("110m")): string | null {
  const s = idOrName.trim();
  if (/^\d{1,3}$/.test(s)) {
    const id = s.padStart(3, "0");
    return list.some((c) => c.id === id) ? id : null;
  }
  const n = norm(s);
  const want = (/^[A-Za-z]{3}$/.test(s) && ISO3[s.toUpperCase()]) || ALIAS[n] || null;
  const hit = list.find((c) => (want ? c.id === want || c.name === want : norm(c.name) === n));
  return hit ? hit.key : null;
}

// ----------------------------------------------------------- the projection

/** "world", or a box [west, south, east, north] in degrees (west > east crosses the antimeridian). */
export type MapView = "world" | [number, number, number, number];
export type MapProjection = "equalEarth" | "mercator";
type Box = [[number, number], [number, number]];

/** Latitudes past this are clamped: Mercator runs to infinity at the poles. */
export const MAX_LAT = 85;
const clampLat = (lat: number) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

/** Points along the edges of a lng/lat box: fitting to them frames the box itself, not its great-circle chords. */
const boxPoints = ([w, s, e, n]: [number, number, number, number]): GeoJSON.MultiPoint => {
  const east = e < w ? e + 360 : e;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const lng = wrap(w + ((east - w) * i) / 8);
    const lat = s + ((n - s) * i) / 8;
    pts.push([lng, clampLat(s)], [lng, clampLat(n)], [wrap(w), clampLat(lat)], [wrap(east), clampLat(lat)]);
  }
  return { type: "MultiPoint", coordinates: pts };
};

/** @internal A stage's geography in base pixels (zoom 1): made once per size, view and detail. */
export type MapGeo = {
  w: number;
  h: number;
  detail: Detail;
  proj: GeoProjection;
  /** The projection's central meridian. */
  meridian: number;
  /** Base pixels of a place (latitude clamped to +-85). */
  px: (lng: number, lat: number) => [number, number];
  shapes: { key: string; name: string; d: string; bb: Box }[];
  /** Base-pixel bounds of a country's mainland (its largest polygon and the ones near it), or null. */
  box: (idOrName: string) => Box | null;
  /** Base-pixel bounds of a lng/lat box. */
  boxOf: (b: [number, number, number, number]) => Box;
  key: (idOrName: string) => string | null;
};

const GEO = new Map<string, MapGeo>();

/** @internal The geography of a stage, memoized: projecting is never repeated per frame. */
export function mapGeo(o: { w: number; h: number; view?: MapView; projection?: MapProjection; meridian?: number; detail?: Detail }): MapGeo {
  const view = o.view ?? "world";
  const projection = o.projection ?? (view === "world" ? "equalEarth" : "mercator");
  const meridian = o.meridian ?? (view === "world" ? 0 : wrap((view[0] + (view[2] < view[0] ? view[2] + 360 : view[2])) / 2));
  const detail: Detail = o.detail === "50m" && DATA["50m"] ? "50m" : "110m";
  const id = JSON.stringify([o.w, o.h, view, projection, meridian, detail]);
  const hit = GEO.get(id);
  if (hit) return hit;

  const proj = (projection === "mercator" ? geoMercator() : geoEqualEarth()).rotate([-meridian, 0]).precision(0.2);
  const pad = Math.round(Math.min(o.w, o.h) * 0.04);
  const target: GeoJSON.GeoJSON | { type: "Sphere" } = view !== "world" ? boxPoints(view) : projection === "mercator" ? boxPoints([meridian - 179.9, -58, meridian + 179.9, 78]) : { type: "Sphere" };
  proj.fitExtent(
    [
      [pad, pad],
      [o.w - pad, o.h - pad],
    ],
    target as GeoJSON.GeoJSON,
  );
  const gp: GeoPath = geoPath(proj).digits(1);
  const list = countries(detail);
  const shapes = list.flatMap((c) => {
    const d = gp(c.f);
    return d ? [{ key: c.key, name: c.name, d, bb: gp.bounds(c.f) as Box }] : [];
  });
  const boxes = new Map<string, Box | null>();
  const mainland = (c: Country): Box | null => {
    const g = c.f.geometry;
    const polys: GeoJSON.Polygon[] = g.type === "MultiPolygon" ? g.coordinates.map((p) => ({ type: "Polygon", coordinates: p })) : g.type === "Polygon" ? [g] : [];
    if (!polys.length) return null;
    const parts = polys.map((p) => ({ b: gp.bounds(p) as Box, a: gp.area(p) })).filter((p) => Number.isFinite(p.b[0][0]));
    if (!parts.length) return null;
    const big = parts.reduce((m, p) => (p.a > m.a ? p : m));
    const mid = (b: Box) => [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
    const [mx, my] = mid(big.b);
    const reach = Math.hypot(big.b[1][0] - big.b[0][0], big.b[1][1] - big.b[0][1]);
    const near = parts.filter((p) => {
      const [x, y] = mid(p.b);
      return Math.hypot(x - mx, y - my) <= reach;
    });
    return [
      [Math.min(...near.map((p) => p.b[0][0])), Math.min(...near.map((p) => p.b[0][1]))],
      [Math.max(...near.map((p) => p.b[1][0])), Math.max(...near.map((p) => p.b[1][1]))],
    ];
  };
  const px = (lng: number, lat: number): [number, number] => proj([lng, clampLat(lat)]) ?? [NaN, NaN];
  const geo: MapGeo = {
    w: o.w,
    h: o.h,
    detail,
    proj,
    meridian,
    px,
    shapes,
    key: (s) => countryKey(s, list),
    box: (s) => {
      const k = countryKey(s, list);
      if (!k) return null;
      if (!boxes.has(k)) boxes.set(k, mainland(list.find((c) => c.key === k)!));
      return boxes.get(k) ?? null;
    },
    boxOf: (b) => {
      const pts = boxPoints(b).coordinates.map(([x, y]) => px(x, y));
      return [
        [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))],
        [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
      ];
    },
  };
  if (GEO.size > 12) GEO.delete(GEO.keys().next().value as string);
  GEO.set(id, geo);
  return geo;
}

// ------------------------------------------------------------------ camera

/** Where the camera looks: a place and a zoom (1 = the whole view), or a country / lng-lat box to frame. */
export type MapCam = { lng: number; lat: number; zoom: number } | { fit: string | [number, number, number, number]; pad?: number };
/** A camera keyframe: [frame, cam, ease?]; the ease shapes the move that ends on this key (default inOut). */
export type MapKey = [number, MapCam, ((x: number) => number)?];
/** @internal The camera in base pixels: the point at the frame's centre, and the zoom. */
export type CamPx = { x: number; y: number; z: number };

const camPx = (g: MapGeo, c: MapCam): CamPx => {
  if ("fit" in c) {
    const b = typeof c.fit === "string" ? g.box(c.fit) : g.boxOf(c.fit);
    if (!b) return { x: g.w / 2, y: g.h / 2, z: 1 };
    const pad = c.pad ?? 0.14;
    const bw = Math.max(1, b[1][0] - b[0][0]);
    const bh = Math.max(1, b[1][1] - b[0][1]);
    return { x: (b[0][0] + b[1][0]) / 2, y: (b[0][1] + b[1][1]) / 2, z: Math.max(0.25, Math.min((g.w * (1 - 2 * pad)) / bw, (g.h * (1 - 2 * pad)) / bh)) };
  }
  const [x, y] = g.px(c.lng, c.lat);
  return Number.isFinite(x) ? { x, y, z: Math.max(0.05, c.zoom) } : { x: g.w / 2, y: g.h / 2, z: Math.max(0.05, c.zoom) };
};

const cosh = (x: number) => (Math.exp(x) + Math.exp(-x)) / 2;
const sinh = (x: number) => (Math.exp(x) - Math.exp(-x)) / 2;
const tanh = (x: number) => {
  const e = Math.exp(2 * x);
  return (e - 1) / (e + 1);
};

/**
 * @internal A flight from a to b, u in 0..1. With rho > 0 the camera pulls out toward the middle
 * of a long hop and comes back in (van Wijk and Nuij); a zoom in place, or rho 0, interpolates the
 * zoom in log space (equal steps feel equal: 1 to 2 takes as long as 2 to 4).
 */
export function flight(a: CamPx, b: CamPx, width: number, rho = 1.2): (u: number) => CamPx {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const w0 = width / a.z;
  const w1 = width / b.z;
  if (rho < 0.05 || d2 < 1e-6) return (u) => ({ x: a.x + dx * u, y: a.y + dy * u, z: Math.exp(mix(Math.log(a.z), Math.log(b.z), u)) });
  const r2 = rho * rho;
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + r2 * r2 * d2) / (2 * w0 * r2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - r2 * r2 * d2) / (2 * w1 * r2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  return (u) => {
    if (u >= 1) return { ...b };
    const s = u * S;
    const k = (w0 / (r2 * d1)) * (cosh(r0) * tanh(rho * s + r0) - sinh(r0));
    return { x: a.x + k * dx, y: a.y + k * dy, z: width / ((w0 * cosh(r0)) / cosh(rho * s + r0)) };
  };
}

/** @internal The camera at frame t (relative to the stage's `at`). The zoom never pulls out past min(1, the smallest key's zoom). */
export function mapCamAt(t: number, keys: MapKey[] | undefined, g: MapGeo, rho = 1.2): CamPx {
  if (!keys?.length) return { x: g.w / 2, y: g.h / 2, z: 1 };
  const ks = [...keys].sort((p, q) => p[0] - q[0]);
  const pts = ks.map((k) => camPx(g, k[1]));
  if (t <= ks[0][0]) return pts[0];
  const floor = Math.min(1, ...pts.map((p) => p.z));
  for (let i = 1; i < ks.length; i++) {
    if (t > ks[i][0]) continue;
    const u = (ks[i][2] ?? inOut)(clamp01((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0] || 1)));
    const c = flight(pts[i - 1], pts[i], g.w, rho)(u);
    return { ...c, z: Math.max(floor, c.z) };
  }
  return pts[pts.length - 1];
}

// ------------------------------------------------------------------ routes

/** A route's waypoints with every leg filled in along its great circle, `n` steps a leg. */
export function densify(path: [number, number][], n = 40): [number, number][] {
  if (path.length < 2) return path.map(([x, y]) => [x, clampLat(y)]);
  const out: [number, number][] = [];
  for (let i = 1; i < path.length; i++) {
    const a: [number, number] = [path[i - 1][0], clampLat(path[i - 1][1])];
    const b: [number, number] = [path[i][0], clampLat(path[i][1])];
    const at = geoInterpolate(a, b);
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const [lng, lat] = at(k / n);
      out.push([lng, clampLat(lat)]);
    }
  }
  return out;
}

/** @internal A route in base pixels: one run per piece between antimeridian crossings, each with its length. */
export function routeRuns(g: MapGeo, path: [number, number][], arc = 0, n = 40): { pts: [number, number][]; len: number }[] {
  const rot = (lng: number) => wrap(lng - g.meridian);
  const runs: [number, number][][] = [[]];
  const push = (p: [number, number]) => {
    const q = g.px(p[0], p[1]);
    if (Number.isFinite(q[0])) runs[runs.length - 1].push(q);
  };
  for (let i = 1; i < path.length; i++) {
    const a: [number, number] = [path[i - 1][0], clampLat(path[i - 1][1])];
    const b: [number, number] = [path[i][0], clampLat(path[i][1])];
    const at = geoInterpolate(a, b);
    const leg = Array.from({ length: n + 1 }, (_, k) => at(k / n) as [number, number]);
    const seams = leg.slice(1).some((p, k) => Math.abs(rot(p[0]) - rot(leg[k][0])) > 180);
    if (!seams) {
      const P = leg.map((p) => g.px(p[0], p[1]));
      // A flight arc: the leg bowed sideways (toward the top of the frame) by `arc` of its length.
      const [x0, y0] = P[0];
      const [x1, y1] = P[n];
      const L = Math.hypot(x1 - x0, y1 - y0) || 1;
      let nx = -(y1 - y0) / L;
      let ny = (x1 - x0) / L;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      P.forEach(([x, y], k) => {
        if (i > 1 && k === 0) return;
        const off = arc * L * Math.sin((Math.PI * k) / n);
        if (Number.isFinite(x)) runs[runs.length - 1].push([x + nx * off, y + ny * off]);
      });
      continue;
    }
    // Across the antimeridian: end the run at the edge and start a new one on the other side.
    for (let k = i > 1 ? 1 : 0; k <= n; k++) {
      if (k > 0 && Math.abs(rot(leg[k][0]) - rot(leg[k - 1][0])) > 180) {
        let lo = (k - 1) / n;
        let hi = k / n;
        const side = Math.sign(rot(leg[k - 1][0]));
        for (let j = 0; j < 30; j++) {
          const m = (lo + hi) / 2;
          if (Math.sign(rot(at(m)[0])) === side && Math.abs(rot(at(m)[0]) - rot(leg[k - 1][0])) < 180) lo = m;
          else hi = m;
        }
        push(at(lo) as [number, number]);
        runs.push([]);
        push(at(hi) as [number, number]);
      }
      push(leg[k]);
    }
  }
  return runs
    .filter((r) => r.length > 1)
    .map((pts) => {
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      return { pts, len };
    });
}

// ------------------------------------------------------------------- stage

export type MapPin = {
  lng: number;
  lat: number;
  /** At most two words (longer labels are cut to two). */
  label?: string;
  /** A small mono line under the label: a figure, a date, coordinates. */
  sub?: string;
  /** Frame the pin drops (from the stage's `at`). */
  at: number;
  color?: string;
  /** Where the label sits from the pin (default "top"). */
  side?: "top" | "bottom" | "left" | "right";
};

export type MapRoute = {
  /** [lng, lat] waypoints; each leg follows its great circle. */
  path: [number, number][];
  /** Frame the line starts drawing, and how long it takes (at least 36 frames; default 54). */
  at: number;
  dur?: number;
  /** Bow each leg sideways by this share of its length (0.15 reads as a flight arc); default 0. */
  arc?: number;
  color?: string;
  /** Line width in screen px at any zoom. */
  width?: number;
};

export type MapHighlight = { id: string; at: number; color?: string };

/** What useMap() (or a render-prop child) gets: screen pixels of a place at this frame's camera. */
export type MapApi = {
  /** Screen px of a place, through the camera (latitude clamped to +-85). */
  px: (lng: number, lat: number) => [number, number];
  /** Whether a place is on screen, with `margin` px to spare. */
  on: (lng: number, lat: number, margin?: number) => boolean;
  zoom: number;
  /** The overlay frame (stepped when the stage is), relative to the stage's `at`. */
  t: number;
  w: number;
  h: number;
};

const MapContext = createContext<MapApi | null>(null);

/** The map around a custom overlay: px(lng, lat) in screen pixels at this frame. Inside <MapStage> only. */
export const useMap = (): MapApi => {
  const m = useContext(MapContext);
  if (!m) throw new Error("useMap() must be used inside <MapStage>");
  return m;
};

/** The first two words of a label: a map label is a name, not a sentence. */
export const twoWords = (s: string) => s.trim().split(/\s+/).slice(0, 2).join(" ");

/** @internal How lit a highlight is at overlay frame t: 0 before it, 1 twelve frames later. */
export const litAt = (t: number, at: number) => prog(t, at, at + 12, inOut);

const paths2d = new WeakMap<MapGeo, Map<string, Path2D>>();
const path2d = (g: MapGeo, key: string, d: string) => {
  let m = paths2d.get(g);
  if (!m) paths2d.set(g, (m = new Map()));
  let p = m.get(key);
  if (!p) m.set(key, (p = new Path2D(d)));
  return p;
};

const PIN_SPRING = { damping: 12, stiffness: 120, mass: 1 } as const;

/**
 * An editorial map: countries from Natural Earth, a camera that flies to places, highlighted countries,
 * pins that drop with a label, routes that draw themselves. Every frame in `cam`, `highlight`, `pins` and
 * `routes` counts from `at`. Children (or a render prop) are overlays in screen pixels; useMap().px places them.
 */
export const MapStage = ({
  t,
  at = 0,
  view = "world",
  projection,
  meridian,
  detail,
  cam,
  rho = 1.2,
  highlight = [],
  pins = [],
  routes = [],
  ground = "#F2EDE4",
  land = "#2B2A27",
  landOpacity = 0.35,
  line = "#F2EDE4",
  accent = "#D9482B",
  ink = "#1B1B1F",
  font = "Inter",
  mono,
  labelSize,
  stepped: step,
  w,
  h,
  children,
  style,
}: {
  t: number;
  at?: number;
  view?: MapView;
  projection?: MapProjection;
  meridian?: number;
  detail?: Detail;
  cam?: MapKey[];
  rho?: number;
  highlight?: MapHighlight[];
  pins?: MapPin[];
  routes?: MapRoute[];
  ground?: string;
  land?: string;
  landOpacity?: number;
  line?: string;
  accent?: string;
  ink?: string;
  font?: string;
  mono?: string;
  labelSize?: number;
  stepped?: boolean | number;
  w?: number;
  h?: number;
  children?: ReactNode | ((m: MapApi) => ReactNode);
  style?: CSSProperties;
}) => {
  const film = useFilm();
  const W = Math.round(w ?? film.W);
  const H = Math.round(h ?? film.H);
  const fps = film.fps || 30;

  // The 1:50m countries for regional views and close zooms, loaded before the frame is taken.
  const want: Detail = detail ?? (view !== "world" || (cam ?? []).some((k) => "fit" in k[1] || k[1].zoom >= 2.5) ? "50m" : "110m");
  const [, setLoaded] = useState(0);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => (want === "50m" && !DATA["50m"] ? delayRender("Loading the map's 1:50m countries") : null));
  const released = useRef(false);
  useEffect(() => {
    if (handle === null) return;
    loadDetail().then(
      () => {
        if (released.current) return;
        released.current = true;
        flushSync(() => setLoaded((n) => n + 1));
        continueRender(handle);
      },
      (err: unknown) => cancelRender(err instanceof Error ? err : new Error(String(err))),
    );
  }, [handle, continueRender, cancelRender]);

  const geo = mapGeo({ w: W, h: H, view, projection, meridian, detail: want });
  const local = t - at;
  const ot = step ? stepped(local, typeof step === "number" ? step : 15, fps) : local;
  const c = mapCamAt(local, cam, geo, rho);
  const z = c.z;
  const toScreen = (bx: number, by: number): [number, number] => [(bx - c.x) * z + W / 2, (by - c.y) * z + H / 2];
  const px = (lng: number, lat: number) => {
    const [bx, by] = geo.px(lng, lat);
    return toScreen(bx, by);
  };
  const api: MapApi = {
    px,
    on: (lng, lat, margin = 0) => {
      const [x, y] = px(lng, lat);
      return x >= -margin && x <= W + margin && y >= -margin && y <= H + margin;
    },
    zoom: z,
    t: ot,
    w: W,
    h: H,
  };

  const lit = highlight.flatMap((hl) => {
    const key = geo.key(hl.id);
    const p = litAt(ot, hl.at);
    return key && p > 0 ? [{ key, p, color: hl.color ?? accent }] : [];
  });
  const litKey = lit.map((l) => `${l.key}:${l.p.toFixed(3)}:${l.color}`).join("|");

  // Land: one canvas, the camera as its transform, hairlines divided by the zoom.
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(z, 0, 0, z, W / 2 - c.x * z, H / 2 - c.y * z);
    const x0 = c.x - W / 2 / z;
    const x1 = c.x + W / 2 / z;
    const y0 = c.y - H / 2 / z;
    const y1 = c.y + H / 2 / z;
    const seen = geo.shapes.filter((s) => s.bb[1][0] >= x0 && s.bb[0][0] <= x1 && s.bb[1][1] >= y0 && s.bb[0][1] <= y1);
    ctx.globalAlpha = landOpacity;
    ctx.fillStyle = land;
    for (const s of seen) ctx.fill(path2d(geo, s.key, s.d));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.5 / z;
    ctx.lineJoin = "round";
    for (const s of seen) ctx.stroke(path2d(geo, s.key, s.d));
    for (const l of lit) {
      const s = geo.shapes.find((x) => x.key === l.key);
      if (!s) continue;
      const p2 = path2d(geo, s.key, s.d);
      ctx.globalAlpha = 0.8 * l.p;
      ctx.fillStyle = l.color;
      ctx.fill(p2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = mix(0.5, 1.5, l.p) / z;
      ctx.stroke(p2);
    }
  }, [geo, W, H, z, c.x, c.y, land, landOpacity, line, litKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Routes: projected once per stage, drawn in the scaled layer with pathLength=1.
  const routeKey = JSON.stringify(routes.map((r) => [r.path, r.arc ?? 0]));
  const prepared = useMemo(() => routes.map((r) => routeRuns(geo, r.path, r.arc ?? 0)), [geo, routeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const S = Math.min(W, H);
  const baseWidth = Math.max(2, Math.round(S * 0.0028));
  const size = labelSize ?? Math.round(S * 0.026);
  const halo = `0 0 ${Math.round(size * 0.25)}px ${ground}, 0 0 2px ${ground}`;

  const tips: ReactNode[] = [];
  const lines = routes.map((r, i) => {
    const runs = prepared[i];
    const dur = Math.max(36, r.dur ?? 54);
    const p = prog(ot, r.at, r.at + dur, inOut);
    if (p <= 0 || !runs.length) return null;
    const color = r.color ?? accent;
    const width = r.width ?? baseWidth;
    const total = runs.reduce((s, x) => s + x.len, 0) || 1;
    let before = 0;
    let tip: [number, number] | null = null;
    const els = runs.map((run, k) => {
      const q = clamp01((p * total - before) / (run.len || 1));
      if (q > 0 && q < 1) {
        let want = q * run.len;
        for (let j = 1; j < run.pts.length; j++) {
          const [ax, ay] = run.pts[j - 1];
          const [bx, by] = run.pts[j];
          const seg = Math.hypot(bx - ax, by - ay);
          if (want <= seg || j === run.pts.length - 1) {
            const f = seg ? Math.min(1, want / seg) : 0;
            tip = [ax + (bx - ax) * f, ay + (by - ay) * f];
            break;
          }
          want -= seg;
        }
      }
      before += run.len;
      if (q <= 0) return null;
      const d = run.pts.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
      return <path key={k} d={d} pathLength={1} strokeDasharray="1 2" strokeDashoffset={1 - q} fill="none" stroke={color} strokeWidth={width / z} strokeLinecap="round" strokeLinejoin="round" />;
    });
    const tipAlpha = 1 - prog(ot, r.at + dur - 8, r.at + dur + 4);
    if (tip && tipAlpha > 0) {
      const [sx, sy] = toScreen(tip[0], tip[1]);
      tips.push(<div key={`tip${i}`} style={{ position: "absolute", left: sx - width * 1.8, top: sy - width * 1.8, width: width * 3.6, height: width * 3.6, borderRadius: "50%", background: color, opacity: tipAlpha }} />);
    }
    return <g key={i}>{els}</g>;
  });

  const pinEls = pins.map((pin, i) => {
    const age = ot - pin.at;
    if (age < 0) return null;
    const [sx, sy] = px(pin.lng, pin.lat);
    if (!Number.isFinite(sx) || sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) return null;
    const color = pin.color ?? accent;
    const drop = spring({ frame: age, fps, config: PIN_SPRING });
    const y = sy - 40 * (1 - drop);
    const r = Math.max(5, Math.round(S * 0.0065));
    // One ring on landing, then a slow breath every two seconds.
    const q = ((age - 8) % 60) / 36;
    const ring = age >= 8 && q <= 1 ? outE(clamp01(q)) : null;
    const lp = pin.label ? prog(ot, pin.at + 18, pin.at + 30, outE) : 0;
    const label = pin.label ? twoWords(pin.label) : "";
    const lead = Math.round(size * 0.64);
    const gap = r + 4;
    const m = Math.round(S * 0.03);
    const tall = gap + lead + size * (pin.sub ? 2.1 : 1.3);
    // A label that would leave the frame flips to the pin's other side.
    const want = pin.side ?? "top";
    const side = want === "top" && sy - tall < m ? "bottom" : want === "bottom" && sy + tall > H - m ? "top" : want;
    const estW = Math.max(label.length * size * 0.58, (pin.sub?.length ?? 0) * size * 0.62 * 0.62);
    const lx = side === "left" ? sx - gap - lead : side === "right" ? sx + gap + lead : Math.max(m + estW / 2, Math.min(W - m - estW / 2, sx));
    const ly = side === "top" ? sy - gap - lead : side === "bottom" ? sy + gap + lead : sy;
    const anchor = side === "top" ? "translate(-50%, -100%)" : side === "bottom" ? "translate(-50%, 0)" : side === "left" ? "translate(-100%, -50%)" : "translate(0, -50%)";
    const vertical = side === "top" || side === "bottom";
    return (
      <div key={i}>
        {ring !== null ? (
          <div style={{ position: "absolute", left: sx, top: sy, width: 0, height: 0 }}>
            <div style={{ position: "absolute", left: -r * mix(1.2, 4.2, ring), top: -r * mix(1.2, 4.2, ring), width: r * 2 * mix(1.2, 4.2, ring), height: r * 2 * mix(1.2, 4.2, ring), borderRadius: "50%", border: `${Math.max(1.5, r * 0.3)}px solid ${color}`, opacity: 0.5 * (1 - ring), boxSizing: "border-box" }} />
          </div>
        ) : null}
        <div style={{ position: "absolute", left: sx - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", background: color, boxShadow: `0 0 0 ${Math.max(2, Math.round(r * 0.4))}px ${ground}`, opacity: clamp01(drop * 1.6) }} />
        {label && lp > 0 ? (
          <>
            <div
              style={{
                position: "absolute",
                left: vertical ? sx - 0.75 : side === "left" ? sx - gap - lead * lp : sx + gap,
                top: vertical ? (side === "top" ? sy - gap - lead * lp : sy + gap) : sy - 0.75,
                width: vertical ? 1.5 : lead * lp,
                height: vertical ? lead * lp : 1.5,
                background: ink,
                opacity: 0.6,
              }}
            />
            <div style={{ position: "absolute", left: lx, top: ly + (vertical ? (side === "top" ? 1 : -1) * (1 - lp) * 6 : 0), transform: anchor, opacity: lp, textAlign: side === "left" ? "right" : side === "right" ? "left" : "center", whiteSpace: "nowrap", paddingBottom: side === "top" ? 4 : 0, paddingTop: side === "bottom" ? 4 : 0 }}>
              <div style={{ fontFamily: font, fontWeight: 600, fontSize: size, lineHeight: 1.1, color: ink, textShadow: halo }}>{label}</div>
              {pin.sub ? <div style={{ fontFamily: mono ?? font, fontWeight: 500, fontSize: Math.round(size * 0.62), lineHeight: 1.3, letterSpacing: "0.04em", color: ink, opacity: 0.7, textShadow: halo }}>{pin.sub}</div> : null}
            </div>
          </>
        ) : null}
      </div>
    );
  });

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "hidden", background: ground, ...style }}>
      <canvas ref={canvas} data-qa="hero" width={W} height={H} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, pointerEvents: "none" }} />
      {routes.length ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <g transform={`translate(${W / 2} ${H / 2}) scale(${z}) translate(${-c.x} ${-c.y})`}>{lines}</g>
        </svg>
      ) : null}
      {tips}
      {pinEls}
      <MapContext.Provider value={api}>{typeof children === "function" ? children(api) : children}</MapContext.Provider>
    </div>
  );
};

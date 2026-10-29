// Isometric models: a system drawn as a small, tidy 3D model you look down on.
// Everything is a 2D affine projection (exact for isometric), so it survives the
// export's renderer, which draws no CSS 3D. Units are model cells: x runs to the
// lower right, y to the lower left, z up; `u` is one cell in px.
import { Children, cloneElement, createContext, Fragment, isValidElement, useContext, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { Easing } from "remotion";
import { clamp01, inOut, prog } from "./motion";

/** cos 30°: the iso axes' horizontal reach. The same number as the plane matrix, so DOM and SVG faces meet exactly. */
const C = 0.866;
/** The floor's matrix: a DOM box laid flat on the ground (its x along model x, its y along model y). */
export const ISO_FLOOR = `matrix(${C},0.5,${-C},0.5,0,0)`;

export type IsoPt = [number, number, number];

/** The screen point (px, from the scene's origin) of model point (x, y, z) at `u` px per cell. */
export const iso = (x: number, y: number, z: number, u = 40) => ({ x: (x - y) * C * u, y: (x + y) * 0.5 * u - z * u });

/** Painter's order: higher draws later (in front). Boxes on one grid never need more than x + y + z. */
export const isoDepth = (x: number, y: number, z: number) => Math.round((x + y + z) * 100) + 10_000;

// --------------------------------------------------------------- colour

const hex2rgb = (hex: string): [number, number, number] => {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = Number.parseInt(h.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
};

/** @internal Hue (deg), saturation and lightness (0 to 100) of a hex colour. */
export const hsl = (hex: string): [number, number, number] => {
  const [r, g, b] = hex2rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
};

const hsl2hex = (h: number, s: number, l: number) => {
  const S = clamp01(s / 100);
  const L = clamp01(l / 100);
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

/** The three faces of a block from one base colour: top lighter (+10 lightness), left the base, right darker (-15). */
export const isoFaces = (color: string) => {
  const [h, s, l] = hsl(color);
  return { top: hsl2hex(h, s, Math.min(100, l + 10)), left: hsl2hex(h, s, l), right: hsl2hex(h, s, Math.max(0, l - 15)) };
};

// ------------------------------------------------------------------ scene

/** `pass`: the scene draws its children twice, the model first, then only the labels, so no block covers a label. */
type IsoCtx = { u: number; ox: number; oy: number; pass: "draw" | "labels" };
const Ctx = createContext<IsoCtx>({ u: 40, ox: 0, oy: 0, pass: "draw" });

type Props = { x?: unknown; y?: unknown; z?: unknown; lift?: unknown; depth?: unknown; children?: ReactNode };
const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);
const flat = (nodes: ReactNode): ReactNode[] => Children.toArray(nodes).flatMap((c) => (isValidElement(c) && c.type === Fragment ? flat((c.props as Props).children) : [c]));

/**
 * @internal The scene's children in painting order. The export's renderer paints in DOM order and ignores
 * z-index, so the scene sorts: grids, then routes, then everything placed in the model (anything with numeric
 * x and y props, or a `depth` prop) by x + y + z, then the rest (plain DOM overlays) as written.
 */
export function isoSort(nodes: ReactNode): ReactNode[] {
  const rank = (c: ReactNode): [number, number] => {
    if (!isValidElement(c)) return [3, 0];
    const p = c.props as Props;
    if (c.type === IsoGrid) return [0, 0];
    if (c.type === IsoPath) return [1, 0];
    if (typeof p.depth === "number") return [2, p.depth];
    if (c.type === IsoPacket) {
      const q = packetAt(c.props as PacketProps);
      return q ? [2, q[0] + q[1] + q[2]] : [1, 0];
    }
    if (c.type === IsoExplode) {
      const first = flat(p.children).find(isValidElement);
      const f = (first?.props ?? {}) as Props;
      return [2, num(f.x) + num(f.y) + num(f.z)];
    }
    if (typeof p.x === "number" && typeof p.y === "number") return [2, p.x + p.y + num(p.z) + num(p.lift)];
    return [3, 0];
  };
  return flat(nodes)
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.i - b.i)
    .map((e) => e.c);
}

/** @internal Whether a child can carry labels (and so is drawn again in the labels pass). */
const hasLabels = (c: ReactNode) => {
  if (!isValidElement(c)) return false;
  if (c.type === IsoBlock || c.type === IsoExplode) return true;
  if (c.type === IsoGrid || c.type === IsoPath || c.type === IsoPacket || c.type === IsoPlane) return false;
  const p = c.props as Props;
  return typeof c.type !== "string" && typeof p.x === "number" && typeof p.y === "number";
};

/**
 * The stage of an isometric model: a w x h box whose model origin (0,0,0) sits at (ox, oy) px, `u` px per cell.
 * `drift` slides the whole model `drift` px per 300 frames down the iso diagonal (translate only, never a rotation).
 * It paints its children back to front itself (see isoSort): put blocks straight in it, or in your own components
 * given numeric `x` and `y` props (they sort by them, and must hold only iso blocks); overlays go last.
 */
export const IsoScene = ({ t = 0, u = 40, w, h, ox, oy, drift = 0, children, style }: { t?: number; u?: number; w: number; h: number; ox?: number; oy?: number; drift?: number; children?: ReactNode; style?: CSSProperties }) => {
  const k = (drift * t) / 300;
  const sorted = isoSort(children);
  return (
    <div style={{ position: "relative", width: w, height: h, flexShrink: 0, ...style }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0, transform: drift ? `translate(${(k * C).toFixed(2)}px, ${(k * 0.5).toFixed(2)}px)` : undefined }}>
        <Ctx.Provider value={{ u, ox: ox ?? w / 2, oy: oy ?? h / 2, pass: "draw" }}>{sorted}</Ctx.Provider>
        <Ctx.Provider value={{ u, ox: ox ?? w / 2, oy: oy ?? h / 2, pass: "labels" }}>{sorted.filter(hasLabels)}</Ctx.Provider>
      </div>
    </div>
  );
};

/** @internal The three visible faces of a box, as screen polygons (px from the scene origin). */
export function isoBox(x: number, y: number, z: number, w: number, d: number, h: number, u: number) {
  const P = (a: number, b: number, c: number) => iso(a, b, c, u);
  return {
    top: [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)],
    left: [P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x, y + d, z)],
    right: [P(x + w, y, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)],
  };
}

type Pt = { x: number; y: number };
const bbox = (pts: Pt[], pad = 2) => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  return { x0, y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
};
const poly = (pts: Pt[], x0: number, y0: number) => pts.map((p) => `${(p.x - x0).toFixed(1)},${(p.y - y0).toFixed(1)}`).join(" ");

const backOut = Easing.out(Easing.back(1.4));

/** @internal A block's arrival at frame t: its screen offset in px (drop/rise), its height factor (grow) and opacity. */
export function isoArrive(t: number, at: number, from: "drop" | "rise" | "grow") {
  const raw = clamp01((t - at) / 15);
  const e = raw >= 1 ? 1 : backOut(raw);
  return { dy: from === "drop" ? -60 * (1 - e) : from === "rise" ? 60 * (1 - e) : 0, k: from === "grow" ? Math.max(0, e) : 1, o: prog(t, at, at + 6) };
}

/**
 * A box w x d x h cells with its back corner at (x, y, z), three faces shaded from `color`. From frame `at` it rises
 * from 60 px below ("rise", default), drops from above ("drop") or grows up from its floor ("grow"), over 15 frames with
 * a slight overshoot. `lift` raises it (cells; an exploded view sets it). `label` floats above it, `top` is DOM laid flat
 * on its top face (w*u x d*u px). The scene paints it among its siblings by x + y + z.
 */
export const IsoBlock = ({ x, y, z = 0, w = 1, d = 1, h = 1, color, t, at = 0, from = "rise", lift = 0, label, top, edge, opacity = 1 }: { x: number; y: number; z?: number; w?: number; d?: number; h?: number; color: string; t: number; at?: number; from?: "drop" | "rise" | "grow"; lift?: number; label?: ReactNode; top?: ReactNode; edge?: string; opacity?: number }) => {
  const { u, ox, oy, pass } = useContext(Ctx);
  const a = isoArrive(t, at, from);
  if (a.o <= 0) return null;
  const Z = z + lift;
  const H = h * a.k;
  const f = isoBox(x, y, Z, w, d, H, u);
  const b = bbox([...f.top, ...f.left, ...f.right]);
  const c = isoFaces(color);
  const face = (pts: Pt[], fill: string) => <polygon points={poly(pts, b.x0, b.y0)} fill={fill} stroke={edge ?? fill} strokeWidth={edge ? 1 : 0.75} strokeLinejoin="round" />;
  const head = iso(x + w / 2, y + d / 2, Z + H, u);
  const corner = iso(x, y, Z + H, u);
  const labelIn = prog(t, at + 12, at + 22);
  if (pass === "labels")
    return label && labelIn > 0 ? (
      <div style={{ position: "absolute", left: ox + head.x, top: oy + head.y - 0.6 * u + a.dy, zIndex: 100_000, transform: `translate(-50%, -100%) translateY(${((1 - labelIn) * 8).toFixed(1)}px)`, opacity: labelIn * opacity, whiteSpace: "nowrap" }}>{label}</div>
    ) : null;
  return (
    <div style={{ position: "absolute", left: ox + b.x0, top: oy + b.y0, width: b.w, height: b.h, zIndex: isoDepth(x, y, Z), opacity: a.o * opacity, transform: a.dy ? `translateY(${a.dy.toFixed(1)}px)` : undefined }}>
      <svg width={b.w} height={b.h} viewBox={`0 0 ${b.w.toFixed(1)} ${b.h.toFixed(1)}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {face(f.left, c.left)}
        {face(f.right, c.right)}
        {face(f.top, c.top)}
      </svg>
      {top ? <div style={{ position: "absolute", left: corner.x - b.x0, top: corner.y - b.y0, width: w * u, height: d * u, transformOrigin: "0 0", transform: ISO_FLOOR, overflow: "hidden" }}>{top}</div> : null}
    </div>
  );
};

/** Real DOM (UI, text) laid flat on the ground or a top face at height z: a w*u x d*u px box, its x along model x, its y along model y. */
export const IsoPlane = ({ x, y, z = 0, w, d, children, style }: { x: number; y: number; z?: number; w: number; d: number; children?: ReactNode; style?: CSSProperties }) => {
  const { u, ox, oy, pass } = useContext(Ctx);
  if (pass === "labels") return null;
  const p = iso(x, y, z, u);
  return <div style={{ position: "absolute", left: ox + p.x, top: oy + p.y, width: w * u, height: d * u, zIndex: isoDepth(x, y, z), transformOrigin: "0 0", transform: ISO_FLOOR, ...style }}>{children}</div>;
};

/** A floor grid of `n` cells each way from the origin, one line every `size` cells. Faint: 6 to 10 % of the ink. */
export const IsoGrid = ({ size = 1, n = 8, color, weight = 1 }: { size?: number; n?: number; color: string; weight?: number }) => {
  const { u, ox, oy, pass } = useContext(Ctx);
  if (pass === "labels") return null;
  const lines: [Pt, Pt][] = [];
  for (let i = -n; i <= n; i += size) {
    lines.push([iso(i, -n, 0, u), iso(i, n, 0, u)]);
    lines.push([iso(-n, i, 0, u), iso(n, i, 0, u)]);
  }
  const b = bbox(lines.flat());
  return (
    <svg width={b.w} height={b.h} style={{ position: "absolute", left: ox + b.x0, top: oy + b.y0, zIndex: 0 }}>
      {lines.map(([p, q], i) => (
        <line key={i} x1={p.x - b.x0} y1={p.y - b.y0} x2={q.x - b.x0} y2={q.y - b.y0} stroke={color} strokeWidth={weight} />
      ))}
    </svg>
  );
};

/** 0 to 1: how far an exploded view is open at frame t (opens from `at` over `dur` frames, closes from `back`). */
export const explode = (t: number, at: number, dur = 24, back?: number) => clamp01(prog(t, at, at + dur, inOut) - (back === undefined ? 0 : prog(t, back, back + dur, inOut)));

/**
 * An exploded view: its children (IsoBlocks, listed bottom to top) part by `gap` cells per layer from `at` over `dur`
 * frames (21 to 30), and reassemble from `back`.
 */
export const IsoExplode = ({ t, at, back, dur = 24, gap = 1, children }: { t: number; at: number; back?: number; dur?: number; gap?: number; children: ReactNode }) => {
  const open = explode(t, at, dur, back);
  let i = 0;
  return (
    <>
      {Children.map(children, (c) => {
        if (!isValidElement(c)) return c;
        const el = c as ReactElement<{ lift?: number }>;
        return cloneElement(el, { lift: (el.props.lift ?? 0) + i++ * gap * open });
      })}
    </>
  );
};

/** @internal The model point at fraction p (0 to 1) of the way along a polyline, by length. */
export function isoPathAt(points: IsoPt[], p: number): IsoPt {
  if (points.length < 2) return points[0] ?? [0, 0, 0];
  const seg = points.slice(1).map((q, i) => Math.hypot(q[0] - points[i][0], q[1] - points[i][1], q[2] - points[i][2]));
  const total = seg.reduce((s, v) => s + v, 0) || 1;
  let left = clamp01(p) * total;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? clamp01(left / seg[i]) : 1;
      const [a, b] = [points[i], points[i + 1]];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    left -= seg[i];
  }
  return points[points.length - 1];
}

/** A route on the model (cells), drawn on from `at` over `dur` frames: the line a packet rides. Dash it for a wireless hop. */
export const IsoPath = ({ points, t, at = 0, dur = 18, color, width = 2, dash }: { points: IsoPt[]; t: number; at?: number; dur?: number; color: string; width?: number; dash?: number }) => {
  const { u, ox, oy, pass } = useContext(Ctx);
  const p = prog(t, at, at + dur, inOut);
  if (p <= 0 || pass === "labels") return null;
  const pts = points.map(([x, y, z]) => iso(x, y, z, u));
  const b = bbox(pts, width + 2);
  const len = pts.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0);
  const mask = `${len} ${len}`;
  return (
    <svg width={b.w} height={b.h} style={{ position: "absolute", left: ox + b.x0, top: oy + b.y0, zIndex: 1 }}>
      {dash ? <polyline points={poly(pts, b.x0, b.y0)} fill="none" stroke={color} strokeWidth={width} strokeDasharray={`${dash} ${dash}`} strokeLinecap="round" strokeLinejoin="round" opacity={p >= 1 ? 1 : 0} /> : null}
      <polyline points={poly(pts, b.x0, b.y0)} fill="none" stroke={color} strokeWidth={width} strokeDasharray={mask} strokeDashoffset={(len * (1 - p)).toFixed(1)} strokeLinecap="round" strokeLinejoin="round" opacity={dash && p >= 1 ? 0 : 1} />
    </svg>
  );
};

/**
 * A small cube (`size` cells) travelling a route (cells) from `at` over `dur` frames, eased at both ends, fading in and
 * out over 4 frames; `every` sends another one every that many frames. Sorts itself among blocks as it goes.
 */
type PacketProps = { points: IsoPt[]; t: number; at?: number; dur?: number; every?: number; color: string; size?: number };

/** @internal Where a packet is at its frame (null while none is under way), and how far into its trip (frames). */
export function packetAt({ points, t, at = 0, dur = 30, every }: PacketProps): [number, number, number, number] | null {
  const age = every && t >= at ? (t - at) % every : t - at;
  if (age < 0 || age > dur) return null;
  const [x, y, z] = isoPathAt(points, inOut(clamp01(age / dur)));
  return [x, y, z, age];
}

export const IsoPacket = (props: PacketProps) => {
  const { color, size = 0.3, dur = 30 } = props;
  const { u, ox, oy, pass } = useContext(Ctx);
  const q = packetAt(props);
  if (!q || pass === "labels") return null;
  const [x, y, z, age] = q;
  const s = size;
  const f = isoBox(x - s / 2, y - s / 2, z, s, s, s, u);
  const b = bbox([...f.top, ...f.left, ...f.right]);
  const c = isoFaces(color);
  const o = Math.min(clamp01(age / 4), clamp01((dur - age) / 4));
  return (
    <svg width={b.w} height={b.h} style={{ position: "absolute", left: ox + b.x0, top: oy + b.y0, zIndex: isoDepth(x + s / 2, y + s / 2, z) + 1, opacity: o }}>
      <polygon points={poly(f.left, b.x0, b.y0)} fill={c.left} stroke={c.left} strokeWidth={0.75} />
      <polygon points={poly(f.right, b.x0, b.y0)} fill={c.right} stroke={c.right} strokeWidth={0.75} />
      <polygon points={poly(f.top, b.x0, b.y0)} fill={c.top} stroke={c.top} strokeWidth={0.75} />
    </svg>
  );
};

/** The frame each block starts when a model builds bottom-up, back to front, `step` frames apart (4 by default). */
export const isoBuild = (blocks: { x: number; y: number; z?: number }[], at: number, step = 4): number[] => {
  const order = blocks.map((b, i) => ({ i, k: (b.z ?? 0) * 1000 + b.x + b.y })).sort((a, b) => a.k - b.k || a.i - b.i);
  const out = new Array<number>(blocks.length);
  order.forEach((o, rank) => {
    out[o.i] = at + rank * step;
  });
  return out;
};

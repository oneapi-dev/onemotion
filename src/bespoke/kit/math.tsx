// A math blackboard: plots that draw themselves, equations built and rearranged
// token by token, one shape becoming another (3Blue1Brown's grammar, rewritten
// as pure functions of the frame). Plain DOM text and SVG: no LaTeX, no glow.
// Ink plus at most two colours, each colour one quantity for the whole film.
import type { CSSProperties, ReactNode } from "react";
import { clamp01, inOut, lin, mix, outE, prog } from "./motion";
import { textW } from "./text";
import { samplePath } from "./draw";

type P2 = [number, number];
/** A tick on an axis: a graph value, or a value and the label to print ("π"). */
export type Tick = number | [number, string];
const tv = (k: Tick) => (typeof k === "number" ? k : k[0]);
const tl = (k: Tick) => (typeof k === "number" ? String(k) : k[1]);

// ------------------------------------------------------------------- plot

/** @internal The px point of graph point (x, y) in a w x h plot showing xs and ys. */
export const plotMap = (xs: P2, ys: P2, w: number, h: number) => (x: number, y: number): P2 => [((x - xs[0]) / (xs[1] - xs[0] || 1)) * w, h - ((y - ys[0]) / (ys[1] - ys[0] || 1)) * h];

/** @internal y of a data series at x (straight between points, held past the ends). */
export const dataAt = (data: P2[], x: number) => {
  if (!data.length) return 0;
  if (x <= data[0][0]) return data[0][1];
  for (let i = 1; i < data.length; i++) {
    const [x1, y1] = data[i];
    const [x0, y0] = data[i - 1];
    if (x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0 || 1));
  }
  return data[data.length - 1][1];
};

/** @internal Graph points of a curve from xs[0] to `upto`, `n` samples over the whole domain plus the exact end. */
export function curvePts(f: (x: number) => number, xs: P2, upto: number, n = 160, data?: P2[]): P2[] {
  const out: P2[] = [];
  const end = Math.max(xs[0], Math.min(xs[1], upto));
  const knots = data ? data.map((d) => d[0]).filter((x) => x > xs[0] && x < end) : Array.from({ length: n - 1 }, (_, i) => xs[0] + ((xs[1] - xs[0]) * (i + 1)) / n).filter((x) => x < end);
  for (const x of [xs[0], ...knots, end]) out.push([x, f(x)]);
  return out;
}

/**
 * A graph on a board. From `at`: the axes grow out from the origin (21 frames); `grid` (a step in graph units) draws
 * outward from the origin over 42 frames, then dims to 0.55; from `draw` (default at + 21) the curve (`fn`, or `data`
 * points) plots left to right over `dur` frames (39, linear) with a tracer dot on its leading edge. `track` (a graph x,
 * animate it yourself) parks the tracer there once the curve reaches it; `readout(x, y)` is drawn beside the tracer from
 * the same value. `tangent` draws the slope at the tracer, `area` shades under the curve up to it, `drop` dashes
 * guides from the tracer to both axes. `ticks` label graph values on the axes; `labels` name the axes.
 */
export const Plot = ({
  t,
  at = 0,
  draw,
  dur = 39,
  fn,
  data,
  xs,
  ys,
  w,
  h,
  ink,
  color,
  color2,
  font,
  size,
  grid,
  ticks,
  labels,
  track,
  readout,
  tangent,
  area,
  drop,
  width = 4,
  style,
}: {
  t: number;
  at?: number;
  draw?: number;
  dur?: number;
  fn?: (x: number) => number;
  data?: P2[];
  xs: P2;
  ys: P2;
  w: number;
  h: number;
  ink: string;
  color: string;
  color2?: string;
  font: string;
  size?: number;
  grid?: number;
  ticks?: { x?: Tick[]; y?: Tick[] };
  labels?: [string, string];
  track?: number;
  readout?: (x: number, y: number) => ReactNode;
  tangent?: boolean;
  area?: boolean;
  drop?: boolean;
  width?: number;
  style?: CSSProperties;
}) => {
  const M = plotMap(xs, ys, w, h);
  const f = fn ?? ((x: number) => dataAt(data ?? [], x));
  const fs = size ?? Math.round(Math.max(14, h * 0.05));
  const ox = Math.max(xs[0], Math.min(xs[1], 0));
  const oy = Math.max(ys[0], Math.min(ys[1], 0));
  const [Ox, Oy] = M(ox, oy);
  const axis = prog(t, at, at + 21, inOut);
  const tickIn = prog(t, at + 18, at + 30);
  const start = draw ?? at + 21;
  const p = prog(t, start, start + dur, lin);
  const lead = mix(xs[0], xs[1], p);
  const xt = track === undefined ? lead : Math.min(lead, Math.max(xs[0], track));
  const yt = f(xt);
  const [Tx, Ty] = M(xt, yt);
  const two = color2 ?? ink;

  const gridLines: { x1: number; y1: number; x2: number; y2: number; o: number }[] = [];
  if (grid && grid > 0) {
    const maxD = Math.max(Ox, w - Ox, Oy, h - Oy) || 1;
    const dim = mix(1, 0.55, prog(t, at + 42, at + 54));
    const line = (d: number) => prog(t, at + 36 * (d / maxD), at + 36 * (d / maxD) + 8) * dim;
    for (let gx = Math.ceil(xs[0] / grid) * grid; gx <= xs[1] + 1e-9; gx += grid) {
      const [px] = M(gx, 0);
      if (Math.abs(px - Ox) > 0.5) gridLines.push({ x1: px, y1: 0, x2: px, y2: h, o: line(Math.abs(px - Ox)) });
    }
    for (let gy = Math.ceil(ys[0] / grid) * grid; gy <= ys[1] + 1e-9; gy += grid) {
      const [, py] = M(0, gy);
      if (Math.abs(py - Oy) > 0.5) gridLines.push({ x1: 0, y1: py, x2: w, y2: py, o: line(Math.abs(py - Oy)) });
    }
  }

  const pts = p > 0 ? curvePts(f, xs, lead, 160, data).map(([x, y]) => M(x, y)) : [];
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const shade =
    area && p > 0
      ? (() => {
          const under = curvePts(f, xs, xt, 160, data).map(([x, y]) => M(x, y));
          const base = Oy;
          return `M${under[0][0].toFixed(1)} ${base.toFixed(1)} ${under.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} L${Tx.toFixed(1)} ${base.toFixed(1)} Z`;
        })()
      : null;
  let tan: [P2, P2] | null = null;
  if (tangent && p > 0) {
    const e = (xs[1] - xs[0]) * 1e-3;
    const [ax, ay] = M(xt - e, f(xt - e));
    const [bx, by] = M(xt + e, f(xt + e));
    const L = Math.hypot(bx - ax, by - ay) || 1;
    const r = w * 0.12;
    tan = [
      [Tx - ((bx - ax) / L) * r, Ty - ((by - ay) / L) * r],
      [Tx + ((bx - ax) / L) * r, Ty + ((by - ay) / L) * r],
    ];
  }
  const dot = Math.max(5, Math.round(w * 0.008));
  const flip = Tx > w * 0.78;
  return (
    <div style={{ position: "relative", width: w, height: h, flexShrink: 0, fontFamily: font, ...style }}>
      <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
        {gridLines.map((g, i) => (g.o > 0 ? <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={ink} strokeOpacity={0.2 * g.o} strokeWidth={1} /> : null))}
        {shade ? <path d={shade} fill={two} fillOpacity={0.2} /> : null}
        {axis > 0 ? (
          <g stroke={ink} strokeWidth={2} strokeLinecap="round">
            <line x1={Ox - Ox * axis} y1={Oy} x2={Ox + (w - Ox) * axis} y2={Oy} />
            <line x1={Ox} y1={Oy - Oy * axis} x2={Ox} y2={Oy + (h - Oy) * axis} />
          </g>
        ) : null}
        {tickIn > 0
          ? [...(ticks?.x ?? []).map((v) => M(tv(v), oy)), ...(ticks?.y ?? []).map((v) => M(ox, tv(v)))].map(([x, y], i) => {
              const onX = i < (ticks?.x?.length ?? 0);
              return <line key={i} x1={onX ? x : x - 6} y1={onX ? y - 6 : y} x2={onX ? x : x + 6} y2={onX ? y + 6 : y} stroke={ink} strokeWidth={2} opacity={tickIn} />;
            })
          : null}
        {drop && p > 0 ? (
          <g stroke={ink} strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="5 6">
            <line x1={Tx} y1={Ty} x2={Tx} y2={Oy} />
            <line x1={Tx} y1={Ty} x2={Ox} y2={Ty} />
          </g>
        ) : null}
        {d ? <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {tan ? <line x1={tan[0][0]} y1={tan[0][1]} x2={tan[1][0]} y2={tan[1][1]} stroke={two} strokeWidth={Math.max(2, width * 0.6)} strokeLinecap="round" /> : null}
        {p > 0 ? <circle cx={Tx} cy={Ty} r={dot} fill={color} /> : null}
      </svg>
      {tickIn > 0
        ? [...(ticks?.x ?? []).map((v) => ({ v: tl(v), at: M(tv(v), oy), x: true })), ...(ticks?.y ?? []).map((v) => ({ v: tl(v), at: M(ox, tv(v)), x: false }))].map((k, i) => (
            <div key={i} style={{ position: "absolute", left: k.at[0], top: k.at[1], fontSize: fs * 0.8, color: ink, opacity: tickIn * 0.7, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", transform: k.x ? `translate(-50%, ${fs * 0.5}px)` : `translate(calc(-100% - ${fs * 0.5}px), -50%)` }}>
              {k.v}
            </div>
          ))
        : null}
      {labels && tickIn > 0 ? (
        <>
          <div style={{ position: "absolute", left: w, top: Oy, fontSize: fs, color: ink, opacity: tickIn, whiteSpace: "nowrap", transform: `translate(${fs * 0.4}px, -50%)` }}>{labels[0]}</div>
          <div style={{ position: "absolute", left: Ox, top: 0, fontSize: fs, color: ink, opacity: tickIn, whiteSpace: "nowrap", transform: `translate(-50%, calc(-100% - ${fs * 0.4}px))` }}>{labels[1]}</div>
        </>
      ) : null}
      {readout && p > 0 ? (
        <div style={{ position: "absolute", left: Tx, top: Ty, fontSize: fs, color: ink, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", transform: flip ? `translate(calc(-100% - ${fs * 0.7}px), calc(-100% - ${fs * 0.3}px))` : `translate(${fs * 0.7}px, calc(-100% - ${fs * 0.3}px))` }}>
          {readout(xt, yt)}
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- formula

/**
 * One token of an equation: its text, and optionally a key (tokens with the same key move between steps; by default
 * the text plus its count, so the second "+" is "+#2"), a colour, and `sup`/`sub` (smaller, raised or lowered).
 */
export type Tok = { s: string; k?: string; c?: string; sup?: boolean; sub?: boolean };

/** @internal */
export type TokPlace = { k: string; s: string; c?: string; x: number; y: number; fs: number; w: number };

const TIGHT = /^[()[\]{},.!]$/;

/** @internal Every token's key, its left x and baseline shift (px), its size and width, and the line's width. */
export function layoutTokens(tokens: Tok[], size: number, measure: (s: string, fs: number) => number): { items: TokPlace[]; width: number } {
  const seen = new Map<string, number>();
  let cur = 0;
  const items = tokens.map((tk, i) => {
    const n = (seen.get(tk.s) ?? 0) + 1;
    seen.set(tk.s, n);
    const small = tk.sup || tk.sub;
    const fs = small ? size * 0.6 : size;
    const prev = tokens[i - 1];
    const gap = i === 0 ? 0 : small ? size * 0.04 : TIGHT.test(tk.s) || (prev && /^[([{]$/.test(prev.s)) ? size * 0.04 : size * 0.22;
    const x = cur + gap;
    const w = measure(tk.s, fs);
    cur = x + w;
    return { k: tk.k ?? (n > 1 ? `${tk.s}#${n}` : tk.s), s: tk.s, c: tk.c, x, y: tk.sup ? -size * 0.42 : tk.sub ? size * 0.18 : 0, fs, w };
  });
  return { items, width: cur };
}

/** @internal */
export type TokFrame = { id: string; s: string; c?: string; x: number; y: number; fs: number; o: number };

/**
 * @internal What every token of a stepped equation shows at frame t: x from the centre line (or the left edge when
 * `center` is false), baseline shift, size and opacity. Step 0 builds token by token (`step` frames apart, `each`
 * frames each, rising); each later step at `at[i]` moves matching keys to their new places over `dur` frames (inOut),
 * fades removed ones in its first half and raises new ones 0.25 em from 35 % on.
 */
export function formulaState(steps: Tok[][], at: number[], t: number, size: number, measure: (s: string, fs: number) => number, opts: { dur?: number; step?: number; each?: number; center?: boolean } = {}): TokFrame[] {
  const { dur = 21, step = 3, each = 13, center = true } = opts;
  const lay = steps.map((s) => layoutTokens(s, size, measure));
  const shift = (i: number) => (center ? -lay[i].width / 2 : 0);
  let k = 0;
  for (let i = 1; i < steps.length; i++) if (at[i] !== undefined && t >= at[i]) k = i;
  const rise = size * 0.25;
  if (k === 0) {
    return lay[0].items.map((it, j) => {
      const e = prog(t, at[0] + j * step, at[0] + j * step + each, outE);
      return { id: it.k, s: it.s, c: it.c, x: it.x + shift(0), y: it.y + (1 - e) * rise, fs: it.fs, o: e };
    });
  }
  const p = prog(t, at[k], at[k] + dur, inOut);
  const old = new Map(lay[k - 1].items.map((it) => [it.k, it]));
  const now = new Set(lay[k].items.map((it) => it.k));
  const out: TokFrame[] = [];
  for (const it of lay[k].items) {
    const was = old.get(it.k);
    if (was) {
      const x = mix(was.x + shift(k - 1), it.x + shift(k), p);
      const y = mix(was.y, it.y, p);
      const fs = mix(was.fs, it.fs, p);
      if (was.s === it.s) out.push({ id: it.k, s: it.s, c: it.c, x, y, fs, o: 1 });
      else {
        out.push({ id: `${it.k}~old`, s: was.s, c: was.c, x, y, fs, o: 1 - p });
        out.push({ id: it.k, s: it.s, c: it.c, x, y, fs, o: p });
      }
    } else {
      const e = prog(t, at[k] + dur * 0.35, at[k] + dur, outE);
      out.push({ id: it.k, s: it.s, c: it.c, x: it.x + shift(k), y: it.y + (1 - e) * rise, fs: it.fs, o: e });
    }
  }
  const fade = 1 - prog(t, at[k], at[k] + dur * 0.5);
  for (const it of lay[k - 1].items) if (!now.has(it.k) && fade > 0) out.push({ id: `${it.k}~gone`, s: it.s, c: it.c, x: it.x + shift(k - 1), y: it.y, fs: it.fs, o: fade });
  return out;
}

/**
 * An equation that rewrites itself: `steps` are its forms, `at` the frame each one starts (the first builds token by
 * token). Tokens with the same key glide to their new places over `dur` frames (18 to 24), new ones rise in, removed
 * ones fade. `colors` gives each variable its one colour by its text ({ x: "#..", A: "#.." }); everything else is
 * `ink`. Use a serif face; superscripts are `{ s: "2", sup: true }`. Laid out centred in a box as wide as its widest form.
 */
export const FormulaSteps = ({ t, steps, at, dur = 21, size, font, weight = 400, ink, colors, align = "center", style }: { t: number; steps: Tok[][]; at: number[]; dur?: number; size: number; font: string; weight?: number; ink: string; colors?: Record<string, string>; align?: "center" | "left"; style?: CSSProperties }) => {
  const measure = (s: string, fs: number) => textW(s, font, weight, fs);
  const widest = Math.max(...steps.map((s) => layoutTokens(s, size, measure).width));
  const frame = formulaState(steps, at, t, size, measure, { dur, center: align === "center" });
  const base = size * 1.05;
  const left = align === "center" ? widest / 2 : 0;
  return (
    <div style={{ position: "relative", width: Math.ceil(widest), height: size * 1.5, flexShrink: 0, fontFamily: font, fontWeight: weight, ...style }}>
      {frame.map((tk) =>
        tk.o > 0 ? (
          <span key={tk.id} style={{ position: "absolute", left: left + tk.x, top: base - 0.8 * tk.fs + tk.y, fontSize: tk.fs, lineHeight: 1, whiteSpace: "pre", color: tk.c ?? colors?.[tk.s] ?? ink, opacity: tk.o }}>
            {tk.s}
          </span>
        ) : null,
      )}
    </div>
  );
};

/** An equation built token by token from `at` (3 frames apart, 13 frames each). The one-form FormulaSteps. */
export const Formula = ({ t, at = 0, tokens, size, font, weight, ink, colors, style }: { t: number; at?: number; tokens: Tok[]; size: number; font: string; weight?: number; ink: string; colors?: Record<string, string>; style?: CSSProperties }) => <FormulaSteps t={t} steps={[tokens]} at={[at]} size={size} font={font} weight={weight} ink={ink} colors={colors} style={style} />;

// ------------------------------------------------------------------ morph

type Poly = { pts: P2[]; closed: boolean };

/** @internal Path data flattened to points (M L H V C S Q T Z, absolute or relative). Arcs need a browser (samplePath). */
export function flatten(d: string): Poly {
  if (/[aA]/.test(d)) {
    const s = typeof document !== "undefined" ? samplePath(d).pts : [];
    return { pts: s, closed: /[zZ]\s*$/.test(d.trim()) };
  }
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const pts: P2[] = [];
  let i = 0;
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let ctrl: P2 | null = null;
  let closed = false;
  const num = () => Number(toks[i++]);
  const curve = (p0: P2, c1: P2, c2: P2, p3: P2) => {
    for (let k = 1; k <= 24; k++) {
      const u = k / 24;
      const a = (1 - u) ** 3;
      const b = 3 * (1 - u) ** 2 * u;
      const c = 3 * (1 - u) * u * u;
      const e = u ** 3;
      pts.push([a * p0[0] + b * c1[0] + c * c2[0] + e * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + e * p3[1]]);
    }
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ax = (v: number) => (rel ? cx + v : v);
    const ay = (v: number) => (rel ? cy + v : v);
    if (C === "Z") {
      closed = true;
      cx = sx;
      cy = sy;
      ctrl = null;
      continue;
    }
    if (C === "M") {
      cx = ax(num());
      cy = ay(num());
      sx = cx;
      sy = cy;
      pts.push([cx, cy]);
      cmd = rel ? "l" : "L";
      ctrl = null;
    } else if (C === "L") {
      cx = ax(num());
      cy = ay(num());
      pts.push([cx, cy]);
      ctrl = null;
    } else if (C === "H") {
      cx = rel ? cx + num() : num();
      pts.push([cx, cy]);
      ctrl = null;
    } else if (C === "V") {
      cy = rel ? cy + num() : num();
      pts.push([cx, cy]);
      ctrl = null;
    } else if (C === "C" || C === "S") {
      const c1: P2 = C === "C" ? [ax(num()), ay(num())] : ctrl ? [2 * cx - ctrl[0], 2 * cy - ctrl[1]] : [cx, cy];
      const c2: P2 = [ax(num()), ay(num())];
      const p3: P2 = [ax(num()), ay(num())];
      curve([cx, cy], c1, c2, p3);
      ctrl = c2;
      [cx, cy] = p3;
    } else if (C === "Q" || C === "T") {
      const q: P2 = C === "Q" ? [ax(num()), ay(num())] : ctrl ? [2 * cx - ctrl[0], 2 * cy - ctrl[1]] : [cx, cy];
      const p3: P2 = [ax(num()), ay(num())];
      curve([cx, cy], [cx + (2 / 3) * (q[0] - cx), cy + (2 / 3) * (q[1] - cy)], [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])], p3);
      ctrl = q;
      [cx, cy] = p3;
    } else i++;
  }
  if (closed && pts.length > 1) {
    const [a, b] = [pts[0], pts[pts.length - 1]];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) pts.pop();
  }
  return { pts, closed };
}

/** @internal `n` points evenly spaced by arc length along a polyline (a loop when closed). */
export function resample(poly: Poly, n = 200): P2[] {
  const P = poly.closed ? [...poly.pts, poly.pts[0]] : poly.pts;
  if (P.length < 2) return Array.from({ length: n }, () => P[0] ?? [0, 0]);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1] || 1;
  const out: P2[] = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = poly.closed ? (L * i) / n : (L * i) / (n - 1);
    while (j < P.length - 1 && cum[j] < s) j++;
    const seg = cum[j] - cum[j - 1] || 1;
    const k = clamp01((s - cum[j - 1]) / seg);
    out.push([P[j - 1][0] + (P[j][0] - P[j - 1][0]) * k, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * k]);
  }
  return out;
}

const area2 = (p: P2[]) => p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * a[1], 0);
const cost = (a: P2[], b: P2[], o: number) => a.reduce((s, q, i) => s + (q[0] - b[(i + o) % b.length][0]) ** 2 + (q[1] - b[(i + o) % b.length][1]) ** 2, 0);
const shiftBest = (fixed: P2[], moving: P2[]) => {
  let best = 0;
  let bc = Infinity;
  for (let o = 0; o < moving.length; o++) {
    const c = cost(fixed, moving, o);
    if (c < bc) [bc, best] = [c, o];
  }
  return moving.map((_, i) => moving[(i + best) % moving.length]);
};

const pairs = new Map<string, { a: P2[]; b: P2[]; ac: boolean; bc: boolean }>();

/** @internal Both paths as `n` points each, start points and winding lined up so each point travels the shortest way. */
export function morphPair(from: string, to: string, n = 200) {
  const key = `${n}|${from}|${to}`;
  const hit = pairs.get(key);
  if (hit) return hit;
  const A = flatten(from);
  const B = flatten(to);
  let a = resample(A, n);
  let b = resample(B, n);
  if (A.closed && B.closed) {
    if (Math.sign(area2(a)) !== Math.sign(area2(b))) b = [...b].reverse();
    b = shiftBest(a, b);
  } else {
    if (cost(a, [...b].reverse(), 0) < cost(a, b, 0)) b = [...b].reverse();
    if (A.closed) a = shiftBest(b, a);
    if (B.closed) b = shiftBest(a, b);
  }
  const out = { a, b, ac: A.closed, bc: B.closed };
  pairs.set(key, out);
  return out;
}

/** @internal The morph's points at progress p (0 = `from`, 1 = `to`); `spin` turns the source that many degrees on the way. */
export function morphPoints(from: string, to: string, p: number, n = 200, spin = 0): P2[] {
  const { a, b } = morphPair(from, to, n);
  const r = (spin * p * Math.PI) / 180;
  const cx = a.reduce((s, q) => s + q[0], 0) / a.length;
  const cy = a.reduce((s, q) => s + q[1], 0) / a.length;
  const [cs, sn] = [Math.cos(r), Math.sin(r)];
  return a.map(([x, y], i) => {
    const rx = cx + (x - cx) * cs - (y - cy) * sn;
    const ry = cy + (x - cx) * sn + (y - cy) * cs;
    return [mix(rx, b[i][0], p), mix(ry, b[i][1], p)];
  });
}

/**
 * One shape becoming another: `from` and `to` are SVG path data in a w x h box (see `path` helpers), each resampled
 * to 200 points by length with start and winding aligned, interpolated from `at` over `dur` frames (27; 33 with
 * `spin`, which turns the source 90° as it goes). Only for the same object changing state. `fill` shows while closed.
 */
export const Morph = ({ t, at, dur, from, to, w, h, color, width = 4, fill, spin = false, style }: { t: number; at: number; dur?: number; from: string; to: string; w: number; h: number; color: string; width?: number; fill?: string; spin?: boolean; style?: CSSProperties }) => {
  const p = prog(t, at, at + (dur ?? (spin ? 33 : 27)), inOut);
  const { ac, bc } = morphPair(from, to);
  const pts = morphPoints(from, to, p, 200, spin ? 90 : 0);
  const closed = p < 0.5 ? ac : bc;
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + (closed ? " Z" : "");
  const fillO = fill ? mix(ac ? 1 : 0, bc ? 1 : 0, p) : 0;
  return (
    <svg width={w} height={h} style={{ flexShrink: 0, ...style }}>
      <path d={d} fill={fill && fillO > 0 ? fill : "none"} fillOpacity={fillO} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

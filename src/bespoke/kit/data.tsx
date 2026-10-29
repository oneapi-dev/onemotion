// Data blocks for charts that carry the film: a bar chart race, a pictogram
// (Isotype) grid, a ring stat and a one-inflection callout. Every value is a
// pure function of the frame; every number goes through fmtNum, in tabular
// figures. Techniques from the iart-ai data-animation skills, rebuilt: the
// race interpolates rank positions (the reference teleports bars) and caps
// how far a bar may travel in one frame.
import { useMemo, type CSSProperties } from "react";
import { Easing } from "remotion";
import { fmtNum } from "./blocks";
import { clamp01, inOut, mix, prog } from "./motion";

const outQuad = Easing.out(Easing.quad);
const outCubic = Easing.out(Easing.cubic);

// ---------------------------------------------------------------- RankRace

/** One step of a race (a date, a year): every competitor's value at that step. */
export type RaceRow = { label: string; values: Record<string, number> };

/** @internal The furthest a bar may travel in one frame, in slots (one slot = barH + gap). */
export const RACE_MAX_STEP = 0.25;

/** @internal */
export type RaceTrack = {
  keys: string[];
  /** Slots shown: `top`, plus one for "Other" when the rest is folded. */
  slots: number;
  other: boolean;
  /** Frames from `at` until the last row lands (intro + (rows - 1) * perRow). */
  length: number;
  /** Per key, per frame from `at` (0..length): the bar's slot (0 = the top), its opacity and its value. */
  y: Record<string, number[]>;
  alpha: Record<string, number[]>;
  value: Record<string, number[]>;
  /** Per frame: the folded rest's value, and the leader's value (the x scale). */
  rest: number[];
  leader: number[];
};

/**
 * @internal Each row's ranks: keys sorted by value (ties keep the order a key first
 * appears in), the first `top` on their slots, the rest parked on slot
 * `top` (just under the last bar, where "Other" sits when the rest is folded).
 */
export function raceRanks(rows: RaceRow[], top: number) {
  const keys: string[] = [];
  for (const r of rows) for (const k of Object.keys(r.values)) if (!keys.includes(k)) keys.push(k);
  const n = Math.max(1, Math.min(12, Math.round(top)));
  const slot = rows.map((r) => {
    const order = [...keys].sort((a, b) => (r.values[b] ?? 0) - (r.values[a] ?? 0) || keys.indexOf(a) - keys.indexOf(b));
    const s: Record<string, number> = {};
    order.forEach((k, i) => (s[k] = Math.min(i, n)));
    return s;
  });
  const rest = rows.map((r, i) => keys.reduce((sum, k) => (slot[i][k] >= n ? sum + (r.values[k] ?? 0) : sum), 0));
  return { keys, top: n, slot, rest };
}

/**
 * @internal The whole race, frame by frame: each bar's slot eases (inOut) from its
 * rank at row i to its rank at row i+1, and follows that path at most
 * RACE_MAX_STEP slots a frame, so even a bar that leaps eight places glides
 * there instead of teleporting (on a large jump it arrives a few frames late).
 * Values interpolate linearly between rows; the first row grows in over `intro`.
 */
export function raceTrack(rows: RaceRow[], { perRow = 45, top = 8, rest = "drop", intro = 20 }: { perRow?: number; top?: number; rest?: "other" | "drop"; intro?: number } = {}): RaceTrack {
  const r = raceRanks(rows, top);
  const n = rows.length;
  const pr = Math.max(1, perRow);
  const length = Math.ceil(intro + Math.max(0, n - 1) * pr);
  const other = rest === "other" && r.keys.length > r.top;
  const y: Record<string, number[]> = {};
  const alpha: Record<string, number[]> = {};
  const value: Record<string, number[]> = {};
  for (const k of r.keys) (y[k] = []), (alpha[k] = []), (value[k] = []);
  const restV: number[] = [];
  const leader: number[] = [];
  const at = (f: number) => {
    if (n < 2 || f < intro) return { i: 0, j: 0, e: 0, lin: 0, grow: n ? outCubic(clamp01(f / Math.max(1, intro))) : 0 };
    const u = (f - intro) / pr;
    const i = Math.min(n - 2, Math.floor(u));
    const lin = clamp01(u - i);
    return { i, j: i + 1, e: inOut(lin), lin, grow: 1 };
  };
  for (let f = 0; f <= length; f++) {
    const { i, j, e, lin, grow } = at(f);
    let lead = 0;
    for (const k of r.keys) {
      const target = mix(r.slot[i][k], r.slot[j][k], e);
      const prev = y[k].length ? y[k][y[k].length - 1] : target;
      const step = Math.max(-RACE_MAX_STEP, Math.min(RACE_MAX_STEP, target - prev));
      y[k].push(f === 0 ? target : prev + step);
      const shown = (s: number) => (s < r.top ? 1 : 0);
      alpha[k].push(mix(shown(r.slot[i][k]), shown(r.slot[j][k]), e));
      const v = mix(rows[i].values[k] ?? 0, rows[j].values[k] ?? 0, lin) * grow;
      value[k].push(v);
      if (r.slot[i][k] < r.top || r.slot[j][k] < r.top) lead = Math.max(lead, v);
    }
    restV.push(mix(r.rest[i] ?? 0, r.rest[j] ?? 0, lin) * grow);
    leader.push(lead);
  }
  return { keys: r.keys, slots: r.top + (other ? 1 : 0), other, length, y, alpha, value, rest: restV, leader };
}

/** @internal The track read at frame f from `at` (clamped to its ends, interpolated between whole frames). */
export function raceAt(track: RaceTrack, f: number) {
  const g = Math.max(0, Math.min(track.length, f));
  const a = Math.floor(g);
  const b = Math.min(track.length, a + 1);
  const u = g - a;
  const read = (arr: number[]) => mix(arr[a], arr[b], u);
  return {
    bars: track.keys.map((k) => ({ key: k, y: read(track.y[k]), alpha: read(track.alpha[k]), value: read(track.value[k]) })),
    rest: read(track.rest),
    leader: read(track.leader),
  };
}

/** Frames a race takes from `at`: the intro, a row every `perRow` frames, and the final hold. Fit a race to a beat with it. */
export const raceLength = (rows: number, perRow = 45, hold = 75, intro = 20) => intro + Math.max(0, rows - 1) * perRow + hold;

/**
 * A bar chart race: one row per step (a date), the top `top` bars (max 12)
 * ranked by value, each bar gliding between its ranks (never teleporting),
 * the x scale following the current leader, values counting in tabular
 * figures. The step's label sits huge and faint (13 %) in the corner; the
 * `highlight` key is the accent, every other bar grey. The rest of the keys
 * are dropped, or folded into one "Other" bar under the others
 * (`rest="other"`). Timeline from `at`: the first row grows in over 20
 * frames, the next row lands every `perRow` frames (or fit them all into
 * `dur`), then the final row holds `hold` frames while the other bars recede.
 * Length: raceLength(rows.length, perRow, hold).
 */
export const RankRace = ({ t, at, rows, w, h, perRow = 45, dur, hold = 75, top = 8, rest = "drop", highlight, color, grey = "#BDB8AE", ink, font, unit = "", decimals = 0, locale = "en-US", otherLabel = "Other", labelW, style }: { t: number; at: number; rows: RaceRow[]; w: number; h: number; perRow?: number; dur?: number; hold?: number; top?: number; rest?: "other" | "drop"; highlight?: string; color: string; grey?: string; ink: string; font: string; unit?: string; decimals?: number; locale?: string; otherLabel?: string; labelW?: number; style?: CSSProperties }) => {
  const intro = 20;
  const pr = dur !== undefined ? Math.max(1, (dur - intro - hold) / Math.max(1, rows.length - 1)) : perRow;
  const track = useMemo(() => raceTrack(rows, { perRow: pr, top, rest, intro }), [rows, pr, top, rest]);
  const f = t - at;
  const now = raceAt(track, f);
  const slotH = h / Math.max(1, track.slots);
  const barH = slotH * 0.76;
  const lw = labelW ?? Math.min(w * 0.22, 260);
  const valueRoom = Math.min(w * 0.16, 200);
  const maxW = Math.max(1, w - lw - valueRoom);
  const scale = (v: number) => Math.max(0, Math.min(1, v / (now.leader || 1))) * maxW;
  const fs = Math.max(14, Math.min(32, barH * 0.46));
  const rowI = Math.max(0, Math.min(rows.length - 1, Math.floor((f - intro) / pr + 0.5)));
  const settled = highlight ? prog(f, track.length, track.length + 20, outQuad) : 0;
  const enter = prog(f, 0, 12, outQuad);
  const num = (v: number) => `${fmtNum(v, decimals, locale)}${unit}`;
  const bar = (key: string, label: string, y: number, v: number, a: number, fill: string, dimmed: number) => (
    <g key={key} transform={`translate(0 ${(y * slotH + (slotH - barH) / 2).toFixed(2)})`} opacity={a * dimmed}>
      <text x={lw - 14} y={barH / 2} dy="0.35em" textAnchor="end" fill={ink} fontSize={fs} fontWeight={key === highlight ? 700 : 500}>
        {label}
      </text>
      <rect x={lw} y={0} width={scale(v)} height={barH} fill={fill} />
      <text x={lw + scale(v) + 10} y={barH / 2} dy="0.35em" fill={ink} fillOpacity={key === highlight ? 1 : 0.72} fontSize={fs} fontWeight={600} style={{ fontVariantNumeric: "tabular-nums" }}>
        {num(v)}
      </text>
    </g>
  );
  // The highlight draws over the bars it passes.
  const order = [...now.bars].sort((a, b) => (a.key === highlight ? 1 : 0) - (b.key === highlight ? 1 : 0));
  return (
    <svg width={w} height={h} style={{ overflow: "visible", fontFamily: font, ...style }}>
      <text x={w} y={h - h * 0.02} textAnchor="end" fill={ink} fillOpacity={0.13 * enter} fontSize={Math.round(h * 0.2)} fontWeight={700} style={{ fontVariantNumeric: "tabular-nums" }}>
        {rows[rowI]?.label ?? ""}
      </text>
      <line x1={lw} x2={lw} y1={0} y2={h} stroke={ink} strokeOpacity={0.35 * enter} strokeWidth={1.5} />
      {order.map((b) => (b.alpha > 0.01 ? bar(b.key, b.key, b.y, b.value, b.alpha, b.key === highlight ? color : grey, b.key === highlight ? 1 : 1 - 0.45 * settled) : null))}
      {track.other ? bar("__other__", otherLabel, track.slots - 1, now.rest, 1, grey, 0.55) : null}
    </svg>
  );
};

// ---------------------------------------------------------------- Pictogram

/** Icons on a 24 x 24 grid, drawn as one filled path each. */
export const PICTO_ICONS = {
  person: "M12 2.5a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2zM4.8 21.5v-4c0-3.1 2.9-5.6 7.2-5.6s7.2 2.5 7.2 5.6v4z",
  house: "M12 2.8 2.2 11.2h2.6v10.3h5.4v-6.3h3.6v6.3h5.4V11.2h2.6z",
  drop: "M12 2.2c3.7 4.7 6.8 8.6 6.8 12.4a6.8 6.8 0 0 1-13.6 0c0-3.8 3.1-7.7 6.8-12.4z",
  bolt: "M13.8 1.8 4.4 13.6h6.1L9.6 22.2l9.4-11.9h-6.1z",
} as const;
export type PictoIcon = keyof typeof PICTO_ICONS;

/** @internal How lit each unit is: 1 for whole units, the fraction for the partial one, 0 after. */
export const pictoUnits = (total: number, value: number) => Array.from({ length: Math.max(0, Math.round(total)) }, (_, i) => clamp01(value - i));

/** @internal The clip that reveals `frac` of a unit from its left edge (a partial unit is cut, never scaled). */
export const pictoClip = (frac: number) => `inset(0 ${((1 - clamp01(frac)) * 100).toFixed(2)}% 0 0)`;

/**
 * A pictogram (Isotype) grid: `total` icons, the first `value` lit in the
 * accent and the rest at `dim` opacity, so "7 of 10" is seen, not read. A
 * fractional value (7.4) lights the last unit partly, revealed from its left
 * edge with a clip. The grid fades in from `at`, then units light one after
 * another `step` frames apart (the whole spread capped at `cap` frames).
 * `icon` is a name or your own SVG path on a 24 x 24 grid.
 */
export const Pictogram = ({ t, at, total = 10, value, icon = "person", cols, size = 72, gap, color, base, dim = 0.25, step = 3, cap = 60, style }: { t: number; at: number; total?: number; value: number; icon?: PictoIcon | string; cols?: number; size?: number; gap?: number; color: string; base?: string; dim?: number; step?: number; cap?: number; style?: CSSProperties }) => {
  const units = pictoUnits(total, value);
  const c = Math.max(1, Math.round(cols ?? Math.min(10, units.length)));
  const g = gap ?? size * 0.22;
  const d = (PICTO_ICONS as Record<string, string>)[icon] ?? icon;
  const lit = Math.max(1, Math.ceil(value));
  const s = lit > 1 ? Math.min(step, cap / (lit - 1)) : step;
  const glyph = (fill: string) => (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
      <path d={d} fill={fill} />
    </svg>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${c}, ${size}px)`, gap: g, ...style }}>
      {units.map((frac, i) => {
        const show = prog(t, at + Math.min(i, 12), at + Math.min(i, 12) + 10, outQuad);
        const on = prog(t, at + 12 + i * s, at + 12 + i * s + 8, outCubic);
        return (
          <div key={i} style={{ position: "relative", width: size, height: size }}>
            <div style={{ opacity: dim * show }}>{glyph(base ?? color)}</div>
            {frac > 0 ? <div style={{ position: "absolute", inset: 0, opacity: on, clipPath: frac < 1 ? pictoClip(frac) : undefined, transform: `translateY(${((1 - on) * size * 0.06).toFixed(2)}px)` }}>{glyph(color)}</div> : null}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- RingStat

/** @internal A ring's dash at progress p of `value` (0..1): the dash array is the circumference, the offset what stays hidden. */
export const ringDash = (value: number, p: number, r: number) => {
  const c = 2 * Math.PI * r;
  return { dash: c, offset: c * (1 - clamp01(value) * clamp01(p)) };
};

/**
 * A donut stat: the arc draws from 12 o'clock to `value` (0..1) over `dur`
 * frames from `at` (ease out), the number in the middle counting in step
 * with the arc (value × `scale`, a percent by default), the label under
 * the ring. `track` is the unlit ring.
 */
export const RingStat = ({ t, at, value, dur = 30, size = 280, thickness, color, track = "rgba(0,0,0,0.1)", ink, font, label, scale = 100, unit = "%", decimals = 0, locale = "en-US", numberSize, style }: { t: number; at: number; value: number; dur?: number; size?: number; thickness?: number; color: string; track?: string; ink: string; font: string; label?: string; scale?: number; unit?: string; decimals?: number; locale?: string; numberSize?: number; style?: CSSProperties }) => {
  const sw = thickness ?? size * 0.085;
  const r = (size - sw) / 2;
  const p = prog(t, at, at + dur, outQuad);
  const { dash, offset } = ringDash(value, p, r);
  const enter = prog(t, at - 8, at + 4, outQuad);
  const fs = numberSize ?? size * 0.26;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.08, fontFamily: font, color: ink, opacity: enter, ...style }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ display: "block", transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={sw} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash.toFixed(2)} strokeDashoffset={offset.toFixed(2)} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {fmtNum(value * scale * p, decimals, locale)}
          {unit ? <span style={{ fontSize: "0.5em", marginLeft: "0.05em" }}>{unit}</span> : null}
        </div>
      </div>
      {label ? <div style={{ fontSize: Math.max(18, size * 0.1), fontWeight: 500, opacity: 0.72 * prog(t, at + 14, at + 30, outQuad), textAlign: "center", maxWidth: size * 1.6 }}>{label}</div> : null}
    </div>
  );
};

// The callout lives in its own module so LineChart (blocks.tsx) can use it without importing this file.
export { Callout, calloutAlpha } from "./callout";

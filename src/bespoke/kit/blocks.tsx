// Ready-made motion blocks: whole moments a promo film reuses (a price that
// counts and lands, a UI card that reveals and tilts, phones fanning out, a
// chart that builds, a logo lockup, a terminal run, transitions). Their
// motion is re-implemented from HyperFrames catalog blocks (Apache-2.0,
// (c) HeyGen; kinetic-center-build MIT, a port of Remocn) as pure functions
// of the frame: no GSAP, no assets or logos copied. Every block is sized and
// coloured by its props, so it takes the film's own look.
import type { CSSProperties, ReactNode } from "react";
import { Easing } from "remotion";
import { Callout } from "./callout";
import { clamp01, kf, mix, prog, typed } from "./motion";
import { textW } from "./text";
import { Mark } from "./ui";

const expoOut = (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
const backOut = Easing.out(Easing.back(1.4));
const sineInOut = Easing.inOut(Easing.sin);
const p3 = Easing.out(Easing.cubic);
const p4in = Easing.in(Easing.poly(5));

/**
 * A number that counts to its value and lands with a small pulse: prices,
 * credits, totals. The currency sign and the suffix sit smaller beside the
 * digits. Counts over `dur` frames from `at`.
 */
/** A number as a reader reads it: thousands grouped, the decimals fixed ("2,400,000", "2.400.000" in id-ID), never "2400000" or "0.30000000000000004". */
export const fmtNum = (v: number, decimals = 0, locale = "en-US") => v.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const PriceCount = ({ t, at, from = 0, to, dur = 52, prefix = "", suffix = "", decimals = 0, locale = "en-US", size, color, font, weight = 700, style }: { t: number; at: number; from?: number; to: number; dur?: number; prefix?: string; suffix?: string; decimals?: number; locale?: string; size: number; color: string; font: string; weight?: number; style?: CSSProperties }) => {
  const enter = prog(t, at, at + 11, p3);
  const v = from + (to - from) * prog(t, at, at + dur, sineInOut);
  const land = at + dur;
  const pulse = t < land ? 0 : t < land + 5 ? prog(t, land, land + 5, p3) : 1 - prog(t, land + 5, land + 10, Easing.out(Easing.quad));
  const drift = t > land + 10 ? Math.sin(((t - land - 10) / 60) * Math.PI) * 0.0055 * size : 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: font, fontWeight: weight, fontSize: size, color, lineHeight: 1, fontVariantNumeric: "tabular-nums", opacity: enter, transform: `translateY(${(1 - enter) * 0.022 * size + drift}px) scale(${(0.98 + 0.02 * enter) * (1 + 0.07 * pulse)})`, ...style }}>
      {prefix ? <span style={{ fontSize: "0.55em", transform: "translateY(-0.31em)", marginRight: "0.04em" }}>{prefix}</span> : null}
      {fmtNum(v, decimals, locale)}
      {suffix ? <span style={{ fontSize: "0.55em", marginLeft: "0.06em" }}>{suffix}</span> : null}
    </span>
  );
};

/**
 * A UI card (a Window, a panel, a screenshot) revealed with a turn: it rises
 * in, the camera pushes in at `push`, it turns to an angle at `tilt` and
 * sways there, and flies off at `exit`. Give each stage the frame it starts
 * on; leave one out to skip it. The turn is drawn in 2D (a foreshortened
 * width): the export's renderer draws no CSS 3D, and a card turned with
 * rotateY would vanish from the MP4.
 */
export const UiReveal = ({ t, at, push, tilt, exit, angle = -34, zoom = 1.15, children, style }: { t: number; at: number; push?: number; tilt?: number; exit?: number; angle?: number; zoom?: number; children: ReactNode; style?: CSSProperties }) => {
  const enter = expoOut(clamp01((t - at) / 17));
  const pushed = push === undefined ? 0 : prog(t, push, push + 39, Easing.inOut(Easing.cubic));
  const turned = tilt === undefined ? 0 : expoOut(clamp01((t - tilt) / 40));
  const sway = tilt !== undefined && t > tilt + 40 ? Math.sin(((t - tilt - 40) / 27) * Math.PI) * 2 : 0;
  const gone = exit === undefined ? 0 : p4in(clamp01((t - exit) / 16));
  const scale = (0.92 + 0.08 * enter) * mix(1, zoom, pushed) * (1 - 0.6 * gone);
  const turn = angle * turned + sway - 31 * gone;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
      <div style={{ opacity: enter * (1 - gone), transform: `translate(${-2200 * gone}px, ${(1 - enter) * 24 - 16 * turned}px) scaleX(${Math.cos((turn * Math.PI) / 180).toFixed(4)}) scale(${scale})` }}>{children}</div>
    </div>
  );
};

/** Three phones (or cards) that start stacked and fan out: the middle one pops in, the sides swing out to ±spread px at ±angle degrees. */
export const PhoneFan = ({ t, at, spread = 340, angle = 12, left, center, right, style }: { t: number; at: number; spread?: number; angle?: number; left: ReactNode; center: ReactNode; right: ReactNode; style?: CSSProperties }) => {
  const mid = backOut(clamp01((t - at - 6) / 21));
  const fan = expoOut(clamp01((t - at - 9) / 36));
  const side = (i: number) => clamp01((t - at - 9 - i * 3) / 9);
  const layer = (s: number, node: ReactNode, z: number) => (
    <div style={{ position: "absolute", left: "50%", top: "50%", zIndex: z, opacity: side(s < 0 ? 0 : 1), transform: `translate(-50%, -50%) translateX(${s * spread * fan}px) rotate(${s * angle * fan}deg) scale(${0.92 + 0.08 * fan})` }}>{node}</div>
  );
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      {layer(-1, left, 1)}
      {layer(1, right, 1)}
      <div style={{ position: "absolute", left: "50%", top: "50%", zIndex: 2, opacity: clamp01(mid * 1.5), transform: `translate(-50%, -50%) scale(${0.85 + 0.15 * mid})` }}>{center}</div>
    </div>
  );
};

type Datum = { label: string; value: number };

/** Bars that rise one after another from `at` (every `step` frames), each label counting to its value as it lands. Values come from the facts only. */
export const BarChart = ({ t, at, data, w, h, color, ink, font, step = 15, unit = "", decimals = 0, max, locale = "en-US" }: { t: number; at: number; data: Datum[]; w: number; h: number; color: string; ink: string; font: string; step?: number; unit?: string; decimals?: number; max?: number; locale?: string }) => {
  const top = max ?? Math.max(...data.map((d) => d.value), 1);
  const gap = w * 0.06;
  const bw = (w - gap * (data.length - 1)) / Math.max(1, data.length);
  const base = h - 40;
  return (
    <svg width={w} height={h} style={{ overflow: "visible", fontFamily: font }}>
      {[0.25, 0.5, 0.75, 1].map((g, i) => (
        <line key={g} x1={0} x2={w} y1={base - base * g} y2={base - base * g} stroke={ink} strokeOpacity={0.12 * prog(t, at + i * 7, at + i * 7 + 12)} />
      ))}
      {data.map((d, i) => {
        const p = prog(t, at + 12 + i * step, at + 12 + i * step + 24, Easing.out(Easing.quad));
        const bh = (d.value / top) * (base - 30) * p;
        const x = i * (bw + gap);
        return (
          <g key={d.label}>
            <rect x={x} y={base - bh} width={bw} height={bh} rx={Math.min(10, bw * 0.08)} fill={color} />
            <text x={x + bw / 2} y={base - bh - 12} textAnchor="middle" fill={ink} fontSize={Math.min(34, bw * 0.3)} fontWeight={700} opacity={p} style={{ fontVariantNumeric: "tabular-nums" }}>
              {`${fmtNum(d.value * p, decimals, locale)}${unit}`}
            </text>
            <text x={x + bw / 2} y={h - 6} textAnchor="middle" fill={ink} fillOpacity={0.7} fontSize={Math.min(24, bw * 0.2)}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/** The point a LineChart callout marks: its index among the points, and the few words said about it. */
export type LineCallout = { index: number; text: string };

/**
 * A line that draws itself through its points over `dur` frames, a dot riding its tip, each point's value counting up as the line reaches it.
 * `axis` draws the baseline, the left axis and three hairlines over 12 frames first (the line then starts 12 frames later); `area` fills
 * under the line, fading in once the draw passes 90 %; `callout` marks one point with a leader and a short text as the line reaches it.
 */
export const LineChart = ({ t, at, data, w, h, color, ink, font, dur = 90, unit = "", decimals = 1, min, max, locale = "en-US", area = false, callout, axis = false }: { t: number; at: number; data: Datum[]; w: number; h: number; color: string; ink: string; font: string; dur?: number; unit?: string; decimals?: number; min?: number; max?: number; locale?: string; area?: boolean; callout?: LineCallout; axis?: boolean }) => {
  const lo = min ?? Math.min(...data.map((d) => d.value));
  const hi = max ?? Math.max(...data.map((d) => d.value));
  const base = h - 40;
  const pts = data.map((d, i) => [data.length > 1 ? (i / (data.length - 1)) * w : w / 2, base - ((d.value - lo) / (hi - lo || 1)) * (h - 90)] as const);
  const lens = pts.map((p, i) => (i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const lineAt = at + (axis ? 12 : 0);
  const p = prog(t, lineAt, lineAt + dur, sineInOut);
  // The tip, by arc length, so the dot stays on the stroke's front.
  let left = p * total;
  let tip = pts[0];
  let reached = 0;
  for (let i = 1; i < pts.length; i++) {
    if (left <= lens[i]) {
      const f = lens[i] ? left / lens[i] : 1;
      tip = [mix(pts[i - 1][0], pts[i][0], f), mix(pts[i - 1][1], pts[i][1], f)];
      break;
    }
    left -= lens[i];
    tip = pts[i];
    reached = i;
  }
  const d = pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const ax = axis ? prog(t, at, at + 12, p3) : 0;
  const fill = area && pts.length > 1 ? +(0.16 * clamp01((p - 0.9) / 0.1)).toFixed(3) : 0;
  // The frame the tip reaches the callout's point: the draw's sine ease inverted at that point's share of the length.
  const ci = callout ? Math.max(0, Math.min(pts.length - 1, Math.round(callout.index))) : -1;
  const share = ci > 0 ? lens.slice(1, ci + 1).reduce((a, b) => a + b, 0) / total : 0;
  const event = lineAt + (dur * Math.acos(1 - 2 * share)) / Math.PI;
  const cq = ci >= 0 ? pts[ci] : null;
  const up = cq ? cq[1] > 150 : true;
  return (
    <svg width={w} height={h} style={{ overflow: "visible", fontFamily: font }}>
      {axis ? (
        <g>
          {[1 / 3, 2 / 3, 1].map((g, i) => (
            <line key={g} x1={0} x2={w * prog(t, at + i * 2, at + 8 + i * 2, p3)} y1={base - (h - 90) * g} y2={base - (h - 90) * g} stroke={ink} strokeOpacity={0.12} strokeWidth={1} />
          ))}
          <line x1={-20} x2={-20 + (w + 20) * ax} y1={base} y2={base} stroke={ink} strokeOpacity={0.55} strokeWidth={1.5} />
          <line x1={-20} x2={-20} y1={base} y2={base - (base - 30) * ax} stroke={ink} strokeOpacity={0.55} strokeWidth={1.5} />
        </g>
      ) : null}
      {fill > 0 ? <path d={`${d} L${pts[pts.length - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`} fill={color} fillOpacity={fill} /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} />
      {p > 0 && p < 1 ? <circle cx={tip[0]} cy={tip[1]} r={10} fill={color} /> : null}
      {pts.map((q, i) => {
        const shown = i <= reached || p >= 1 ? prog(t, lineAt + (dur * i) / Math.max(1, pts.length - 1), lineAt + (dur * i) / Math.max(1, pts.length - 1) + 24, p3) : 0;
        return (
          <g key={data[i].label} opacity={shown}>
            <circle cx={q[0]} cy={q[1]} r={7} fill={color} />
            <text x={q[0]} y={q[1] - 22} textAnchor="middle" fill={ink} fontSize={30} fontWeight={700} style={{ fontVariantNumeric: "tabular-nums" }}>{`${fmtNum(data[i].value * shown, decimals, locale)}${unit}`}</text>
            <text x={q[0]} y={h - 6} textAnchor="middle" fill={ink} fillOpacity={0.7} fontSize={22}>
              {data[i].label}
            </text>
          </g>
        );
      })}
      {callout && cq ? <Callout t={t} event={event} x={cq[0]} y={cq[1]} dy={up ? -Math.min(130, cq[1] - 20) : 110} start={up ? 56 : 26} text={callout.text} color={color} ink={ink} font={font} align={cq[0] > w * 0.6 ? "end" : "start"} /> : null}
    </svg>
  );
};

/** The closing lockup: the mark pops in, the name's letters cascade up beside it, then the line and the address in a pill. `logo` replaces the brand mark. */
export const LogoLockup = ({ t, at, name, line, url, size = 120, ink, accent, font, logo, style }: { t: number; at: number; name: string; line?: string; url?: string; size?: number; ink: string; accent: string; font: string; logo?: ReactNode; style?: CSSProperties }) => {
  const mark = backOut(clamp01((t - at) / 18));
  const settle = t > at + 36 ? 1 : mix(1.15, 1, prog(t, at + 27, at + 36, p3));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.28, fontFamily: font, color: ink, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: size * 0.22 }}>
        <div style={{ opacity: clamp01(mark * 2), transform: `scale(${(0.6 + 0.4 * mark) * (t > at + 18 ? settle : 1)})` }}>{logo ?? <Mark size={size} />}</div>
        <div style={{ display: "flex", fontSize: size * 0.72, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {[...name].map((ch, i) => {
            const p = prog(t, at + 8 + i * 1.6, at + 26 + i * 1.6, expoOut);
            return (
              <span key={i} style={{ display: "inline-block", whiteSpace: "pre", opacity: p, transform: `translateY(${(1 - p) * 0.5}em)` }}>
                {ch}
              </span>
            );
          })}
        </div>
      </div>
      {line ? <div style={{ fontSize: size * 0.26, opacity: prog(t, at + 60, at + 90, p3), transform: `translateY(${(1 - prog(t, at + 60, at + 90, p3)) * 20}px)` }}>{line}</div> : null}
      {url ? (
        <div style={{ fontSize: size * 0.2, fontWeight: 600, padding: `${size * 0.08}px ${size * 0.22}px`, borderRadius: 999, background: accent, color: "#fff", opacity: prog(t, at + 72, at + 99, p3), transform: `translateY(${(1 - prog(t, at + 72, at + 99, p3)) * 15}px)` }}>{url}</div>
      ) : null}
    </div>
  );
};

/** Words arriving one by one while the line stays centred: each new word pushes the ones before it left. Measured, so it fits the font. */
export const KineticCenter = ({ t, at, words, font, size, weight = 800, color, step = 9, gapEm = 0.28, style }: { t: number; at: number; words: string[]; font: string; size: number; weight?: number; color: string; step?: number; gapEm?: number; style?: CSSProperties }) => {
  const gap = gapEm * size;
  const widths = words.map((w) => textW(w, font, weight, size));
  const lineW = (k: number) => widths.slice(0, k + 1).reduce((a, b) => a + b, 0) + gap * k;
  const k = Math.max(0, Math.min(words.length - 1, Math.floor((t - at) / step)));
  const into = prog(t, at + k * step, at + k * step + step, expoOut);
  const shownW = k === 0 ? lineW(0) : mix(lineW(k - 1), lineW(k), into);
  // Each word starts where the ones before it end, the whole line centred on the width shown so far.
  const lefts = widths.map((_, i) => -shownW / 2 + widths.slice(0, i).reduce((a, b) => a + b, 0) + gap * i);
  return (
    <div style={{ position: "relative", height: size * 1.2, ...style }}>
      {words.map((w, i) => {
        const left = lefts[i];
        const p = prog(t, at + i * step, at + i * step + step, expoOut);
        return (
          <span key={i} style={{ position: "absolute", left: `calc(50% + ${left}px)`, top: 0, fontFamily: font, fontSize: size, fontWeight: weight, color, lineHeight: 1.2, whiteSpace: "pre", opacity: p, transform: `translateY(${(1 - p) * 0.3 * size}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** A command typed at a prompt, then its output lines appearing one by one: for CLIs, SDK calls and API requests. Put it inside <Window kind="terminal">. */
export const TerminalRun = ({ t, at, command, output, prompt = "$", cps = 1.2, lineStep = 6, font = "JetBrains Mono", size = 26, ink = "#E8E8EA", dim = "rgba(232,232,234,0.55)", accent = "#7CE38B" }: { t: number; at: number; command: string; output: string[]; prompt?: string; cps?: number; lineStep?: number; font?: string; size?: number; ink?: string; dim?: string; accent?: string }) => {
  const shown = typed(command, t, at, cps);
  const done = at + Math.ceil(command.length / cps) + 8;
  const caret = shown.length < command.length || t < done ? (Math.floor(t / 15) % 2 === 0 ? 1 : 0) : 0;
  return (
    <div style={{ fontFamily: font, fontSize: size, lineHeight: 1.55, color: ink, whiteSpace: "pre" }}>
      <div>
        <span style={{ color: accent }}>{prompt} </span>
        {shown}
        <span style={{ opacity: caret, background: ink, width: "0.55em", height: "1.05em", display: "inline-block", verticalAlign: "-0.15em", marginLeft: 2 }} />
      </div>
      {output.map((line, i) => {
        const p = prog(t, done + i * lineStep, done + i * lineStep + 8, p3);
        return (
          <div key={i} style={{ color: i === output.length - 1 ? ink : dim, opacity: p, transform: `translateY(${(1 - p) * 8}px)` }}>
            {line}
          </div>
        );
      })}
    </div>
  );
};

/**
 * A camera on a still layout: it eases between focus keys, each a frame and
 * the point to centre (x, y in px of the content) at a scale. For zooming
 * into a UI to the button that matters.
 */
export const FocusZoom = ({ t, keys, w, h, children, style }: { t: number; keys: [number, { x: number; y: number; scale: number }][]; w: number; h: number; children: ReactNode; style?: CSSProperties }) => {
  const ease = Easing.inOut(Easing.cubic);
  const x = kf(t, keys.map(([f, k]) => [f, k.x, ease]));
  const y = kf(t, keys.map(([f, k]) => [f, k.y, ease]));
  const s = kf(t, keys.map(([f, k]) => [f, k.scale, ease]));
  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transformOrigin: "0 0", transform: `translate(${w / 2 - x * s}px, ${h / 2 - y * s}px) scale(${s})` }}>{children}</div>
    </div>
  );
};

/** A cut that passes through white (or `color`): `a` washes out, `b` comes back from it. Over `dur` frames from `at`. */
export const FlashThrough = ({ t, at, dur = 36, a, b, color = "#FFFFFF" }: { t: number; at: number; dur?: number; a: ReactNode; b: ReactNode; color?: string }) => {
  const p = Easing.inOut(Easing.quad)(clamp01((t - at) / dur));
  const smooth = (e0: number, e1: number, x: number) => {
    const u = clamp01((x - e0) / (e1 - e0));
    return u * u * (3 - 2 * u);
  };
  const cross = smooth(0.35, 0.65, p);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {cross < 1 ? (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - cross }}>
          {a}
          <div style={{ position: "absolute", inset: 0, background: color, opacity: smooth(0, 0.45, p) }} />
        </div>
      ) : null}
      {cross > 0 ? (
        <div style={{ position: "absolute", inset: 0, opacity: cross }}>
          {b}
          <div style={{ position: "absolute", inset: 0, background: color, opacity: 1 - smooth(0.5, 1, p) }} />
        </div>
      ) : null}
    </div>
  );
};

/** `b` slides over `a` from a side, with a red/cyan split on its fastest frames. Over `dur` frames from `at`. */
export const ChromaWipe = ({ t, at, dur = 18, a, b, from = "right" }: { t: number; at: number; dur?: number; a: ReactNode; b: ReactNode; from?: "left" | "right" | "top" | "bottom" }) => {
  const p = Easing.inOut(Easing.cubic)(clamp01((t - at) / dur));
  const speed = Math.sin(p * Math.PI);
  const off = (1 - p) * 100;
  const move = from === "right" ? `translateX(${off}%)` : from === "left" ? `translateX(${-off}%)` : from === "bottom" ? `translateY(${off}%)` : `translateY(${-off}%)`;
  const split = 14 * speed;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0 }}>{a}</div>
      {p > 0 ? <div style={{ position: "absolute", inset: 0, transform: move, filter: split > 0.5 ? `drop-shadow(${split}px 0 0 rgba(255,0,64,0.55)) drop-shadow(${-split}px 0 0 rgba(0,220,255,0.55))` : undefined }}>{b}</div> : null}
    </div>
  );
};

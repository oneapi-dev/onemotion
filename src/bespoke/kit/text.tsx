// Text tools for bespoke scenes. Adapted from remotion-opus-skill's kit (MIT,
// (c) 2026 direkturcrypto). Big text is measured, never estimated: display
// faces run 30 to 40 % wider than a character-count guess.
import type { CSSProperties, ReactNode } from "react";
import { Easing } from "remotion";
import { clamp01, pop, prog, typed } from "./motion";

let ctx: CanvasRenderingContext2D | null = null;
const memo = new Map<string, number>();

/** The width in px of one line of text, measured with the loaded font. */
export const textW = (text: string, font: string, weight: number, size: number, trackEm = 0) => {
  const key = `${font}|${weight}|${size}|${trackEm}|${text}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * size * 0.6;
  ctx.font = `${weight} ${size}px "${font}"`;
  const w = ctx.measureText(text).width + trackEm * size * Math.max(0, [...text].length - 1);
  memo.set(key, w);
  return w;
};

/** The largest size, at most `max` px, at which one line of `text` fits in `maxW`. */
export const fit = (text: string, font: string, weight: number, max: number, maxW: number, trackEm = 0) => {
  const w = textW(text, font, weight, max, trackEm);
  if (w <= maxW) return max;
  return Math.max(max * 0.3, Math.floor(max * (maxW / w) * 0.98));
};

/**
 * One measured line, never wider than maxW. Children may replace the text (animated characters) at the same size.
 * A little padding, taken back by the margin, holds glyph overhangs and the last character's mask inside the box
 * when the line is sized to its content (a centred flex item), without moving it.
 */
export const Fit = ({ text, font, weight, size, maxW, track = 0, style, children }: { text: string; font: string; weight: number; size: number; maxW: number; track?: number; style?: CSSProperties; children?: ReactNode }) => {
  const s = fit(text, font, weight, size, maxW, track);
  return (
    <div data-fit="1" style={{ fontFamily: font, fontWeight: weight, fontSize: s, letterSpacing: `${track}em`, whiteSpace: "nowrap", lineHeight: 1.08, padding: "0 0.06em", margin: "0 -0.06em", ...style }}>
      {children ?? text}
    </div>
  );
};

type CharsMode = "rise" | "drop" | "fade" | "scale" | "slam";

/**
 * A per-character reveal from frame `at`: rise or drop (masked), fade, scale (pop), slam (big to size).
 * Characters are grouped by word, and the spaces between words stay plain text: a line breaks only
 * between words, and never starts with a space.
 */
export const Chars = ({ text, t, at, step = 2.2, mode = "rise", style }: { text: string; t: number; at: number; step?: number; mode?: CharsMode; style?: CSSProperties }) => {
  const parts = text.split(/(\s+)/);
  // Each part's first character's index in the whole text, so the timing runs on across words and spaces.
  const starts = parts.map((_, k) => parts.slice(0, k).reduce((n, p) => n + [...p].length, 0));
  return (
    <>
      {parts.map((part, k) =>
        !part ? null : /^\s+$/.test(part) ? (
          part
        ) : (
          <span key={k} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
            {[...part].map((ch, j) => charOf(ch, starts[k] + j, t, at, step, mode, style))}
          </span>
        ),
      )}
    </>
  );
};

/** One character of Chars, the i-th of its text, revealed from at + i * step. */
const charOf = (ch: string, i: number, t: number, at: number, step: number, mode: CharsMode, style?: CSSProperties) => {
  const a = at + i * step;
  const p = prog(t, a, a + 16);
  let inner: CSSProperties = {};
  if (mode === "rise") inner = { transform: `translateY(${((1 - p) * 110).toFixed(1)}%) rotate(${((1 - p) * 6).toFixed(1)}deg)` };
  if (mode === "drop") inner = { transform: `translateY(${((p - 1) * 110).toFixed(1)}%)` };
  if (mode === "fade") inner = { opacity: p, transform: `translateY(${((1 - p) * 0.25).toFixed(3)}em)` };
  if (mode === "scale") inner = { transform: `scale(${pop(t, a, 3.5).toFixed(3)})`, opacity: t >= a ? 1 : 0 };
  if (mode === "slam") inner = { transform: `scale(${(t < a ? 2.2 : 1 + 1.2 * Math.exp(-(t - a) / 3)).toFixed(3)})`, opacity: prog(t, a - 2, a + 2) };
  const clip = mode === "rise" || mode === "drop";
  return (
    // The mask is padded so glyph tips and descenders are never shaved.
    <span key={i} style={{ display: "inline-block", overflow: clip ? "hidden" : "visible", verticalAlign: "bottom", padding: clip ? "0 0.04em 0.14em" : 0, margin: clip ? "0 -0.04em -0.14em" : 0 }}>
      <span style={{ display: "inline-block", whiteSpace: "pre", ...inner, ...style }}>{ch}</span>
    </span>
  );
};

export const Caret = ({ t, h, color }: { t: number; h: number; color: string }) => (
  <span style={{ display: "inline-block", width: Math.max(2, Math.round(h * 0.09)), height: h, background: color, marginLeft: 3, verticalAlign: "middle", opacity: Math.sin(t / 4.5) > -0.2 ? 1 : 0 }} />
);

/** Text typed from frame `at`, `cps` characters per frame, with a caret while typing. */
export const Typewriter = ({ text, t, at, cps = 1.2, caret, caretH = 30, style }: { text: string; t: number; at: number; cps?: number; caret?: string; caretH?: number; style?: CSSProperties }) => {
  const s = typed(text, t, at, cps);
  const typing = t < at + text.length / cps + 30;
  return (
    <span style={{ whiteSpace: "pre-wrap", ...style }}>
      {s}
      {caret && typing ? <Caret t={t} h={caretH} color={caret} /> : null}
    </span>
  );
};

/** Slot-machine digits that roll down and land, right to left, from `at`. Other characters stand still. */
export const Odometer = ({ text, t, at, color, style }: { text: string; t: number; at: number; color?: string; style?: CSSProperties }) => {
  const chars = [...text];
  const digits = chars.filter((c) => /\d/.test(c)).length;
  let di = 0;
  return (
    <span style={{ display: "inline-flex", color, lineHeight: 1.1, letterSpacing: 0, ...style }}>
      {chars.map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i} style={{ whiteSpace: "pre" }}>{ch}</span>;
        const k = digits - 1 - di++;
        const end = 20 + Number(ch);
        const start = end - 10 - k * 3;
        const p = prog(t, at + k * 2.5, at + 22 + k * 2.5, Easing.bezier(0.2, 0.7, 0.2, 1));
        const pos = t < at ? start : start + (end - start) * p;
        return (
          <span key={i} style={{ display: "inline-block", height: "1.1em", overflow: "hidden", position: "relative", padding: "0 0.06em", margin: "0 -0.06em" }}>
            <span style={{ visibility: "hidden" }}>0</span>
            <span style={{ position: "absolute", left: "0.06em", top: 0, display: "flex", flexDirection: "column", transform: `translateY(${(-pos * 1.1).toFixed(3)}em)` }}>
              {Array.from({ length: 30 }, (_, j) => (
                <span key={j} style={{ height: "1.1em" }}>
                  {j % 10}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
};

/** A number counting from `from` to `to` between frames start and end. */
export const CountUp = ({ t, from = 0, to, start, end, locale = "en-US", decimals = 0, prefix = "", suffix = "", style }: { t: number; from?: number; to: number; start: number; end: number; locale?: string; decimals?: number; prefix?: string; suffix?: string; style?: CSSProperties }) => {
  const v = from + (to - from) * prog(t, start, end, Easing.bezier(0.3, 0, 0.2, 1));
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{`${prefix}${v.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`}</span>;
};

/** A marker swipe behind its children, drawn from `at`. */
export const Highlight = ({ t, at, color, children, height = "0.42em" }: { t: number; at: number; color: string; children: ReactNode; height?: string }) => (
  <span style={{ position: "relative", display: "inline-block" }}>
    <span style={{ position: "absolute", left: "-0.08em", right: "-0.08em", bottom: "0.08em", height, background: color, transform: `scaleX(${clamp01(prog(t, at, at + 12)).toFixed(3)}) skewX(-8deg)`, transformOrigin: "left center" }} />
    <span style={{ position: "relative" }}>{children}</span>
  </span>
);

/** A line struck through its children from `at`. */
export const Strike = ({ t, at, color, thickness = 6, children }: { t: number; at: number; color: string; thickness?: number; children: ReactNode }) => (
  <span style={{ position: "relative", display: "inline-block" }}>
    {children}
    <span style={{ position: "absolute", left: -6, right: -6, top: "52%", height: thickness, borderRadius: thickness, background: color, transform: `scaleX(${prog(t, at - 2, at + 8).toFixed(3)}) rotate(-3deg)`, transformOrigin: "left center" }} />
  </span>
);

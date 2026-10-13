import type { CSSProperties } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { noise, useFx } from "./fx";
import { AccentMark } from "./fxMark";
import { useLook } from "./looks";
import { clamp } from "./motion";
import type { TextFx } from "./plan";

/**
 * Headline entrances that work letter by letter: scramble, typewriter, wave,
 * scatter and rolling. Every letter keeps its place in the line from the
 * first frame (hidden letters are transparent, not absent), so the headline
 * wraps and sizes exactly as the plain reveal does.
 */

export type CharTextProps = {
  kind: Exclude<TextFx, "reveal">;
  text: string;
  size: number;
  at: number;
  align?: "left" | "center";
  maxWidth?: number;
  weight?: number;
  color?: string;
  accentLast?: boolean;
  lineHeight?: number;
  family?: string;
};

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/";

/** Frame each letter of a typed line appears on: a natural rhythm, pausing after spaces and punctuation, done within about 1.4 s. */
function typedAt(chars: string[]): number[] {
  const raw: number[] = [];
  let t = 0;
  chars.forEach((c, i) => {
    raw.push(t);
    t += 1.2 + noise(i, 7) * 1.2 + (c === " " ? 1.5 : /[.,!?]/.test(c) ? 4 : 0);
  });
  const k = Math.min(1, 42 / Math.max(1, t));
  return raw.map((x) => x * k);
}

export const CharText: React.FC<CharTextProps> = ({ kind, text, size, at, align = "center", maxWidth, weight, color, accentLast = true, lineHeight = 1.02, family }) => {
  const look = useLook();
  const { mark } = useFx();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - at;
  const words = text.split(/\s+/).filter(Boolean);
  const chars = words.join(" ").split("");
  const typed = kind === "typewriter" ? typedAt(chars) : [];
  let lastTyped = typed.reduce((last, t, i) => (f >= t ? i : last), -1);
  // Spaces are not drawn: the caret waits on the letter before one.
  if (chars[lastTyped] === " ") lastTyped -= 1;
  // Index of each word's first letter in `chars` (words are joined by single spaces).
  const starts = words.map((_, wi) => words.slice(0, wi).reduce((n, w) => n + w.length + 1, 0));

  const letter = (c: string, i: number, accent: boolean) => {
    const base: CSSProperties = { display: "inline-block", position: "relative", whiteSpace: "pre" };
    switch (kind) {
      case "scramble": {
        const appear = i * 0.6;
        const settle = 6 + i * 1.15;
        const shown = f >= appear;
        const done = f >= settle;
        const glyph = GLYPHS[Math.floor(noise(i, Math.floor(f / 2)) * GLYPHS.length)];
        return (
          <span style={base}>
            <span style={{ opacity: done ? 1 : 0 }}>{c}</span>
            {shown && !done ? (
              <span style={{ position: "absolute", left: 0, top: 0, color: look.accentA, opacity: 0.9 }}>{c === c.toLowerCase() ? glyph.toLowerCase() : glyph}</span>
            ) : null}
          </span>
        );
      }
      case "typewriter": {
        const shown = f >= typed[i];
        const caretHere = i === lastTyped && (lastTyped < chars.length - 1 || Math.floor((f - typed[i]) / 8) % 2 === 0);
        return (
          <span style={base}>
            <span style={{ opacity: shown ? 1 : 0 }}>{c}</span>
            {caretHere ? (
              <span style={{ position: "absolute", left: "100%", top: "8%", width: "0.07em", height: "0.86em", marginLeft: "0.04em", background: look.accentA, borderRadius: "0.02em" }} />
            ) : null}
          </span>
        );
      }
      case "wave": {
        const p = spring({ frame: f - i * 1.2, fps, config: { damping: 11, stiffness: 140, mass: 0.6 } });
        const idle = Math.sin((frame - i * 3) / 9) * 0.035 * Math.min(1, p);
        return (
          <span style={{ ...base, opacity: Math.min(1, p * 1.8), transform: `translateY(${(1 - p) * 0.7 + idle}em)` }}>
            {c}
          </span>
        );
      }
      case "scatter": {
        const p = spring({ frame: f - i * 0.8, fps, config: { damping: 15, stiffness: 120, mass: 0.7 } });
        const dx = (noise(i, 1) * 2 - 1) * 1.6;
        const dy = (noise(i, 2) * 2 - 1) * 1.2;
        const rot = (noise(i, 3) * 2 - 1) * 70;
        return (
          <span style={{ ...base, opacity: Math.min(1, p * 2), transform: `translate(${(1 - p) * dx}em, ${(1 - p) * dy}em) rotate(${(1 - p) * rot}deg)` }}>
            {c}
          </span>
        );
      }
      case "rolling": {
        const p = spring({ frame: f - i * 1, fps, config: { damping: 12, stiffness: 170, mass: 0.6 } });
        return (
          <span style={{ ...base, overflow: "hidden", padding: "0 0.12em 0.12em", margin: "0 -0.12em -0.12em", verticalAlign: "top" }}>
            <span style={{ display: "inline-block", transform: `translateY(${interpolate(p, [0, 1], [115, 0], clamp)}%)`, color: accent ? look.accentA : undefined }}>{c}</span>
          </span>
        );
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: size * 0.24,
        maxWidth,
        fontFamily: family ?? look.display,
        fontWeight: weight ?? look.weight,
        fontSize: size,
        lineHeight,
        letterSpacing: `${look.tracking}em`,
        color: color ?? look.text,
        textAlign: align,
      }}
    >
      {words.map((w, wi) => {
        const accent = accentLast && wi === words.length - 1 && words.length > 1;
        const start = starts[wi];
        return (
          <span key={wi} style={{ display: "inline-block", whiteSpace: "nowrap", color: accent ? look.accentA : undefined, position: accent && mark ? "relative" : undefined }}>
            {w.split("").map((c, ci) => (
              <span key={ci}>{letter(c, start + ci, accent)}</span>
            ))}
            {/* The mark draws on once the word's letters have arrived. */}
            {accent && mark ? <AccentMark at={at + Math.round((start + w.length) * 1.2) + 12} size={size} chars={w.length} /> : null}
          </span>
        );
      })}
    </div>
  );
};

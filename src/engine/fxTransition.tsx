import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { noise } from "./fx";
import type { Look } from "./looks";
import type { Plan, TransitionFx } from "./plan";
import type { Timing } from "./rig";

/**
 * Full-screen transitions on the scenes that ask for one: the screen closes
 * over the end of the camera's move and opens on the new card as it lands,
 * so the whip reads as a cut. Built only from what the browser exporter
 * draws: solid boxes, borders, rounded corners and transforms (no masks,
 * clip paths or radial gradients).
 */

const CLOSE = 9;
const OPEN = 12;
/** Frames the screen stays fully shut on either side of the landing: long enough to read as a cut. */
const HOLD = 1;
const easeIn = Easing.bezier(0.55, 0, 0.85, 0.35);
const easeOut = Easing.bezier(0.15, 0.65, 0.45, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 → 1 as the screen closes before the landing, then 1 → 0 as it opens after. */
function coverAt(frame: number, land: number): { cover: number; opening: boolean } | null {
  const shut = land - HOLD;
  const open = land + HOLD;
  if (frame < shut - CLOSE || frame > open + OPEN) return null;
  if (frame < shut) return { cover: easeIn(interpolate(frame, [shut - CLOSE, shut], [0, 1], clamp)), opening: false };
  if (frame <= open) return { cover: 1, opening: frame >= land };
  return { cover: 1 - easeOut(interpolate(frame, [open, open + OPEN], [0, 1], clamp)), opening: true };
}

const Shape: React.FC<{ kind: TransitionFx; cover: number; opening: boolean; look: Look; seed: number }> = ({ kind, cover, opening, look, seed }) => {
  const { width: W, height: H } = look;
  const ink = look.mode === "dark" ? "#0a0b0d" : "#151515";
  const accent = look.accentA;
  switch (kind) {
    case "wipe": {
      // Sweeps in from the left and on out to the right.
      const x = opening ? (1 - cover) * 100 : (cover - 1) * 100;
      return <AbsoluteFill style={{ background: accent, transform: `translateX(${x}%)` }} />;
    }
    case "iris": {
      // The screen with a round hole that shrinks to nothing and grows back:
      // an SVG path whose even-odd fill leaves the circle empty.
      // The hole shrinks fast at first so the ring is seen closing, not only at the end.
      const r = (Math.hypot(W, H) / 2 + 4) * (1 - cover) ** 1.8;
      const cx = W / 2;
      const cy = H / 2;
      const hole = r > 0.5 ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z` : "";
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          <path d={`M 0 0 H ${W} V ${H} H 0 Z ${hole}`} fill={ink} fillRule="evenodd" />
        </svg>
      );
    }
    case "blinds": {
      const n = 8;
      return (
        <>
          {Array.from({ length: n }, (_, i) => {
            // Each slat starts a little after the one above and is shut by the time cover reaches 1.
            const lag = (i / n) * 0.35;
            const v = Math.min(1, Math.max(0, (cover - lag) / 0.65));
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  width: W,
                  top: (H / n) * i - 1,
                  height: H / n + 2,
                  background: i % 2 ? ink : accent,
                  transformOrigin: opening ? "50% 100%" : "50% 0%",
                  transform: `scaleY(${v})`,
                }}
              />
            );
          })}
        </>
      );
    }
    case "pixels": {
      const cols = look.layout === "tall" ? 9 : look.layout === "square" ? 12 : 16;
      const rows = look.layout === "tall" ? 16 : look.layout === "square" ? 12 : 9;
      const cw = W / cols;
      const ch = H / rows;
      const cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const k = r * cols + c;
          if (cover <= noise(seed + k, opening ? 2 : 1) * 0.95) continue;
          cells.push(<div key={k} style={{ position: "absolute", left: c * cw - 0.5, top: r * ch - 0.5, width: cw + 1, height: ch + 1, background: (r + c) % 5 === 0 ? accent : ink }} />);
        }
      }
      return <>{cells}</>;
    }
    case "shutter": {
      const y = (1 - cover) * 100;
      return (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H / 2 + 1, background: ink, transform: `translateY(${-y}%)` }} />
          <div style={{ position: "absolute", left: 0, top: H / 2, width: W, height: H / 2, background: ink, transform: `translateY(${y}%)` }} />
          <div style={{ position: "absolute", left: 0, top: H / 2 - 2, width: W, height: 4, background: accent, opacity: cover, transform: `scaleX(${cover})` }} />
        </>
      );
    }
    case "flash": {
      // A hit of light on the landing: a short rise, a longer fall.
      const level = opening ? cover : cover > 0.66 ? (cover - 0.66) / 0.34 : 0;
      return <AbsoluteFill style={{ background: look.mode === "dark" ? "#ffffff" : accent, opacity: 0.85 * level }} />;
    }
  }
};

export const Transitions: React.FC<{ plan: Plan; timing: Timing; look: Look }> = ({ plan, timing, look }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {plan.scenes.map((s, i) => {
        const kind = s.fx?.transition;
        if (!kind || i === 0) return null;
        const at = coverAt(frame, timing.starts[i]);
        if (!at) return null;
        return (
          <AbsoluteFill key={i} style={{ pointerEvents: "none", overflow: "hidden" }}>
            <Shape kind={kind} cover={at.cover} opening={at.opening} look={look} seed={i * 997} />
          </AbsoluteFill>
        );
      })}
    </>
  );
};

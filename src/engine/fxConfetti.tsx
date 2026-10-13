import { AbsoluteFill, useCurrentFrame } from "remotion";
import { noise } from "./fx";
import type { Look } from "./looks";
import type { Plan } from "./plan";
import type { Timing } from "./rig";

/**
 * A confetti burst from two cannons at the bottom corners as a card lands,
 * on the one scene that asks for it. Each piece flies on a fixed ballistic
 * path (launch speed and angle from a seed, air drag, gravity) and flutters
 * by flipping on its long axis, so every render shows the same burst.
 */

const PIECES = 90;
const SECONDS = 2.6;
const DRAG = 1.6;
const GRAVITY = 1900;

export const Confetti: React.FC<{ plan: Plan; timing: Timing; look: Look }> = ({ plan, timing, look }) => {
  const frame = useCurrentFrame();
  const i = plan.scenes.findIndex((s) => s.fx?.confetti);
  if (i < 0) return null;
  const start = timing.starts[i] + 4;
  const t = (frame - start) / 30;
  if (t < 0 || t > SECONDS) return null;
  const { width: W, height: H, u } = look;
  const colors = [look.accentA, look.text, look.mode === "dark" ? "#ffffff" : "#1b1b1b", look.accentA];
  const k = (1 - Math.exp(-DRAG * t)) / DRAG;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      {Array.from({ length: PIECES }, (_, n) => {
        const left = n % 2 === 0;
        const r = (j: number) => noise(n, j);
        const angle = ((left ? -62 : -118) + (r(1) * 2 - 1) * 16) * (Math.PI / 180);
        const speed = (1500 + r(2) * 1100) * u;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const x = (left ? 0.04 : 0.96) * W + vx * k;
        // Linear drag with gravity pulling down (+y on screen): y = y0 + g/D·t + (vy − g/D)·(1 − e^(−Dt))/D.
        const y = H + 20 * u + (vy - (GRAVITY * u) / DRAG) * k + ((GRAVITY * u) / DRAG) * t;
        const spin = r(3) * 720 - 360;
        const flip = Math.cos(t * (6 + r(4) * 8) + r(5) * 6);
        const w = (10 + r(6) * 10) * u;
        const h = w * (0.45 + r(7) * 0.3);
        const fade = Math.min(1, (SECONDS - t) / 0.6);
        return (
          <div
            key={n}
            style={{
              position: "absolute",
              left: x - w / 2,
              top: y - h / 2,
              width: w,
              height: h,
              borderRadius: r(8) < 0.25 ? "50%" : 2 * u,
              background: colors[Math.floor(r(9) * colors.length)],
              opacity: fade,
              transform: `rotate(${spin * t}deg) scaleY(${flip})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

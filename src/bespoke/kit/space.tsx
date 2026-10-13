// Optional 2.5D tools: a camera you keyframe, DOM billboards projected with
// perspective and lens depth of field, particles with speed streaks and a
// perspective floor (both on canvas). Use them, extend them or ignore them.
// Adapted from remotion-opus-skill's kit (MIT, (c) 2026 direkturcrypto).
import type { ReactNode } from "react";
import { Draw } from "./draw";
import { useFilm } from "./film";
import { clamp01, inOut, kf, lin, prog, seeded, type KP } from "./motion";

export type Vec3 = { x: number; y: number; z: number };
/** A camera position and roll (degrees). */
export type Cam3 = Vec3 & { r: number };
export type CamKey = [number, Cam3, ((x: number) => number)?];

/** The camera at frame t from keys [frame, camera, ease?]; a key's ease shapes the move that ends on it. */
export const camAt = (keys: CamKey[], t: number): Cam3 => {
  const pick = (fn: (c: Cam3) => number) => kf(t, keys.map(([f, c, e]) => [f, fn(c), e] as KP));
  return { x: pick((c) => c.x), y: pick((c) => c.y), z: pick((c) => c.z), r: pick((c) => c.r) };
};

/** Where a world point lands on screen and its scale. F is the focal length: a card at distance F renders at its own size. */
export const project3D = (p: Vec3, cam: Cam3, W: number, cy: number, F = 1200) => {
  const d = p.z - cam.z;
  const s = F / Math.max(1, d);
  return { x: W / 2 + (p.x - cam.x) * s, y: cy + (p.y - cam.y) * s, s, d };
};

/**
 * A DOM element standing in 3D at `p` (its centre), w by h at native size.
 * `focusZ` is the depth in focus (lens blur grows away from it); `unfocus`
 * 0..1 dims and blurs it when it is not what the beat is about. Elements
 * paint in JSX order: render far billboards first.
 */
export const Billboard3D = ({ cam, p, w, h, F = 1200, focusZ, unfocus = 0, children }: { cam: Cam3; p: Vec3; w: number; h: number; F?: number; focusZ?: number; unfocus?: number; children: ReactNode }) => {
  const { W, H } = useFilm();
  const { x, y, s, d } = project3D(p, cam, W, H / 2, F);
  if (d < 60) return null;
  if (x + (w * s) / 2 < -300 || x - (w * s) / 2 > W + 300 || y + (h * s) / 2 < -300 || y - (h * s) / 2 > H + 300) return null;
  const fd = focusZ !== undefined ? Math.max(200, focusZ - cam.z) : d;
  const blur = Math.min(14, Math.abs(1 / d - 1 / fd) * F * 9 + unfocus * 5);
  const op = prog(d, 90, 420, lin) * (1 - unfocus * 0.4);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: w,
        height: h,
        transform: `translate(${(x - w / 2).toFixed(2)}px, ${(y - h / 2).toFixed(2)}px) scale(${s.toFixed(5)})`,
        transformOrigin: "50% 50%",
        opacity: op,
        // Always set, so it never toggles between frames.
        filter: `blur(${(blur / s).toFixed(2)}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** Drifting particles in 3D, drawn as streaks while the camera moves (pass the camera of the frame before as `prev`). */
export const Particles3D = ({ cam, prev, F = 1200, n = 140, color = "#111", hot = "#FF4A1C", seed = 1, spread = 1 }: { cam: Cam3; prev: Cam3; F?: number; n?: number; color?: string; hot?: string; seed?: number; spread?: number }) => {
  const { W, H } = useFilm();
  return (
    <Draw
      draw={(ctx) => {
        ctx.lineCap = "round";
        for (let i = 0; i < n; i++) {
          const p = { x: (seeded(i * 3.1 + seed) - 0.5) * 5600 * spread, y: (seeded(i * 5.7 + seed * 2) - 0.5) * 3600 * spread, z: -2600 + seeded(i * 7.3 + seed * 3) * 14000 };
          const a = project3D(p, cam, W, H / 2, F);
          if (a.d < 80 || a.d > 9000 || a.x < -200 || a.x > W + 200 || a.y < -200 || a.y > H + 200) continue;
          const b = project3D(p, prev, W, H / 2, F);
          const isHot = seeded(i * 2.3 + seed) > 0.72;
          const r = Math.max(1.2, (3 + seeded(i * 1.9 + seed) * 6) * a.s);
          ctx.globalAlpha = (isHot ? 0.55 : 0.2) * prog(a.d, 80, 400, lin) * (1 - prog(a.d, 6500, 9000, lin));
          ctx.strokeStyle = ctx.fillStyle = isHot ? hot : color;
          if (Math.hypot(a.x - b.x, a.y - b.y) > 3) {
            ctx.lineWidth = r * 2;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(a.x, a.y);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }}
    />
  );
};

/** A perspective grid floor at world height y, fading into the horizon. */
export const Floor3D = ({ cam, F = 1200, y = 820, color = "#111", alpha = 0.14, step = 260 }: { cam: Cam3; F?: number; y?: number; color?: string; alpha?: number; step?: number }) => {
  const { W, H } = useFilm();
  return (
    <Draw
      draw={(ctx) => {
        const cy = H / 2;
        const zn = cam.z + 160;
        const zf = cam.z + 9000;
        const pr = (x: number, z: number) => project3D({ x, y, z }, cam, W, cy, F);
        const g = ctx.createLinearGradient(0, cy, 0, H);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, color);
        ctx.strokeStyle = g;
        ctx.globalAlpha = clamp01(alpha);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const x0 = Math.round(cam.x / step) * step;
        for (let k = -16; k <= 16; k++) {
          const a = pr(x0 + k * step, zn);
          const b = pr(x0 + k * step, zf);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        for (let z = Math.ceil(zn / 420) * 420; z < zf; z += 420) {
          const a = pr(cam.x - 5000, z);
          const b = pr(cam.x + 5000, z);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }}
    />
  );
};

/** A smooth 0..1 weight for "this is what the voice is talking about" between frames a and b. */
export const focusWeight = (t: number, a: number, b: number, ramp = 8) => clamp01(inOut(clamp01((t - (a - ramp)) / (2 * ramp))) * (1 - inOut(clamp01((t - (b - ramp)) / (2 * ramp)))));

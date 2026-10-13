// Effects for bespoke scenes. Hits ease in and out over several frames: a
// one-frame step reads as a glitch. Adapted from remotion-opus-skill's kit
// (MIT, (c) 2026 direkturcrypto), drawn on canvas for the browser exporter.
import { useMemo } from "react";
import { Easing, Img } from "remotion";
import { Draw } from "./draw";
import { useFilm } from "./film";
import { hitEnv, lin, prog, seeded } from "./motion";

export type Hit = { at: number; kind: "shake" | "punch" | "flash"; amp?: number };

/** The camera's reaction to a list of hits at frame t: a shake offset, a zoom punch and a flash level. Apply x, y and scale to your world. */
export const useHits = (hits: Hit[], t: number) => {
  let x = 0;
  let y = 0;
  let punch = 0;
  let flash = 0;
  for (const h of hits) {
    if (h.kind === "shake" && t >= h.at && t <= h.at + 18) {
      const d = Math.exp(-(t - h.at) / 4.5) * (h.amp ?? 10);
      x += Math.sin((t - h.at) * 2.3) * d;
      y += Math.cos((t - h.at) * 1.9) * d;
    }
    if (h.kind === "punch") punch += (h.amp ?? 0.022) * hitEnv(t, h.at);
    if (h.kind === "flash" && t >= h.at - 2 && t < h.at + 10) flash += (h.amp ?? 0.16) * (t < h.at ? (t - h.at + 2) / 2 : 1 - (t - h.at) / 10);
  }
  return { x, y, scale: 1 + punch, flash };
};

/** Static print grain over the frame: an image made once, so it costs nothing per frame. */
export const Grain = ({ opacity = 0.06, dark = false }: { opacity?: number; dark?: boolean }) => {
  const { W, H } = useFilm();
  const src = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d");
    if (!g) return "";
    const img = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = Math.round(seeded(i * 0.37) * 255);
      img.data.set([v, v, v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }, []);
  if (!src) return null;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "hidden", opacity: dark ? opacity * 0.7 : opacity, pointerEvents: "none" }}>
      {Array.from({ length: Math.ceil(H / 256) }, (_, r) =>
        Array.from({ length: Math.ceil(W / 256) }, (_, c) => <Img key={`${r}-${c}`} src={src} style={{ position: "absolute", left: c * 256, top: r * 256, width: 256, height: 256 }} />),
      )}
    </div>
  );
};

/** A burst of strokes and a ring at (x, y) from frame `at`: an impact, a connection, a click landing. */
export const Burst = ({ at, x, y, color, n = 12, size = 160 }: { at: number; x: number; y: number; color: string; n?: number; size?: number }) => (
  <Draw
    draw={(ctx, t) => {
      if (t < at || t > at + 20) return;
      const p = prog(t, at, at + 18);
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = 10 * (1 - p) + 1;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + 0.3;
        const r0 = size * (0.2 + 0.4 * p);
        const r1 = r0 + size * (0.4 + 0.6 * p);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.lineWidth = 12 * (1 - p);
      ctx.beginPath();
      ctx.arc(x, y, size * (0.2 + p), 0, Math.PI * 2);
      ctx.stroke();
    }}
  />
);

/** Confetti falling from the top from frame `at`. Only when there is something to celebrate. */
export const Confetti = ({ at, colors, n = 90, seed = 3 }: { at: number; colors: string[]; n?: number; seed?: number }) => {
  const { W, H } = useFilm();
  return (
    <Draw
      draw={(ctx, t) => {
        if (t < at) return;
        const dt = t - at;
        for (let i = 0; i < n; i++) {
          const vy = 6 + seeded(i * 2.9 + seed) * 10;
          const y = -40 + vy * dt + 0.08 * dt * dt * seeded(i * 4.1 + seed);
          if (y > H + 40) continue;
          const x = seeded(i * 1.7 + seed) * W + Math.sin(dt / (8 + seeded(i * 3.3) * 10) + i) * 40;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((dt * (6 + seeded(i * 5.1) * 12) * Math.PI) / 180);
          ctx.fillStyle = colors[i % colors.length];
          ctx.fillRect(-7, -4, 14, 8);
          ctx.restore();
        }
      }}
    />
  );
};

/** A tapered lash from a to b that cracks at frame `at`, with a motion trail: a whip-pan accent or a fast connection. */
export const Whip = ({ at, a, b, color, width = 46 }: { at: number; a: [number, number]; b: [number, number]; color: string; width?: number }) => (
  <Draw
    draw={(ctx, t) => {
      if (t < at - 10 || t > at + 20) return;
      const shape = (tt: number) => {
        const reveal = prog(tt, at - 10, at + 2, Easing.bezier(0.6, 0, 0.9, 0.6));
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L;
        const ny = dx / L;
        const amp = 150 * (1 - 0.6 * prog(tt, at, at + 16));
        const left: [number, number][] = [];
        const right: [number, number][] = [];
        for (let i = 0; i <= 60; i++) {
          const u = (i / 60) * reveal;
          const wave = Math.sin(u * Math.PI * 2.1 - (tt - at + 10) * 0.5) * amp * Math.sin(u * Math.PI);
          const x = a[0] + dx * u + nx * wave;
          const y = a[1] + dy * u + ny * wave;
          const wd = width * (1 - u) ** 1.4 + 5;
          left.push([x + nx * wd * 0.5, y + ny * wd * 0.5]);
          right.unshift([x - nx * wd * 0.5, y - ny * wd * 0.5]);
        }
        ctx.beginPath();
        [...left, ...right].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
      };
      const fade = 1 - prog(t, at + 6, at + 18, lin);
      ctx.fillStyle = color;
      if (t - 3 >= at - 10) {
        ctx.globalAlpha = 0.25 * fade;
        shape(t - 3);
      }
      ctx.globalAlpha = fade;
      shape(t);
    }}
  />
);

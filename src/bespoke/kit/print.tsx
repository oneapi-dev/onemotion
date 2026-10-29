import type { CSSProperties, ReactNode } from "react";
import { Draw } from "./draw";
import { useFilm } from "./film";
import { clamp01, mix, outE, prog, seeded } from "./motion";

/**
 * Printed looks: risograph and paper documentary. Everything steps "on twos"
 * (each pose held two frames) the way hand-made print animation does.
 * Recipes after makevoid's p5 riso/paper/type libraries and charlie947's
 * vox-explainer, rebuilt as pure functions of the frame.
 */

/** The frame held for two: every animated value of a printed look reads `onTwos(t)`, never `t`. */
export const onTwos = (t: number) => Math.floor(t / 2) * 2;

/** A sticker slapping on at `at`: scale 1.18 to 1 with one small settle over 7 frames, and its turn easing out. */
export const slap = (t: number, at: number, turn = 0.08) => {
  const p = prog(t, at, at + 7, outE);
  const over = t >= at ? Math.sin(clamp01((t - at) / 7) * Math.PI) * 0.03 : 0;
  return { opacity: t >= at ? 1 : 0, transform: `scale(${(mix(1.18, 1, p) - over).toFixed(4)}) rotate(${(turn * (1 - p) * 57.3).toFixed(2)}deg)` } as CSSProperties;
};

const hex = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Risograph inks: where two spot inks overlap they multiply, so the third colour is their product. */
export const riso = {
  overlap: (a: string, b: string) => {
    const x = hex(a);
    const y = hex(b);
    return `#${x.map((v, i) => Math.round((v * y[i]) / 255).toString(16).padStart(2, "0")).join("")}`;
  },
};

/** Knocked-out type: a paper-coloured outline about a tenth of the size drawn under the fill, as a printer's knockout leaves. */
export const knockout = (size: number, paper: string): CSSProperties => ({ WebkitTextStroke: `${(size * 0.1).toFixed(1)}px ${paper}`, paintOrder: "stroke fill" });

/**
 * Its content printed twice: the second ink a few pixels off-register at 55 % behind the first. Pass a
 * function of the ink, `(ink) => …`, called once with `ghost` (the other spot ink) for the second print and
 * once with undefined for the first, so each print can colour itself. Plain layers, no blend mode.
 */
export const Misprint = ({ children, ghost, dx = 4, dy = 3, style }: { children: ReactNode | ((ink: string | undefined) => ReactNode); ghost: string; dx?: number; dy?: number; style?: CSSProperties }) => {
  const draw = (ink: string | undefined) => (typeof children === "function" ? children(ink) : children);
  return (
    <div style={{ position: "relative", ...style }}>
      <div aria-hidden data-qa="echo" style={{ position: "absolute", inset: 0, transform: `translate(${dx}px, ${dy}px)`, color: ghost, opacity: 0.55 }}>
        {draw(ghost)}
      </div>
      <div style={{ position: "relative" }}>{draw(undefined)}</div>
    </div>
  );
};

/** Riso paper: a warm stock with ink speckle, re-seeded every two frames so it lives without crawling. Put it first, under everything. */
export const RisoPaper = ({ t, paper = "#F1EAD9", ink = "#2B3A7A", amount = 0.18 }: { t: number; paper?: string; ink?: string; amount?: number }) => {
  const { W, H } = useFilm();
  const frame = onTwos(t);
  const [r, g, b] = hex(ink);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: paper }} />
      <Draw
        width={W}
        height={H}
        style={{ position: "absolute", inset: 0 }}
        draw={(ctx) => {
          const cell = 6;
          for (let y = 0; y < H; y += cell)
            for (let x = 0; x < W; x += cell) {
              const n = seeded(x * 0.37 + y * 1.91 + frame * 7.3);
              if (n > 0.86) {
                ctx.fillStyle = `rgba(${r},${g},${b},${((n - 0.86) / 0.14) * amount})`;
                ctx.fillRect(x, y, 2, 2);
              }
            }
        }}
      />
    </>
  );
};

/** A printed halftone: dots of `color` on a `size` grid at `opacity`. Under a beat's subject, never over the words. */
export const Halftone = ({ color = "#14213D", size = 9, dot = 1.6, opacity = 0.12, style }: { color?: string; size?: number; dot?: number; opacity?: number; style?: CSSProperties }) => (
  <div style={{ position: "absolute", inset: 0, opacity, backgroundImage: `radial-gradient(${color} ${dot}px, transparent ${dot + 0.6}px)`, backgroundSize: `${size}px ${size}px`, pointerEvents: "none", ...style }} />
);

/** @internal A torn edge as a polygon, seeded: ragged by `amp` px every `step` px along the top and bottom. */
export function tornPolygon(w: number, h: number, seed: number, amp = 7, step = 9): string {
  const top: string[] = [];
  const bottom: string[] = [];
  for (let x = 0; x <= w; x += step) {
    top.push(`${x}px ${(seeded(seed + x * 0.13) * amp).toFixed(1)}px`);
    bottom.push(`${w - x}px ${(h - seeded(seed + 97 + x * 0.17) * amp).toFixed(1)}px`);
  }
  return `polygon(${[...top, ...bottom].join(", ")})`;
}

/** A torn paper strip for a caption: seeded ragged top and bottom, a small soft shadow, its words on it. Width and height in px. */
export const TornStrip = ({ w, h, seed = 1, paper = "#FBF7EE", shadow = true, children, style }: { w: number; h: number; seed?: number; paper?: string; shadow?: boolean; children?: ReactNode; style?: CSSProperties }) => (
  <div style={{ position: "relative", width: w, height: h, ...style }}>
    {shadow ? <div aria-hidden style={{ position: "absolute", left: 5, top: 7, width: w, height: h, background: "rgba(20,20,20,0.18)", filter: "blur(7px)", clipPath: tornPolygon(w, h, seed) }} /> : null}
    <div style={{ position: "absolute", inset: 0, background: paper, clipPath: tornPolygon(w, h, seed), display: "flex", alignItems: "center", padding: `0 ${Math.round(h * 0.25)}px` }}>{children}</div>
  </div>
);

// Motion tokens, an anchor camera, reading pace and two type effects, adapted
// from cinetic (https://github.com/Leonxlnx/cinetic, MIT, (c) 2026 Leonxlnx):
// its remotion-starter lib/anim.ts, lib/camera.ts, lib/pace.ts, fx/MaskRise.tsx
// and fx/Scramble.tsx, condensed and converted from 60 fps frames to the
// film's 30. Every value is a pure function of the frame.
import type { CSSProperties } from "react";
import { Easing } from "remotion";
import { clamp01, mix, prog } from "./motion";

type Ease = (t: number) => number;

/** A true exponential ease-out that lands exactly on 1 (k = 6: half-way at 12 % of the move, 90 % at 38 %). */
const expOut = (k: number): Ease => {
  const n = 1 - Math.exp(-k);
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.exp(-k * t)) / n);
};

/** Easing tokens named for how they feel. Entrances decay, exits accelerate; only the camera eases both ways. */
export const E = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  outSoft: Easing.bezier(0.22, 1, 0.36, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  exit: Easing.bezier(0.55, 0.055, 0.675, 0.19),
  inOut: Easing.bezier(0.87, 0, 0.13, 1),
  smooth: Easing.bezier(0.65, 0, 0.35, 1),
  ui: Easing.bezier(0.4, 0, 0.2, 1),
  cam: Easing.bezier(0.48, 0.1, 0, 0.9),
  glide: Easing.bezier(0.47, 0.2, 0.15, 1),
  contact: Easing.bezier(0.55, 0, 0.9, 0.55),
  whip: Easing.bezier(0.6, 0, 0.15, 1),
  dolly: Easing.bezier(0.35, 0, 0.65, 1),
  expo: expOut(6),
  linear: (t: number) => t,
};

/** Spring presets for spring() from "remotion". Critically damped by default; pop and land overshoot (a true landing, at most twice a film); type rides calm only. */
export const SPR = {
  snap: { damping: 18, stiffness: 260, mass: 0.7 },
  pop: { damping: 11, stiffness: 180, mass: 0.6 },
  soft: { damping: 26, stiffness: 120, mass: 1 },
  heavy: { damping: 30, stiffness: 90, mass: 1.4 },
  firm: { damping: 24, stiffness: 140, mass: 1 },
  micro: { damping: 30, stiffness: 500, mass: 0.6 },
  land: { damping: 14.5, stiffness: 200, mass: 1 },
  calm: { damping: 16, stiffness: 64, mass: 1 },
} as const;

/** Log-space mix for scale and zoom: equal ratios per frame, so a zoom never seems to accelerate. */
export const lmix = (a: number, b: number, t: number) => Math.exp(mix(Math.log(a), Math.log(b), t));
/** Blur for an entrance at eased progress p: gone by 60 % of the move, so text lands sharp. */
export const blurIn = (p: number, px: number) => px * clamp01(1 - p / 0.6);
/** Blur for an exit at eased progress q: only once the element is already moving. */
export const blurOut = (q: number, px: number) => px * clamp01((q - 0.3) / 0.7);
/** Attack-decay envelope `t` frames after a cue: rises over `attack` frames, decays with time constant `tau` (30 fps frames). */
export const hitPulse = (t: number, attack = 1, tau = 2.5) => (t <= 0 || t > attack + 6 * tau ? 0 : t < attack ? Math.sin((t / attack) * (Math.PI / 2)) : Math.exp(-(t - attack) / tau));
/** Vertical text moves end at `k` of their curve (while still moving ~1 px a frame), so a settling word never stair-steps. */
export const arrive = (p: number, k = 0.94) => clamp01(p / k);
/** The slow start of an exit, skipped the same way. */
export const depart = (q: number, k = 0.06) => clamp01((q - k) / (1 - k));
/** Contact squash `t` frames after a landing: wider and flatter, back over ~4 frames. */
export const squash = (t: number) => {
  const k = hitPulse(t, 0.5, 2);
  return { along: 1 - 0.1 * k, across: 1 + 0.08 * k };
};
/** An inertial scroll from frame `start` at v0 px a frame, losing (1 - decay) of its speed each frame: x, speed and total travel. */
export const inertia = (frame: number, start: number, v0: number, decay = 0.79) => {
  const d = Math.min(0.999999, Math.max(1e-6, decay));
  const tau = -1 / Math.log(d);
  const n = frame - start;
  const total = v0 * tau;
  if (n <= 0) return { x: v0 * n, v: v0, total };
  const k = d ** n;
  return { x: total * (1 - k), v: v0 * k, total };
};

/** A framing: world point (ax, ay) sits at screen point (sx, sy) at scale k, with optional yaw/pitch/roll in degrees. */
export type Shot = { ax: number; ay: number; sx: number; sy: number; k: number; yaw?: number; pitch?: number; roll?: number };
/** Blend two shots (scale in log space): shots chain without drift, lc(lc(A, B, t1), C, t2). */
export const lc = (A: Shot, B: Shot, t: number): Shot => ({ ax: mix(A.ax, B.ax, t), ay: mix(A.ay, B.ay, t), sx: mix(A.sx, B.sx, t), sy: mix(A.sy, B.sy, t), k: lmix(A.k, B.k, t), yaw: mix(A.yaw ?? 0, B.yaw ?? 0, t), pitch: mix(A.pitch ?? 0, B.pitch ?? 0, t), roll: mix(A.roll ?? 0, B.roll ?? 0, t) });
/**
 * The style of the world container (lay the world out at left 0, top 0 in world px) for a shot. Roll
 * turns the frame; yaw and pitch are drawn in 2D (a foreshortened width or height), since the export's
 * renderer draws no CSS 3D.
 */
export const shotStyle = (s: Shot): CSSProperties => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const roll = s.roll ? ` rotate(${s.roll}deg)` : "";
  const yaw = s.yaw ? ` scaleX(${Math.cos(rad(s.yaw)).toFixed(4)})` : "";
  const pitch = s.pitch ? ` scaleY(${Math.cos(rad(s.pitch)).toFixed(4)})` : "";
  return { position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${s.sx}px, ${s.sy}px)${roll}${yaw}${pitch} scale(${Math.max(1e-4, s.k)}) translate(${-s.ax}px, ${-s.ay}px)` };
};
/** Where a world point lands on screen under a flat shot: for overlays that track the product. */
export const toScreen = (s: Shot, p: { x: number; y: number }) => ({ x: s.sx + (p.x - s.ax) * s.k, y: s.sy + (p.y - s.ay) * s.k });
/** A push-in breath inside a hold: multiply k by it (0..1 through the hold). */
export const breath = (t: number, amount = 0.025) => 1 + amount * t;
/** A zoom-out hop during a whip (t its 0..1 progress): multiply k by it. */
export const dip = (t: number, depth = 0.18) => 1 - depth * Math.sin(Math.PI * t) ** 2;

/**
 * Reading pace, in 30 fps frames. calm: fragments of 1 to 4 words, 18 frames
 * to rise, 5.5 apart, held at least 1 s; crisp: the denser launch tempo.
 * Text must hold long enough to be read: holdFor(words) after it resolves.
 */
export const PACE = {
  calm: { wordDur: 18, stagger: 5.5, holdBase: 21, holdPerWord: 4, holdMin: 30, maxNewWords: 4, maxVisible: 8 },
  crisp: { wordDur: 13, stagger: 3, holdBase: 18, holdPerWord: 3, holdMin: 21, maxNewWords: 5, maxVisible: 10 },
} as const;
type Pace = (typeof PACE)[keyof typeof PACE];
/** Frames a fragment of `words` words holds after it resolves. */
export const holdFor = (words: number, p: Pace = PACE.calm) => Math.max(p.holdMin, p.holdBase + p.holdPerWord * words);
/** Frames from a fragment's first word starting to its last word in. */
export const revealFor = (words: number, p: Pace = PACE.calm) => Math.max(0, words - 1) * p.stagger + p.wordDur;

/**
 * Words (or whole lines) rising from behind a mask under their baseline:
 * nothing shows until it crosses the edge; lines are "\n"-separated. Exits
 * up through the top from `out`. Lands sharp: nothing scales.
 */
/**
 * Named entrances with their physics fixed, after motion-prompt's catalog (github.com/showheyohtaki/motion-prompt, MIT):
 * - slam: from 3.4x to 1 in 0.18 s, then an impact shake (15 px, decaying over 1.1 s): a headline, a number, a stamp hitting.
 * - pop: a spring that peaks at about 1.26 and turns in from -20 degrees: an icon, a badge, a chip.
 * - stamp: from 1.6x, tilted, landing with a squash: a seal, a "PAID", a price tag.
 * - drop: falls 120 px and bounces twice: a card, a coin, a token landing on something.
 * - rise: slides up 120 px on a quintic ease-out over 0.65 s, fully opaque (clip its parent to hide the start): a line of type.
 * - zoom: grows from 0.6 with a short fade: a panel, a screenshot.
 * Spread it on the element: <div style={enter("slam", t, cue("gratis"))}>. Before `at` the element is hidden.
 */
export type Move = "slam" | "pop" | "stamp" | "drop" | "rise" | "zoom";

export function enter(move: Move, t: number, at: number): CSSProperties {
  const s = (t - at) / 30;
  if (s < 0) return { opacity: 0, transform: "none" };
  switch (move) {
    case "slam": {
      const p = clamp01(s / 0.18);
      const k = mix(3.4, 1, p * p);
      const shake = s > 0.18 && s < 1.28 ? 15 * Math.exp(-5 * (s - 0.18)) * Math.sin(2 * Math.PI * 5 * (s - 0.18)) : 0;
      return { opacity: clamp01(s / 0.05), transform: `translateX(${shake.toFixed(2)}px) scale(${k.toFixed(4)})` };
    }
    case "pop": {
      const d = Math.exp(-6.5 * s) * Math.cos(15 * s);
      return { opacity: clamp01(s / 0.08), transform: `scale(${(1 - d).toFixed(4)}) rotate(${(-20 * d).toFixed(2)}deg)` };
    }
    case "stamp": {
      const p = clamp01(s / 0.15);
      const land = s > 0.15 ? Math.exp(-9 * (s - 0.15)) * Math.sin(18 * (s - 0.15)) : 0;
      return { opacity: clamp01(s / 0.06), transform: `scale(${(mix(1.6, 1, p * p) + 0.06 * land).toFixed(4)}, ${(mix(1.6, 1, p * p) - 0.08 * land).toFixed(4)}) rotate(${mix(-12, -4, p).toFixed(2)}deg)` };
    }
    case "drop": {
      const y = -120 * Math.exp(-5.5 * s) * Math.abs(Math.cos(11 * s));
      return { opacity: clamp01(s / 0.06), transform: `translateY(${y.toFixed(2)}px)` };
    }
    case "rise": {
      const p = clamp01(s / 0.65);
      return { transform: `translateY(${(120 * (1 - p) ** 5).toFixed(2)}px)` };
    }
    case "zoom": {
      const p = clamp01(s / 0.45);
      return { opacity: clamp01(s / 0.15), transform: `scale(${mix(0.6, 1, 1 - (1 - p) ** 4).toFixed(4)})` };
    }
  }
}

/** A hold that stays alive: a slow float of `amp` px over `period` seconds (translateY it). Keep it on the hero, not on the line being read. */
export const float = (t: number, amp = 8, period = 2.4) => -amp * Math.sin((2 * Math.PI * (t / 30)) / period);

/** An irregular idle wiggle (sines at coprime rates, so it never looks like a loop): { x, y, r } in px and degrees, `seed` offsets each element. */
export const wiggle = (t: number, seed = 0, amp = 3) => {
  const s = t / 30 + seed * 7.3;
  return { x: amp * (Math.sin(s * 1.3) + 0.5 * Math.sin(s * 3.1)) / 1.5, y: amp * (Math.sin(s * 1.7 + 1) + 0.5 * Math.sin(s * 2.3)) / 1.5, r: (amp / 3) * Math.sin(s * 0.9 + 2) };
};

export const MaskRise = ({ text, t, at, size, font, weight = 700, color, by, stagger = 5, dur = 19, out, outDur = 11, lead = 1.05, align = "left", style }: { text: string; t: number; at: number; size: number; font: string; weight?: number; color: string; by?: "word" | "line"; stagger?: number; dur?: number; out?: number; outDur?: number; lead?: number; align?: "left" | "center" | "right"; style?: CSSProperties }) => {
  const unit = by ?? (text.split(/\s+/).filter(Boolean).length <= 3 ? "line" : "word");
  const pad = { t: 0.12, b: 0.26, x: 0.1 };
  const travel = lead + pad.t + pad.b;
  let k = -1;
  return (
    <div style={{ fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: lead, color, textAlign: align, display: "flex", flexDirection: "column", ...style }}>
      {text.split("\n").map((line, li) => {
        const words = line.split(" ");
        const units = unit === "word" ? words.map((w, wi) => (wi < words.length - 1 ? `${w} ` : w)) : [line];
        return (
          // The mask is as wide as its line, whatever box it sits in: it hides the rise, never the end of a word.
          <div key={li} style={{ overflow: "hidden", width: "max-content", maxWidth: "none", alignSelf: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start", padding: `${pad.t}em ${pad.x}em ${pad.b}em`, margin: `-${pad.t}em -${pad.x}em -${pad.b}em` }}>
            <span style={{ display: "inline-block", whiteSpace: "pre" }}>
              {units.map((u, ui) => {
                k++;
                const s = at + k * stagger;
                const p = prog(t, s, s + dur, E.out);
                const q = out === undefined ? 0 : prog(t, out + k * (stagger / 2), out + k * (stagger / 2) + outDur, E.in);
                const y = (1 - arrive(p)) * travel - depart(q) * travel;
                return (
                  <span key={ui} style={{ display: "inline-block", whiteSpace: "pre", transform: `translateY(${y.toFixed(4)}em)`, visibility: p <= 0 || q >= 1 ? "hidden" : undefined }}>
                    {u}
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/** Deterministic 0..1 from a string seed. */
const rand = (seed: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

/**
 * A decode reveal for a short product string (a code, a version, a price):
 * each letter or digit cycles through glyphs of its own kind, then locks,
 * left to right, `stagger` frames apart after `hold`. An accent, at most once
 * a film, never on a line the viewer must read the moment it appears. The
 * layout never jumps: the final text holds the space from the first frame.
 */
export const Scramble = ({ text, t, at, hold = 9, stagger = 2.5, seed = "s", cycle = "rgba(0,0,0,0.45)", style }: { text: string; t: number; at: number; hold?: number; stagger?: number; seed?: string; cycle?: string; style?: CSSProperties }) => {
  const F = Math.round(t);
  if (F < at) return null;
  let n = -1;
  const order = [...text].map((c) => (/[0-9A-Za-z]/.test(c) ? ++n : -1));
  return (
    <span style={{ position: "relative", display: "inline-block", fontVariantNumeric: "tabular-nums", opacity: prog(t, at, at + 8, E.smooth), ...style }}>
      {[...text].map((ch, i) => {
        const r = order[i];
        const lock = r < 0 ? at : Math.round(at + hold + r * stagger);
        if (F >= lock) return <span key={i}>{ch}</span>;
        const pool = /[0-9]/.test(ch) ? "0123456789" : /[A-Z]/.test(ch) ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "abcdefghijklmnopqrstuvwxyz";
        const g = pool[Math.floor(rand(`${seed}:${i}:${Math.floor((F - at) / 2)}`) * pool.length)];
        return (
          <span key={i} style={{ position: "relative", display: "inline-block" }}>
            <span style={{ visibility: "hidden" }}>{ch}</span>
            <span aria-hidden style={{ position: "absolute", left: 0, top: 0, color: cycle }}>
              {g}
            </span>
          </span>
        );
      })}
    </span>
  );
};

// Kinetic type on the music's beat: one or two words filling the frame on
// every beat, whip pans between them, grounds that flip on phrase changes, a
// zoom through a letter, a TV switch-off. The devices and their measured
// targets come from the scenario-kinetic-film skill (its references/craft.md
// and method.md), re-implemented as pure functions of the frame for the
// browser exporter: no CSS 3D (depth is scale, echo copies and stacked
// text-shadow), no blend modes, effects on canvas.
import type { CSSProperties, ReactNode } from "react";
import { Easing } from "remotion";
import { E, lmix } from "./cinetic";
import { Draw } from "./draw";
import { useFilm } from "./film";
import { clamp01, hitEnv, mix, prog, seeded } from "./motion";
import { Sfx } from "./sound";
import { fit, textW } from "./text";

const inExpo = Easing.in(Easing.exp);
const inOutCubic = Easing.inOut(Easing.cubic);

/** The frame of music beat `k` counted from frame `from` (k may be fractional: 0.5 is the off-beat). `pulse` is useFilm().pulse. */
export const onBeat = (from: number, k: number, pulse: number) => Math.round(from + k * pulse);

/** Frames a whip pan takes at this tempo: half a beat, 4 to 8 frames. */
export const whipFrames = (pulse: number) => Math.max(4, Math.min(8, Math.round(pulse / 2)));

/** True when a colour is light enough to need dark type on it (#rgb, #rrggbb or rgb()). */
export const isLight = (c: string) => {
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  const rgb = h
    ? (h[1].length === 3 ? [...h[1]].map((x) => x + x) : (h[1].match(/../g) as string[])).map((x) => parseInt(x, 16))
    : (/rgba?\(([^)]+)\)/.exec(c)?.[1].split(",").slice(0, 3).map(Number) ?? [0, 0, 0]);
  const [r, g, b] = rgb.map((v) => (v / 255) ** 2.2);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3;
};

export type WhipDir = "left" | "right" | "up" | "down";
const VEC: Record<WhipDir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/**
 * A whip pan between two layers over the `dur` frames that end at `at`: the
 * outgoing layer leaves toward `dir` while the incoming one arrives from the
 * other side, both on one fast curve. Returns each layer's offset and the
 * smear (0..1, peaking mid-whip) to stretch ghosts and blur by.
 */
export function whipPan(t: number, at: number, dur: number, dir: WhipDir, W: number, H: number) {
  const p = prog(t, at - dur, at, E.whip);
  const [vx, vy] = VEC[dir];
  const span = vx ? W : H;
  const smear = t <= at - dur || t >= at ? 0 : Math.sin(Math.PI * clamp01((t - (at - dur)) / dur));
  return { out: { x: vx * span * p, y: vy * span * p }, in: { x: -vx * span * (1 - p), y: -vy * span * (1 - p) }, smear, dir: [vx, vy] as [number, number] };
}

/** A layer moved by a whip, smeared along the move with trailing ghosts and a blur. */
const Smeared = ({ x, y, smear, dir, children }: { x: number; y: number; smear: number; dir: [number, number]; children: ReactNode }) => {
  const layer = (dx: number, dy: number, o: number, k: number) => (
    <div key={k} data-qa={k ? "echo" : undefined} style={{ position: "absolute", inset: 0, transform: `translate(${(x + dx).toFixed(1)}px, ${(y + dy).toFixed(1)}px)`, opacity: o, filter: smear > 0.05 ? `blur(${(10 * smear).toFixed(1)}px)` : undefined }}>
      {children}
    </div>
  );
  if (smear <= 0.05) return layer(0, 0, 1, 0);
  // Ghosts trail behind the move, the way a long shutter streaks it.
  return <>{[3, 2, 1].map((k) => layer(-dir[0] * k * 70 * smear, -dir[1] * k * 70 * smear, 0.22 * (1 - k / 4), k)).concat(layer(0, 0, 1, 0))}</>;
};

export type KStyle = "slam" | "punch" | "stack" | "split" | "pair" | "cut";

/** One shot of a KineticType run: one idea, on one beat. */
export type KShot = {
  /** The frame the shot lands (on a music beat: onBeat(beat.start, k, pulse)). */
  at: number;
  /** One or two words; stack, split and pair take two lines: [kicker, word], [small, big], [line 1, line 2]. */
  text: string | [string, string];
  /** slam: huge, letters tumble in, outlined ghost rows scroll above and below · punch: flies out of depth with an echo trail and an extruded edge · stack: a small kicker, then the word slams `second` frames later over an accent bar · split: a small word, then the big one slams in from the right · pair: two lines meeting from both sides · cut: a hard-cut word, for runs of beat cuts. */
  style?: KStyle;
  /** The ground behind it (a colour); type defaults to readable on it. */
  ground?: string;
  color?: string;
  /** The word that matters, the accent bar and the punch's extruded edge. */
  accent?: string;
  /** How it arrives: a hard cut (default), or a whip pan from the previous shot. */
  in?: "cut" | WhipDir;
  /** punch: rays, a ring, a flash and a shake (the drop, the title: at most a few a film) · hit: a flash and a shake · beat: a shake and a bump only (runs of cuts) · none. */
  fx?: "punch" | "hit" | "beat" | "none";
  /** Frames until the second element of stack, split and pair (default half a beat). */
  second?: number;
  /** Frames after landing at which an outlined word fills: outlined for what is not true yet, filled when it is. */
  fill?: number;
  /** Largest type size in px (default about 42 % of the frame height); every word is measured to fit the width. */
  size?: number;
  rot?: number;
};

/** Which shot of a run shows at frame t, and how the whip into the next one moves it. @internal exported for tests */
export function kineticAt(shots: KShot[], t: number, pulse: number) {
  const dur = whipFrames(pulse);
  // The first shot has nothing to whip from: it cuts in.
  const start = (s: KShot, k: number) => (k > 0 && s.in && s.in !== "cut" ? s.at - dur : s.at);
  let i = -1;
  for (let k = 0; k < shots.length; k++) if (start(shots[k], k) <= t) i = k;
  if (i < 0) return null;
  const s = shots[i];
  // Inside the whip that lands shot i, shot i-1 is still leaving.
  if (s.in && s.in !== "cut" && t < s.at && i > 0) return { i, prev: i - 1, dir: s.in, dur };
  return { i, prev: -1, dir: null, dur };
}

const HITS = { punch: { shake: 16, bump: 0.06, flash: 0.32 }, hit: { shake: 10, bump: 0.035, flash: 0.2 }, beat: { shake: 5, bump: 0.02, flash: 0 }, none: { shake: 0, bump: 0, flash: 0 } };
const CUE = { punch: "impact", hit: "sub", beat: "tick", none: null } as const;
/** Every KineticType line is set this tight (em): measure with it. */
/** @internal */
export const TRACK = -0.02;

/** The camera on shot k at frame t, u its 0..1 progress through its hold: a hit's shake and bump, a slow push and a roll. */
const camOf = (k: number, s: KShot, t: number, u: number) => {
  const fx = HITS[s.fx ?? "beat"];
  const lt = t - s.at;
  const shake = lt >= 0 && lt < 18 ? Math.exp(-lt / 4) * fx.shake : 0;
  return { x: Math.sin(lt * 2.3) * shake, y: Math.cos(lt * 1.9) * shake, r: (k % 2 ? 1 : -1) * mix(-0.6, 0.6, u), s: 1 + 0.05 * u + fx.bump * hitEnv(t, s.at, 6, 2) };
};

/** The sizes a shot is set at: the frame width it fills, the main word's size, the small line's and a pair's. */
const sizesOf = (s: KShot, font: string, weight: number, W: number, H: number) => {
  const maxW = W * (H > W ? 0.9 : 0.86);
  const base = s.size ?? Math.min(H * 0.42, W * 0.34);
  const [a, b] = Array.isArray(s.text) ? s.text : [s.text, ""];
  const style: KStyle = s.style ?? (Array.isArray(s.text) ? "stack" : "slam");
  const pair = style === "pair" ? Math.min(fit(a, font, weight, base * 0.8, maxW), fit(b, font, weight, base * 0.8, maxW)) : 0;
  return { maxW, base, a, b, style, pair, big: fit(b || a, font, weight, base, maxW), small: fit(a, font, weight, base * 0.3, maxW * 0.8) };
};

/** The zoom through a point: the point slides to the frame's centre while the scale grows 60 times, exponentially. */
/** @internal */
export const zoomStyle = (t: number, at: number, dur: number, x: number, y: number, W: number, H: number): CSSProperties => {
  const z = prog(t, at, at + dur, inExpo);
  const S = Math.exp(Math.log(60) * z);
  const m = inOutCubic(clamp01(z * 1.5));
  return { position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${mix(x, W / 2, m).toFixed(1)}px, ${mix(y, H / 2, m).toFixed(1)}px) scale(${S.toFixed(4)}) translate(${-x}px, ${-y}px)` };
};

/** Where character `char` of shot k's main word (the big word of stack and split, line 2 of pair) is on screen at frame t, through its own drift and the camera. @internal exported for tests */
export function letterOnScreen(shots: KShot[], k: number, char: number, t: number, font: string, weight: number, W: number, H: number, pulse: number, fps: number) {
  const s = shots[k];
  const z = sizesOf(s, font, weight, W, H);
  const two = z.style === "stack" || z.style === "split" || z.style === "pair";
  const word = two ? z.b : z.a;
  const size = z.style === "pair" ? z.pair : z.big;
  const y = z.style === "stack" ? H / 2 + z.small * 0.46 : z.style === "split" ? H / 2 + z.small * 0.51 : z.style === "pair" ? H / 2 + size * 0.46 : H / 2;
  const lt = t - s.at;
  const p = letterAt(word, char, font, weight, size, W / 2, y, TRACK);
  // The word's own slow scale (pair lines slide instead), then the camera about the frame's centre.
  const own = z.style === "pair" ? 1 : 1 + 0.03 * (Math.max(0, lt) / fps);
  const px = W / 2 + (p.x - W / 2) * own + (z.style === "pair" ? 24 * (lt / fps) : 0);
  const next = shots[k + 1];
  const cam = camOf(k, s, t, clamp01(lt / Math.max(pulse, (next?.at ?? s.at + 4 * pulse) - s.at)));
  const r = (cam.r * Math.PI) / 180;
  const dx = (px - W / 2) * cam.s;
  const dy = (p.y - H / 2) * cam.s;
  return { x: W / 2 + dx * Math.cos(r) - dy * Math.sin(r) + cam.x, y: H / 2 + dx * Math.sin(r) + dy * Math.cos(r) + cam.y };
}

/**
 * A run of kinetic type shots, one per beat or half beat, full frame: each
 * lands with its hit, keeps moving after it lands (the camera pushes and
 * rolls, slams slide their ghost rows, words scale slowly) and gives way to
 * the next by a hard cut or a whip pan. `t` is the current frame, as for
 * every block. Plays a sound on every landing and whip unless `sound` is
 * false. Put it full frame inside its station; shots after the last one's
 * hold stay on the last. `zoom` ends the run by flying through the hole of
 * character `char` of the last shot's main word (pick O, D, 0, A, B, P, R)
 * from `at` for `dur` frames; nothing is drawn after, so cut to the next
 * shot there, on the colour the hole showed (the last shot's ground).
 */
export const KineticType = ({ t, shots, font, weight = 800, paper = "#F4F1EA", ink = "#141210", ground = "#0C0E11", sound = true, zoom, style }: { t: number; shots: KShot[]; font: string; weight?: number; paper?: string; ink?: string; ground?: string; sound?: boolean; zoom?: { at: number; dur: number; char: number }; style?: CSSProperties }) => {
  const { W, H, pulse, fps } = useFilm();
  const now = kineticAt(shots, t, pulse);
  const sounds = sound
    ? shots.flatMap((s, k) => {
        const fx = s.fx ?? "beat";
        const out: ReactNode[] = [];
        if (k > 0 && s.in && s.in !== "cut") out.push(<Sfx key={`w${k}`} name="swoosh" at={s.at - whipFrames(pulse) - 1} volume={0.42} />);
        const name = CUE[fx];
        if (name) out.push(<Sfx key={`h${k}`} name={name} at={s.at - 1} volume={fx === "beat" ? 0.32 : 0.5} />);
        if (Array.isArray(s.text) && s.style !== "pair") out.push(<Sfx key={`s${k}`} name="pop" at={s.at + (s.second ?? Math.round(pulse / 2)) - 1} volume={0.36} />);
        return out;
      })
    : [];
  if (!now || (zoom && t >= zoom.at + zoom.dur)) return <>{sounds}</>;
  const layer = (k: number) => {
    const s = shots[k];
    const next = shots[k + 1];
    const g = s.ground ?? ground;
    const fg = s.color ?? (isLight(g) ? ink : paper);
    const life = Math.max(pulse, (next?.at ?? s.at + 4 * pulse) - s.at);
    const fx = HITS[s.fx ?? "beat"];
    const lt = t - s.at;
    const c = camOf(k, s, t, clamp01(lt / life));
    const cam = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) rotate(${c.r.toFixed(3)}deg) scale(${c.s.toFixed(4)})`;
    return (
      <div style={{ position: "absolute", inset: 0, background: g, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, transform: cam, transformOrigin: "50% 50%" }}>
          <ShotType s={s} k={k} lt={lt} whipped={k > 0 && Boolean(s.in && s.in !== "cut")} font={font} weight={weight} fg={fg} accent={s.accent ?? fg} paper={paper} ink={ink} W={W} H={H} pulse={pulse} fps={fps} />
        </div>
        {s.fx === "punch" && lt >= 0 && lt < 18 ? <Rays t={t} at={s.at} color={s.accent ?? fg} W={W} H={H} /> : null}
        {fx.flash && lt >= -1 && lt < 8 ? <div style={{ position: "absolute", inset: 0, background: "#FFFFFF", opacity: fx.flash * (lt < 0 ? 0.5 : 1 - lt / 8) }} /> : null}
      </div>
    );
  };
  const { i, prev, dir, dur } = now;
  const shot = shots[i];
  const fly = zoom && t >= zoom.at ? letterOnScreen(shots, shots.length - 1, zoom.char, t, font, weight, W, H, pulse, fps) : null;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "hidden", ...style }}>
      <div style={fly && zoom ? zoomStyle(t, zoom.at, zoom.dur, fly.x, fly.y, W, H) : { position: "absolute", inset: 0 }}>
      {dir && prev >= 0 ? (
        (() => {
          const w = whipPan(t, shot.at, dur, dir, W, H);
          return (
            <>
              <Smeared x={w.out.x} y={w.out.y} smear={w.smear} dir={w.dir}>{layer(prev)}</Smeared>
              <Smeared x={w.in.x} y={w.in.y} smear={w.smear} dir={w.dir}>{layer(i)}</Smeared>
            </>
          );
        })()
      ) : (
        layer(i)
      )}
      </div>
      {sounds}
    </div>
  );
};

const ShotType = ({ s, k, lt, whipped, font, weight, fg, accent, paper, ink, W, H, pulse, fps }: { s: KShot; k: number; lt: number; whipped: boolean; font: string; weight: number; fg: string; accent: string; paper: string; ink: string; W: number; H: number; pulse: number; fps: number }) => {
  const { maxW, a, b, style, pair, big, small } = sizesOf(s, font, weight, W, H);
  // A whip is the entrance: the word is already formed when the camera reaches it.
  const le = whipped ? 99 : lt;
  const alive = 1 + 0.03 * (Math.max(0, lt) / fps);
  const second = s.second ?? Math.round(pulse / 2);
  const box: CSSProperties = { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" };
  const filled = s.fill === undefined || lt >= s.fill;
  const line = (size: number, color: string, extra?: CSSProperties) => ({
    fontFamily: font,
    fontWeight: weight,
    fontSize: size,
    lineHeight: 0.92,
    letterSpacing: `${TRACK}em`,
    whiteSpace: "nowrap" as const,
    color: filled ? color : "transparent",
    WebkitTextStroke: filled ? undefined : `${Math.max(2, size * 0.014).toFixed(1)}px ${color}`,
    ...extra,
  });

  if (style === "slam" || style === "cut") {
    const size = big;
    const pe = prog(le, 0, style === "cut" ? 3 : 6, E.out);
    const scale = mix(style === "cut" ? 1.08 : 1.35, 1, pe) * alive;
    const ghost = (row: number) => {
      const dirn = row % 2 ? 1 : -1;
      const x = dirn * (Math.max(0, lt) * 2.4 + 160);
      return (
        <div key={row} style={{ position: "absolute", left: 0, right: 0, top: H / 2 + row * size * 0.95 - size * 0.46, display: "flex", justifyContent: "center", transform: `translateX(${x.toFixed(1)}px)`, opacity: 0.16 }}>
          <div style={{ ...line(size, fg), color: "transparent", WebkitTextStroke: `${Math.max(2, size * 0.012).toFixed(1)}px ${fg}` }}>{`${a}   ${a}   ${a}`}</div>
        </div>
      );
    };
    return (
      <>
        {style === "slam" ? [-2, -1, 1, 2].map(ghost) : null}
        <div style={box}>
          <div style={{ ...line(size, fg), transform: `rotate(${s.rot ?? 0}deg) scale(${scale.toFixed(4)})` }}>
            {style === "slam"
              ? [...a].map((ch, j) => {
                  const q = prog(le, j * 0.8, j * 0.8 + 6, E.out);
                  const rot = (1 - q) * (seeded(j + k * 7) - 0.5) * 50;
                  const y = (1 - q) * size * 0.35 * (seeded(j * 3 + k) - 0.3);
                  return (
                    <span key={j} style={{ display: "inline-block", whiteSpace: "pre", transform: `translateY(${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`, opacity: le >= j * 0.8 ? 1 : 0 }}>
                      {ch}
                    </span>
                  );
                })
              : a}
          </div>
        </div>
      </>
    );
  }

  if (style === "punch") {
    const size = big;
    const z = (d: number) => prog(le - d, 0, 7, E.expo);
    const depth = Math.max(2, Math.round(size / 40));
    const edge = Array.from({ length: depth }, (_, d) => `${((d + 1) * 0.8).toFixed(1)}px ${((d + 1) * 1.1).toFixed(1)}px 0 ${accent === fg ? "rgba(0,0,0,0.45)" : accent}`).join(", ");
    const echo = (d: number) => (
      <div key={d} style={box}>
        <div style={{ ...line(size, fg), transform: `scale(${lmix(0.12, 1, z(d * 1.3)).toFixed(4)})`, opacity: 0.3 * (1 - d / 5) * (1 - prog(lt, 6, 14)) }}>{a}</div>
      </div>
    );
    return (
      <>
        {[4, 3, 2, 1].map(echo)}
        <div style={box}>
          <div style={{ ...line(size, fg), textShadow: filled ? edge : undefined, transform: `scale(${(lmix(0.12, 1, z(0)) * alive).toFixed(4)})` }}>{a}</div>
        </div>
      </>
    );
  }

  if (style === "pair") {
    const size = pair;
    const p1 = prog(le, 0, 6, E.out);
    const p2 = prog(le - (s.second ?? 0), 0, 6, E.out);
    return (
      <div style={box}>
        <div style={{ ...line(size, fg), transform: `translateX(${((1 - p1) * -W * 0.6 - 24 * (lt / fps)).toFixed(1)}px)` }}>{a}</div>
        <div style={{ ...line(size, accent), transform: `translateX(${((1 - p2) * W * 0.6 + 24 * (lt / fps)).toFixed(1)}px)`, opacity: le >= (s.second ?? 0) ? 1 : 0 }}>{b}</div>
      </div>
    );
  }

  // stack ([kicker, word]) and split ([small, big]): the second element slams `second` frames later.
  const p2 = prog(lt - second, 0, style === "split" ? 7 : 5, E.out);
  const landed = lt >= second;
  // Until the second element lands, the first one holds the frame alone: large and centred, then it shrinks into place as the second slams.
  // It starts clearing out of the way 2 frames before the slam, so the two never sit on each other.
  const pk = prog(lt - second + 2, 0, 3, E.out);
  const lead = mix(Math.min(2.4, (maxW * 0.7) / Math.max(1, textW(a, font, weight, small))), 1, pk);
  const drop = (1 - pk) * (big * 0.46 + small * 0.05);
  if (style === "split") {
    const x = (1 - p2) * W * 0.7;
    const bw = textW(b, font, weight, big);
    const left = (-bw / 2 + textW(a, font, weight, small) / 2) * pk;
    return (
      <div style={box}>
        <div style={{ ...line(small, fg), alignSelf: "center", transform: `translate(${left.toFixed(1)}px, ${drop.toFixed(1)}px) scale(${lead.toFixed(4)})`, marginBottom: small * 0.1 }}>{a}</div>
        <div style={{ ...line(big, accent), opacity: landed ? 1 : 0, transform: `translateX(${x.toFixed(1)}px) scale(${alive.toFixed(4)})`, filter: landed && p2 < 0.9 ? `blur(${(8 * (1 - p2)).toFixed(1)}px)` : undefined }}>{b}</div>
      </div>
    );
  }
  const bar = prog(le, 0, 5, E.out);
  const barColor = accent === fg ? fg : accent;
  return (
    <div style={box}>
      <div style={{ position: "relative", padding: `0 ${small * 0.3}px`, transform: `translateY(${drop.toFixed(1)}px) scale(${lead.toFixed(4)})` }}>
        <div style={{ position: "absolute", inset: 0, background: barColor, clipPath: `inset(0 ${((1 - bar) * 100).toFixed(1)}% 0 0)`, opacity: 0.9 }} />
        <div style={{ ...line(small, isLight(barColor) ? ink : paper), position: "relative" }}>{a}</div>
      </div>
      <div style={{ ...line(big, fg), opacity: landed ? 1 : 0, transform: `scale(${(mix(1.15, 1, p2) * alive).toFixed(4)})` }}>{b}</div>
    </div>
  );
};

/** Rays, a ring and sparks from the centre on a punch: the biggest hits only. */
/** @internal */
export const Rays = ({ t, at, color, W, H }: { t: number; at: number; color: string; W: number; H: number }) => (
  <Draw
    draw={(ctx) => {
      const p = prog(t, at, at + 16);
      const cx = W / 2;
      const cy = H / 2;
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.8 * (1 - p);
      ctx.lineWidth = 3;
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * Math.PI * 2 + seeded(k + at) * 0.1;
        const r0 = 120 + W * 0.25 * p + seeded(k * 3 + at) * 80;
        const r1 = r0 + W * (0.12 + 0.2 * seeded(k * 5 + at)) * (1 - p * 0.5);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.lineWidth = 16 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 40 + W * 0.55 * p, 0, Math.PI * 2);
      ctx.stroke();
    }}
  />
);

/** The centre of character `index` of one centred line of `text` drawn at (cx, cy): pass it to ZoomThrough to fly through a letter's counter. */
export const letterAt = (text: string, index: number, font: string, weight: number, size: number, cx: number, cy: number, trackEm = 0) => {
  const all = textW(text, font, weight, size, trackEm);
  // Each character before it is followed by its tracking.
  const before = index > 0 ? textW(text.slice(0, index), font, weight, size, trackEm) + trackEm * size : 0;
  const ch = textW(text.charAt(index), font, weight, size);
  return { x: cx - all / 2 + before + ch / 2, y: cy };
};

/**
 * The camera flies through point (x, y) of its children between `at` and
 * `at + dur`: aim it at the hole of a letter (O, D, 0, A, B, P, R; see
 * letterAt) and the inside of the letter becomes the next shot. For a
 * KineticType run use its own `zoom`, which follows the words' drift. Start the
 * next shot at `at + dur` on the ground the letter's counter showed.
 */
export const ZoomThrough = ({ t, at, dur, x, y, children }: { t: number; at: number; dur: number; x: number; y: number; children: ReactNode }) => {
  const { W, H } = useFilm();
  if (t >= at + dur) return null;
  return <div style={zoomStyle(t, at, dur, x, y, W, H)}>{children}</div>;
};

/** A TV switch-off out of a section: its children squash to a bright line, then to a point that fades, over `dur` frames from `at`. */
export const TvOff = ({ t, at, dur = 8, color = "#FFFFFF", children }: { t: number; at: number; dur?: number; color?: string; children: ReactNode }) => {
  const { W, H } = useFilm();
  if (t < at) return <>{children}</>;
  const half = at + dur * 0.55;
  const sy = mix(1, 0.012, prog(t, at, half, E.in));
  const sx = mix(1, 0.004, prog(t, half, at + dur, E.in));
  const glow = prog(t, at, half, E.in);
  return (
    <>
      {t < at + dur ? (
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`, transformOrigin: "50% 50%", filter: `brightness(${(1 + 2 * glow).toFixed(2)})` }}>{children}</div>
      ) : null}
      {t >= half && t < at + dur + 6 ? <div style={{ position: "absolute", left: W / 2 - 9, top: H / 2 - 9, width: 18, height: 18, borderRadius: 9, background: color, opacity: 1 - prog(t, at + dur, at + dur + 6) }} /> : null}
    </>
  );
};

/** Speed lines converging into a glowing point at (x, y) over the `dur` frames before `at`: the charge before a run's first shot. */
export const Charge = ({ t, at, dur, color, x, y }: { t: number; at: number; dur: number; color: string; x?: number; y?: number }) => {
  const { W, H } = useFilm();
  if (t < at - dur || t >= at) return null;
  const cx = x ?? W / 2;
  const cy = y ?? H / 2;
  return (
    <Draw
      draw={(ctx) => {
        const p = prog(t, at - dur, at, E.in);
        ctx.strokeStyle = color;
        ctx.lineCap = "round";
        for (let k = 0; k < 48; k++) {
          const a = seeded(k * 1.7) * Math.PI * 2;
          const far = Math.hypot(W, H) * (0.5 + 0.3 * seeded(k * 2.3));
          const head = far * (1 - p) * (0.6 + 0.4 * seeded(k * 4.1 + Math.floor(t / 2)));
          const tail = head + 60 + 200 * p;
          ctx.globalAlpha = 0.25 + 0.6 * p;
          ctx.lineWidth = 1.5 + 2 * p;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * head, cy + Math.sin(a) * head);
          ctx.lineTo(cx + Math.cos(a) * tail, cy + Math.sin(a) * tail);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, 4 + 16 * p, 0, Math.PI * 2);
        ctx.fill();
      }}
    />
  );
};

/**
 * "NO <thing>." over a mock of the thing: the mock shows at `at`, NO slams a
 * beat later, the word fills half a beat after that (outlined until then),
 * and a beat later a slash cuts the mock in two and its halves fall apart.
 * About 3 beats; `mock` is drawn full frame (a Window, a timeline, a stack of cards).
 */
export const Denial = ({ t, at, word, mock, font, weight = 800, color, accent, no = "NO" }: { t: number; at: number; word: string; mock: ReactNode; font: string; weight?: number; color: string; accent?: string; no?: string }) => {
  const { W, H, pulse, fps } = useFilm();
  if (t < at) return null;
  const tNo = at + pulse;
  const tWord = at + 1.5 * pulse;
  const tCut = at + 2 * pulse;
  const fall = prog(t, tCut, tCut + pulse * 1.2, E.in);
  const size = fit(`${no} ${word}`, font, weight, Math.min(H * 0.3, W * 0.24), W * 0.86);
  const half = (side: 1 | -1) => (
    <div key={side} data-qa={side > 0 ? "echo" : undefined} style={{ position: "absolute", inset: 0, clipPath: side < 0 ? "polygon(0 0, 58% 0, 42% 100%, 0 100%)" : "polygon(58% 0, 100% 0, 100% 100%, 42% 100%)", transform: `translate(${(side * fall * W * 0.18).toFixed(1)}px, ${(fall * H * 0.7).toFixed(1)}px) rotate(${(side * fall * 14).toFixed(2)}deg)`, opacity: 1 - fall }}>
      {mock}
    </div>
  );
  const slam = prog(t, tNo, tNo + 5, E.out);
  const filled = t >= tWord;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "hidden" }}>
      {fall < 1 ? [half(-1), half(1)] : null}
      {t >= tCut && t < tCut + 4 ? <div style={{ position: "absolute", left: W * 0.42, top: -40, width: 8, height: H + 80, background: accent ?? color, transform: `rotate(9deg) scaleY(${prog(t, tCut, tCut + 3).toFixed(3)})`, transformOrigin: "50% 0" }} /> : null}
      {t >= tNo ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: size * 0.25, transform: `translateX(${(-(t - tNo) * 0.8).toFixed(1)}px) scale(${(mix(1.4, 1, slam) * (1 + 0.05 * Math.max(0, t - tNo) / fps)).toFixed(4)})` }}>
          <span style={{ fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 0.92, color: accent ?? color, whiteSpace: "nowrap" }}>{no}</span>
          <span style={{ fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 0.92, whiteSpace: "nowrap", color: filled ? color : "transparent", WebkitTextStroke: filled ? undefined : `${Math.max(2, size * 0.014).toFixed(1)}px ${color}` }}>{word}</span>
        </div>
      ) : null}
    </div>
  );
};

import { Easing, interpolate } from "remotion";
import { MUSIC } from "./music";
import { FPS, type CameraPath, type Plan } from "./plan";

/**
 * Timing and the camera rig of a flythrough.
 *
 * Every scene starts on a beat of the chosen music bed and the closing scene
 * on a bar line; the bed is started at whatever bar puts its breakdown right
 * before the close, so the last card lands on the music's own release.
 */

export type MusicName = keyof typeof MUSIC;

export type Timing = {
  music: MusicName;
  /** Frames per beat (fractional). */
  beat: number;
  /** Frame each scene starts on, and its length. */
  starts: number[];
  frames: number[];
  total: number;
  /** Frame of the closing scene. */
  closeAt: number;
  /** Seconds into the music bed at frame 0. */
  musicFrom: number;
  /** Frames a camera move between two cards takes. */
  move: number;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function planTiming(plan: Plan): Timing {
  const music = (plan.music in MUSIC ? plan.music : "drive") as MusicName;
  const m = MUSIC[music];
  const beat = (FPS * 60) / m.bpm;
  const n = plan.scenes.length;
  // Whole beats per scene, an even count so cuts fall on strong beats; the
  // close holds at least two bars for the logo and the music's last hit.
  const beats = plan.scenes.map((s, i) => {
    // A flythrough moves on; a held card reads in less time than a full
    // frame of text. Demos (code, chat) keep their length.
    const cap = s.type === "code" || s.type === "chat" ? 7 : i === n - 1 ? 4.2 : 4.4;
    const b = Math.max(i === n - 1 ? 8 : 4, Math.round((Math.min(s.duration, cap) * FPS) / beat));
    return i === n - 1 ? b : b + (b % 2);
  });
  if (n > 1) {
    const before = sum(beats.slice(0, n - 1));
    if (before % 4) beats[n - 2] += 4 - (before % 4);
  }
  const startBeat: number[] = [];
  beats.reduce((at, b) => {
    startBeat.push(at);
    return at + b;
  }, 0);
  const starts = startBeat.map((b) => Math.round(b * beat));
  const total = Math.round(sum(beats) * beat);
  const frames = starts.map((s, i) => (i < n - 1 ? starts[i + 1] : total) - s);

  const barSeconds = (4 * 60) / m.bpm;
  const closeBar = Math.round(startBeat[n - 1] / 4);
  let fromBar = m.breakAt + 2 - closeBar;
  if (fromBar < m.intro) fromBar = m.intro;
  const room = m.seconds - 0.5 - total / FPS;
  if (fromBar * barSeconds > room) fromBar = Math.max(0, Math.floor(room / barSeconds));

  const move = Math.round(Math.min(26, Math.max(14, beat * 1.5)));
  return { music, beat, starts, frames, total: Math.max(1, total), closeAt: starts[n - 1], musicFrom: fromBar * barSeconds, move };
}

// ------------------------------------------------------------------ camera

export type Vec = { x: number; y: number; z: number };

export type Station = {
  /** Where the card stands, in px of the composition. */
  pos: Vec;
  /** The card's turn about the vertical axis, degrees; the camera matches it on arrival. */
  rotY: number;
  rotX: number;
};

export type Camera = Vec & { yaw: number; pitch: number; roll: number; speed: number };

/**
 * Where each card stands along the route. Cards recede into the room; the
 * route decides whether the camera weaves (serpentine), climbs (staircase)
 * or pushes straight in with a light zigzag (dolly).
 */
export function stations(n: number, path: CameraPath, width: number, height: number, u: number): Station[] {
  const Z = 2300 * u;
  return Array.from({ length: n }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const last = i === n - 1;
    switch (path) {
      case "serpentine":
        return { pos: { x: last ? 0 : side * width * 0.62, y: 0, z: -i * Z * 0.85 - (last ? Z * 0.4 : 0) }, rotY: last ? 0 : side * -16, rotX: 0 };
      case "staircase":
        return { pos: { x: side * width * 0.1, y: -i * height * 0.7, z: -i * Z * 0.7 }, rotY: 0, rotX: last ? 0 : 6 };
      case "dolly":
      default:
        return { pos: { x: i === 0 || last ? 0 : side * width * 0.24, y: (i % 3 === 1 ? 1 : 0) * height * 0.05, z: -i * Z - (last ? Z * 0.3 : 0) }, rotY: last ? 0 : side * -5, rotX: 0 };
    }
  });
}

const whip = Easing.bezier(0.72, 0, 0.18, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** When the camera leaves for card i, and when it has landed there. */
export function moveWindow(i: number, t: Timing): [number, number] {
  if (i === 0) return [0, 26];
  const land = t.starts[i] + Math.round(t.move * 0.25);
  return [land - t.move, land];
}

function rest(st: Station): Vec & { yaw: number; pitch: number } {
  return { ...st.pos, yaw: st.rotY, pitch: st.rotX };
}

/** The camera at a frame: holding on a card with a slow push, or travelling. */
export function cameraAt(frame: number, t: Timing, st: Station[], u: number): Camera {
  const at = (f: number): Omit<Camera, "speed"> => {
    let i = 0;
    for (let k = 0; k < st.length; k++) if (f >= moveWindow(k, t)[0]) i = k;
    const [from, to] = moveWindow(i, t);
    const target = rest(st[i]);
    // While holding, a slow push and sway keep the shot alive.
    const nextLeave = i < st.length - 1 ? moveWindow(i + 1, t)[0] : t.total;
    const hold = interpolate(f, [to, Math.max(to + 1, nextLeave)], [0, 1], clamp);
    const drift = { x: Math.sin(hold * Math.PI) * 30 * u, y: -hold * 12 * u, z: -hold * 190 * u };
    const prev =
      i === 0
        ? { x: target.x + 90 * u, y: target.y + 70 * u, z: target.z + 1100 * u, yaw: -6, pitch: -3 }
        : (() => {
            const p = rest(st[i - 1]);
            return { ...p, z: p.z - 190 * u, y: p.y - 12 * u };
          })();
    const k = whip(interpolate(f, [from, to], [0, 1], clamp));
    const arc = Math.sin(k * Math.PI);
    const dx = target.x - prev.x;
    return {
      x: prev.x + (target.x - prev.x) * k + drift.x * Math.min(1, hold * 4),
      y: prev.y + (target.y - prev.y) * k + drift.y + arc * -80 * u,
      z: prev.z + (target.z - prev.z) * k + drift.z,
      yaw: prev.yaw + (target.yaw - prev.yaw) * k + arc * Math.sign(dx || 1) * 9,
      pitch: prev.pitch + (target.pitch - prev.pitch) * k + arc * -2,
      roll: arc * Math.sign(dx || 1) * -2.5,
    };
  };
  const c = at(frame);
  const p = at(frame - 1);
  const speed = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) / u;
  return { ...c, speed };
}

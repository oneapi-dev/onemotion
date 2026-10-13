import { Easing, interpolate } from "remotion";
import { scoreOf } from "../music/score";
import { FPS, type CameraPath, type Plan } from "./plan";

/**
 * Timing and the camera rig of a flythrough.
 *
 * The music is composed for the video, so the video sets the grid: every
 * scene starts on a beat of the score's tempo, a whole number of beats long,
 * and the closing scene on a bar line. Cards land on their scene's first
 * beat, where the music hits.
 */

/** Seconds after a card lands before its voiceover line starts: the hit first, then the voice. */
export const VOICE_LEAD = 0.2;

export type Timing = {
  /** Beats per minute, and frames per beat (fractional). */
  bpm: number;
  beat: number;
  /** Beat and frame each scene starts on, and its length in beats and frames. */
  startBeats: number[];
  beats: number[];
  starts: number[];
  frames: number[];
  total: number;
  /** Frame of the closing scene. */
  closeAt: number;
  /** Frames a camera move between two cards takes. */
  move: number;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function planTiming(plan: Plan): Timing {
  const { bpm } = scoreOf(plan);
  const beat = (FPS * 60) / bpm;
  const n = plan.scenes.length;
  // Whole beats per scene, an even count so cuts fall on strong beats; the
  // close holds at least two bars for the logo and the music's last hit.
  const beats = plan.scenes.map((s, i) => {
    // A flythrough moves on; a held card reads in less time than a full
    // frame of text. Demos (code, chat) keep their length.
    const cap = s.type === "code" || s.type === "chat" ? 7 : i === n - 1 ? 4.2 : 4.4;
    // A recorded voiceover line is spoken in full before the camera moves on.
    const voiced = s.narration_seconds ? Math.ceil(((s.narration_seconds + VOICE_LEAD + 0.4) * FPS) / beat) : 0;
    const b = Math.max(i === n - 1 ? 8 : 4, Math.round((Math.min(s.duration, cap) * FPS) / beat), voiced);
    return i === n - 1 ? b : b + (b % 2);
  });
  if (n > 1) {
    const before = sum(beats.slice(0, n - 1));
    if (before % 4) beats[n - 2] += 4 - (before % 4);
  }
  const startBeats: number[] = [];
  beats.reduce((at, b) => {
    startBeats.push(at);
    return at + b;
  }, 0);
  const starts = startBeats.map((b) => Math.round(b * beat));
  const total = Math.max(1, Math.round(sum(beats) * beat));
  const frames = starts.map((s, i) => (i < n - 1 ? starts[i + 1] : total) - s);
  const move = Math.round(Math.min(26, Math.max(14, beat * 1.5)));
  return { bpm, beat, startBeats, beats, starts, frames, total, closeAt: starts[n - 1], move };
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

/** When the camera leaves for card i, and when it has landed there: on the scene's first beat. */
export function moveWindow(i: number, t: Timing): [number, number] {
  if (i === 0) return [0, 26];
  const land = t.starts[i];
  return [land - t.move, land];
}

function rest(st: Station): Vec & { yaw: number; pitch: number } {
  return { ...st.pos, yaw: st.rotY, pitch: st.rotX };
}

/** A vector in the axes of a camera turned by yaw and pitch, in room axes: the inverse of projector's turn. */
function toRoom(v: Vec, yaw: number, pitch: number): Vec {
  const rad = Math.PI / 180;
  const [cx, sx] = [Math.cos(pitch * rad), Math.sin(pitch * rad)];
  const [cy, sy] = [Math.cos(yaw * rad), Math.sin(yaw * rad)];
  const y = v.y * cx - v.z * sx;
  const z = v.y * sx + v.z * cx;
  return { x: v.x * cy + z * sy, y, z: -v.x * sy + z * cy };
}

/** The camera's distance from the plane in focus, per unit u. */
export const PERSPECTIVE = 1500;
/** How far a hold pushes in, per unit u. */
const HOLD_PUSH = 190;
/** How much bigger a held card is drawn by the end of its hold: cards must fit the frame at this size. */
export const HOLD_ZOOM = PERSPECTIVE / (PERSPECTIVE - HOLD_PUSH);

/**
 * Where a hold has taken the camera from its station, `hold` from 0 to 1: a
 * slow push in, a little lift and a sway that eases in, all along the
 * camera's own axes. Pushed down the room's z instead, a turned or tilted
 * station would slide its card off center as the camera closes in.
 */
function push(hold: number, u: number, at: { yaw: number; pitch: number }): Vec {
  const sway = Math.sin(hold * Math.PI) * 30 * u * Math.min(1, hold * 4);
  return toRoom({ x: sway, y: -hold * 12 * u, z: -hold * HOLD_PUSH * u }, at.yaw, at.pitch);
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
    const drift = push(hold, u, target);
    // A move starts where the last hold ended.
    const prev =
      i === 0
        ? { x: target.x + 90 * u, y: target.y + 70 * u, z: target.z + 1100 * u, yaw: -6, pitch: -3 }
        : (() => {
            const p = rest(st[i - 1]);
            const end = push(1, u, p);
            return { ...p, x: p.x + end.x, y: p.y + end.y, z: p.z + end.z };
          })();
    const k = whip(interpolate(f, [from, to], [0, 1], clamp));
    const arc = Math.sin(k * Math.PI);
    const dx = target.x - prev.x;
    return {
      x: prev.x + (target.x - prev.x) * k + drift.x,
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

/**
 * Projects a room point to the screen the way the CSS camera does:
 * translate by -camera, rotateY(-yaw), rotateX(-pitch), rotateZ(roll), then
 * perspective onto the plane at z = 0 seen from z = perspective.
 */
export type Projector = ReturnType<typeof projector>;

export function projector(cam: Camera, width: number, height: number, perspective: number) {
  const rad = Math.PI / 180;
  const [cy, sy] = [Math.cos(-cam.yaw * rad), Math.sin(-cam.yaw * rad)];
  const [cx, sx] = [Math.cos(-cam.pitch * rad), Math.sin(-cam.pitch * rad)];
  const [cz, sz] = [Math.cos(cam.roll * rad), Math.sin(cam.roll * rad)];
  return (x: number, y: number, z: number) => {
    let px = x - cam.x;
    let py = y - cam.y;
    let pz = z - cam.z;
    [px, pz] = [px * cy + pz * sy, -px * sy + pz * cy];
    [py, pz] = [py * cx - pz * sx, py * sx + pz * cx];
    [px, py] = [px * cz - py * sz, px * sz + py * cz];
    const k = perspective / (perspective - pz);
    return { x: px, y: py, z: pz, k, sx: width / 2 + px * k, sy: height / 2 + py * k };
  };
}

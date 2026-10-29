/* eslint-disable */
// @ts-nocheck
// Ported from the aiTrends 2D Studio engine (kit v0.1.0, engine/rig2d.js), kept as close to the original
// as the move allows: it draws into a Canvas 2D context, frame by frame, and runs inside a Remotion
// <canvas> (kit/studio2d/Studio2D.tsx plays the shots, grades and letterboxes the frame like its player).
// engine/rig2d.js — the stick-figure character rig (2D canvas).
// Local space: feet on y=0, up is -y, the figure faces +x. Base height ≈ 240 units (s = 1).
// Points: head, sh (neck/shoulder), hip, eF/hF = near elbow/hand, eB/hB = far elbow/hand,
//         kF/fF = near knee/foot, kB/fB = far knee/foot.
import { E, S, clamp, lerp, mixVal, seg, circle, ring, alpha, shade, mix, rr, poly, ease } from './core';

const P = (o) => o;
export const POSES = {
  stand:      P({ head: [3, -208], sh: [0, -174], hip: [0, -100], eF: [9, -137], hF: [13, -101], eB: [-7, -136], hB: [-9, -100], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  relaxed:    P({ head: [4, -207], sh: [1, -173], hip: [0, -100], eF: [12, -138], hF: [20, -106], eB: [-8, -137], hB: [-14, -104], kF: [8, -50], fF: [10, 0], kB: [-4, -50], fB: [-12, 0] }),
  talk:       P({ head: [5, -208], sh: [1, -174], hip: [0, -100], eF: [22, -132], hF: [42, -146], eB: [-7, -136], hB: [-9, -100], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  explain:    P({ head: [5, -208], sh: [1, -174], hip: [0, -100], eF: [24, -136], hF: [46, -156], eB: [16, -134], hB: [34, -148], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  point:      P({ head: [5, -208], sh: [1, -174], hip: [0, -100], eF: [34, -170], hF: [68, -172], eB: [-7, -136], hB: [-9, -100], kF: [6, -50], fF: [6, 0], kB: [-6, -50], fB: [-12, 0] }),
  pointUp:    P({ head: [4, -209], sh: [1, -174], hip: [0, -100], eF: [18, -206], hF: [22, -246], eB: [-7, -136], hB: [-9, -100], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  wave:       P({ head: [4, -209], sh: [1, -174], hip: [0, -100], eF: [28, -196], hF: [36, -236], eB: [-7, -136], hB: [-9, -100], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  cheer:      P({ head: [3, -212], sh: [0, -176], hip: [0, -100], eF: [22, -206], hF: [36, -246], eB: [-20, -206], hB: [-32, -246], kF: [10, -50], fF: [16, 0], kB: [-10, -50], fB: [-16, 0] }),
  handsOnHead:P({ head: [3, -208], sh: [0, -174], hip: [0, -100], eF: [32, -196], hF: [12, -230], eB: [-28, -196], hB: [-8, -232], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  crossArms:  P({ head: [2, -208], sh: [0, -174], hip: [0, -100], eF: [16, -142], hF: [-8, -150], eB: [10, -144], hB: [14, -152], kF: [6, -50], fF: [6, 0], kB: [-6, -50], fB: [-12, 0] }),
  think:      P({ head: [6, -206], sh: [1, -173], hip: [0, -100], eF: [24, -148], hF: [16, -192], eB: [16, -134], hB: [6, -140], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  shrug:      P({ head: [3, -206], sh: [0, -172], hip: [0, -100], eF: [26, -156], hF: [40, -176], eB: [-24, -156], hB: [-38, -176], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  holdFront:  P({ head: [5, -207], sh: [1, -173], hip: [0, -100], eF: [22, -140], hF: [36, -152], eB: [16, -142], hB: [30, -154], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  phone:      P({ head: [6, -204], sh: [1, -172], hip: [0, -100], eF: [20, -138], hF: [28, -166], eB: [-7, -136], hB: [-9, -100], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  reach:      P({ head: [8, -206], sh: [4, -172], hip: [0, -100], eF: [34, -186], hF: [62, -204], eB: [-6, -136], hB: [-10, -102], kF: [10, -50], fF: [12, 0], kB: [-6, -50], fB: [-18, 0] }),
  sad:        P({ head: [12, -192], sh: [6, -166], hip: [0, -100], eF: [10, -132], hF: [12, -98], eB: [-2, -132], hB: [-2, -98], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  facepalm:   P({ head: [8, -200], sh: [2, -170], hip: [0, -100], eF: [28, -160], hF: [26, -200], eB: [-7, -136], hB: [-9, -100], kF: [6, -50], fF: [3, 0], kB: [-6, -50], fB: [-11, 0] }),
  ready:      P({ head: [12, -182], sh: [6, -148], hip: [0, -80], eF: [34, -132], hF: [56, -146], eB: [-26, -132], hB: [-46, -146], kF: [26, -44], fF: [22, 0], kB: [-24, -44], fB: [-24, 0] }),
  crouch:     P({ head: [16, -150], sh: [8, -118], hip: [0, -58], eF: [28, -88], hF: [38, -60], eB: [18, -86], hB: [26, -58], kF: [34, -54], fF: [20, 0], kB: [20, -50], fB: [-8, 0] }),
  sit:        P({ head: [4, -180], sh: [1, -146], hip: [0, -72], eF: [16, -110], hF: [38, -84], eB: [10, -110], hB: [30, -84], kF: [44, -74], fF: [46, 0], kB: [40, -72], fB: [38, 0] }),
  sitBack:    P({ head: [-8, -176], sh: [-6, -144], hip: [0, -72], eF: [2, -108], hF: [26, -86], eB: [-14, -110], hB: [-24, -80], kF: [44, -78], fF: [54, -2], kB: [40, -76], fB: [44, 0] }),
  kneel:      P({ head: [10, -168], sh: [5, -134], hip: [0, -62], eF: [24, -100], hF: [38, -76], eB: [-4, -100], hB: [-6, -66], kF: [36, -46], fF: [36, 0], kB: [-6, -4], fB: [-48, 0] }),
  lie:        P({ head: [3, -208], sh: [0, -174], hip: [0, -100], eF: [14, -136], hF: [18, -100], eB: [-12, -138], hB: [-20, -104], kF: [4, -50], fF: [2, 0], kB: [-4, -50], fB: [-6, 0] }), // use with rot: ±Math.PI/2
  dive:       P({ head: [4, -212], sh: [0, -176], hip: [0, -100], eF: [8, -218], hF: [12, -256], eB: [-6, -218], hB: [-4, -254], kF: [8, -52], fF: [10, -2], kB: [-6, -54], fB: [-14, -8] }), // with rot
  kick:       P({ head: [-4, -206], sh: [-6, -172], hip: [0, -100], eF: [8, -140], hF: [24, -124], eB: [-24, -140], hB: [-42, -128], kF: [36, -78], fF: [66, -70], kB: [-4, -50], fB: [-8, 0] }),
  jump:       P({ head: [4, -232], sh: [1, -198], hip: [0, -124], eF: [24, -226], hF: [32, -266], eB: [-18, -226], hB: [-26, -266], kF: [16, -82], fF: [6, -48], kB: [-12, -84], fB: [-22, -50] }),
  fall:       P({ head: [-10, -196], sh: [-8, -164], hip: [0, -100], eF: [24, -196], hF: [44, -222], eB: [-34, -186], hB: [-58, -204], kF: [24, -58], fF: [44, -28], kB: [-10, -54], fB: [-6, -8] }),
};

// ---------- pose helpers ----------
export const pose = (name) => POSES[name] || POSES.stand;
export const blendPose = (a, b, k) => mixVal(typeof a === 'string' ? pose(a) : a, typeof b === 'string' ? pose(b) : b, ease.inOut(k));
// posesAt(t, [[0,'stand'],[1.2,'talk'],[3,'point']], 0.35) -> holds each pose, blends over `blend` s
export function posesAt(t, keys, blend = 0.35) {
  let cur = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [ti, pi] = keys[i];
    if (t < ti) break;
    const k = clamp((t - ti) / blend); cur = k >= 1 ? pi : blendPose(cur, pi, k);
    if (k < 1) return cur;
  }
  return typeof cur === 'string' ? pose(cur) : cur;
}
// small idle life: breathing + sway, applied on top of any pose
export function breathe(p, t, amt = 1, seed = 0) {
  const b = Math.sin(t * 2.1 + seed) * 1.6 * amt, s = Math.sin(t * 0.9 + seed * 2) * 1.2 * amt;
  const q = { ...p }; for (const k of ['head', 'sh', 'eF', 'hF', 'eB', 'hB']) q[k] = [p[k][0] + s * (k === 'head' ? 1.2 : 0.6), p[k][1] + b]; return q;
}
function ik(a, b, L1, L2, dir = 1) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; let d = Math.hypot(dx, dy); d = Math.min(d, L1 + L2 - 0.01);
  const ang = Math.atan2(dy, dx) - dir * Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  return [a[0] + Math.cos(ang) * L1, a[1] + Math.sin(ang) * L1];
}
// walk / run cycles. phase advances ~ 2π per step pair: phase = t * speed * 2π
export function walkPose(phase, o = {}) {
  const { stride = 26, lift = 12, bob = 3, arm = 16, lean = 2, run = false } = o;
  const st = run ? 46 : stride, li = run ? 34 : lift, bb = run ? 7 : bob, ar = run ? 30 : arm, le = run ? 14 : lean;
  const hipY = -100 + (run ? 6 : 0) - bb * (1 - Math.abs(Math.sin(phase))) + bb * 0.5;
  const hip = [0, hipY], sh = [le, hipY - 74], head = [le + 4, hipY - 108];
  const foot = (ph) => [st * Math.sin(ph), -li * Math.max(0, Math.cos(ph))];
  const fF = foot(phase), fB = foot(phase + Math.PI);
  const kF = ik(hip, fF, 52, 52, 1), kB = ik(hip, fB, 52, 52, 1);
  const hand = (ph) => run ? [le + ar * Math.sin(ph) * 0.9 + 6, hipY - 46 - Math.cos(ph) * 10] : [le * 0.5 - ar * Math.sin(ph) + 4, hipY - 2];
  const hF = hand(phase + Math.PI), hB = hand(phase);
  const elbow = (h) => run ? [lerp(sh[0], h[0], 0.5) - 14, lerp(sh[1], h[1], 0.5) + 6] : [lerp(sh[0], h[0], 0.5) - 3, sh[1] + 38];
  return { head, sh, hip, eF: elbow(hF), hF, eB: elbow(hB), hB, kF, fF, kB, fB };
}

// ---------- faces ----------
export const EXPR = {
  neutral: { eyes: 'dot', brows: null, mouth: 'smallSmile' }, happy: { eyes: 'happy', brows: null, mouth: 'grin' }, joy: { eyes: 'happy', brows: 'raised', mouth: 'grin' },
  smile: { eyes: 'dot', brows: null, mouth: 'smile' }, surprised: { eyes: 'ring', brows: 'raised', mouth: 'o' }, shocked: { eyes: 'wide', brows: 'raised', mouth: 'oBig' },
  scared: { eyes: 'ring', brows: 'worried', mouth: 'wavy' }, worried: { eyes: 'dot', brows: 'worried', mouth: 'wavy' }, nervous: { eyes: 'dot', brows: 'worried', mouth: 'flat', sweat: true },
  angry: { eyes: 'dot', brows: 'angry', mouth: 'flat' }, determined: { eyes: 'dot', brows: 'angry', mouth: 'smallFlat' }, sad: { eyes: 'dot', brows: 'worried', mouth: 'frown' },
  cry: { eyes: 'closed', brows: 'worried', mouth: 'frown', tears: true }, smirk: { eyes: 'dot', brows: null, mouth: 'smirk' }, sleepy: { eyes: 'closed', brows: null, mouth: 'flat' },
  thinking: { eyes: 'dot', brows: 'raised', mouth: 'smallFlat', look: [0.5, -0.6] }, confused: { eyes: 'dot', brows: 'confused', mouth: 'wavy' }, awe: { eyes: 'wide', brows: 'raised', mouth: 'o' },
};
// face(g, headX, headY, r, {expr, talk, blink, look:[x,y], front, color, facing})  — also used for giant close-ups
export function face(g, hx, hy, r, o = {}) {
  const ex = { ...(EXPR[o.expr] || EXPR.neutral), ...(o.override || {}) };
  const col = o.color || S().feature, ink = S().ink;
  const fx = hx + (o.front ? 0 : r * 0.34), fy = hy - r * 0.08;
  const look = o.look || ex.look || [0, 0];
  const eyeX = o.front ? [fx - r * 0.34, fx + r * 0.34] : [fx - r * 0.26, fx + r * 0.32];
  const ey = fy - r * 0.08;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  eyeX.forEach((x, i) => {
    const s = o.front ? 1 : i === 0 ? 0.88 : 1;
    if (o.blink || ex.eyes === 'closed') { seg(g, [[x - r * 0.12 * s, ey], [x + r * 0.12 * s, ey]], r * 0.08, col); return; }
    switch (ex.eyes) {
      case 'happy': g.strokeStyle = col; g.lineWidth = r * 0.09; g.beginPath(); g.arc(x, ey + r * 0.05, r * 0.13 * s, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); break;
      case 'ring': ring(g, x, ey, r * 0.2 * s, r * 0.085, col); circle(g, x + look[0] * r * 0.06, ey + look[1] * r * 0.06, r * 0.075 * s, col); break;
      case 'wide': circle(g, x, ey, r * 0.2 * s, col); circle(g, x + look[0] * r * 0.08, ey + look[1] * r * 0.08, r * 0.085 * s, ink); break;
      default: circle(g, x + look[0] * r * 0.05, ey + look[1] * r * 0.05, r * 0.125 * s, col);
    }
  });
  const by = ey - r * 0.3, bw = r * 0.15;
  const brow = (x, a) => seg(g, [[x - bw, by + a], [x + bw, by - a]], r * 0.075, col);
  if (ex.brows === 'worried') { brow(eyeX[0], -r * 0.06); brow(eyeX[1], r * 0.06); }
  if (ex.brows === 'angry') { brow(eyeX[0], r * 0.08); brow(eyeX[1], -r * 0.08); }
  if (ex.brows === 'raised') eyeX.forEach(x => { g.strokeStyle = col; g.lineWidth = r * 0.07; g.beginPath(); g.arc(x, by + r * 0.12, r * 0.15, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); });
  if (ex.brows === 'confused') { brow(eyeX[0], r * 0.07); g.strokeStyle = col; g.lineWidth = r * 0.07; g.beginPath(); g.arc(eyeX[1], by + r * 0.08, r * 0.15, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); }
  const mx = fx + (o.front ? 0 : r * 0.04), my = fy + r * 0.42;
  const talk = o.talk || 0;
  if (talk > 0.05) { g.fillStyle = col; g.beginPath(); g.ellipse(mx, my, r * 0.16, r * (0.05 + 0.2 * talk), 0, 0, Math.PI * 2); g.fill(); }
  else switch (ex.mouth) {
    case 'grin': g.fillStyle = col; g.beginPath(); g.moveTo(mx - r * 0.3, my - r * 0.06); g.quadraticCurveTo(mx, my + r * 0.42, mx + r * 0.3, my - r * 0.06); g.closePath(); g.fill(); break;
    case 'smile': g.strokeStyle = col; g.lineWidth = r * 0.09; g.beginPath(); g.arc(mx, my - r * 0.2, r * 0.27, 0.35, Math.PI - 0.35); g.stroke(); break;
    case 'smallSmile': g.strokeStyle = col; g.lineWidth = r * 0.085; g.beginPath(); g.arc(mx, my - r * 0.14, r * 0.18, 0.4, Math.PI - 0.4); g.stroke(); break;
    case 'o': g.fillStyle = col; g.beginPath(); g.ellipse(mx, my, r * 0.11, r * 0.15, 0, 0, Math.PI * 2); g.fill(); break;
    case 'oBig': ring(g, mx, my + r * 0.04, r * 0.15, r * 0.08, col); break;
    case 'flat': seg(g, [[mx - r * 0.2, my], [mx + r * 0.2, my]], r * 0.085, col); break;
    case 'smallFlat': seg(g, [[mx - r * 0.12, my], [mx + r * 0.12, my]], r * 0.085, col); break;
    case 'frown': g.strokeStyle = col; g.lineWidth = r * 0.085; g.beginPath(); g.arc(mx, my + r * 0.2, r * 0.2, Math.PI + 0.5, Math.PI * 2 - 0.5); g.stroke(); break;
    case 'smirk': g.strokeStyle = col; g.lineWidth = r * 0.085; g.beginPath(); g.moveTo(mx - r * 0.16, my); g.quadraticCurveTo(mx + r * 0.05, my + r * 0.06, mx + r * 0.22, my - r * 0.1); g.stroke(); break;
    case 'wavy': { g.strokeStyle = col; g.lineWidth = r * 0.085; g.beginPath(); for (let i = 0; i <= 16; i++) { const u = i / 16; const x = mx - r * 0.24 + u * r * 0.48, y = my + Math.sin(u * Math.PI * 2) * r * 0.06; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); break; }
  }
  if (ex.tears) { g.fillStyle = '#8fd0ff'; for (const x of eyeX) { g.beginPath(); g.ellipse(x, ey + r * 0.3, r * 0.05, r * 0.1, 0, 0, Math.PI * 2); g.fill(); } }
  if (ex.sweat) { g.fillStyle = '#9fd8ff'; g.beginPath(); g.ellipse(hx - r * 0.6, hy - r * 0.45, r * 0.08, r * 0.13, 0, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

// ---------- outfits ----------
// outfit = { top: 'hoodie'|'labcoat'|'trench'|'jersey'|'tshirt'|'suit'|'dress'|'tracksuit'|'none', color, color2,
//            legs: colour (trousers) | null, head: 'cap'|'capBack'|'beanie'|'fedora'|'headband'|'visor'|'hood'|'ponytail'|'bun'|'curly'|'spiky'|'none',
//            headColor, face: 'glasses'|'sunglasses'|null, gloves: colour|null, number: '1', kid: bool }
function drawHeadwear(g, o, hx, hy, r, pass) {
  const c = o.headColor || '#f2c21a', dark = shade(c, -0.25), hi = shade(c, 0.35);
  const sil = pass === 'sil';
  const fill = (col) => (sil ? o._sil : col);
  switch (o.head) {
    case 'cap': case 'capBack': {
      const back = o.head === 'capBack' ? -1 : 1;
      g.fillStyle = fill(c); g.beginPath(); g.ellipse(hx - 1, hy - r * 0.32, r * 1.04, r * 0.82, 0, Math.PI, Math.PI * 2); g.fill();
      seg(g, [[hx + back * r * 0.25, hy - r * 0.34], [hx + back * r * 1.55, hy - r * 0.26]], r * 0.26, fill(dark));
      if (!sil) { g.strokeStyle = alpha(hi, 0.8); g.lineWidth = r * 0.08; g.beginPath(); g.ellipse(hx - r * 0.1, hy - r * 0.5, r * 0.6, r * 0.42, 0, Math.PI * 1.15, Math.PI * 1.55); g.stroke(); }
      break; }
    case 'visor': seg(g, [[hx - r * 0.95, hy - r * 0.42], [hx + r * 0.9, hy - r * 0.42]], r * 0.22, fill(c)); seg(g, [[hx + r * 0.3, hy - r * 0.4], [hx + r * 1.5, hy - r * 0.3]], r * 0.22, fill(dark)); break;
    case 'beanie': {
      g.fillStyle = fill(c); g.beginPath(); g.ellipse(hx - 1, hy - r * 0.18, r * 1.06, r * 1.0, 0, Math.PI, Math.PI * 2); g.fill();
      rr(g, hx - r * 1.08, hy - r * 0.34, r * 2.16, r * 0.34, r * 0.14); g.fillStyle = fill(dark); g.fill();
      circle(g, hx - r * 0.1, hy - r * 1.2, r * 0.3, fill(hi)); break; }
    case 'fedora': {
      g.fillStyle = fill(c); g.beginPath(); g.ellipse(hx, hy - r * 0.55, r * 1.8, r * 0.3, 0, 0, Math.PI * 2); g.fill();
      rr(g, hx - r * 0.78, hy - r * 1.45, r * 1.56, r * 0.95, r * 0.25); g.fill();
      if (!sil) { g.fillStyle = dark; g.fillRect(hx - r * 0.78, hy - r * 0.78, r * 1.56, r * 0.2); g.strokeStyle = alpha(hi, 0.6); g.lineWidth = r * 0.06; g.beginPath(); g.ellipse(hx, hy - r * 0.55, r * 1.8, r * 0.3, 0, Math.PI * 1.05, Math.PI * 1.6); g.stroke(); }
      break; }
    case 'headband': {
      g.save(); g.beginPath(); g.arc(hx, hy, r * 1.04, 0, Math.PI * 2); g.clip(); g.fillStyle = fill(c); g.fillRect(hx - r * 1.2, hy - r * 0.62, r * 2.4, r * 0.3); g.restore();
      seg(g, [[hx - r * 0.95, hy - r * 0.48], [hx - r * 1.5, hy - r * 0.2], [hx - r * 1.7, hy + r * 0.1]], r * 0.16, fill(c)); break; }
    case 'ponytail': { g.strokeStyle = fill(o._ink); g.lineWidth = r * 0.42; g.lineCap = 'round'; g.beginPath(); g.moveTo(hx - r * 0.7, hy - r * 0.55); g.quadraticCurveTo(hx - r * 1.7, hy - r * 0.4, hx - r * 1.45, hy + r * 0.75); g.stroke();
      if (o.headColor && !sil) seg(g, [[hx - r * 0.9, hy - r * 0.75], [hx - r * 0.8, hy - r * 0.35]], r * 0.22, o.headColor); break; }
    case 'bun': circle(g, hx - r * 0.55, hy - r * 0.95, r * 0.45, fill(o._ink)); break;
    case 'curly': for (let i = 0; i < 7; i++) { const a = Math.PI * (1.05 + i * 0.13); circle(g, hx + Math.cos(a) * r * 0.92, hy + Math.sin(a) * r * 0.92, r * 0.34, fill(o._ink)); } break;
    case 'spiky': g.fillStyle = fill(o._ink); g.beginPath(); for (let i = 0; i <= 6; i++) { const a = Math.PI * (1.05 + i * 0.15); const rr2 = i % 2 ? r * 1.45 : r * 0.95; g.lineTo(hx + Math.cos(a) * rr2, hy + Math.sin(a) * rr2); } g.closePath(); g.fill(); break;
  }
}
function torsoWear(g, o, p, pass) {
  const sil = pass === 'sil', c = sil ? o._sil : o.color || '#d64a33', d = sil ? o._sil : shade(o.color || '#d64a33', -0.22);
  const [sx, sy] = p.sh, [hx, hy] = p.hip;
  switch (o.top) {
    case 'hoodie': case 'tracksuit': case 'jersey': case 'tshirt': case 'suit': case 'dress': {
      const col = o.top === 'suit' ? (sil ? o._sil : o.color || '#2a2833') : c;
      const top = sy - 7, bot = hy + (o.top === 'jersey' || o.top === 'tshirt' ? 4 : 12);
      g.fillStyle = col; g.beginPath(); g.moveTo(sx - 15, top + 6); g.quadraticCurveTo(sx, top - 4, sx + 15, top + 6); g.lineTo(hx + 15, bot); g.lineTo(hx - 15, bot); g.closePath(); g.fill();
      if (o.top === 'dress') poly(g, [[hx - 14, hy - 8], [hx + 14, hy - 8], [hx + 34, hy + 50], [hx - 34, hy + 50]], col);
      if (!sil && o.top === 'hoodie') { g.fillStyle = d; g.fillRect(hx - 15, bot - 7, 30, 7); seg(g, [[sx + 6, sy - 2], [sx + 7, sy + 18]], 2, shade(c, 0.4)); }
      if (!sil && o.top === 'suit') { poly(g, [[sx - 1, sy - 4], [sx + 4, sy - 4], [sx + 5, sy + 40], [sx + 1, sy + 46]], o.color2 || '#c0392b'); }
      if (!sil && o.top === 'jersey' && o.number) { g.fillStyle = o.color2 || '#fff'; g.font = '700 24px Nunito'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.number, (sx + hx) / 2 + 2, (sy + hy) / 2); }
      if (!sil && o.top === 'tracksuit') seg(g, [[sx + 12, sy + 2], [hx + 12, hy]], 3, o.color2 || '#ffffff');
      break; }
    case 'labcoat': case 'trench': {
      const col = sil ? o._sil : o.top === 'labcoat' ? '#ebe7f0' : o.color || '#2c2833';
      g.fillStyle = col; g.beginPath(); g.moveTo(sx - 15, sy - 5); g.lineTo(sx + 15, sy - 5); g.lineTo(hx + 25, hy + 44); g.lineTo(hx - 23, hy + 44); g.closePath(); g.fill();
      if (!sil) { seg(g, [[sx + 3, sy], [hx + 4, hy + 42]], 2, o.top === 'labcoat' ? '#a9a2b5' : shade(col, 0.25)); seg(g, [[sx - 6, sy - 3], [sx + 2, sy + 22], [sx + 10, sy - 3]], 2.2, o.top === 'labcoat' ? '#c9c2d4' : shade(col, 0.3));
        if (o.top === 'trench') g.fillStyle = shade(col, -0.3), g.fillRect(hx - 18, hy - 6, 38, 6); }
      break; }
  }
}
function sleeve(o) { if (['hoodie', 'tracksuit', 'labcoat', 'trench', 'suit'].includes(o.top)) return 'long'; if (['jersey', 'tshirt'].includes(o.top)) return 'short'; return null; }
function sleeveColor(o, far) { const c = o.top === 'labcoat' ? '#f3f0f6' : o.top === 'trench' ? o.color || '#2c2833' : o.top === 'suit' ? o.color || '#2a2833' : o.color || '#d64a33'; return far ? shade(c, -0.3) : c; }

// ---------- main draw ----------
// drawFigure(g, { x, y, s, facing, pose, rot, outfit, expr, talk, blink, look, rim:{dir:[x,y], color, w}, dim, alpha, prop, shadow })
export function drawFigure(g, o) {
  const st = S(), ink = o.ink || st.ink, far = o.inkFar || st.inkFar;
  const p = o.pose || POSES.stand, s = (o.s ?? 1) * (o.outfit?.kid ? 0.72 : 1), f = o.facing ?? 1;
  const of = { ...(o.outfit || {}), _ink: ink };
  const rim = o.rim === false ? null : { dir: [-0.8, -0.5], w: st.rimWidth, color: '#ffc68a', ...(o.rim || {}) };
  g.save(); if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (o.shadow !== false && !o.rot) { g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(o.x, o.y + 2, 34 * s, 6 * s, 0, 0, Math.PI * 2); g.fill(); }
  if (o.trail) { const { count = 4, dx = -40, dy = 0, a = 0.22 } = o.trail; for (let i = count; i >= 1; i--) { g.save(); g.globalAlpha *= a * (1 - i / (count + 1)); body(g, { ...o, x: o.x + dx * i, y: o.y + dy * i, trail: null }, p, s, f, of, ink, far, null, alpha(rim?.color || '#fff', 1)); g.restore(); } }
  body(g, o, p, s, f, of, ink, far, rim);
  g.restore();
}
function body(g, o, p, s, f, of, ink, far, rim, flat) {
  const tf = (dx = 0, dy = 0) => { g.translate(o.x + dx, o.y + dy); g.scale(f * s, s); if (o.rot) { g.translate(p.hip[0], p.hip[1]); g.rotate(o.rot); g.translate(-p.hip[0], -p.hip[1]); } };
  if (flat) { g.save(); tf(); parts(g, o, p, { ...of, _sil: flat }, flat, flat, 'sil'); g.restore(); return; }
  if (rim) { g.save(); tf(rim.dir[0] * rim.w, rim.dir[1] * rim.w); parts(g, o, p, { ...of, _sil: rim.color }, rim.color, rim.color, 'sil', 1.6); g.restore(); }
  g.save(); tf(); parts(g, o, p, of, o.dim ? mix(ink, far, 0.6) : ink, far, 'main'); g.restore();
}
function parts(g, o, p, of, ink, far, pass, grow = 0) {
  const sil = pass === 'sil', L = 12.5 + grow, A = 11 + grow, T = 15 + grow, HR = 26 + grow * 0.6;
  const sl = sleeve(of);
  // far leg + far arm
  seg(g, [p.hip, p.kB, p.fB, [p.fB[0] + 12, p.fB[1]]], L - 1, sil ? ink : of.legs ? shade(of.legs, -0.35) : far);
  seg(g, [p.sh, p.eB, p.hB], A - 1, sil ? ink : far);
  if (!sil && sl) seg(g, sl === 'long' ? [p.sh, p.eB, [lerp(p.eB[0], p.hB[0], 0.7), lerp(p.eB[1], p.hB[1], 0.7)]] : [p.sh, [lerp(p.sh[0], p.eB[0], 0.75), lerp(p.sh[1], p.eB[1], 0.75)]], 16, sleeveColor(of, true));
  if (of.gloves) circle(g, p.hB[0], p.hB[1], 8.5 + grow, sil ? ink : shade(of.gloves, -0.2));
  // hair / hood behind head
  if (of.top === 'hoodie' && of.head !== 'hood') { g.fillStyle = sil ? ink : shade(of.color || '#d64a33', -0.28); g.beginPath(); g.ellipse(p.sh[0] - 9, p.sh[1] - 6, 15 + grow, 11 + grow, -0.3, 0, Math.PI * 2); g.fill(); }
  if (of.head === 'hood') { const c = of.headColor || of.color || '#d64a33'; circle(g, p.head[0] - 6, p.head[1] + 2, HR * 1.22, sil ? ink : shade(c, -0.12)); }
  if (['ponytail', 'bun'].includes(of.head)) drawHeadwear(g, of, p.head[0], p.head[1], HR, pass);
  // torso
  seg(g, [p.sh, p.hip], T, ink);
  if (of.top && of.top !== 'none') torsoWear(g, of, p, pass);
  // near leg
  seg(g, [p.hip, p.kF, p.fF, [p.fF[0] + 13, p.fF[1]]], L, sil ? ink : of.legs || ink);
  if (!sil && ['labcoat', 'trench'].includes(of.top)) { const c = of.top === 'labcoat' ? '#ebe7f0' : of.color || '#2c2833'; poly(g, [[p.sh[0] - 4, p.sh[1] + 40], [p.hip[0] + 25, p.hip[1] + 44], [p.hip[0] - 23, p.hip[1] + 44]], c); }
  // near arm
  seg(g, [p.sh, p.eF, p.hF], A, ink);
  if (!sil && sl) seg(g, sl === 'long' ? [p.sh, p.eF, [lerp(p.eF[0], p.hF[0], 0.72), lerp(p.eF[1], p.hF[1], 0.72)]] : [p.sh, [lerp(p.sh[0], p.eF[0], 0.75), lerp(p.sh[1], p.eF[1], 0.75)]], 16.5, sleeveColor(of, false));
  if (of.gloves) circle(g, p.hF[0], p.hF[1], 9 + grow, sil ? ink : of.gloves);
  // head
  circle(g, p.head[0], p.head[1], HR, ink);
  if (!['ponytail', 'bun', 'hood', 'none', undefined].includes(of.head)) drawHeadwear(g, of, p.head[0], p.head[1], HR, pass);
  if (sil) return;
  face(g, p.head[0], p.head[1], HR, { expr: o.expr, talk: o.talk, blink: o.blink, look: o.look, override: o.face });
  if (of.face === 'glasses') { const c = S().feature; g.strokeStyle = c; g.lineWidth = 2.4; for (const dx of [-6.5, 10]) { g.beginPath(); g.arc(p.head[0] + 9 + dx, p.head[1] - 4, 7, 0, Math.PI * 2); g.stroke(); } seg(g, [[p.head[0] + 9.5, p.head[1] - 4], [p.head[0] + 12.5, p.head[1] - 4]], 2, c); }
  if (of.face === 'sunglasses') { g.fillStyle = '#05060a'; rr(g, p.head[0] - 1, p.head[1] - 10, 16, 11, 4); g.fill(); rr(g, p.head[0] + 17, p.head[1] - 10, 15, 11, 4); g.fill(); seg(g, [[p.head[0] - 4, p.head[1] - 7], [p.head[0] + 33, p.head[1] - 7]], 2.5, '#05060a'); g.fillStyle = '#9fe8ff'; g.fillRect(p.head[0] + 2, p.head[1] - 8, 4, 2); g.fillRect(p.head[0] + 20, p.head[1] - 8, 4, 2); }
  if (of.head === 'hood') { g.strokeStyle = shade(of.headColor || of.color || '#d64a33', 0.15); g.lineWidth = 5; g.beginPath(); g.arc(p.head[0] - 6, p.head[1] + 2, HR * 1.18, Math.PI * 0.9, Math.PI * 1.75); g.stroke(); }
  if (o.prop) drawProp(g, o.prop, p, ink);
}
export function soccerBall(g, x, y, r, rot = 0, light = '#f2efe8') {
  g.save(); g.translate(x, y); g.rotate(rot); circle(g, 0, 0, r, light);
  g.fillStyle = '#16131c'; const pent = (cx, cy, rr2) => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); } g.closePath(); g.fill(); };
  pent(0, 0, r * 0.32); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5 + Math.PI / 5; g.save(); g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip(); pent(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.28); g.restore(); }
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(r * 0.15, r * 0.15, r, 0, Math.PI * 2); g.arc(0, 0, r, 0, Math.PI * 2, true); g.fill(); g.restore();
}
function drawProp(g, prop, p, ink) {
  const t = typeof prop === 'string' ? { type: prop } : prop; const h = t.hand === 'B' ? p.hB : p.hF;
  switch (t.type) {
    case 'phone': rr(g, h[0] - 2, h[1] - 22, 14, 24, 3); g.fillStyle = ink; g.fill(); g.fillStyle = t.glow || '#9fd8ff'; g.fillRect(h[0], h[1] - 20, 10, 18); break;
    case 'ball': soccerBall(g, h[0] + 10, h[1] - 6, 14, t.rot || 0); break;
    case 'paper': g.fillStyle = '#f2e6c8'; g.fillRect(h[0] - 4, h[1] - 30, 30, 36); g.strokeStyle = '#b8a888'; g.lineWidth = 1.5; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(h[0], h[1] - 22 + i * 7); g.lineTo(h[0] + 20, h[1] - 22 + i * 7); g.stroke(); } break;
    case 'cup': g.fillStyle = '#f2efe8'; g.fillRect(h[0] - 2, h[1] - 18, 14, 18); seg(g, [[h[0] + 12, h[1] - 14], [h[0] + 17, h[1] - 9], [h[0] + 12, h[1] - 4]], 2.5, '#f2efe8'); break;
    case 'paddle': circle(g, h[0] + 12, h[1] - 6, 11, t.color || '#b2382a'); break;
    case 'pointer': seg(g, [h, [h[0] + 70, h[1] - 50]], 2.5, '#d8d0c0'); break;
    case 'tablet': rr(g, h[0] - 6, h[1] - 34, 40, 30, 4); g.fillStyle = ink; g.fill(); g.fillStyle = t.glow || '#7fd0d6'; g.fillRect(h[0] - 2, h[1] - 30, 32, 22); break;
    case 'flashlight': seg(g, [h, [h[0] + 14, h[1] - 4]], 6, '#3a3a44'); g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,240,200,.14)'; g.beginPath(); g.moveTo(h[0] + 14, h[1] - 4); g.lineTo(h[0] + 260, h[1] - 70); g.lineTo(h[0] + 260, h[1] + 60); g.closePath(); g.fill(); g.restore(); break;
  }
}
// world position of the head centre (for rings, labels, speech bubbles)
export function headPos(o) { const p = o.pose || POSES.stand, s = (o.s ?? 1) * (o.outfit?.kid ? 0.72 : 1), f = o.facing ?? 1; let [x, y] = p.head; if (o.rot) { const [hx, hy] = p.hip; const c = Math.cos(o.rot), sn = Math.sin(o.rot); [x, y] = [hx + (x - hx) * c - (y - hy) * sn, hy + (x - hx) * sn + (y - hy) * c]; } return [o.x + x * f * s, o.y + y * s, 26 * s]; }

// ---------- giant close-up head (fills the frame) ----------
// bigFace(g, cx, cy, r, { outfit, expr, talk, blink, look, rimColor, rimSide:-1|1, tilt })
export function bigFace(g, cx, cy, r, o = {}) {
  const st = S(), ink = st.ink, of = o.outfit || {}, rc = o.rimColor || '#ffc68a', side = o.rimSide ?? -1;
  g.save(); g.translate(cx, cy); if (o.tilt) g.rotate(o.tilt);
  // shoulders / clothing at the bottom
  const top = of.top || 'none', cc = top === 'labcoat' ? '#ebe7f0' : of.color || ink;
  g.fillStyle = top === 'none' ? ink : cc; g.beginPath(); g.ellipse(0, r * 1.65, r * 1.25, r * 0.85, 0, Math.PI, Math.PI * 2); g.fill();
  if (of.head === 'hood') { const hc = of.headColor || of.color || '#d64a33'; circle(g, side * -r * 0.04, r * 0.06, r * 1.2, shade(hc, -0.15)); g.strokeStyle = alpha(shade(hc, 0.4), 0.7); g.lineWidth = r * 0.05; g.beginPath(); g.arc(-r * 0.05, 0, r * 1.12, Math.PI * 1.1, Math.PI * 1.5); g.stroke(); }
  // rim crescent on the lit side
  g.save(); g.beginPath(); g.arc(0, 0, r + r * 0.06, 0, Math.PI * 2); g.arc(side * r * 0.07, r * 0.02, r, 0, Math.PI * 2, true); g.fillStyle = rc; g.fill('evenodd'); g.restore();
  circle(g, 0, 0, r, ink);
  if (of.head && !['hood', 'none'].includes(of.head)) drawHeadwear(g, { ...of, _ink: ink }, 0, 0, r, 'main');
  face(g, 0, 0, r, { expr: o.expr, talk: o.talk, blink: o.blink, look: o.look, front: true, override: o.face });
  if (of.face === 'glasses') { g.strokeStyle = st.feature; g.lineWidth = r * 0.06; for (const dx of [-0.34, 0.34]) { g.beginPath(); g.arc(dx * r, -r * 0.16, r * 0.26, 0, Math.PI * 2); g.stroke(); } }
  if (of.face === 'sunglasses') { g.fillStyle = '#05060a'; rr(g, -r * 0.66, -r * 0.34, r * 0.6, r * 0.4, r * 0.12); g.fill(); rr(g, r * 0.06, -r * 0.34, r * 0.6, r * 0.4, r * 0.12); g.fill(); g.fillStyle = 'rgba(160,230,255,.6)'; g.fillRect(-r * 0.55, -r * 0.28, r * 0.12, r * 0.05); }
  g.restore();
}

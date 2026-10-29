/* eslint-disable */
// @ts-nocheck
// Ported from the aiTrends 2D Studio reference project (reaction-time); only its imports changed.
import { s2, rig, fx2, ui2 } from '@kit';
import { registerShot } from './registry';
// shots/01_cafe.js — the café sequence: fly catch, the falling cup, the friend's reaction.
const { E, V, mood, layer, blurLayer, veil, ease, prog, key, clamp, lerp, shake, talkAmount, seg, circle, ring, rr, glow, alpha, shade, linGrad } = s2;
const { drawFigure, POSES, posesAt, breathe, bigFace, headPos } = rig;
const FX = fx2;
const UI = ui2;
import { cafe, cafeGround, cafeTable, cup } from './cafe';
import { MAX, JAKE } from './cast';

const S = () => V(1.6, 1.7);                       // figure scale for medium shots
const seats = () => ({ max: E.W / 2 - V(210, 190), jake: E.W / 2 + V(210, 190) });
function chairAt(g, x, GY, s, facing, color) { g.save(); g.translate(x, 0); g.scale(facing, 1); FX.chair(g, -18 * s, GY, s, color); g.restore(); }
function fly(g, x, y, t, s = 1) {
  for (let i = 1; i <= 6; i++) circle(g, x + i * 9 * s, y + Math.sin((t - i * 0.03) * 22) * 6 * s, 1.6 * s, 'rgba(20,16,24,.35)');
  circle(g, x, y, 5 * s, '#120e16');
  const wf = Math.abs(Math.sin(t * 90)); g.fillStyle = 'rgba(230,240,255,.55)';
  g.beginPath(); g.ellipse(x - 2 * s, y - 6 * s, 3 * s, 7 * s * wf + 1, -0.4, 0, 7); g.fill(); g.beginPath(); g.ellipse(x + 3 * s, y - 6 * s, 3 * s, 7 * s * wf + 1, 0.4, 0, 7); g.fill();
}
const flyPos = (t) => [E.W + 60 - t * V(760, 520), E.H * V(0.42, 0.5) + Math.sin(t * 5) * 30 + Math.sin(t * 13) * 8];

// two friends at the café table (shared by s001 / s004)
function tableScene(g, t, o) {
  const cam = { z: o.z ?? 1, x: o.x ?? 0, y: o.y ?? 0 };
  const { GY, M } = cafe(g, t, cam, { mood: 'golden' });
  const { max, jake } = seats(), s = S(), rim = { color: M.rim, dir: [0, -1], w: 4 };
  layer(g, cam, 1, (g) => {
    chairAt(g, max, GY, s, 1, '#24181e'); chairAt(g, jake, GY, s, -1, '#24181e');
    const tb = cafeTable(g, E.W / 2, GY);
    if (o.cupOnTable !== false) cup(g, E.W / 2 + 60, tb.top, 1.2);
    drawFigure(g, { x: max, y: GY, s, facing: 1, outfit: MAX, pose: breathe(o.maxPose || POSES.sit, t), expr: o.maxExpr || 'neutral', look: o.maxLook, rim, shadow: false });
    drawFigure(g, { x: jake, y: GY, s, facing: -1, outfit: JAKE, pose: breathe(o.jakePose || POSES.sit, t, 1, 2), expr: o.jakeExpr || 'neutral', prop: o.jakeProp, rim, shadow: false, blink: (t % 3.3) > 3.2 });
    o.extra?.(g, GY);
  });
  FX.dust(g, t, { count: 40, color: '#ffe2bd', a: 0.35 });
  FX.lensStreak(g, E.W / 2, E.H * 0.3, E.W * 1.2, '#ffe0b0', 0.18);
}

// s001 — "A fly buzzes past your face."  wide, slow push, eyes track the fly
registerShot('s001', { draw(g, t) {
  const f = flyPos(t * 1.05 + 0.2); const { max } = seats();
  const hp = [max + 3 * S(), cafeGround() - 180 * S()];
  const look = [clamp((f[0] - hp[0]) / 300, -1, 1), clamp((f[1] - hp[1]) / 300, -1, 1)];
  tableScene(g, t, { z: 1 + 0.08 * ease.inOut(t / 3.4), x: -40 * ease.inOut(t / 3.4), maxLook: look, maxExpr: t > 1.6 ? 'surprised' : 'neutral', jakePose: POSES.phone, jakeProp: 'phone',
    extra: (g) => fly(g, f[0], f[1], t, 1.4) });
} });

// s002 — "You don't even think."  giant face, focus
registerShot('s002', { draw(g, t, info) {
  blurLayer(g, 14, (g) => cafe(g, t, { z: 1.5, x: -150, y: -120 }, { mood: 'golden' })); veil(g, '#120a10', 0.35);
  const M = mood('golden'); const r = V(300, 330) * (1 + 0.05 * t);
  const fx = lerp(E.W * 0.9, E.W * 0.15, ease.inOut(prog(t, 0.1, 1.3)));
  bigFace(g, E.W / 2, E.H * V(0.6, 0.55), r, { outfit: MAX, expr: 'determined', look: [clamp((fx - E.W / 2) / 400, -1, 1), -0.2], rimColor: M.rim, rimSide: -1 });
  blurLayer(g, 6, (g) => fly(g, fx, E.H * 0.4, t, 4));
} });

// s003 — "You just catch it."  the snatch
function hand(g, x, y, s, closed, sleeve, rimC = '#ffc68a') {
  g.save(); g.translate(-5, -5); handShape(g, x, y, s, closed, rimC, rimC); g.restore(); handShape(g, x, y, s, closed, sleeve, '#0e0b12');
}
function handShape(g, x, y, s, closed, sleeve, ink) {
  seg(g, [[x + 40 * s, y + 20 * s], [E.W + 400, y + 260 * s]], 70 * s, ink);
  seg(g, [[x + 150 * s, y + 70 * s], [E.W + 400, y + 260 * s]], 96 * s, sleeve);
  if (closed) { circle(g, x, y, 46 * s, ink); for (let i = 0; i < 4; i++) circle(g, x - 34 * s + i * 4 * s, y - 30 * s + i * 20 * s, 15 * s, ink); }
  else { circle(g, x + 10 * s, y + 6 * s, 40 * s, ink); for (let i = 0; i < 4; i++) { const a = -2.2 + i * 0.32; seg(g, [[x, y], [x + Math.cos(a) * 95 * s, y + Math.sin(a) * 95 * s]], 17 * s, ink); } seg(g, [[x + 6 * s, y + 20 * s], [x - 60 * s, y + 60 * s]], 18 * s, ink); }
}
registerShot('s003', { draw(g, t) {
  const M = mood('golden');
  blurLayer(g, 16, (g) => cafe(g, t, { z: 1.8, x: 200, y: -60 }, { mood: 'golden' })); veil(g, '#120a10', 0.35);
  const snap = 0.5, closed = t > snap, k = ease.out(prog(t, 0, snap));
  const fxy = [E.W * 0.47 + Math.sin(t * 9) * 10, E.H * 0.45 + Math.sin(t * 15) * 8];
  const [sx, sy] = closed ? shake(t, 10 * (1 - prog(t, snap, snap + 0.5)), 30) : [0, 0];
  g.save(); g.translate(sx, sy);
  if (!closed) fly(g, fxy[0], fxy[1], t, 2.2);
  const hx = lerp(E.W * 0.95, fxy[0] + 20, k), hy = lerp(E.H * 0.75, fxy[1] + 10, k);
  hand(g, hx, hy, V(1.4, 1.2), closed, MAX.color);
  g.restore();
  if (closed) {
    FX.rings(g, fxy[0], fxy[1], t - snap, { count: 3, r0: 60, r1: 420, speed: 1.6, color: '#fff3e0', a: 0.6 * (1 - prog(t, snap, snap + 1.2)) });
    FX.speedLines(g, t, { cx: fxy[0], cy: fxy[1], count: 40, a: 0.35 * (1 - prog(t, snap, snap + 0.6)) });
    UI.readout(g, { label: 'REACTION:', value: '0.025 s', x: V(140, 90), y: E.H - V(170, 620), a: ease.out(prog(t, 0.9, 1.2)) });
  }
} });

// s004 — wide: Max holds up the fist, Jake stares
registerShot('s004', { draw(g, t) {
  const fist = { ...POSES.sit, eF: [24, -150], hF: [34, -188] };
  tableScene(g, t, { z: 1.04, x: -20, maxPose: posesAt(t, [[0, POSES.sit], [0.3, fist]]), maxExpr: 'smirk', jakePose: POSES.sitBack, jakeExpr: t > 0.6 ? 'shocked' : 'surprised' });
} });

// s005 — "Your friend knocks his coffee off the table."  close on the table top
registerShot('s005', { draw(g, t) {
  const GY = cafeGround(), tx = E.W / 2, top = GY - 162, cam = { z: V(2.0, 1.8), x: 20, y: top - E.H / 2 + 40 };
  cafe(g, t, cam, { mood: 'golden' });
  const { jake } = seats(), s = S();
  const elbow = key(t, [[0, 0], [0.8, 0], [1.05, 1], [1.6, 0.85]]);
  const push = ease.out(prog(t, 0.95, 2.0));
  const cx = lerp(tx + 60, tx - 175, push), fall = Math.max(0, t - 2.0);
  const cy = top + 0.5 * 260 * fall * fall, rot = -1.1 * ease.inOut(prog(t, 1.3, 3.1));
  layer(g, cam, 1, (g) => {
    chairAt(g, jake, GY, s, -1, '#24181e'); cafeTable(g, tx, GY);
    const jp = { ...POSES.sit, eF: [28 - elbow * 6, -112 - elbow * 18], hF: [50 + elbow * 10, -128 - elbow * 6] };
    drawFigure(g, { x: jake, y: GY, s, facing: -1, outfit: JAKE, pose: jp, expr: t > 1.2 ? 'scared' : 'happy', rim: { color: mood('golden').rim, dir: [0, -1] }, shadow: false });
    cup(g, cx, cy, 1.2, rot);
    if (t > 1.0 && t < 1.4) FX.rings(g, tx + 70, top - 20, t - 1.0, { count: 2, r0: 10, r1: 70, speed: 2.5, color: '#ffffff', a: 0.6 });
  });
} });

// s006 — "The cup hasn't even started to fall"  TIME FREEZE
function coffee(g, x, y, t, seed = 1) {
  g.fillStyle = '#5a321e'; g.beginPath(); g.ellipse(x - 30, y + 30, 44, 18, -0.5, 0, 7); g.fill();
  for (let i = 0; i < 16; i++) { const a = -2.2 + i * 0.2 + Math.sin(i * 7.3) * 0.2, d = 50 + ((i * 37) % 70); const px = x - 20 + Math.cos(a) * d + Math.sin(t * 0.5 + i) * 2, py = y + 40 - Math.sin(a) * d * 0.6; const r = 4 + (i % 4) * 2.5; circle(g, px, py, r, '#6a3a22'); circle(g, px - r * 0.3, py - r * 0.3, r * 0.3, 'rgba(255,230,200,.7)'); }
}
registerShot('s006', { draw(g, t) {
  const cam = { z: 1.0 + 0.04 * t, r: -0.03 + 0.012 * t };
  blurLayer(g, 12, (g) => cafe(g, 0, { z: 1.9, x: -100, y: -260 }, { mood: 'golden' })); veil(g, '#120a10', 0.35);
  layer(g, cam, 1, (g) => {
    const x = E.W / 2, y = E.H * 0.46;
    FX.drops(g, t, { count: 50, color: '#d8e4ff', rMax: 10, drift: 3 });
    g.save(); g.translate(x, y); g.scale(2.2, 2.2); g.translate(-x, -y); coffee(g, x, y, t); g.restore(); cup(g, x, y, V(5.5, 5), -1.1);
    FX.rings(g, x, y - 40, t, { count: 3, r0: 120, r1: 520, speed: 0.35, color: '#e8f0ff', a: 0.35 });
  });
  g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(80,120,255,.35)'; g.fillRect(0, 0, E.W, E.H); g.restore();
  UI.badge(g, { str: '100x', a: ease.out(prog(t, 0.3, 0.8)) });
} });

// s007 — "and your hand is already under it."
registerShot('s007', { draw(g, t) {
  blurLayer(g, 14, (g) => cafe(g, t, { z: 1.7, x: -260, y: -200 }, { mood: 'golden' })); veil(g, '#120a10', 0.35);
  const land = 2.3, d = ease.inOut(prog(t, 0, land));
  const hx = E.W * 0.5, hy = E.H * V(0.72, 0.66), cy = lerp(E.H * 0.18, hy - 70, d) + (t > land ? Math.sin((t - land) * 30) * 6 * Math.exp(-(t - land) * 6) : 0);
  const ink = '#0e0b12', s = V(1.5, 1.4);
  seg(g, [[hx - 40 * s, hy + 10 * s], [-300, hy + 260 * s]], 70 * s, ink); seg(g, [[hx - 160 * s, hy + 70 * s], [-300, hy + 260 * s]], 96 * s, MAX.color);
  rr(g, hx - 70 * s, hy - 10 * s, 140 * s, 34 * s, 17 * s); g.fillStyle = ink; g.fill();
  for (let i = 0; i < 4; i++) seg(g, [[hx + 40 * s, hy + 4 * s], [hx + 70 * s + (t > land ? -12 : 0) * s, hy - (24 + i * 5) * s + i * 10 * s]], 14 * s, ink);
  for (let i = 0; i < 5; i++) { const dy = (t * 120 + i * 60) % 260; if (t < land) circle(g, hx + (i - 2) * 10, cy - 120 + dy * 0.4, 5, '#6a3a22'); }
  cup(g, hx, cy, V(2.4, 2.2), -0.25 * (1 - d));
  if (t > land) FX.rings(g, hx, hy - 40, t - land, { count: 2, r0: 50, r1: 260, speed: 1.4, color: '#fff3e0', a: 0.5 * (1 - prog(t, land, land + 1)) });
  seg(g, [[hx, cy + 20], [hx, hy - 30]], 2, alpha('#ffffff', 0.25 * (1 - d)));
} });

// s009 — "How? How did you do that?"  Jake's giant face, lip-synced to the real word timings
registerShot('s009', { draw(g, t, info) {
  blurLayer(g, 14, (g) => cafe(g, t, { z: 1.6, x: 260, y: -160 }, { mood: 'golden' })); veil(g, '#120a10', 0.35);
  const M = mood('golden'), r = V(290, 320) * (1 + 0.03 * t);
  const talk = talkAmount(info.globalT, 23.1, 24.7);
  bigFace(g, E.W / 2 + V(120, 0), E.H * V(0.6, 0.55), r, { outfit: JAKE, expr: t < 2.5 ? 'shocked' : 'surprised', talk, rimColor: M.rim, rimSide: 1, blink: (t % 2.9) > 2.8 });
  if (talk > 0) FX.rings(g, E.W / 2 + V(120, 0), E.H * V(0.6, 0.55), t, { count: 3, r0: r * 1.1, r1: r * 1.6, color: '#fff3e0', a: 0.35 });
} });

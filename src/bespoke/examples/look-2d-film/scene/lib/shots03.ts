/* eslint-disable */
// @ts-nocheck
// Ported from the aiTrends 2D Studio reference project (reaction-time); only its imports changed.
import { s2, rig, fx2, ui2 } from '@kit';
import { registerShot } from './registry';
// shots/03_explain.js — numbers, title card, the lab, and the blueprint "how it works" diagram.
const { E, V, S, mood, layer, blurLayer, backdrop, ease, prog, clamp, lerp, wordTime, seg, circle, ring, rr, poly, glow, alpha, text, FONTS } = s2;
const { drawFigure, POSES, posesAt, breathe } = rig;
const FX = fx2;
const UI = ui2;
import { lab } from './lab';
import { MAX, DOC } from './cast';

// shared blueprint comparison: NORMAL vs YOU reaction time bars (s010 shows normal, s011 adds you)
function reactionBoard(g, t, showYou, tYou = 0) {
  UI.blueprint(g); const ui = S().ui, bpc = UI.bpStroke();
  const x0 = V(560, 140), x1 = E.W - V(200, 120), scale = (x1 - x0) / 0.3;   // 0 .. 0.30 s axis
  const rowY = [E.H * V(0.38, 0.4), E.H * V(0.66, 0.6)];
  seg(g, [[x0, rowY[1] + V(110, 140)], [x1, rowY[1] + V(110, 140)]], 2, alpha(bpc, 0.6));
  for (let k = 0; k <= 6; k++) { const x = x0 + k * 0.05 * scale; seg(g, [[x, rowY[1] + V(100, 130)], [x, rowY[1] + V(120, 150)]], 2, alpha(bpc, 0.6)); text(g, (k * 0.05).toFixed(2) + 's', x, rowY[1] + V(150, 180), { size: V(28, 30), color: alpha(bpc, 0.8), font: FONTS.ui, weight: 800 }); }
  const row = (y, label, value, frac, color, who) => {
    if (!E.vertical) UI.lineFigure(g, { x: V(300, 0), y: y + 120, s: 1.05, pose: who === 'you' ? POSES.ready : POSES.stand, color: alpha(color, 0.9) });
    text(g, label, x0, y - 62, { size: V(40, 44), color, font: FONTS.ui, weight: 900, align: 'left', spacing: 2 });
    rr(g, x0, y - 26, x1 - x0, 52, 26); g.fillStyle = alpha(color, 0.1); g.fill();
    const w = Math.max(52, (x1 - x0) * frac); rr(g, x0, y - 26, w, 52, 26); g.fillStyle = color; g.fill(); glow(g, x0 + w, y, 60, color, 0.5);
    if (frac > 0.02) text(g, value, x0 + w + 28, y + 2, { size: V(58, 60), color, font: FONTS.ui, weight: 900, align: 'left', glow: 14, glowColor: alpha(color, 0.6), alpha: clamp(frac * 8) });
  };
  const pN = showYou ? 1 : ease.inOut(prog(t, 0.5, 2.2));
  row(rowY[0], 'NORMAL HUMAN', '0.25 s', (0.25 / 0.3) * pN, bpc, 'normal');
  if (showYou) row(rowY[1], 'YOU', '0.025 s', (0.025 / 0.3) * ease.out(prog(t, tYou, tYou + 0.25)), ui.gold, 'you');
}
registerShot('s010', { draw(g, t) { reactionBoard(g, t, false); } });
registerShot('s011', { draw(g, t, info) {
  const tYou = (wordTime('react', info.shot.start) ?? info.shot.start + 0.4) - info.shot.start;
  reactionBoard(g, t, true, tYou);
  UI.badge(g, { str: '10x FASTER', a: ease.out(prog(t, tYou + 0.6, tYou + 1)), size: V(40, 46) });
} });

// s012 — the title card over a sunset city
registerShot('s012', { draw(g, t, info) {
  const M = mood('dusk'), cam = { z: 1.06 - 0.06 * ease.inOut(t / info.dur), y: -20 * t };
  layer(g, cam, 0.2, (g) => { backdrop(g, M.sky); FX.sun(g, E.W / 2, E.H * V(0.62, 0.55), V(90, 110), '#fff3dc', M.key, 5); FX.godRays(g, E.W / 2, E.H * V(0.62, 0.55), { count: 14, angle: -Math.PI / 2, spread: Math.PI * 1.6, len: 1800, a: 0.06, t }); });
  layer(g, cam, 0.5, (g) => FX.skyline(g, { x: -200, y: E.H * V(0.74, 0.66), w: E.W + 400, maxH: V(300, 500), color: '#2a1f36', windowColor: alpha(M.practical, 0.8), seed: 21 }));
  layer(g, cam, 0.8, (g) => { g.fillStyle = '#16111e'; g.fillRect(-E.W, E.H * V(0.74, 0.66), E.W * 3, E.H); FX.skyline(g, { x: -200, y: E.H * V(0.8, 0.72), w: E.W + 400, minH: 60, maxH: V(160, 260), color: '#120d18', windowColor: alpha(M.practical, 0.9), lit: 0.25, seed: 5 }); });
  FX.dust(g, t, { count: 30, color: '#ffd9b0', a: 0.4 });
  UI.titleCard(g, t, { lines: ['WHAT IF YOUR REACTION TIME', 'WAS 10X FASTER?'], dur: info.dur, y: E.H * V(0.4, 0.38) });
} });

// s013 — "Here's how it works."  the lab: Doc presents the board, Max listens
registerShot('s013', { draw(g, t) {
  const cam = { z: 1 + 0.06 * ease.inOut(t / 2.4), x: -30 };
  const { GY, M } = lab(g, t, cam, { mood: 'interiorWarm' });
  layer(g, cam, 1, (g) => {
    const s = V(1.35, 1.5), rim = { color: M.rim, dir: [0, -1] };
    drawFigure(g, { x: E.W / 2 - V(40, 190), y: GY, s, facing: -1, outfit: DOC, pose: breathe(posesAt(t, [[0, POSES.stand], [0.4, POSES.point]]), t), expr: 'smile', prop: { type: 'pointer' }, rim });
    drawFigure(g, { x: E.W / 2 + V(260, 210), y: GY, s, facing: -1, outfit: MAX, pose: breathe(POSES.stand, t, 1, 3), expr: 'thinking', rim });
  });
  blurLayer(g, 10, (g) => { g.fillStyle = 'rgba(200,140,220,.55)'; rr(g, 80, E.H - 300, 90, 280, 20); g.fill(); g.fillStyle = 'rgba(230,160,60,.6)'; rr(g, E.W - 200, E.H - 260, 120, 240, 30); g.fill(); }, cam, 1.6);
  FX.dust(g, t, { count: 40 });
} });

// s014 — "Your eyes see. Your brain decides. Your muscles move."  blueprint pipeline, synced to the words
function eyeIcon(g, x, y, r, c) { g.strokeStyle = c; g.lineWidth = 5; g.beginPath(); g.ellipse(x, y, r, r * 0.55, 0, 0, 7); g.stroke(); circle(g, x, y, r * 0.28, c); }
function brainIcon(g, x, y, r, c) { g.strokeStyle = c; g.lineWidth = 5; for (const dx of [-0.32, 0.32]) { g.beginPath(); g.ellipse(x + dx * r, y, r * 0.42, r * 0.6, 0, 0, 7); g.stroke(); } seg(g, [[x - r * 0.5, y - r * 0.1], [x - r * 0.2, y + r * 0.15]], 4, c); seg(g, [[x + r * 0.5, y - r * 0.1], [x + r * 0.2, y + r * 0.15]], 4, c); }
function armIcon(g, x, y, r, c) { g.strokeStyle = c; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - r * 0.7, y + r * 0.4); g.lineTo(x, y + r * 0.4); g.quadraticCurveTo(x + r * 0.6, y + r * 0.3, x + r * 0.3, y - r * 0.5); g.stroke(); circle(g, x + r * 0.3, y - r * 0.55, r * 0.2, c); }
registerShot('s014', { draw(g, t, info) {
  UI.blueprint(g); const c = UI.bpStroke(), gold = S().ui.gold, g0 = info.shot.start;
  const T = ['eyes', 'brain', 'muscles'].map((w, i) => (wordTime(w, g0) ?? g0 + 0.2 + i * 1.3) - g0);
  const pts = E.vertical ? [[E.W / 2, E.H * 0.2], [E.W / 2, E.H * 0.41], [E.W / 2, E.H * 0.62]] : [[E.W * 0.2, E.H * 0.48], [E.W * 0.5, E.H * 0.48], [E.W * 0.8, E.H * 0.48]];
  const icons = [eyeIcon, brainIcon, armIcon], labels = ['SEE', 'DECIDE', 'MOVE'], R = V(90, 110);
  for (let i = 0; i < 2; i++) { const k = ease.inOut(prog(t, T[i] + 0.2, T[i + 1])); const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    g.setLineDash([10, 12]); seg(g, [[ax + (bx - ax) * 0.18, ay + (by - ay) * 0.18], [bx - (bx - ax) * 0.18, by - (by - ay) * 0.18]], 3, alpha(c, 0.35)); g.setLineDash([]);
    if (k > 0 && k < 1) { const px = lerp(ax, bx, 0.18 + 0.64 * k), py = lerp(ay, by, 0.18 + 0.64 * k); glow(g, px, py, 50, gold, 0.9); circle(g, px, py, 9, '#fff8e0'); } }
  pts.forEach(([x, y], i) => { const on = ease.outBack(prog(t, T[i] - 0.1, T[i] + 0.3)); g.save(); g.translate(x, y); g.scale(0.6 + 0.4 * on, 0.6 + 0.4 * on); const col = t > T[i] ? gold : alpha(c, 0.5);
    ring(g, 0, 0, R, 4, col); if (t > T[i]) glow(g, 0, 0, R * 1.6, gold, 0.25); icons[i](g, 0, 0, R * 0.55, col); g.restore();
    text(g, labels[i], x + (E.vertical ? R + 40 : 0), y + (E.vertical ? 0 : R + 60), { size: V(44, 50), color: col, font: FONTS.ui, weight: 900, spacing: 3, align: E.vertical ? 'left' : 'center', alpha: clamp(on) }); });
  const total = T[2] + 0.6, ms = clamp(t / total) * 0.25;
  UI.readout(g, { label: 'ELAPSED', value: ms.toFixed(3) + ' s', x: E.W / 2, y: E.H * V(0.84, 0.71), align: 'center', a: ease.out(prog(t, 0.2, 0.6)) });
} });

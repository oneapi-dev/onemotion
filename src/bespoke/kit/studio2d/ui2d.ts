/* eslint-disable */
// @ts-nocheck
// Ported from the aiTrends 2D Studio engine (kit v0.1.0, engine/ui2d.js), kept as close to the original
// as the move allows: it draws into a Canvas 2D context, frame by frame, and runs inside a Remotion
// <canvas> (kit/studio2d/Studio2D.tsx plays the shots, grades and letterboxes the frame like its player).
// engine/ui2d.js — on-screen graphics: titles, data cards, counters, callouts, blueprint diagrams, end screen, captions.
import { E, S, V, clamp, lerp, prog, ease, alpha, shade, mix, seg, circle, ring, rr, poly, text, measure, glow, linGrad, FONTS } from './core';
import { drawFigure, POSES } from './rig2d';

const fadeIO = (t, dur, inT = 0.35, outT = 0.35) => clamp(Math.min(t / inT, (dur - t) / outT));

// Big glowing title: "WHAT IF ONE SECOND / FELT LIKE FOREVER?" (+ optional part label)
export function titleCard(g, t, o = {}) {
  const { lines = ['WHAT IF', 'TITLE GOES HERE?'], sub = null, dur = 4, y = E.H / 2 } = o; const ui = S().ui;
  const a = fadeIO(t, dur, 0.5, 0.5); if (a <= 0) return;
  const s = 1 + 0.025 * t, big = V(96, 92), small = V(54, 52);
  g.save(); g.globalAlpha *= a; g.translate(E.W / 2, y); g.scale(s, s);
  const fit = (str, size) => Math.min(size, (E.W * 0.86) / Math.max(1, measure(g, str, size) / size));
  const sizes = lines.map((ln, i) => fit(ln, i === lines.length - 1 ? big : small));
  const gaps = sizes.slice(1).map((s2, i) => (sizes[i] + s2) * 0.62), totalH = gaps.reduce((a, b) => a + b, 0);
  let yy = -totalH / 2 - (sub ? big * 0.45 : 0);
  lines.forEach((ln, i) => { const isBig = i === lines.length - 1; text(g, ln, 0, yy, { size: sizes[i], color: isBig ? ui.gold : ui.cream, glow: 30, glowColor: 'rgba(255,120,40,.85)', spacing: isBig ? 3 : 4 }); yy += gaps[i] ?? sizes[i] * 0.9; });
  if (sub) { g.fillStyle = alpha(ui.cream, 0.55); g.fillRect(-E.W * 0.22, yy - big * 0.32, E.W * 0.44, 3); text(g, sub, 0, yy + big * 0.32, { size: small * 1.05, color: ui.accent, glow: 24, glowColor: 'rgba(255,80,60,.7)', spacing: 3 }); }
  g.restore();
}
// Glowing single question / chapter line ("IS ANY OF THIS REAL?")
export function bigLine(g, t, o = {}) { const { str = 'IS ANY OF THIS REAL?', dur = 3, y = E.H / 2, size = V(84, 76), color = S().ui.gold } = o; const a = fadeIO(t, dur, 0.4, 0.4); if (a <= 0) return; const sz = Math.min(size, (E.W * 0.88) / Math.max(1, measure(g, str, size) / size)); text(g, str, E.W / 2, y, { size: sz, color, glow: 30, glowColor: alpha(color, 0.7), alpha: a, spacing: 2 }); }
// Corner badge e.g. "100x" (slow-motion factor) or "DAY 3"
export function badge(g, o = {}) { const { str = '100x', x = E.W - V(90, 70), y = V(110, 150), color = S().ui.gold, size = V(38, 44), a = 1 } = o; text(g, str, x, y, { size, color, glow: 18, glowColor: alpha(color, 0.6), align: 'right', alpha: a, font: FONTS.ui, weight: 900 }); }
// timing / measurement readout e.g. "0.20 s", "NORMAL: 0.25 s"
export function readout(g, o = {}) {
  const { label = null, value = '0.20 s', x = 200, y = E.H - 200, color = S().ui.gold, size = V(46, 52), a = 1, align = 'left' } = o;
  const ls = size * 0.42, lw = label ? measure(g, label, ls, FONTS.ui, 900) + 18 : 0, vw = measure(g, value, size, FONTS.ui, 900), tot = lw + vw;
  let xx = align === 'center' ? x - tot / 2 : align === 'right' ? x - tot : x;
  g.save(); g.globalAlpha *= a;
  if (label) text(g, label, xx, y + size * 0.08, { size: ls, color: alpha(S().ui.cream, 0.8), font: FONTS.ui, weight: 900, align: 'left', spacing: 2 });
  text(g, value, xx + lw, y, { size, color, glow: 16, glowColor: alpha(color, 0.6), font: FONTS.ui, weight: 900, align: 'left' }); g.restore();
}
// Callout label with leader line pointing at something
export function callout(g, t, o = {}) { const { at = [E.W / 2, E.H / 2], to = [E.W / 2 + 200, E.H / 2 - 150], str = 'LABEL', color = S().ui.cream, size = V(30, 36), start = 0 } = o; const p = ease.out(prog(t, start, start + 0.5)); if (p <= 0) return; const ex = lerp(at[0], to[0], p), ey = lerp(at[1], to[1], p); circle(g, at[0], at[1], 6, color); seg(g, [at, [ex, ey]], 2, alpha(color, 0.8)); text(g, str, to[0] + (to[0] > at[0] ? 12 : -12), to[1], { size, color, font: FONTS.ui, weight: 900, align: to[0] > at[0] ? 'left' : 'right', alpha: clamp((p - 0.6) / 0.4), spacing: 1.5 }); }
// Dimension line with arrows: "30 m"
export function dimension(g, t, o = {}) { const { x1, y1, x2, y2, str = '30 m', color = S().ui.gold, start = 0 } = o; const p = ease.out(prog(t, start, start + 0.6)); if (p <= 0) return; const ex = lerp(x1, x2, p), ey = lerp(y1, y2, p); seg(g, [[x1, y1], [ex, ey]], 3, color); const ang = Math.atan2(y2 - y1, x2 - x1), ar = (x, y, a) => poly(g, [[x, y], [x - Math.cos(a - 0.4) * 16, y - Math.sin(a - 0.4) * 16], [x - Math.cos(a + 0.4) * 16, y - Math.sin(a + 0.4) * 16]], color); ar(x1, y1, ang + Math.PI); if (p > 0.98) ar(x2, y2, ang); text(g, str, (x1 + x2) / 2 + 24, (y1 + y2) / 2, { size: V(40, 46), color, font: FONTS.ui, weight: 900, align: 'left', glow: 12, glowColor: alpha(color, 0.6), alpha: clamp((p - 0.5) * 2) }); }
// Data card: title, subtitle, animated counter + curve drawing on
export function dataCard(g, t, o = {}) {
  const { title = 'SUBJECT 11 · MAX', subtitle = 'SPEED FACTOR', from = 10, to = 12.4, decimals = 1, unit = 'x', start = 0.4, dur = 2, labels = [[0, null], [0.55, null], [1, null]], shape = 1.7, arrow = true, inDur = 0.35, total = 99 } = o;
  const ui = S().ui; const aIn = ease.out(prog(t, 0, inDur)) * clamp((total - t) / 0.3); if (aIn <= 0) return;
  const cw = V(1300, 940), ch = V(700, 760), cx = (E.W - cw) / 2, cy = (E.H - ch) / 2;
  g.save(); g.globalAlpha *= aIn; g.translate(E.W / 2, E.H / 2); const sc = 0.92 + 0.08 * ease.outBack(prog(t, 0, inDur + 0.1)); g.scale(sc, sc); g.translate(-E.W / 2, -E.H / 2);
  rr(g, cx, cy, cw, ch, 28); g.fillStyle = ui.card; g.fill(); g.strokeStyle = ui.cardLine; g.lineWidth = 2.5; g.stroke();
  text(g, title, cx + 70, cy + 92, { size: V(46, 48), color: ui.text, font: FONTS.ui, weight: 900, align: 'left' });
  text(g, subtitle, cx + 72, cy + 136, { size: V(22, 26), color: ui.sub, font: FONTS.ui, weight: 900, align: 'left', spacing: 2 });
  for (let i = 0; i < 4; i++) { g.fillStyle = alpha(ui.text, 0.08); g.fillRect(cx + 70, cy + ch * 0.36 + i * ch * 0.14, cw - 140, 2); }
  const p = ease.inOut(prog(t, start, start + dur)), v = lerp(from, to, p);
  const valStr = v.toFixed(decimals) + unit; const vx = cx + cw - (arrow ? 120 : 70);
  text(g, valStr, vx, cy + 108, { size: V(84, 88), color: ui.accent, font: FONTS.ui, weight: 900, align: 'right', glow: 22, glowColor: alpha(ui.accent, 0.5) });
  if (arrow) poly(g, to >= from ? [[vx + 18, cy + 120], [vx + 54, cy + 120], [vx + 36, cy + 88]] : [[vx + 18, cy + 92], [vx + 54, cy + 92], [vx + 36, cy + 124]], ui.accent);
  const x0 = cx + 110, x1 = cx + cw - 110, y0 = cy + ch - 90, y1 = cy + ch * 0.33;
  const pt = (u) => [lerp(x0, x1, u), lerp(y0, y1, Math.pow(u, shape))];
  g.strokeStyle = ui.accent; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); for (let i = 0; i <= 120; i++) { const [x, y] = pt((i / 120) * p); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  const [hx, hy] = pt(p); glow(g, hx, hy, 60, ui.accent, 0.8);
  for (const [u, lab] of labels) { if (p + 0.001 < u) continue; const [lx, ly] = pt(u); const s = lab ?? lerp(from, to, u).toFixed(decimals) + unit; text(g, s, lx, ly - 28, { size: V(30, 34), color: mix(ui.accent, '#ffffff', 0.7), font: FONTS.ui, weight: 900, alpha: clamp((p - u + 0.06) / 0.06) }); }
  g.restore();
}
// Horizontal comparison bars: [{label:'REAL', v:0.3}, {label:'FELT', v:0.9}]
export function compareBars(g, t, o = {}) { const { rows = [{ label: 'REAL', v: 0.3 }, { label: 'FELT', v: 0.9 }], x = V(220, 120), y = E.H - V(250, 520), w = V(700, 840), start = 0, color = S().ui.blueprint } = o; rows.forEach((r, i) => { const p = ease.out(prog(t, start + i * 0.3, start + i * 0.3 + 1)); const yy = y + i * 60; text(g, r.label, x, yy, { size: V(24, 30), color: alpha(S().ui.cream, 0.8), font: FONTS.ui, weight: 900, align: 'left', spacing: 2 }); rr(g, x + 120, yy - 10, w, 20, 10); g.fillStyle = alpha(color, 0.15); g.fill(); rr(g, x + 120, yy - 10, Math.max(20, w * r.v * p), 20, 10); g.fillStyle = r.color || color; g.fill(); }); }
// Progress / timeline meter (e.g. TIME vs MEMORY strips)
export function meter(g, t, o = {}) { const { x = 200, y = 300, w = E.W - 400, ticks = 40, label = 'TIME', color = S().ui.gold, start = 0, speed = 1 } = o; text(g, label, x, y - 50, { size: V(40, 44), color, align: 'left', glow: 14, glowColor: alpha(color, 0.5) }); rr(g, x, y - 26, w, 52, 10); g.fillStyle = alpha(color, 0.08); g.fill(); for (let i = 0; i <= ticks; i++) { const big = i % 5 === 0, xx = x + 20 + ((w - 40) * i) / ticks, on = (t - start) * speed * ticks > i; seg(g, [[xx, y - (big ? 18 : 9)], [xx, y + (big ? 18 : 9)]], big ? 4 : 2, alpha(color, on ? 1 : 0.35)); } }
// Blueprint style: dark navy backdrop + faint grid; draw your diagram in bpStroke() colour with seg/ring
export function blueprint(g, o = {}) { const { grid = 60, a = 0.07 } = o; const ui = S().ui; g.fillStyle = ui.bpBg; g.fillRect(-E.W, -E.H, E.W * 3, E.H * 3); g.strokeStyle = alpha(ui.blueprint, a); g.lineWidth = 1; for (let x = 0; x <= E.W; x += grid) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, E.H); g.stroke(); } for (let y = 0; y <= E.H; y += grid) { g.beginPath(); g.moveTo(0, y); g.lineTo(E.W, y); g.stroke(); } }
export const bpStroke = () => S().ui.blueprint;
// line-art stick figure for blueprint/diagram segments
export function lineFigure(g, o = {}) { const { x, y, s = 1, pose = POSES.stand, color = '#e8f0ff', facing = 1 } = o; const p = pose; g.save(); g.translate(x, y); g.scale(s * facing, s); g.strokeStyle = color; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'; const L = (pts) => { g.beginPath(); g.moveTo(...pts[0]); pts.slice(1).forEach(q => g.lineTo(...q)); g.stroke(); }; L([p.sh, p.hip]); L([p.hip, p.kF, p.fF]); L([p.hip, p.kB, p.fB]); L([p.sh, p.eF, p.hF]); L([p.sh, p.eB, p.hB]); g.beginPath(); g.arc(p.head[0], p.head[1], 22, 0, Math.PI * 2); g.stroke(); g.restore(); }
// Speech/comment bubble with dots (used on end screens)
export function bubble(g, x, y, o = {}) { const { w = 120, h = 70, color = '#f4efe6', dots = true, str = null } = o; rr(g, x - w / 2, y - h / 2, w, h, h / 2); g.fillStyle = color; g.fill(); poly(g, [[x - w * 0.25, y + h / 2 - 4], [x - w * 0.38, y + h / 2 + 18], [x - w * 0.08, y + h / 2 - 4]], color); if (dots && !str) for (let i = -1; i <= 1; i++) circle(g, x + i * w * 0.2, y, h * 0.09, S().ink); if (str) text(g, str, x, y + 2, { size: h * 0.42, color: S().ink, font: FONTS.ui, weight: 900 }); }
// End screen: question + comment bubble + subscribe pill + the whole cast lined up
export function endScreen(g, t, o = {}) {
  const { question = 'What would YOU do?', cast = [], moodColors = ['#1b1426', '#2a1a2e', '#4a2a2a'], rim = '#ffb070' } = o; const ui = S().ui;
  g.fillStyle = linGrad(g, 0, 0, 0, E.H, moodColors); g.fillRect(-E.W, -E.H, E.W * 3, E.H * 3);
  glow(g, E.W / 2, E.H * 0.9, E.W * 0.45, '#ff9a5a', 0.3);
  const a1 = ease.out(prog(t, 0.2, 0.8));
  text(g, question, E.W / 2, V(150, 360), { size: V(64, 66), font: FONTS.serif, weight: 900, italic: true, color: ui.cream, alpha: a1, glow: 18, glowColor: 'rgba(255,170,90,.5)' });
  bubble(g, E.W / 2 - V(260, 170), V(300, 560), { w: V(110, 130), h: V(60, 70) });
  const sp = ease.outBack(prog(t, 0.6, 1.1)); g.save(); g.translate(E.W / 2 + V(60, 60), V(300, 560)); g.scale(sp, sp); rr(g, -150, -38, 300, 76, 38); g.fillStyle = '#e0302a'; g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-104, 12); g.quadraticCurveTo(-104, -18, -92, -18); g.quadraticCurveTo(-80, -18, -80, 12); g.closePath(); g.fill(); circle(g, -92, 17, 5, '#fff'); text(g, 'Subscribe', 18, 2, { size: 34, color: '#fff', font: FONTS.ui, weight: 900 }); g.restore();
  const n = cast.length, gap = Math.min(V(150, 120), (E.W * 0.85) / Math.max(1, n)), y0 = E.H - V(170, 420);
  cast.forEach((of, i) => { const k = ease.out(prog(t, 0.3 + i * 0.08, 0.7 + i * 0.08)); drawFigure(g, { x: E.W / 2 + (i - (n - 1) / 2) * gap, y: y0 + (1 - k) * 40, s: V(0.9, 1.05), facing: 1, outfit: of, pose: POSES.relaxed, expr: 'smile', alpha: k, rim: { color: rim, dir: [0, 1] } }); });
}
// Word-level captions (great for 9:16). Shows a 3–4 word phrase, current word highlighted.
export function captions(g, globalT, o = {}) {
  const words = E.words; if (!words.length) return; const { y = V(E.H - 150, E.H * 0.79), size = V(58, 74), max = 4, color = '#ffffff', hi = S().ui.gold } = o;
  let i = -1; for (let k = words.length - 1; k >= 0; k--) if (globalT >= words[k].start - 0.05) { if (globalT <= words[k].end + 0.35) i = k; break; } if (i < 0) return;
  const st = Math.floor(i / max) * max, group = words.slice(st, st + max); const strs = group.map(w => w.word.trim().toUpperCase());
  const w0 = strs.map(s => measure(g, s, size)).reduce((a, b) => a + b, 0) + size * 0.3 * (strs.length - 1);
  const sz = size * Math.min(1, (E.W * 0.88) / w0);   // shrink long phrases to fit the frame
  const gap = sz * 0.3, widths = strs.map(s => measure(g, s, sz)), total = widths.reduce((a, b) => a + b, 0) + gap * (strs.length - 1);
  let x = E.W / 2 - total / 2; strs.forEach((s, k) => { const cur = st + k === i; const pop = cur ? 1 + 0.08 * ease.out(prog(globalT, group[k].start, group[k].start + 0.12)) : 1; g.save(); g.translate(x + widths[k] / 2, y); g.scale(pop, pop); text(g, s, 0, 0, { size: sz, color: cur ? hi : color, stroke: sz * 0.16, strokeColor: 'rgba(0,0,0,.85)' }); g.restore(); x += widths[k] + gap; });
}

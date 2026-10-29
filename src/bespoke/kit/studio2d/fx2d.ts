/* eslint-disable */
// @ts-nocheck
// Ported from the aiTrends 2D Studio engine (kit v0.1.0, engine/fx2d.js), kept as close to the original
// as the move allows: it draws into a Canvas 2D context, frame by frame, and runs inside a Remotion
// <canvas> (kit/studio2d/Studio2D.tsx plays the shots, grades and letterboxes the frame like its player).
// engine/fx2d.js — atmosphere, light and set-dressing helpers (2D canvas, logical units).
import { E, rng, clamp, lerp, alpha, shade, mix, seg, circle, ring, rr, poly, linGrad, radGrad, glow, noise } from './core';

// ---------- atmosphere ----------
export function rain(g, t, o = {}) {
  const { seed = 1, count = 260, angle = 0.14, speed = 2200, len = 46, color = '#b8c8ff', a = 0.32, w = 1.3, area = [-100, -100, E.W + 200, E.H + 200], timeScale = 1 } = o;
  const r = rng(seed); g.save(); g.strokeStyle = alpha(color, a); g.lineWidth = w; g.lineCap = 'round'; g.beginPath();
  const [ax, ay, aw, ah] = area, dx = Math.sin(angle), dy = Math.cos(angle);
  for (let i = 0; i < count; i++) {
    const x0 = ax + r() * aw, y0 = r() * ah, sp = speed * (0.7 + r() * 0.6), L = len * (0.6 + r() * 0.8);
    const y = ay + ((y0 + t * timeScale * sp) % ah), x = x0 + (y - ay) * dx;
    g.moveTo(x, y); g.lineTo(x + dx * L, y + dy * L);
  }
  g.stroke(); g.restore();
}
// frozen raindrops / bubbles hanging in the air (time-stop moments)
export function drops(g, t, o = {}) {
  const { seed = 2, count = 70, area = [0, 0, E.W, E.H], rMin = 3, rMax = 14, color = '#cfe0ff', drift = 4 } = o;
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = area[0] + r() * area[2] + Math.sin(t * 0.4 + i) * drift, y = area[1] + r() * area[3] + Math.cos(t * 0.3 + i) * drift, rad = rMin + r() ** 2 * (rMax - rMin);
    g.fillStyle = radGrad(g, x - rad * 0.3, y - rad * 0.3, 0, rad, [alpha(color, 0.05), alpha(color, 0.12), alpha(color, 0.45)]);
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); ring(g, x, y, rad, Math.max(0.8, rad * 0.08), alpha(color, 0.55));
    circle(g, x - rad * 0.35, y - rad * 0.35, rad * 0.22, alpha('#ffffff', 0.85));
  }
}
export function dust(g, t, o = {}) {
  const { seed = 3, count = 50, color = '#ffe9d2', area = [0, 0, E.W, E.H], size = 2.2, speed = 14, a = 0.5 } = o;
  const r = rng(seed); g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const s = 0.4 + r() * 1.2, ph = r() * 6.28, rad = (0.5 + r()) * size;
    const x = area[0] + ((r() * area[2] + Math.sin(t * 0.5 + ph) * 18) % area[2]), y = area[1] + (((r() * area[3] - t * speed * s) % area[3]) + area[3]) % area[3];
    const al = a * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.7 + ph)));
    g.fillStyle = radGrad(g, x, y, 0, rad * 3, [alpha(color, al), alpha(color, 0)]); g.beginPath(); g.arc(x, y, rad * 3, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
export function snow(g, t, o = {}) { const { seed = 4, count = 160, color = '#ffffff', speed = 60 } = o; const r = rng(seed); for (let i = 0; i < count; i++) { const s = 0.5 + r(), x = (r() * E.W + Math.sin(t * s + i) * 30) % E.W, y = ((r() * E.H + t * speed * s) % (E.H + 20)) - 10; circle(g, x, y, 1.5 + s * 2, alpha(color, 0.75)); } }
export function stars(g, t = 0, o = {}) { const { seed = 5, count = 140, area = [0, 0, E.W, E.H * 0.6], color = '#ffffff' } = o; const r = rng(seed); for (let i = 0; i < count; i++) { const x = area[0] + r() * area[2], y = area[1] + r() * area[3], s = r(); circle(g, x, y, 0.6 + s * 1.6, alpha(color, 0.25 + 0.6 * s * (0.6 + 0.4 * Math.sin(t * 2 + i)))); } }
export function fog(g, y, h, color, a = 0.35) { g.fillStyle = linGrad(g, 0, y, 0, y + h, [alpha(color, 0), alpha(color, a), alpha(color, 0)]); g.fillRect(-E.W, y, E.W * 3, h); }

// ---------- light ----------
export function sun(g, x, y, r, color = '#fff6e0', glowColor = '#ffd59a', glowR = 4) { glow(g, x, y, r * glowR, glowColor, 0.55); glow(g, x, y, r * 1.8, '#fff3dc', 0.6); circle(g, x, y, r, color); }
export function moon(g, x, y, r, color = '#e8ecff') { glow(g, x, y, r * 4, color, 0.18); circle(g, x, y, r, color); }
export function godRays(g, x, y, o = {}) {
  const { count = 7, angle = Math.PI / 2, spread = 0.9, len = 1600, color = '#ffd9a0', a = 0.1, t = 0, width = 0.07 } = o;
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const ang = angle - spread / 2 + (spread * (i + 0.5)) / count + Math.sin(t * 0.3 + i) * 0.01, w = width * (0.6 + ((i * 37) % 10) / 10);
    g.fillStyle = linGrad(g, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, [alpha(color, a), alpha(color, 0)]);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang - w) * len, y + Math.sin(ang - w) * len); g.lineTo(x + Math.cos(ang + w) * len, y + Math.sin(ang + w) * len); g.closePath(); g.fill();
  }
  g.restore();
}
// cone of light from a lamp / spotlight / window, pointing at angle
export function lightCone(g, x, y, o = {}) { const { angle = Math.PI / 2, spread = 0.5, len = 700, color = '#ffe2a8', a = 0.18 } = o; g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = radGrad(g, x, y, 0, len, [alpha(color, a), alpha(color, a * 0.4), alpha(color, 0)]); g.beginPath(); g.moveTo(x, y); g.arc(x, y, len, angle - spread / 2, angle + spread / 2); g.closePath(); g.fill(); g.restore(); }
export function pool(g, x, y, rx, ry, color = '#ffd59a', a = 0.3) { g.save(); g.globalCompositeOperation = 'lighter'; g.translate(x, y); g.scale(1, ry / rx); g.fillStyle = radGrad(g, 0, 0, 0, rx, [alpha(color, a), alpha(color, 0)]); g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore(); }
export function lensStreak(g, x, y, w = E.W, color = '#ffe6cc', a = 0.35, h = 2) { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = linGrad(g, x - w / 2, 0, x + w / 2, 0, [alpha(color, 0), alpha(color, a), alpha(color, 0)]); g.fillRect(x - w / 2, y - h / 2, w, h); g.restore(); }
export function sparkle(g, x, y, s = 20, color = '#ffffff', a = 0.9) { g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, y, s * 0.8, color, a * 0.6); seg(g, [[x - s, y], [x + s, y]], s * 0.06, alpha(color, a)); seg(g, [[x, y - s], [x, y + s]], s * 0.06, alpha(color, a)); g.restore(); }
export function lightning(g, o = {}) {
  const { seed = 9, x1 = E.W * 0.6, y1 = 0, x2 = E.W * 0.5, y2 = E.H * 0.6, color = '#dfe8ff', w = 3, branches = 3, a = 1, jag = 60 } = o;
  const r = rng(seed); const path = (ax, ay, bx, by, n, wd, depth) => {
    const pts = [[ax, ay]]; for (let i = 1; i < n; i++) { const u = i / n; pts.push([lerp(ax, bx, u) + (r() - 0.5) * jag * (1 - u * 0.3), lerp(ay, by, u) + (r() - 0.5) * jag * 0.3]); } pts.push([bx, by]);
    g.save(); g.globalCompositeOperation = 'lighter'; g.shadowColor = color; g.shadowBlur = 24; seg(g, pts, wd, alpha(color, a)); seg(g, pts, wd * 0.4, alpha('#ffffff', a)); g.restore();
    if (depth > 0) for (let b = 0; b < branches; b++) { const k = 2 + Math.floor(r() * (pts.length - 3)); const [px, py] = pts[k]; path(px, py, px + (r() - 0.3) * 260, py + 120 + r() * 200, 6, wd * 0.5, depth - 1); }
  }; path(x1, y1, x2, y2, 14, w, 1);
}
export function speedLines(g, t, o = {}) { const { cx = E.W / 2, cy = E.H / 2, count = 60, color = '#ffffff', a = 0.25, inner = 260, seed = 6 } = o; const r = rng(seed); g.save(); g.globalCompositeOperation = 'lighter'; for (let i = 0; i < count; i++) { const ang = r() * Math.PI * 2, d0 = inner + r() * 200 + ((t * 900 + r() * 400) % 500), L = 80 + r() * 260; seg(g, [[cx + Math.cos(ang) * d0, cy + Math.sin(ang) * d0], [cx + Math.cos(ang) * (d0 + L), cy + Math.sin(ang) * (d0 + L)]], 1 + r() * 2.5, alpha(color, a * r())); } g.restore(); }
// expanding rings: someone speaking off-screen / a realisation / a shockwave
export function rings(g, x, y, t, o = {}) { const { count = 3, r0 = 40, r1 = 140, color = '#fff1e6', a = 0.5, speed = 1.4, w = 2 } = o; for (let k = 0; k < count; k++) { const ph = (t * speed + k / count) % 1; ring(g, x, y, r0 + ph * (r1 - r0), w, alpha(color, a * (1 - ph))); } }

// ---------- set dressing ----------
export function skyline(g, o = {}) {
  const { seed = 7, x = 0, y = E.H * 0.6, w = E.W, minH = 40, maxH = 220, color = '#2a2440', windowColor = '#ffd59a', lit = 0.35, minW = 26, maxW = 70 } = o;
  const r = rng(seed); let cx = x; g.fillStyle = color;
  while (cx < x + w) { const bw = minW + r() * (maxW - minW), bh = minH + r() ** 1.5 * (maxH - minH); g.fillStyle = color; g.fillRect(cx, y - bh, bw, bh + 2); if (r() < 0.2) g.fillRect(cx + bw * 0.45, y - bh - 24, 3, 24);
    g.fillStyle = windowColor; for (let wy = y - bh + 8; wy < y - 8; wy += 13) for (let wx = cx + 5; wx < cx + bw - 7; wx += 11) if (r() < lit) g.fillRect(wx, wy, 4, 6);
    cx += bw + r() * 6; }
}
export function hills(g, o = {}) { const { seed = 8, y = E.H * 0.7, amp = 80, color = '#2a2440', freq = 0.004 } = o; g.fillStyle = color; g.beginPath(); g.moveTo(-E.W, E.H * 2); for (let x = -E.W; x <= E.W * 2; x += 20) g.lineTo(x, y - (noise(x * freq, seed) * 0.5 + 0.5) * amp); g.lineTo(E.W * 2, E.H * 2); g.closePath(); g.fill(); }
export function clouds(g, o = {}) { const { seed = 10, count = 6, y = E.H * 0.2, h = 120, color = '#ffffff', a = 0.12 } = o; const r = rng(seed); for (let i = 0; i < count; i++) { const cx = r() * E.W, cy = y + r() * h, w = 160 + r() * 260; g.fillStyle = alpha(color, a); g.beginPath(); g.ellipse(cx, cy, w, 14 + r() * 16, 0, 0, Math.PI * 2); g.fill(); } }
export function tree(g, x, y, s = 1, color = '#1c1626') { seg(g, [[x, y], [x, y - 90 * s]], 9 * s, color); for (const [dx, dy, r] of [[0, -130, 46], [-34, -104, 34], [34, -104, 34], [-16, -150, 30], [20, -146, 32]]) circle(g, x + dx * s, y + dy * s, r * s, color); }
export function pine(g, x, y, s = 1, color = '#1c1626') { poly(g, [[x, y - 220 * s], [x + 30 * s, y], [x - 30 * s, y]], color); }
export function lampPost(g, x, y, h = 320, o = {}) { const { color = '#15121c', light = '#ffd59a', on = true, a = 0.22 } = o; seg(g, [[x, y], [x, y - h], [x + 34, y - h - 10]], 6, color); rr(g, x + 24, y - h - 12, 26, 10, 3); g.fillStyle = color; g.fill(); if (on) { glow(g, x + 37, y - h - 2, 60, light, 0.8); g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = linGrad(g, 0, y - h, 0, y, [alpha(light, a), alpha(light, a * 0.25)]); g.beginPath(); g.moveTo(x + 30, y - h); g.lineTo(x + 44, y - h); g.lineTo(x + 140, y); g.lineTo(x - 66, y); g.closePath(); g.fill(); g.restore(); } }
// window with a view: drawSky(g, x, y, w, h) paints inside, then frame + mullions (+ optional blinds)
export function windowFrame(g, o, drawSky) {
  const { x, y, w, h, cols = 3, rows = 1, frame = '#2b2030', bar = 8, blinds = 0, arch = false } = o;
  g.save(); g.beginPath(); if (arch) { g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); } else g.rect(x, y, w, h);
  g.clip(); drawSky(g, x, y, w, h);
  for (let i = 0; i < blinds; i++) { g.fillStyle = alpha(frame, 0.35); g.fillRect(x, y + 6 + i * 7, w, 2); }
  g.fillStyle = frame; for (let i = 1; i < cols; i++) g.fillRect(x + (w * i) / cols - bar / 2, y, bar, h); for (let i = 1; i < rows; i++) g.fillRect(x, y + (h * i) / rows - bar / 2, w, bar);
  g.restore(); g.strokeStyle = frame; g.lineWidth = bar * 1.2; if (arch) { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); g.stroke(); } else g.strokeRect(x, y, w, h);
}
// building facade with a grid of (some) lit windows
export function facade(g, o = {}) { const { x, y, w, h, color = '#2a2238', win = '#ffcf8a', dark = '#1a1424', cols = 4, rows = 3, lit = 0.6, seed = 11, door = false } = o; const r = rng(seed); g.fillStyle = color; g.fillRect(x, y - h, w, h); const cw = w / cols, rh = (h - 30) / rows; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const on = r() < lit; const wx = x + i * cw + cw * 0.2, wy = y - h + 20 + j * rh + rh * 0.15; g.fillStyle = on ? win : dark; g.fillRect(wx, wy, cw * 0.6, rh * 0.62); if (on) glow(g, wx + cw * 0.3, wy + rh * 0.3, cw * 0.7, win, 0.18); } if (door) { g.fillStyle = win; g.fillRect(x + w / 2 - 26, y - 90, 52, 90); glow(g, x + w / 2, y - 45, 120, win, 0.3); } }
export function door(g, o = {}) { const { x, y, w = 110, h = 230, color = '#3a2a36', open = 0, light = '#cfe0ff' } = o; g.fillStyle = shade(color, -0.4); g.fillRect(x, y - h, w, h); if (open > 0) { g.fillStyle = light; g.fillRect(x, y - h, w * open, h); glow(g, x + w * open / 2, y - h / 2, h, light, 0.25 * open); } g.fillStyle = color; g.fillRect(x + w * open, y - h, w * (1 - open), h); g.strokeStyle = shade(color, -0.5); g.lineWidth = 6; g.strokeRect(x, y - h, w, h); }
export function chair(g, x, y, s = 1, color = '#2a2230') { seg(g, [[x - 30 * s, y], [x - 26 * s, y - 70 * s], [x + 26 * s, y - 70 * s], [x + 30 * s, y]], 6 * s, color); seg(g, [[x - 28 * s, y - 70 * s], [x - 32 * s, y - 160 * s]], 7 * s, color); rr(g, x - 34 * s, y - 78 * s, 68 * s, 12 * s, 4 * s); g.fillStyle = color; g.fill(); }
export function stool(g, x, y, s = 1, color = '#2a2230') { rr(g, x - 26 * s, y - 72 * s, 52 * s, 10 * s, 4 * s); g.fillStyle = color; g.fill(); for (const dx of [-20, 20]) seg(g, [[x + dx * 0.4 * s, y - 70 * s], [x + dx * s, y]], 4 * s, color); seg(g, [[x - 14 * s, y - 28 * s], [x + 14 * s, y - 28 * s]], 3 * s, color); }
export function counter(g, o = {}) { const { x, y, w, h = 90, color = '#2a1e2a', top = '#3a2a37', doors = 8 } = o; g.fillStyle = color; g.fillRect(x, y - h, w, h); g.fillStyle = top; g.fillRect(x - 6, y - h - 8, w + 12, 9); g.strokeStyle = shade(color, -0.3); g.lineWidth = 2; for (let i = 1; i < doors; i++) { g.beginPath(); g.moveTo(x + (w * i) / doors, y - h + 8); g.lineTo(x + (w * i) / doors, y - 4); g.stroke(); } }
export function screen(g, o = {}, content) { const { x, y, w, h, frame = '#0c0c12', bg = '#14202c', glowC = '#7fd0d6', a = 0.25 } = o; rr(g, x - 8, y - 8, w + 16, h + 16, 8); g.fillStyle = frame; g.fill(); g.fillStyle = bg; g.fillRect(x, y, w, h); if (content) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); content(g, x, y, w, h); g.restore(); } glow(g, x + w / 2, y + h / 2, Math.max(w, h) * 0.8, glowC, a); }
export function bed(g, o = {}) { const { x, y, w = 420, color = '#5a5aa0', frame = '#2a2238', pillow = '#e8e4f4' } = o; g.fillStyle = frame; g.fillRect(x, y - 70, w, 70); g.fillRect(x - 10, y - 150, 22, 150); g.fillStyle = color; rr(g, x + 6, y - 96, w - 6, 40, 14); g.fill(); g.fillStyle = pillow; rr(g, x + 16, y - 116, 90, 30, 12); g.fill(); }
export function clock(g, x, y, r, t = 0, o = {}) { const { face = '#f2efe8', ink = '#1a1622', red = '#e04a3a', speed = 1 } = o; circle(g, x, y, r, face); ring(g, x, y, r, r * 0.06, ink); for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; seg(g, [[x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8], [x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92]], r * 0.04, ink); } const s = t * speed, ang = (v) => v * Math.PI * 2 - Math.PI / 2; seg(g, [[x, y], [x + Math.cos(ang(s / 3600)) * r * 0.5, y + Math.sin(ang(s / 3600)) * r * 0.5]], r * 0.07, ink); seg(g, [[x, y], [x + Math.cos(ang(s / 60 / 60 * 12)) * r * 0.7, y + Math.sin(ang(s / 60 / 60 * 12)) * r * 0.7]], r * 0.05, ink); seg(g, [[x, y], [x + Math.cos(ang(Math.floor(s) / 60)) * r * 0.82, y + Math.sin(ang(Math.floor(s) / 60)) * r * 0.82]], r * 0.025, red); circle(g, x, y, r * 0.05, ink); }
// planks / tiles receding toward a horizon line
export function floorLines(g, y0, y1, color = 'rgba(0,0,0,.25)', spacing = 0.06) { g.strokeStyle = color; g.lineWidth = 1.5; for (let y = y0 + 8; y < y1; y += Math.max(6, (y - y0) * spacing + 6)) { g.beginPath(); g.moveTo(-E.W, y); g.lineTo(E.W * 2, y); g.stroke(); } }
// stadium / audience crowd: rows of tiny bobbing stick people
export function crowd(g, t, o = {}) {
  const { seed = 12, x = 0, y = E.H * 0.5, w = E.W, rows = 6, rowH = 26, size = 1, color = '#3a3358', colors = null, flags = 0.02, wave = 0, cheer = 0 } = o;
  const r = rng(seed);
  for (let j = 0; j < rows; j++) { const ry = y + j * rowH, sc = size * (1 + j * 0.06); for (let cx = x + r() * 10; cx < x + w; cx += 13 * sc + r() * 6) {
    const c = colors ? colors[Math.floor(r() * colors.length)] : shade(color, (r() - 0.5) * 0.3); const ph = r() * 6.28, bob = Math.max(0, Math.sin(t * 6 + ph)) * 3 * cheer + (wave ? Math.max(0, Math.sin(t * 3 - cx * 0.01 * wave)) * 8 : 0);
    circle(g, cx, ry - 14 * sc - bob, 5 * sc, c); seg(g, [[cx, ry - 9 * sc - bob], [cx, ry + 6 * sc]], 5 * sc, c);
    if (cheer > 0.5 && r() < 0.3) seg(g, [[cx, ry - 6 * sc - bob], [cx - 5 * sc, ry - 22 * sc - bob]], 2 * sc, c);
    if (r() < flags) { const fc = ['#e04a3a', '#3a7ae0', '#f2c21a', '#ffffff'][Math.floor(r() * 4)]; seg(g, [[cx + 4, ry - 10 - bob], [cx + 4, ry - 40 - bob]], 1.5, '#ddd'); g.fillStyle = fc; g.fillRect(cx + 4, ry - 40 - bob + Math.sin(t * 4 + ph) * 2, 18, 11); }
  } }
}

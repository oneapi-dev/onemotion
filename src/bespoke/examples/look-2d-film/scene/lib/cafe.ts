/* eslint-disable */
// @ts-nocheck
// Ported from the aiTrends 2D Studio reference project (reaction-time); only its imports changed.
import { s2, fx2 } from '@kit';
// sets/cafe.js — street café at golden hour. Reusable by any shot: call cafe(g, t, cam, opts) then draw characters at depth 1.
// Value structure: facade mostly in shadow, small warm windows + lamps are the bright accents, sky glows above.
const { E, V, mood, layer, backdrop, rr, seg, circle, poly, linGrad, radGrad, glow, alpha, shade, mix } = s2;
const FX = fx2;

export const cafeGround = () => E.H * V(0.82, 0.68);
export function cafe(g, t, cam, o: any = {}) {
  const M = mood(o.mood || 'golden'), GY = cafeGround(), CX = E.W / 2;
  const wall = shade(M.wall, -0.3), wallDark = shade(M.wall, -0.6);
  layer(g, cam, 0.12, (g) => {                                     // sky + low sun + distant city
    backdrop(g, M.sky);
    FX.sun(g, CX + V(620, 300), GY - V(560, 1000), 64, '#fff3dc', M.key, 5);
    FX.clouds(g, { y: GY - V(900, 1500), h: 200, color: '#ffe7c7', a: 0.16, seed: 3 });
    FX.skyline(g, { x: -E.W, y: GY - V(420, 700), w: E.W * 3, minH: 80, maxH: V(260, 420), color: mix(M.sky[1], wallDark, 0.75), windowColor: alpha(M.practical, 0.5), lit: 0.15, seed: 8 });
  });
  layer(g, cam, 0.55, (g) => {                                     // café facade
    const top = GY - V(560, 860), left = CX - 1500, w = 3000;
    g.fillStyle = linGrad(g, 0, top, 0, GY, [shade(wall, 0.06), wall, wallDark]); g.fillRect(left, top, w, GY - top + 4);
    g.fillStyle = shade(wall, -0.4); g.fillRect(left, top - 16, w, 22);
    const ay = GY - V(430, 560), ah = 58;
    for (const i of [-3, -2, -1, 1, 2, 3]) {
      const ww = 210, wh = V(250, 300), wx = CX + i * 300 - ww / 2 + (i > 0 ? 30 : -30), wy = ay + 46;
      FX.windowFrame(g, { x: wx, y: wy, w: ww, h: wh, cols: 2, rows: 1, frame: wallDark, bar: 9 }, (g, x, y, w, h) => {
        g.fillStyle = linGrad(g, 0, y, 0, y + h, [M.practical, shade(M.practical, -0.45), shade(M.practical, -0.7)]); g.fillRect(x, y, w, h);
        g.fillStyle = alpha(wallDark, 0.75); g.fillRect(x, y + h * 0.55, w, 6); for (let k = 0; k < 6; k++) g.fillRect(x + 12 + k * 32, y + h * 0.55 - 26 - (k % 3) * 6, 12, 26 + (k % 3) * 6);
        circle(g, x + w * 0.5, y + 34, 9, '#fff3d6'); glow(g, x + w * 0.5, y + 34, 70, '#fff3d6', 0.5);
        g.fillStyle = alpha(wallDark, 0.9); g.beginPath(); g.arc(x + w * 0.72, y + h - 34, 22, 0, 7); g.fill(); g.fillRect(x + w * 0.72 - 20, y + h - 14, 40, 20);
      });
      glow(g, wx + ww / 2, wy + wh / 2, 230, M.practical, 0.1);
    }
    FX.door(g, { x: CX - 70, y: GY, w: 140, h: V(330, 380), color: wallDark, open: 0.3, light: M.practical });
    for (let x = left, k = 0; x < left + w; x += 56, k++) { g.fillStyle = k % 2 ? '#c9b8a4' : '#8f3328'; g.fillRect(x, ay - ah, 56, ah); g.beginPath(); g.arc(x + 28, ay, 28, 0, Math.PI); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(left, ay - ah, w, 12); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(left, ay + 28, w, 30);
    rr(g, CX - 100, ay - ah - 66, 200, 50, 10); g.fillStyle = wallDark; g.fill();
    g.fillStyle = M.practical; g.font = '700 28px Fredoka'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CAFÉ', CX, ay - ah - 40);
    for (const sx of [-1, 1]) { const lx = CX + sx * 130, ly = ay + 70; rr(g, lx - 8, ly, 16, 26, 4); g.fillStyle = '#ffe9c0'; g.fill(); glow(g, lx, ly + 12, 120, M.practical, 0.45); }
  });
  layer(g, cam, 0.9, (g) => {                                      // sidewalk
    g.fillStyle = linGrad(g, 0, GY, 0, GY + 400, [shade(M.floor, -0.1), shade(M.dark, -0.2)]); g.fillRect(-E.W, GY, E.W * 3, E.H * 2);
    FX.floorLines(g, GY, GY + 600, 'rgba(0,0,0,.25)', 0.08);
    for (const i of [-3, -2, -1, 1, 2, 3]) FX.pool(g, CX + i * 300 + (i > 0 ? 30 : -30), GY + 30, 200, 34, M.practical, 0.16);
    FX.pool(g, CX, GY + 20, 160, 30, M.practical, 0.25);
  });
  return { GY, CX, M };
}
// outdoor table with optional cup; returns the table-top y
export function cafeTable(g, x, GY, o: any = {}) {
  const top = GY - 150, c = o.color || '#1e1418';
  seg(g, [[x, top], [x, GY - 6]], 10, c); seg(g, [[x - 50, GY - 4], [x + 50, GY - 4]], 8, c);
  rr(g, x - 130, top - 12, 260, 16, 8); g.fillStyle = c; g.fill(); g.fillStyle = 'rgba(255,210,150,.35)'; g.fillRect(x - 124, top - 12, 248, 3);
  return { top: top - 12 };
}
export function cup(g, x, y, s = 1, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  rr(g, -14, -30, 28, 30, 5); g.fillStyle = '#f2ece4'; g.fill(); seg(g, [[14, -24], [22, -18], [14, -10]], 4, '#f2ece4');
  g.fillStyle = '#4a2a1a'; g.fillRect(-12, -30, 24, 5); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(4, -26, 10, 26); g.restore();
}

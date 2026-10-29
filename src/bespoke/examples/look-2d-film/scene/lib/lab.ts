/* eslint-disable */
// @ts-nocheck
// Ported from the aiTrends 2D Studio reference project (reaction-time); only its imports changed.
import { s2, fx2 } from '@kit';
// sets/lab.js — research lab at dusk: big window with city skyline, bench, wall board (eye -> brain -> muscle), monitors.
const { E, V, mood, layer, backdrop, rr, seg, circle, ring, linGrad, glow, alpha, shade } = s2;
const FX = fx2;

export const labGround = () => E.H * V(0.8, 0.68);
export function lab(g, t, cam, o: any = {}) {
  const M = mood(o.mood || 'interiorWarm'), GY = labGround(), CX = E.W / 2;
  layer(g, cam, 0.35, (g) => {
    g.fillStyle = linGrad(g, 0, -E.H, 0, GY, [M.dark, M.wall]); g.fillRect(-E.W, -E.H, E.W * 3, GY + E.H);
    for (const x of [-700, -100, 500, 1100, 1700]) { g.fillStyle = shade(M.wall, 0.25); g.fillRect(x, GY - V(760, 1260), 200, 9); }
    const wx = CX - V(330, 300), wy = GY - V(560, 760), ww = V(660, 600), wh = V(330, 420);
    FX.windowFrame(g, { x: wx, y: wy, w: ww, h: wh, cols: 3, frame: shade(M.wall, -0.55), bar: 10, blinds: 6 }, (g, x, y, w, h) => {
      g.fillStyle = linGrad(g, 0, y, 0, y + h, M.sky); g.fillRect(x, y, w, h);
      FX.sun(g, x + w / 2, y + h * 0.6, 55, '#fff7e6', M.key, 4);
      FX.skyline(g, { x, y: y + h, w, maxH: h * 0.6, color: alpha(shade(M.wall, -0.2), 0.75), windowColor: alpha(M.practical, 0.7), seed: 4 });
    });
    // wall board: eye -> brain -> muscle
    const bx = CX - V(760, 470), by = GY - V(520, 1000);
    rr(g, bx, by, 300, 140, 8); g.fillStyle = '#1b1828'; g.fill();
    const ic = '#cfc7dd'; [bx + 55, bx + 150, bx + 245].forEach((x) => ring(g, x, by + 70, 34, 3, ic));
    g.strokeStyle = ic; g.lineWidth = 3; g.beginPath(); g.ellipse(bx + 55, by + 70, 18, 11, 0, 0, 7); g.stroke(); circle(g, bx + 55, by + 70, 5, ic);
    g.beginPath(); g.arc(bx + 142, by + 70, 12, 0, 7); g.arc(bx + 158, by + 70, 12, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(bx + 228, by + 84); g.quadraticCurveTo(bx + 252, by + 46, bx + 262, by + 80); g.stroke();
    seg(g, [[bx + 92, by + 70], [bx + 112, by + 70]], 3, ic); seg(g, [[bx + 187, by + 70], [bx + 207, by + 70]], 3, ic);
    FX.clock(g, CX + V(560, 330), GY - V(600, 1100), 34, 9 * 3600 + 41 * 60 + t, { face: '#e9e2ea' });
  });
  layer(g, cam, 0.7, (g) => {
    FX.counter(g, { x: CX - V(560, 520), y: GY - 40, w: V(1120, 1040), h: 120, color: shade(M.wall, -0.45), top: shade(M.wall, -0.2), doors: 9 });
    FX.screen(g, { x: CX + V(330, 200), y: GY - 260, w: 140, h: 90, glowC: '#7fd0d6', a: 0.2 }, (g, x, y, w, h) => { g.strokeStyle = '#7fd0d6'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 20; i++) g.lineTo(x + 8 + i * 6.5, y + h / 2 - Math.sin(i * 0.9 + t * 3) * 14 * (i % 5 === 0 ? 2 : 1)); g.stroke(); });
    g.fillStyle = linGrad(g, 0, GY - 40, 0, GY + 600, [shade(M.floor, 0.1), M.dark]); g.fillRect(-E.W, GY - 40, E.W * 3, E.H * 2);
    FX.floorLines(g, GY - 40, GY + 600, 'rgba(0,0,0,.2)', 0.07);
    FX.pool(g, CX, GY + 10, 420, 70, M.key, 0.22);
  });
  return { GY, CX, M };
}

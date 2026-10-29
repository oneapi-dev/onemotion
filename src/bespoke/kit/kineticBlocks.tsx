// The scene blocks of the scenario-kinetic-film skill (Picture, Graph,
// Prompt, Fly, Chain, Notes, Hero, Counters, Progress, Stretch, Rewind),
// rebuilt for the browser exporter as pure functions of the frame: no CSS 3D
// (depth is projection and scale), no font axes (the stretch is a transform),
// effects on canvas. Each block runs on the music's beat (useFilm().pulse) and
// fills its station; `at` is the frame it starts and `len` how long it runs.
import type { CSSProperties, ReactNode } from "react";
import { Freeze } from "remotion";
import { E, lmix } from "./cinetic";
import { Draw } from "./draw";
import { useFilm } from "./film";
import { isLight, TRACK, zoomStyle } from "./kinetic";
import { clamp01, hitEnv, mix, prog, seeded } from "./motion";
import { Sfx } from "./sound";
import { fit, textW } from "./text";
import { Picture } from "./ui";

/** One line of display type, set the way every kinetic block sets it. */
const type = (font: string, weight: number, size: number, color: string, extra?: CSSProperties): CSSProperties => ({ fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 0.92, letterSpacing: `${TRACK}em`, whiteSpace: "nowrap", color, ...extra });
const full = (W: number, H: number, extra?: CSSProperties): CSSProperties => ({ position: "absolute", left: 0, top: 0, width: W, height: H, ...extra });
const centre: CSSProperties = { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" };
const outline = (size: number, color: string): CSSProperties => ({ color: "transparent", WebkitTextStroke: `${Math.max(2, size * 0.014).toFixed(1)}px ${color}` });

/** A glowing point with a tail: the comet that draws lines, links nodes and leads the camera. */
function comet(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, r = 9) {
  if (!pts.length) return;
  const [x, y] = pts[pts.length - 1];
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  const tail = pts.slice(-14);
  for (let i = 1; i < tail.length; i++) {
    ctx.globalAlpha = (i / tail.length) * 0.7;
    ctx.lineWidth = r * (i / tail.length) * 1.4;
    ctx.beginPath();
    ctx.moveTo(tail[i - 1][0], tail[i - 1][1]);
    ctx.lineTo(tail[i][0], tail[i][1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A ring growing from (x, y) from frame `at`: a landing. */
function ring(ctx: CanvasRenderingContext2D, t: number, at: number, x: number, y: number, color: string, size = 420) {
  if (t < at || t > at + 16) return;
  const p = prog(t, at, at + 16);
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = color;
  ctx.lineWidth = 14 * (1 - p) + 1;
  ctx.beginPath();
  ctx.arc(x, y, 30 + size * p, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * A picture cut in full frame: it arrives along a slash (or a zoom), pushes
 * and pans toward `focus` with a slight tilt, punches in on every word, hard
 * cuts in to details and carries weather. words: [beat, text, color?] (beats
 * from `at`); cutIns: [beat, scale, [fx, fy]] (positions 0 to 1 of the
 * image); tint darkens it for type; x, y place the words (off centre when a
 * face is in the middle).
 */
export const PictureShot = ({ t, at, len, src, words = [], focus = [0.5, 0.5], tint = 0.3, weather = null, cutIns = [], reveal = "slash", font, weight = 800, color = "#F4F1EA", x, y }: { t: number; at: number; len?: number; src: string; words?: [number, string, string?][]; focus?: [number, number]; tint?: number; weather?: "rain" | "snow" | "dust" | null; cutIns?: [number, number, [number, number]][]; reveal?: "slash" | "zoom"; font: string; weight?: number; color?: string; x?: number; y?: number }) => {
  const { W, H, pulse } = useFilm();
  const L = len ?? Math.round(8 * pulse);
  if (t < at) return null;
  const lt = t - at;
  const u = clamp01(lt / L);
  const beat = (k: number) => at + k * pulse;
  const cut = cutIns.find(([b]) => t >= beat(b) && t < beat(b + 1));
  const punch = words.reduce((a, [b]) => a + 0.04 * hitEnv(t, beat(b), 6, 2), 0);
  const arrive = prog(lt, 0, pulse * 0.5, E.out);
  // A fast push: the picture is where a film most easily parks.
  let scale = 1.06 + 0.3 * u + punch + (reveal === "zoom" ? 0.25 * (1 - arrive) : 0);
  let origin = `${focus[0] * 100}% ${focus[1] * 100}%`;
  if (cut) {
    scale = cut[1] * (1 + 0.04 * clamp01((t - beat(cut[0])) / pulse));
    origin = `${cut[2][0] * 100}% ${cut[2][1] * 100}%`;
  }
  const pan = cut ? { x: 0, y: 0 } : { x: (0.5 - focus[0]) * W * 0.2 * u, y: (0.5 - focus[1]) * H * 0.2 * u };
  const edge = mix(-20, 125, arrive);
  const clip = reveal === "slash" && arrive < 1 ? `polygon(0 0, ${edge}% 0, ${edge - 20}% 100%, 0 100%)` : undefined;
  const word = [...words].reverse().find(([b]) => t >= beat(b));
  const wSize = word ? fit(word[1], font, weight, Math.min(H * 0.3, W * 0.22), W * 0.8) : 0;
  const land = word ? prog(t, beat(word[0]), beat(word[0]) + 5, E.out) : 1;
  return (
    <div style={full(W, H, { overflow: "hidden", background: "#000", clipPath: clip })}>
      <div style={full(W, H, { transformOrigin: origin, transform: `translate(${pan.x.toFixed(1)}px, ${pan.y.toFixed(1)}px) rotate(${(cut ? 0 : mix(-2, 1.5, u)).toFixed(3)}deg) scale(${scale.toFixed(4)})`, filter: reveal === "zoom" && arrive < 1 ? `blur(${(10 * (1 - arrive)).toFixed(1)}px)` : undefined })}>
        <Picture src={src} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, objectFit: "cover" }} />
      </div>
      {tint > 0 ? <div style={full(W, H, { background: `rgba(0,0,0,${tint})` })} /> : null}
      {weather ? <Weather t={t} kind={weather} color={color} /> : null}
      {word ? (
        <div style={{ position: "absolute", left: x ?? W / 2, top: y ?? H / 2, transform: `translate(-50%, -50%) scale(${mix(1.3, 1, land).toFixed(4)})` }}>
          <div style={type(font, weight, wSize, word[2] ?? color)}>{word[1]}</div>
        </div>
      ) : null}
      {words.map(([b], i) => (
        <Sfx key={i} name="impact" at={beat(b) - 1} volume={0.35} />
      ))}
    </div>
  );
};

/** Rain, snow or dust drawn over a picture, from the frame alone. */
const Weather = ({ t, kind, color }: { t: number; kind: "rain" | "snow" | "dust"; color: string }) => {
  const { W, H } = useFilm();
  return (
    <Draw
      draw={(ctx) => {
        ctx.strokeStyle = kind === "rain" ? "rgba(220,230,255,0.6)" : color;
        ctx.fillStyle = kind === "dust" ? color : "rgba(255,255,255,0.85)";
        const n = kind === "rain" ? 160 : kind === "snow" ? 120 : 70;
        for (let i = 0; i < n; i++) {
          const sx = seeded(i * 1.3) * W;
          const speed = kind === "rain" ? 38 + 20 * seeded(i * 2.1) : kind === "snow" ? 2 + 2 * seeded(i * 2.1) : 0.6;
          const yy = (seeded(i * 3.7) * H + t * speed) % (H + 60);
          if (kind === "rain") {
            const xx = (sx + t * 8) % W;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(xx, yy);
            ctx.lineTo(xx - 8, yy - 34);
            ctx.stroke();
          } else {
            const xx = sx + Math.sin(t / 30 + i) * (kind === "snow" ? 18 : 30);
            ctx.globalAlpha = kind === "dust" ? 0.25 + 0.35 * seeded(i * 5.3) : 0.8;
            ctx.beginPath();
            ctx.arc(xx, kind === "dust" ? (seeded(i * 3.7) * H - t * speed + H) % H : yy, kind === "snow" ? 3 + 2 * seeded(i) : 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }}
    />
  );
};

/**
 * A number that kills an old way of working, about 6 beats: two comets draw
 * the axes, the camera rides the comet drawing an easing curve while its
 * keyframes pop, the graph folds, and the number lands with echo rings over
 * its label. `portal` (a character index of the number with a hole: 0, 6, 8,
 * 9) flies through it over the last beat, into the next shot.
 */
export const Graph = ({ t, at, len, number, label, sub, font, weight = 800, mono, color, accent, portal }: { t: number; at: number; len?: number; number: string; label: string; sub?: string; font: string; weight?: number; mono: string; color: string; accent: string; portal?: number }) => {
  const { W, H, pulse } = useFilm();
  const L = len ?? Math.round(6 * pulse);
  if (t < at) return null;
  const b = (k: number) => at + (k / 6) * L;
  const x0 = W * 0.2;
  const x1 = W * 0.8;
  const y0 = H * 0.76;
  const y1 = H * 0.24;
  const curve = (u: number): [number, number] => [mix(x0, x1, u), mix(y0, y1, E.smooth(u))];
  const fold = prog(t, b(3), b(3.5), E.in);
  const nSize = fit(number, font, weight, H * 0.5, W * 0.7);
  const landed = prog(t, b(3.5), b(3.5) + 6, E.out);
  // The camera rides the comet while it draws the curve, then pulls back before the fold.
  const ride = prog(t, b(0.5), b(1), E.cam) * (1 - prog(t, b(2.6), b(3), E.cam));
  const [hx, hy] = curve(prog(t, b(0.5), b(3), E.inOut));
  const camStyle: CSSProperties = full(W, H, { transformOrigin: "0 0", transform: `translate(${W / 2}px, ${H / 2}px) scale(${(1 + 0.3 * ride).toFixed(4)}) translate(${(-mix(W / 2, hx, ride)).toFixed(1)}px, ${(-mix(H / 2, hy, ride)).toFixed(1)}px)` });
  const nx = W / 2;
  const ny = H * 0.44;
  const hole = portal !== undefined ? { x: nx - textW(number, font, weight, nSize, TRACK) / 2 + textW(number.slice(0, portal), font, weight, nSize, TRACK) + textW(number.charAt(portal), font, weight, nSize) / 2, y: ny } : null;
  const through = hole && t >= b(5) ? zoomStyle(t, b(5), b(6) - b(5), hole.x, hole.y, W, H) : full(W, H);
  if (hole && t >= b(6)) return null;
  return (
    <div style={through}>
      {t < b(3.5) ? (
        <div style={camStyle}>
          <div style={full(W, H, { transformOrigin: `50% ${(y0 / H) * 100}%`, transform: `scaleY(${(1 - fold).toFixed(4)})` })}>
            <Draw
              draw={(ctx) => {
                const ax = prog(t, b(0), b(0.5), E.out);
                ctx.globalAlpha = 0.12 * ax;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                for (let g = 1; g <= 4; g++) {
                  ctx.beginPath();
                  ctx.moveTo(x0, mix(y0, y1, g / 4));
                  ctx.lineTo(mix(x0, x1, ax), mix(y0, y1, g / 4));
                  ctx.stroke();
                }
                ctx.globalAlpha = 1;
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(mix(x0, x1, ax), y0);
                ctx.moveTo(x0, y0);
                ctx.lineTo(x0, mix(y0, y1, ax));
                ctx.stroke();
                if (ax < 1) {
                  comet(ctx, [[mix(x0, x1, ax), y0]], accent, 8);
                  comet(ctx, [[x0, mix(y0, y1, ax)]], accent, 8);
                }
                for (let i = 0; i <= 8; i++) {
                  const tx = mix(x0, x1, i / 8);
                  if (tx > mix(x0, x1, ax)) break;
                  ctx.globalAlpha = 0.7;
                  ctx.fillStyle = color;
                  ctx.fillRect(tx - 2, y0, 4, 22);
                  ctx.font = `500 ${Math.round(H * 0.028)}px "${mono}"`;
                  ctx.textAlign = "center";
                  ctx.fillText(`${i * 4}f`, tx, y0 + 30 + H * 0.028);
                  ctx.globalAlpha = 1;
                }
                const cu = prog(t, b(0.5), b(3), E.inOut);
                if (cu > 0) {
                  const pts: [number, number][] = [];
                  for (let i = 0; i <= 80; i++) pts.push(curve((i / 80) * cu));
                  // The area under the curve, so the build reads as a shape, not a thread.
                  ctx.globalAlpha = 0.18;
                  ctx.fillStyle = accent;
                  ctx.beginPath();
                  ctx.moveTo(x0, y0);
                  pts.forEach(([px, py]) => ctx.lineTo(px, py));
                  ctx.lineTo(pts[pts.length - 1][0], y0);
                  ctx.closePath();
                  ctx.fill();
                  ctx.globalAlpha = 1;
                  ctx.strokeStyle = accent;
                  ctx.lineWidth = 14;
                  ctx.beginPath();
                  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
                  ctx.stroke();
                  if (cu < 1) comet(ctx, pts, accent, 10);
                  for (let k = 0; k < 5; k++) {
                    const ku = k / 4;
                    if (ku > cu) break;
                    const [kx, ky] = curve(ku);
                    const s = Math.min(1, (cu - ku) * 12);
                    ctx.save();
                    ctx.translate(kx, ky);
                    ctx.rotate(Math.PI / 4);
                    ctx.fillStyle = color;
                    ctx.fillRect(-20 * s, -20 * s, 40 * s, 40 * s);
                    ctx.restore();
                  }
                }
              }}
            />
          </div>
        </div>
      ) : (
        <>
          <Draw
            draw={(ctx) => {
              for (let k = 0; k < 3; k++) ring(ctx, t, Math.round(b(3.5)) + k * 4, nx, ny, k ? color : accent, W * 0.4);
            }}
          />
          <div style={{ position: "absolute", left: 0, right: 0, top: ny - nSize * 0.46, display: "flex", justifyContent: "center", transform: `translateX(${(40 - (t - b(3.5)) * 2.5).toFixed(1)}px) scale(${(mix(1.6, 1, landed) * (1 + 0.02 * ((t - b(3.5)) / pulse))).toFixed(4)})` }}>
            <div style={type(font, weight, nSize, color)}>{number}</div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: ny + nSize * 0.56, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, opacity: prog(t, b(4), b(4) + 5), transform: `translateX(${(40 - (t - b(3.5)) * 2.5).toFixed(1)}px)` }}>
            <div style={type(font, weight, fit(label, font, weight, H * 0.09, W * 0.7), accent)}>{label}</div>
            {sub ? <div style={{ fontFamily: mono, fontSize: Math.round(H * 0.03), color, opacity: prog(t, b(4.5), b(4.5) + 5) }}>{sub}</div> : null}
          </div>
        </>
      )}
      <Sfx name="whoosh" at={Math.round(b(0.5)) - 2} volume={0.3} />
      <Sfx name="impact" at={Math.round(b(3.5)) - 1} volume={0.5} />
    </div>
  );
};

/**
 * The input that produces the result (a prompt, a brief, a query), whole
 * station: a comet draws the box, the text types while the camera follows
 * the caret, keywords light up and pop, the camera pulls back, the keywords
 * pulse, and the camera pushes into the Enter key through converging speed
 * lines until its colour fills the frame on the last frame: start the next
 * shot on `accent` and it reads as the drop. text: [segment, keyword?].
 */
export const PromptBox = ({ t, at, len, text, label = "PROMPT", unit = "CHARS", font, mono, color, accent, ground, size: sizeIn }: { t: number; at: number; len?: number; text: [string, boolean?][]; label?: string; unit?: string; font: string; mono: string; color: string; accent: string; ground: string; size?: number }) => {
  const { W, H, pulse } = useFilm();
  const size = sizeIn ?? Math.round(H * 0.075);
  const L = len ?? Math.round(16 * pulse);
  if (t < at || t >= at + L) return null;
  const lt = t - at;
  const f = (u: number) => u * L;
  // The box fits the frame even when the camera leans in on the caret, so it is never cropped.
  const zoom = 1.3;
  const bw = Math.min((W * 0.92) / zoom, 1300);
  const bx = (W - bw) / 2;
  const pad = size * 0.8;
  // Lay the text out once: every character's position, wrapped by words inside the box.
  const chars: { ch: string; x: number; y: number; key: boolean }[] = [];
  let cx = 0;
  let cy = 0;
  for (const [seg, key] of text) {
    for (const word of seg.split(/(\s+)/)) {
      if (!word) continue;
      const ww = textW(word, mono, 500, size);
      if (cx + ww > bw - 2 * pad && cx > 0 && !/^\s+$/.test(word)) {
        cx = 0;
        cy += size * 1.35;
      }
      for (const ch of word) {
        chars.push({ ch, x: cx, y: cy, key: Boolean(key) });
        cx += textW(ch, mono, 500, size);
      }
    }
  }
  const bh = cy + size * 1.35 + 2 * pad + size * 1.6;
  const by = (H - bh) / 2;
  const n = Math.floor(chars.length * prog(lt, f(0.08), f(0.58), (x) => x));
  const last = chars[Math.max(0, n - 1)] ?? { x: 0, y: 0 };
  const caret = { x: bx + pad + last.x + size * 0.6, y: by + pad + last.y + size * 0.5 };
  const follow = prog(lt, f(0.06), f(0.12), E.cam) * (1 - prog(lt, f(0.58), f(0.68), E.cam));
  const k = 1 + (zoom - 1) * follow;
  // The camera follows the caret but never past the box's sides: the line being typed stays readable.
  const inside = (v: number, lo: number, hi: number, view: number) => (hi - lo <= view / k ? (lo + hi) / 2 : Math.min(hi - view / (2 * k), Math.max(lo + view / (2 * k), v)));
  const fx = mix(W / 2, inside(caret.x, bx - 20, bx + bw + 20, W), follow);
  const fy = mix(H / 2, inside(caret.y, by - size, by + bh + 20, H), follow);
  const cam: CSSProperties = full(W, H, { transformOrigin: "0 0", transform: `translate(${W / 2}px, ${H / 2}px) scale(${k.toFixed(4)}) translate(${(-fx).toFixed(1)}px, ${(-fy).toFixed(1)}px)` });
  const enter = { x: bx + bw - pad - size * 1.6, y: by + bh - pad - size * 0.55 };
  const push = f(0.8);
  const draw = prog(lt, 0, f(0.08), E.inOut);
  const pulseK = (i: number) => 1 + 0.12 * hitEnv(lt, f(0.7) + i * 3, 6, 2);
  // What is typed so far, as lines of plain and keyword runs: each line reads as one line of text.
  const lines: { y: number; segs: { text: string; key: boolean; k: number }[] }[] = [];
  let keyRun = -1;
  chars.slice(0, n).forEach((c, i) => {
    let ln = lines[lines.length - 1];
    if (!ln || ln.y !== c.y) {
      ln = { y: c.y, segs: [] };
      lines.push(ln);
    }
    if (c.key && !(i > 0 && chars[i - 1].key)) keyRun++;
    const sg = ln.segs[ln.segs.length - 1];
    if (sg && sg.key === c.key) sg.text += c.ch;
    else ln.segs.push({ text: c.ch, key: c.key, k: keyRun });
  });
  // The last characters typed run huge behind the box, sliding: typing moves the whole frame, not three pixels of it.
  const tail = chars
    .slice(Math.max(0, n - 14), n)
    .map((c) => c.ch)
    .join("");
  return (
    <div style={full(W, H, { background: ground, overflow: "hidden" })}>
      {n > 0 && n < chars.length ? (
        <div style={{ position: "absolute", left: 0, top: H * 0.24, whiteSpace: "nowrap", transform: `translateX(${(W * 0.9 - lt * 16).toFixed(1)}px)`, opacity: 0.08 }}>
          <span style={type(font, 800, H * 0.5, color)}>{tail}</span>
        </div>
      ) : null}
      <div style={lt >= push ? zoomStyle(lt, push, L - push, enter.x, enter.y, W, H) : full(W, H)}>
        <div style={cam}>
          <Draw
            draw={(ctx) => {
              // Once drawn, the box is a plain border (below).
              if (draw >= 1) return;
              const per = 2 * (bw + bh);
              const d = draw * per;
              const pts: [number, number][] = [];
              const path = (s: number): [number, number] => (s < bw ? [bx + s, by] : s < bw + bh ? [bx + bw, by + s - bw] : s < 2 * bw + bh ? [bx + bw - (s - bw - bh), by + bh] : [bx, by + bh - (s - 2 * bw - bh)]);
              for (let s = 0; s <= d; s += 12) pts.push(path(s));
              ctx.strokeStyle = color;
              ctx.lineWidth = 4;
              ctx.beginPath();
              pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
              ctx.stroke();
              if (draw < 1) comet(ctx, pts, accent, 9);
            }}
          />
          {draw >= 1 ? <div style={{ position: "absolute", left: bx, top: by, width: bw, height: bh, border: `4px solid ${color}`, boxSizing: "border-box" }} /> : null}
          <div style={{ position: "absolute", left: bx, top: by - size * 0.9, fontFamily: font, fontWeight: 800, fontSize: size * 0.5, color, opacity: draw }}>{label}</div>
          {lines.map((ln, li) => (
            <div key={li} style={{ position: "absolute", left: bx + pad, top: by + pad + ln.y, fontFamily: mono, fontWeight: 500, fontSize: size, lineHeight: 1, color, whiteSpace: "pre" }}>
              {ln.segs.map((sg, si) =>
                sg.key ? (
                  <span key={si} style={{ display: "inline-block", color: ground, background: accent, transform: `scale(${pulseK(sg.k).toFixed(3)})` }}>
                    {sg.text}
                  </span>
                ) : (
                  sg.text
                ),
              )}
            </div>
          ))}
          {n < chars.length && Math.floor(lt / 8) % 2 === 0 ? <div style={{ position: "absolute", left: caret.x - size * 0.5, top: caret.y - size * 0.5, width: size * 0.12, height: size, background: accent }} /> : null}
          <div style={{ position: "absolute", left: bx + pad, top: by + bh - pad - size * 0.6, fontFamily: mono, fontSize: size * 0.45, color, opacity: 0.7 }}>{`${n} ${unit}`}</div>
          <div style={{ position: "absolute", left: enter.x - size * 1.4, top: enter.y - size * 0.55, width: size * 2.8, height: size * 1.1, borderRadius: size * 0.2, background: accent, color: ground, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: size * 0.45, opacity: draw }}>ENTER ⏎</div>
        </div>
      </div>
      {lt >= push ? (
        <Draw
          draw={(ctx) => {
            const p = prog(lt, push, L, E.in);
            ctx.strokeStyle = isLight(ground) ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.4)";
            for (let i = 0; i < 40; i++) {
              const a = seeded(i * 2.3) * Math.PI * 2;
              const r0 = Math.hypot(W, H) * (0.6 - 0.45 * p) * (0.7 + 0.3 * seeded(i));
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0);
              ctx.lineTo(W / 2 + Math.cos(a) * (r0 + 240), H / 2 + Math.sin(a) * (r0 + 240));
              ctx.stroke();
            }
          }}
        />
      ) : null}
      <Sfx name="type" at={Math.round(f(0.08))} volume={0.35} />
      <Sfx name="type" at={Math.round(f(0.33))} volume={0.35} />
      <Sfx name="riser" at={Math.round(push - pulse)} volume={0.4} />
    </div>
  );
};

/**
 * Words standing in depth inside chamfered portals; the camera flies
 * through them with a banked roll and tunnel dust, lands on the last word
 * and sways around it. 3 to 5 words: [word, colour?].
 */
export const FlyWords = ({ t, at, len, words, font, weight = 800, color, accent, ground }: { t: number; at: number; len?: number; words: [string, string?][]; font: string; weight?: number; color: string; accent: string; ground: string }) => {
  const { W, H, pulse } = useFilm();
  const L = len ?? Math.round(11 * pulse);
  if (t < at) return null;
  const F = 1200;
  const gap = 1800;
  const nodes = words.map(([w, c], i) => ({ w, c: c ?? color, size: fit(w, font, weight, Math.min(H * 0.3, W * 0.2), W * 0.7), x: i % 2 ? 260 : -260, y: i % 3 === 1 ? -90 : 60, z: (i + 1) * gap }));
  const lastZ = nodes[nodes.length - 1].z;
  const fly = prog(t, at, at + L * 0.82, E.dolly);
  const camOn = (u: number) => {
    const z = u * (lastZ - F);
    // The camera leans toward the word it is heading for.
    const i = Math.min(nodes.length - 1, Math.floor(z / gap));
    const a = nodes[Math.max(0, i - 1)] ?? nodes[0];
    const bnode = nodes[i];
    const s = clamp01((z - (i - 1) * gap) / gap);
    return { x: mix(i ? a.x : 0, bnode.x, s) * 0.85, y: mix(i ? a.y : 0, bnode.y, s) * 0.85, z };
  };
  const cam = camOn(fly);
  const ahead = camOn(Math.min(1, fly + 0.02));
  const settle = prog(t, at + L * 0.82, at + L, E.smooth);
  const roll = clamp01(Math.abs(ahead.x - cam.x) / 30) * Math.sign(ahead.x - cam.x) * 8 + Math.sin((t - at) / 18) * 1.5 * settle;
  const proj = (x: number, y: number, z: number) => {
    const s = F / Math.max(1, z - cam.z);
    return { x: W / 2 + (x - cam.x) * s, y: H / 2 + (y - cam.y) * s, s };
  };
  return (
    <div style={full(W, H, { background: ground, overflow: "hidden" })}>
      <div style={full(W, H, { transform: `rotate(${roll.toFixed(2)}deg) scale(${(1 + 0.04 * settle).toFixed(4)})` })}>
        <Draw
          draw={(ctx) => {
            for (let i = 0; i < 90; i++) {
              const z = ((seeded(i * 1.9) * lastZ * 1.2 - cam.z) % (lastZ * 1.2) + lastZ * 1.2) % (lastZ * 1.2);
              const p = proj((seeded(i * 3.1) - 0.5) * 2400, (seeded(i * 4.7) - 0.5) * 1400, cam.z + 60 + z);
              ctx.globalAlpha = clamp01(1 - z / 3000) * 0.6;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, Math.min(6, 2 * p.s), 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
            for (const nd of [...nodes].reverse()) {
              const d = nd.z - cam.z;
              if (d < 60) continue;
              const ww = textW(nd.w, font, weight, nd.size, TRACK) / 2 + 120;
              const hh = nd.size * 0.9;
              const c = Math.min(ww, hh) * 0.35;
              const pts: [number, number][] = [[-ww + c, -hh], [ww - c, -hh], [ww, -hh + c], [ww, hh - c], [ww - c, hh], [-ww + c, hh], [-ww, hh - c], [-ww, -hh + c]];
              ctx.strokeStyle = accent;
              ctx.globalAlpha = clamp01((d - 60) / 400) * clamp01(1 - (d - 1.2 * gap) / (0.6 * gap));
              ctx.lineWidth = Math.max(1, 8 * (F / d));
              ctx.beginPath();
              pts.forEach(([px, py], i) => {
                const p = proj(nd.x + px, nd.y + py, nd.z);
                if (i) ctx.lineTo(p.x, p.y);
                else ctx.moveTo(p.x, p.y);
              });
              ctx.closePath();
              ctx.stroke();
            }
          }}
        />
        {[...nodes].reverse().map((nd, i) => {
          const d = nd.z - cam.z;
          // Only the word ahead stands in front of the camera: the one after it fades up as this one passes.
          const ahead = clamp01(1 - (d - 1.1 * gap) / (0.5 * gap));
          if (d < 60 || ahead <= 0) return null;
          const p = proj(nd.x, nd.y, nd.z);
          const near = clamp01((d - 60) / 300);
          // Extruded: stacked shadows step back into depth.
          const edge = Array.from({ length: 6 }, (_, k) => `${(k + 1) * 1.2}px ${(k + 1) * 1.6}px 0 rgba(0,0,0,0.35)`).join(", ");
          return (
            <div key={i} style={{ position: "absolute", left: p.x, top: p.y, transform: `translate(-50%, -50%) scale(${p.s.toFixed(4)})`, opacity: near * ahead, filter: near < 0.9 ? `blur(${(8 * (1 - near)).toFixed(1)}px)` : undefined }}>
              <div style={type(font, weight, nd.size, nd.c, { textShadow: edge })}>{nd.w}</div>
            </div>
          );
        })}
      </div>
      {nodes.map((nd, i) => {
        // Each portal passes the camera where the fly curve crosses its depth: a whoosh there.
        const u = clamp01((nd.z - 60) / Math.max(1, lastZ - F));
        return i < nodes.length - 1 ? <Sfx key={i} name="whoosh" at={Math.round(at + L * 0.82 * u) - 6} volume={0.3} /> : null;
      })}
    </div>
  );
};

/**
 * Input to output: three or four words far apart in one world; the camera
 * rides a comet from node to node, each lands with a ring, then the camera
 * pulls back to show the chain and its trails. nodes: [word, sub?, colour?].
 */
export const Chain = ({ t, at, len, nodes, font, weight = 800, mono, color, accent, ground }: { t: number; at: number; len?: number; nodes: [string, string?, string?][]; font: string; weight?: number; mono: string; color: string; accent: string; ground: string }) => {
  const { W, H, pulse } = useFilm();
  const L = len ?? Math.round(12 * pulse);
  if (t < at) return null;
  const gap = 1100;
  const pos = nodes.map((_, i) => ({ x: i * gap, y: i % 2 ? -200 : 200 }));
  const n = nodes.length;
  const ride = L * 0.72;
  const seg = ride / Math.max(1, n - 1);
  const lt = t - at;
  const i = Math.min(n - 2, Math.floor(lt / seg));
  // It holds on each node for a quarter of its share (under 0.6 s), then travels.
  const s = n > 1 ? prog(lt, i * seg + seg * 0.25, (i + 1) * seg, E.inOut) : 1;
  // How fast the camera travels (px a frame on screen): the words smear with it, as under a real shutter.
  const sAt = (f: number) => (n > 1 ? prog(f, i * seg + seg * 0.25, (i + 1) * seg, E.inOut) : 1);
  const speed = Math.abs(sAt(lt + 1) - sAt(lt - 1)) * 0.5 * gap * 0.9;
  const smear = Math.min(18, speed * 0.35);
  const head = n > 1 ? { x: mix(pos[i].x, pos[i + 1].x, s), y: mix(pos[i].y, pos[i + 1].y, s) } : pos[0];
  const back = prog(lt, ride, L * 0.92, E.cam);
  const size = Math.min(H * 0.3, W * 0.2);
  // The pull-back frames the chain from the first word's left edge to the last word's right edge.
  const ends = textW(nodes[0][0], font, weight, size, TRACK) / 2 + textW(nodes[n - 1][0], font, weight, size, TRACK) / 2;
  const span = (n - 1) * gap + ends + 120;
  const k = mix(0.9, Math.min(1, (W * 0.86) / span), back);
  const cx = mix(head.x, ((n - 1) * gap) / 2, back);
  const cy = mix(head.y * 0.6, 0, back);
  const sx = (x: number) => W / 2 + (x - cx) * k;
  const sy = (y: number) => H / 2 + (y - cy) * k;
  const lands = pos.map((_, j) => at + (j === 0 ? 0 : j * seg));
  return (
    <div style={full(W, H, { background: ground, overflow: "hidden" })}>
      <Draw
        draw={(ctx) => {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 6 * k + 1;
          for (let j = 0; j < n - 1; j++) {
            const done = j < i ? 1 : j === i ? s : 0;
            if (!done) continue;
            ctx.beginPath();
            ctx.moveTo(sx(pos[j].x), sy(pos[j].y));
            ctx.lineTo(sx(mix(pos[j].x, pos[j + 1].x, done)), sy(mix(pos[j].y, pos[j + 1].y, done)));
            ctx.stroke();
          }
          if (back < 1 && s < 1) {
            const pts: [number, number][] = [];
            for (let q = 0; q <= 10; q++) {
              const u = Math.max(0, s - 0.06 + q * 0.006);
              pts.push([sx(mix(pos[i].x, pos[i + 1]?.x ?? pos[i].x, u)), sy(mix(pos[i].y, pos[i + 1]?.y ?? pos[i].y, u))]);
            }
            comet(ctx, pts, accent, 10 * k + 3);
          }
          lands.forEach((f, j) => ring(ctx, t, Math.round(f), sx(pos[j].x), sy(pos[j].y), nodes[j][2] ?? accent, 380 * k));
        }}
      />
      {nodes.map(([word, sub, c], j) => {
        const on = prog(t, lands[j] - 2, lands[j] + 5, E.out);
        if (t < lands[j] - 2) return null;
        return (
          <div key={j} style={{ position: "absolute", left: sx(pos[j].x), top: sy(pos[j].y), transform: `translate(-50%, -50%) scale(${(k * mix(1.3, 1, on)).toFixed(4)})`, display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.12, filter: smear > 0.5 && back < 1 ? `blur(${smear.toFixed(1)}px)` : undefined }}>
            <div style={type(font, weight, size, c ?? color)}>{word}</div>
            {sub ? <div style={{ fontFamily: mono, fontSize: size * 0.3, color, opacity: 0.8 }}>{sub}</div> : null}
          </div>
        );
      })}
      {lands.map((f, j) => (
        <Sfx key={j} name={j ? "connect" : "pop"} at={Math.round(f) - 1} volume={0.4} />
      ))}
    </div>
  );
};

export type NoteEffect = "recolor" | "trim" | "punch";

/**
 * Iteration, about 16 beats: notes typed into a panel one by one while the
 * note being typed runs huge across the frame; each note's effect plays on
 * the preview word when it is sent: recolor (the preview takes the accent),
 * trim (the timeline's first segment is halved by a slash), punch (the
 * preview punches on every beat over a starburst). notes: [text, effect?].
 */
export const Notes = ({ t, at, len, preview, notes, segments = [["INTRO", 3], ["BUILD", 4], ["DROP", 3], ["END", 2]], font, weight = 800, mono, color, accent, ground }: { t: number; at: number; len?: number; preview: string; notes: [string, NoteEffect?][]; segments?: [string, number][]; font: string; weight?: number; mono: string; color: string; accent: string; ground: string }) => {
  const { W, H, pulse } = useFilm();
  const L = len ?? Math.round(16 * pulse);
  if (t < at) return null;
  const lt = t - at;
  const per = L / Math.max(1, notes.length);
  const cur = Math.min(notes.length - 1, Math.floor(lt / per));
  const local = lt - cur * per;
  const typing = clamp01(local / (per * 0.55));
  const sent = (j: number) => lt >= j * per + per * 0.6;
  const effects = notes.filter((_, j) => sent(j)).map(([, e]) => e);
  const recolor = effects.includes("recolor");
  const trimmed = effects.includes("trim");
  const punchFrom = notes.findIndex(([, e], j) => e === "punch" && sent(j));
  const punching = punchFrom >= 0;
  const beatPunch = punching ? 0.08 * hitEnv(lt, Math.floor((lt - (punchFrom * per + per * 0.6)) / pulse) * pulse + punchFrom * per + per * 0.6, 5, 1) : 0;
  const panelW = W * 0.32;
  const px = W * 0.06;
  const pSize = fit(preview, font, weight, H * 0.22, W * 0.5);
  const k = 1.04;
  // The camera leans on the panel while a note types, then glides to the preview when it is sent; both stay in frame.
  const toPreview = prog(local, per * 0.55, per * 0.7, E.cam);
  const camX = mix(W / 2 - W * 0.015, W / 2 + W * 0.015, toPreview);
  const total = segments.reduce((a, [, v]) => a + v, 0);
  const tw = W * 0.8;
  const typed = notes[cur][0].slice(0, Math.floor(notes[cur][0].length * typing));
  return (
    <div style={full(W, H, { background: ground, overflow: "hidden" })}>
      <div style={{ position: "absolute", left: 0, right: 0, top: H * 0.3, whiteSpace: "nowrap", transform: `translateX(${(W * 0.5 - local * 14).toFixed(1)}px)`, opacity: 0.1 }}>
        <span style={{ ...type(mono, 700, H * 0.32, color) }}>{notes[cur][0]}</span>
      </div>
      <div style={full(W, H, { transformOrigin: "0 0", transform: `translate(${W / 2}px, ${H / 2}px) scale(${k}) translate(${-camX}px, ${-H / 2}px)` })}>
        <div style={{ position: "absolute", left: px, top: H * 0.16, width: panelW, height: H * 0.56, border: `3px solid ${color}`, borderRadius: 18, padding: 28, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontFamily: mono, fontSize: 28, color, opacity: 0.6 }}>NOTES</div>
          {notes.slice(0, cur).map(([n], j) => (
            <div key={j} style={{ fontFamily: mono, fontSize: 32, color, display: "flex", gap: 12 }}>
              <span style={{ color: accent }}>✓</span>
              {n}
            </div>
          ))}
          <div style={{ fontFamily: mono, fontSize: 32, color, display: "flex", gap: 12 }}>
            <span style={{ color: sent(cur) ? accent : color }}>{sent(cur) ? "✓" : ">"}</span>
            {typed}
            {!sent(cur) && Math.floor(lt / 8) % 2 === 0 ? <span style={{ color: accent }}>▌</span> : null}
          </div>
        </div>
        <div style={{ position: "absolute", left: W * 0.44, top: H * 0.16, width: W * 0.5, height: H * 0.56, borderRadius: 18, border: `3px solid ${color}55`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {punching ? (
            <Draw
              width={W * 0.5}
              height={H * 0.56}
              draw={(ctx) => {
                ctx.fillStyle = accent;
                ctx.globalAlpha = 0.25 + beatPunch * 3;
                for (let r = 0; r < 16; r++) {
                  const a0 = (r / 16) * Math.PI * 2 + lt / 40;
                  ctx.beginPath();
                  ctx.moveTo(W * 0.25, H * 0.28);
                  ctx.arc(W * 0.25, H * 0.28, W, a0, a0 + Math.PI / 32);
                  ctx.fill();
                }
              }}
            />
          ) : null}
          <div style={{ ...type(font, weight, pSize, recolor ? accent : color), position: "relative", transform: `scale(${(1 + beatPunch).toFixed(4)})` }}>{preview}</div>
        </div>
        <div style={{ position: "absolute", left: (W - tw) / 2, top: H * 0.8, width: tw, height: 44, display: "flex", gap: 6 }}>
          {segments.map(([name, v], j) => {
            const half = j === 0 && trimmed;
            return (
              <div key={j} style={{ position: "relative", flex: half ? v / 2 : v, background: j === 0 ? accent : `${color}33`, borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 12, fontFamily: mono, fontSize: 18, color: j === 0 ? ground : color, overflow: "hidden" }}>
                {name}
              </div>
            );
          })}
          <div style={{ flex: trimmed ? (segments[0]?.[1] ?? 0) / 2 : 0 }} />
        </div>
        <div style={{ position: "absolute", left: (W - tw) / 2 + 12, top: H * 0.84, fontFamily: mono, fontSize: 18, color, opacity: 0.6 }}>{`${total} BEATS`}</div>
      </div>
      {notes.map((_, j) => (
        <Sfx key={j} name="type" at={Math.round(at + j * per)} volume={0.3} />
      ))}
      {notes.map((_, j) => (
        <Sfx key={`s${j}`} name="success" at={Math.round(at + j * per + per * 0.6) - 1} volume={0.3} />
      ))}
    </div>
  );
};

/**
 * Who made it, what it is called, about 8 beats: the kicker tumbles in, a
 * comet spirals to the centre, the extruded title flies out of depth, turns
 * as if orbited, flips once, a light sweeps it twice, ghost copies fan out
 * behind it, and the sub line types with a caret.
 */
export const Hero = ({ t, at, len, kicker, title, sub, font, weight = 800, mono, color, accent }: { t: number; at: number; len?: number; kicker: string; title: string; sub?: string; font: string; weight?: number; mono: string; color: string; accent: string }) => {
  const { W, H, pulse } = useFilm();
  const L = len ?? Math.round(8 * pulse);
  if (t < at) return null;
  const b = (k: number) => at + (k / 8) * L;
  const size = fit(title, font, weight, Math.min(H * 0.34, W * 0.26), W * 0.82);
  const kSize = fit(kicker, font, weight, size * 0.26, W * 0.6);
  const fly = prog(t, b(1.2), b(1.2) + 9, E.expo);
  // A turn read as an orbit (the width breathes with the angle) and one flip.
  const ang = Math.sin(((t - b(1.8)) / (b(5.5) - b(1.8))) * Math.PI) * 32 * clamp01((t - b(1.8)) / 6);
  const flip = Math.cos(Math.PI * 2 * prog(t, b(3.4), b(3.4) + pulse * 0.7, E.inOut));
  const sx = Math.cos((ang * Math.PI) / 180);
  const edge = Array.from({ length: 8 }, (_, k) => `${(k + 1) * 1.1 * Math.sign(ang || 1)}px ${(k + 1) * 1.3}px 0 ${accent}`).join(", ");
  const sweep = (from: number) => {
    const p = prog(t, b(from), b(from) + pulse * 0.8, E.inOut);
    if (p <= 0 || p >= 1) return null;
    const x = mix(-30, 130, p);
    return (
      <div style={{ ...type(font, weight, size, "#FFFFFF"), position: "absolute", inset: 0, clipPath: `polygon(${x}% 0, ${x + 12}% 0, ${x + 2}% 100%, ${x - 10}% 100%)` }}>
        {title}
      </div>
    );
  };
  const typedSub = sub ? sub.slice(0, Math.floor(sub.length * prog(t, b(5.5), b(7), (x) => x))) : "";
  const spiral = prog(t, b(0.2), b(1.2), E.in);
  return (
    <div style={full(W, H, { overflow: "hidden" })}>
      <Draw
        draw={(ctx) => {
          if (spiral <= 0 || spiral >= 1) return;
          const pts: [number, number][] = [];
          for (let q = 0; q <= 20; q++) {
            const u = Math.max(0, spiral - 0.12 + q * 0.006);
            const r = (1 - u) * W * 0.4;
            const a = u * Math.PI * 5;
            pts.push([W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r * 0.6]);
          }
          comet(ctx, pts, accent, 10);
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: H / 2 - size * 0.9 - kSize, display: "flex", justifyContent: "center" }}>
        <div style={type(font, weight, kSize, accent)}>
          {[...kicker].map((ch, j) => {
            const q = prog(t, b(0) + j * 0.8, b(0) + j * 0.8 + 7, E.out);
            return (
              <span key={j} style={{ display: "inline-block", whiteSpace: "pre", opacity: t >= b(0) + j * 0.8 ? 1 : 0, transform: `translateY(${((1 - q) * -kSize).toFixed(1)}px) rotate(${((1 - q) * (seeded(j) - 0.5) * 80).toFixed(1)}deg)` }}>
                {ch}
              </span>
            );
          })}
        </div>
      </div>
      {t >= b(1.2) ? (
        <div style={centre}>
          <div style={{ position: "relative", transform: `scale(${(lmix(0.1, 1, fly) * (1 + 0.04 * prog(t, b(1.2), b(8), E.smooth))).toFixed(4)}) scale(${sx.toFixed(4)}, ${flip.toFixed(4)})` }}>
            {[4, 3, 2, 1].map((g) => (
              <div key={g} style={{ ...type(font, weight, size, color), ...outline(size, color), position: "absolute", inset: 0, opacity: 0.18 * prog(t, b(1.7), b(2.7)), transform: `rotate(${(g * 3 * (g % 2 ? 1 : -1) * prog(t, b(1.7), b(3.2), E.out)).toFixed(2)}deg) translateY(${(g * 6).toFixed(1)}px)` }}>
                {title}
              </div>
            ))}
            <div style={{ ...type(font, weight, size, color), textShadow: edge }}>{title}</div>
            {sweep(2.2)}
            {sweep(4.4)}
          </div>
        </div>
      ) : null}
      {sub && t >= b(5.5) ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: H / 2 + size * 0.75, display: "flex", justifyContent: "center", fontFamily: mono, fontSize: Math.round(size * 0.18), color }}>
          {typedSub}
          {Math.floor((t - at) / 8) % 2 === 0 ? <span style={{ color: accent }}>▌</span> : null}
        </div>
      ) : null}
      <Sfx name="whoosh" at={Math.round(b(1.2)) - 3} volume={0.4} />
      <Sfx name="impact" at={Math.round(b(1.2)) + 6} volume={0.45} />
      {sub ? <Sfx name="type" at={Math.round(b(5.5))} volume={0.3} /> : null}
    </div>
  );
};

/**
 * A number on slot reels: each digit spins through the digits, slowing, and lands on its own value,
 * the columns landing left to right. Only the glyph in the window and the one entering are drawn.
 */
const Reel = ({ text, t, at, size, style }: { text: string; t: number; at: number; size: number; style: CSSProperties }) => {
  const h = size * 0.92;
  return (
    <div style={{ ...style, display: "inline-block" }}>
      {[...text].map((ch, j) => {
        if (!/\d/.test(ch)) return <span key={j}>{ch}</span>;
        const land = at + 12 + j * 4;
        // Turns of the reel still to go: many at first, none once it lands.
        const left = (1 - prog(t, at, land, E.out)) * (10 + j * 5);
        const pos = Number(ch) + left;
        const cur = Math.floor(pos) % 10;
        const frac = pos - Math.floor(pos);
        return (
          <span key={j} style={{ display: "inline-block", position: "relative", height: h, overflow: "hidden", verticalAlign: "top" }}>
            <span style={{ display: "inline-block", transform: `translateY(${(-frac * h).toFixed(1)}px)` }}>{cur}</span>
            {frac > 0.001 ? <span style={{ position: "absolute", left: 0, top: 0, transform: `translateY(${((1 - frac) * h).toFixed(1)}px)` }}>{(cur + 1) % 10}</span> : null}
          </span>
        );
      })}
    </div>
  );
};

/**
 * Scale, one number every `step` frames (default 3 beats): giant numbers on
 * slot reels with their labels, over an optional plane of source text the
 * camera glides across. counters: [value, label]; values only from the brief.
 */
export const Counters = ({ t, at, counters, step, source, font, weight = 800, mono, color, accent }: { t: number; at: number; counters: [string, string][]; step?: number; source?: string; font: string; weight?: number; mono: string; color: string; accent: string }) => {
  const { W, H, pulse, fps } = useFilm();
  if (t < at) return null;
  const s = step ?? Math.round(3 * pulse);
  const i = Math.min(counters.length - 1, Math.floor((t - at) / s));
  const from = at + i * s;
  const [value, label] = counters[i];
  const size = fit(value, font, weight, H * 0.46, W * 0.8);
  const enter = prog(t, from, from + 6, E.out);
  const lines = (source ?? "").split("\n").filter(Boolean);
  return (
    <div style={full(W, H, { overflow: "hidden" })}>
      {lines.length ? (
        <div style={{ position: "absolute", left: W * 0.08, top: 0, transformOrigin: "50% 0", transform: `translateY(${(-(t - at) * 7).toFixed(1)}px) rotate(-6deg) scaleY(0.7)`, opacity: 0.16, fontFamily: mono, fontSize: 26, lineHeight: 1.6, color, whiteSpace: "pre" }}>
          {Array.from({ length: Math.ceil(60 / lines.length) }, () => lines)
            .flat()
            .slice(0, 60)
            .join("\n")}
        </div>
      ) : null}
      <div style={{ ...centre, transform: `translate(${(60 - (t - from) * 2.5).toFixed(1)}px, ${((1 - enter) * H * 0.2).toFixed(1)}px) scale(${(1 + 0.06 * ((t - from) / fps)).toFixed(4)})`, opacity: enter }}>
        <Reel text={value} t={t} at={from} size={size} style={type(font, weight, size, color)} />
        <div style={{ ...type(font, weight, fit(label, font, weight, H * 0.08, W * 0.8), accent), marginTop: H * 0.03 }}>{label}</div>
      </div>
      {counters.map((_, j) => (
        <Sfx key={j} name="ding" at={at + j * s + 8} volume={0.35} />
      ))}
    </div>
  );
};

/**
 * Making it, about 9 beats: line 1 renders itself (outlined, then a scan
 * line fills it), line 2 slams, cards ride a conveyor past a render head
 * (outlined until they pass it), a progress bar and a counter run to done.
 * cards: [word, ground, colour].
 */
export const Progress = ({ t, at, len, lines, cards, label = "RENDERING", doneLabel = "DONE", font, weight = 800, mono, color, accent }: { t: number; at: number; len?: number; lines: [string, string]; cards: [string, string, string][]; label?: string; doneLabel?: string; font: string; weight?: number; mono: string; color: string; accent: string }) => {
  const { W, H, pulse } = useFilm();
  const L = len ?? Math.round(9 * pulse);
  if (t < at) return null;
  const lt = t - at;
  const s1 = fit(lines[0], font, weight, H * 0.16, W * 0.8);
  const s2 = fit(lines[1], font, weight, H * 0.16, W * 0.8);
  const scan = prog(lt, 0, 2 * pulse, (x) => x);
  const slam = prog(lt, 2 * pulse, 2 * pulse + 5, E.out);
  const done = prog(lt, pulse, L * 0.88, (x) => x);
  const cw = 360;
  const head = W / 2;
  // A steady conveyor, about one card a second past the head: fast bright cards in a row read as flashing.
  const off = W * 0.62 - lt * 14;
  return (
    <div style={full(W, H, { overflow: "hidden" })}>
      <div style={{ position: "absolute", left: 0, right: 0, top: H * 0.12, display: "flex", flexDirection: "column", alignItems: "center", gap: H * 0.01 }}>
        <div style={{ position: "relative" }}>
          <div style={{ ...type(font, weight, s1, color), ...outline(s1, color) }}>{lines[0]}</div>
          <div data-qa="echo" style={{ ...type(font, weight, s1, color), position: "absolute", inset: 0, clipPath: `inset(0 ${((1 - scan) * 100).toFixed(1)}% 0 0)` }}>{lines[0]}</div>
          {scan < 1 ? <div style={{ position: "absolute", top: -10, bottom: -10, left: `${(scan * 100).toFixed(1)}%`, width: 4, background: accent }} /> : null}
        </div>
        <div style={{ ...type(font, weight, s2, accent), opacity: lt >= 2 * pulse ? 1 : 0, transform: `scale(${mix(1.4, 1, slam).toFixed(4)})` }}>{lines[1]}</div>
      </div>
      {cards.map(([word, g, c], j) => {
        const x = off + j * (cw + 60);
        if (x > W || x + cw < 0) return null;
        const passed = x + cw / 2 < head;
        const ws = fit(word, font, weight, 90, cw - 40);
        return (
          <div key={j} style={{ position: "absolute", left: x, top: H * 0.55, width: cw, height: cw * 0.6, borderRadius: 14, background: passed ? g : "transparent", border: `3px solid ${passed ? g : color}`, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
            <div style={passed ? type(font, weight, ws, c) : { ...type(font, weight, ws, color), ...outline(ws, color) }}>{word}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: head - 3, top: H * 0.5, width: 6, height: H * 0.32, background: accent }} />
      <div style={{ position: "absolute", left: W * 0.1, top: H * 0.88, width: W * 0.8, height: 10, background: `${color}33`, borderRadius: 5 }}>
        <div style={{ width: `${(done * 100).toFixed(1)}%`, height: "100%", background: accent, borderRadius: 5 }} />
      </div>
      <div style={{ position: "absolute", left: W * 0.1, top: H * 0.91, width: W * 0.8, display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 24, color }}>
        <span>{done >= 1 ? doneLabel : label}</span>
        <span>{`${Math.round(done * 100)}%`}</span>
      </div>
      <Sfx name="impact" at={at + Math.round(2 * pulse) - 1} volume={0.4} />
      <Sfx name="success" at={at + Math.round(L * 0.88)} volume={0.35} />
    </div>
  );
};

/**
 * One word made elastic, about 8 beats: it drops and slams, stretches,
 * dips, squeezes, stretches again and spreads its letters, ghost rows
 * lagging behind, over a live ruler and the line of code that drives it.
 * grounds: [beat, colour] flips behind it.
 */
export const Stretch = ({ t, at, len, word, grounds = [], code = true, font, weight = 800, mono, color, accent }: { t: number; at: number; len?: number; word: string; grounds?: [number, string][]; code?: boolean; font: string; weight?: number; mono: string; color: string; accent: string }) => {
  const { W, H, pulse } = useFilm();
  const L = len ?? Math.round(8 * pulse);
  if (t < at) return null;
  const b = (k: number) => at + (k / 8) * L;
  const size = fit(word, font, weight, H * 0.3, W * 0.5);
  // The width springs to each target in turn (overshooting, then settling): stretch, squeeze, stretch.
  const sxAt = (f: number) => {
    let v = 1;
    for (const [from, to] of [[b(1), 1.55], [b(3), 0.62], [b(4), 1.3]] as const) {
      if (f < from) break;
      v = mix(v, to, 1 - Math.exp(-(f - from) / 3) * Math.cos((f - from) * 0.55));
    }
    return v;
  };
  const sx = sxAt(t);
  const sy = 1 - 0.15 * Math.sin(Math.PI * prog(t, b(2), b(3), E.inOut));
  const drop = prog(t, b(0), b(0) + 6, E.out);
  const spread = prog(t, b(5), b(6.5), E.inOut) * (1 - prog(t, b(7), b(8), E.inOut));
  const g = [...grounds].reverse().find(([k]) => t >= b(k));
  const bg = g?.[1];
  const fg = bg && isLight(bg) ? "#141210" : color;
  const letters = [...word];
  const wFull = textW(word, font, weight, size, TRACK) * sx + spread * letters.length * size * 0.25;
  // The word slides the whole time and its ghost rows scroll the other way: between the moves, it never parks.
  const slide = (t - at) * 2.2 - 140;
  const row = (dy: number, lag: number) => (
    <div style={{ position: "absolute", left: 0, right: 0, top: H / 2 + dy - size * 0.46, display: "flex", justifyContent: "center", opacity: 0.18 }}>
      <div style={{ ...type(font, weight, size, fg), ...outline(size, fg), transform: `translateX(${(-slide * 1.6).toFixed(1)}px) scaleX(${sxAt(t - lag).toFixed(4)})` }}>{word}</div>
    </div>
  );
  return (
    <div style={full(W, H, { overflow: "hidden", background: bg })}>
      {row(-size * 1.05, 4)}
      {row(size * 1.05, 8)}
      <div style={{ ...centre, transform: `translate(${slide.toFixed(1)}px, ${((1 - drop) * -H * 0.6).toFixed(1)}px)` }}>
        <div style={{ ...type(font, weight, size, fg), transform: `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` }}>
          {letters.map((ch, j) => (
            <span key={j} style={{ display: "inline-block", whiteSpace: "pre", transform: `translateX(${((j - (letters.length - 1) / 2) * spread * size * 0.25).toFixed(1)}px)` }}>
              {ch}
            </span>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", left: W / 2 - wFull / 2 + slide, top: H / 2 + size * 0.62, width: wFull, height: 2, background: accent }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: H / 2 + size * 0.68, display: "flex", justifyContent: "center", fontFamily: mono, fontSize: 24, color: accent }}>{`${Math.round(wFull)} px`}</div>
      {code ? <div style={{ position: "absolute", left: W * 0.08, top: H * 0.86, fontFamily: mono, fontSize: 26, color: fg, opacity: 0.75 }}>{`transform: scaleX(${sx.toFixed(2)});`}</div> : null}
      <Sfx name="impact" at={at - 1} volume={0.4} />
      <Sfx name="swoosh" at={Math.round(b(1)) - 1} volume={0.35} />
      <Sfx name="swoosh" at={Math.round(b(3)) - 1} volume={0.35} />
    </div>
  );
};

/**
 * Everything you just saw, played backwards: `children` (a layer that reads
 * useCurrentFrame(), such as a beat's own scene or a KineticType run) plays
 * from frame `from` back to frame 0, accelerating, inside a tilting playback
 * window that lands on that first frame as the window fills the screen.
 */
export const Rewind = ({ t, at, dur, from, label = "◀◀ REWIND", color, accent, children }: { t: number; at: number; dur: number; from: number; label?: string; color: string; accent: string; children: ReactNode }) => {
  const { W, H } = useFilm();
  if (t < at) return null;
  const p = prog(t, at, at + dur, (x) => x);
  const frame = Math.max(0, Math.round(from * (1 - Math.pow(p, 1.6))));
  const land = prog(t, at + dur * 0.7, at + dur, E.inOut);
  const k = mix(0.62, 1, land);
  const rot = mix(-7, 0, land);
  return (
    <div style={full(W, H, { overflow: "hidden" })}>
      <div style={full(W, H, { transform: `rotate(${rot.toFixed(2)}deg) scale(${k.toFixed(4)})`, borderRadius: mix(24, 0, land), overflow: "hidden", boxShadow: land < 1 ? `0 0 0 6px ${color}` : undefined })}>
        <Freeze frame={frame}>{children}</Freeze>
        {land < 1 ? <div style={full(W, H, { backgroundImage: "linear-gradient(rgba(0,0,0,0.18) 2px, transparent 2px)", backgroundSize: "100% 6px", opacity: 1 - land })} /> : null}
      </div>
      {land < 1 ? <div style={{ position: "absolute", left: W * 0.06, top: H * 0.06, fontFamily: "monospace", fontSize: 34, color: accent, opacity: Math.floor((t - at) / 10) % 2 ? 0.4 : 1 }}>{`${label}  ${String(frame).padStart(4, "0")}`}</div> : null}
      <Sfx name="glitch" at={at} volume={0.3} />
    </div>
  );
};

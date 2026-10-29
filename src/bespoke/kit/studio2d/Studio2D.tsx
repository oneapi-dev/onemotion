import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useCurrentFrame, useDelayRender } from "remotion";
import { useBeat } from "../beat";
import { useFilm } from "../film";
import { E as ENGINE, FONTS, alpha, clamp, ease, prog, setStyle, text } from "./core";
import { STYLES as ENGINE_STYLES } from "./styles";
import { captions } from "./ui2d";

/**
 * The aiTrends 2D Studio player, inside a beat: one canvas that plays the beat's shots one after
 * another, each drawn by its own draw(g, t, info) in logical units (1920 x 1080, or 1080 x 1920 in
 * portrait), with the player's transitions (cut, fade, dip, dipWhite, flash, whip, zoom), its colour
 * grade per style (per-channel lift, gamma, gain, contrast, saturation), tint, vignette, film grain and
 * animated letterbox bars. Everything is a function of the frame. Ported from engine/player.js.
 */

export type ShotIn = { type: "cut" | "fade" | "dip" | "dipWhite" | "flash" | "whip" | "zoom"; dur?: number; dir?: number };
export type ShotBars = "wide" | "scope" | "thin" | "none" | number | null;
/** What a shot's draw receives: its length, the film's clock, its progress, its line, and itself with its global start and end (seconds). */
export type ShotInfo = { dur: number; globalT: number; p: number; line?: string; shot: Shot2D & { start: number; end: number } } & Record<string, unknown>;
export type Shot2D = {
  id: string;
  /** Seconds this shot lasts; shots without one share what the beat has left. */
  dur?: number;
  /** The words spoken over it (the narration line it illustrates). */
  line?: string;
  in?: ShotIn;
  bars?: ShotBars;
  vignette?: boolean;
  params?: Record<string, unknown>;
  kind?: "2d" | "3d";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draw: (g: any, t: number, info: ShotInfo, T?: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init?: (T: any, info: ShotInfo) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overlay?: (g: any, t: number, info: ShotInfo, state: any) => void;
};

/** Where each shot sits in the beat, in seconds from the beat's start. */
export function shotSpans(shots: Shot2D[], beatSeconds: number): { start: number; end: number }[] {
  const fixed = shots.reduce((a, s) => a + (s.dur ?? 0), 0);
  const free = shots.filter((s) => s.dur === undefined).length;
  const share = free ? Math.max(0.1, (beatSeconds - fixed) / free) : 0;
  let at = 0;
  return shots.map((s, i) => {
    const d = s.dur ?? share;
    const span = { start: at, end: i === shots.length - 1 ? Math.max(at + d, beatSeconds) : at + d };
    at += d;
    return span;
  });
}

// The engine is untyped JavaScript (ported as is): its shared state and its style table, as it uses them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E = ENGINE as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLES = ENGINE_STYLES as Record<string, any>;

type Lut = { lut: Uint8ClampedArray[] | null; sat: number };
const LUTS = new Map<string, Lut>();
/** The style's grade as three channel lookup tables and a saturation (player.js buildLUT). */
function lutOf(id: string): Lut {
  const hit = LUTS.get(id);
  if (hit) return hit;
  const gr = STYLES[id]?.grade ?? {};
  const lift = gr.lift || [0, 0, 0];
  const gam = gr.gamma || [1, 1, 1];
  const gain = gr.gain || [1, 1, 1];
  const con = gr.contrast ?? 1;
  const sat = gr.sat ?? 1;
  const ident = con === 1 && lift.every((v: number) => v === 0) && gam.every((v: number) => v === 1) && gain.every((v: number) => v === 1);
  const lut = ident
    ? null
    : [0, 1, 2].map((c) => {
        const a = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) {
          let x = i / 255;
          x = clamp((x - 0.5) * con + 0.5);
          x = clamp(gain[c] * (x + lift[c] * (1 - x)));
          x = Math.pow(x, 1 / gam[c]);
          a[i] = Math.round(x * 255);
        }
        return a;
      });
  const out = { lut, sat };
  LUTS.set(id, out);
  return out;
}

const mk = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const pool = new Map<string, { a: HTMLCanvasElement; b: HTMLCanvasElement; grain: HTMLCanvasElement[] }>();
/** The two shot buffers and four grain tiles for an output size, made once. */
function buffersFor(w: number, h: number) {
  const key = `${w}x${h}`;
  let p = pool.get(key);
  if (!p) {
    const grain: HTMLCanvasElement[] = [];
    const gw = Math.ceil(w / 2);
    const gh = Math.ceil(h / 2);
    for (let k = 0; k < 4; k++) {
      const c = mk(gw, gh);
      const x = c.getContext("2d")!;
      const id = x.createImageData(gw, gh);
      let s = 1234 + k * 999;
      for (let i = 0; i < id.data.length; i += 4) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const v = s >>> 24;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
        id.data[i + 3] = 255;
      }
      x.putImageData(id, 0, 0);
      grain.push(c);
    }
    p = { a: mk(w, h), b: mk(w, h), grain };
    pool.set(key, p);
  }
  return p;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache3D = new Map<string, any>();
let glCanvas: HTMLCanvasElement | null = null;
/** three-kit once loaded: later beats start with it, and the render waits only for the first load. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let threeKit: any = null;

/**
 * One beat as a run of 2D-studio shots. `style`: dusk (default), midnight, golden, neon or storybook.
 * `bars`: the letterbox when a shot sets none (wide 2:1 in landscape, none in portrait). `fadeIn` /
 * `fadeOut`: seconds from or to black at the beat's ends (the film's first and last beats).
 */
export const Studio2D = ({ shots, style = "dusk", bars, fadeIn = 0, fadeOut = 0, captionsOn = false, canvasStyle }: { shots: Shot2D[]; style?: string; bars?: ShotBars; fadeIn?: number; fadeOut?: number; captionsOn?: boolean; canvasStyle?: CSSProperties }) => {
  const film = useFilm();
  const { beat, len } = useBeat();
  const f = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  const needs3D = shots.some((s) => s.kind === "3d");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [three, setThree] = useState<any>(threeKit);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  // The render waits for three-kit, and is released only once a frame has been drawn with it.
  const [handle] = useState(() => (needs3D && !threeKit ? delayRender("Loading the 3D studio kit") : null));
  const released = useRef(false);
  useLayoutEffect(() => {
    if (!needs3D || three) return;
    import("./three-kit")
      .then((m) => {
        threeKit = m;
        setThree(m);
      })
      .catch((e: unknown) => cancelRender(e instanceof Error ? e : new Error(String(e))));
  }, [needs3D, three, cancelRender]);

  const vertical = film.H > film.W;
  const W = vertical ? 1080 : film.W === film.H ? 1080 : 1920;
  const H = vertical ? 1920 : 1080;
  const outW = film.W;
  const outH = film.H;
  const fps = film.fps;
  const beatSeconds = len / fps;
  const spans = shotSpans(shots, beatSeconds);

  useLayoutEffect(() => {
    const main = ref.current;
    if (!main || (needs3D && !three)) return;
    const mg = main.getContext("2d", { willReadFrequently: true });
    if (!mg) return;
    const words = film.beats.flatMap((b) => b.words.map((w) => ({ word: w.text, start: w.at / fps, end: w.end / fps })));
    const beatStart = beat.start / fps;
    Object.assign(E, { vertical, W, H, fps, cfg: { bars: bars ?? (vertical ? "none" : "wide"), captions: captionsOn }, words, shots: shots.map((s, i) => ({ ...s, start: beatStart + spans[i].start, end: beatStart + spans[i].end })), outW, outH });
    E.PX = outW / W;
    setStyle(style);
    const { a: bufA, b: bufB, grain } = buffersFor(outW, outH);
    E.qaText = [];
    const t = f / fps;
    const idx = Math.max(0, spans.findIndex((s) => t < s.end));
    const i = t >= spans[spans.length - 1].end ? spans.length - 1 : idx;
    const shot = shots[i];
    const lt = t - spans[i].start;

    const drawShot = (buf: HTMLCanvasElement, k: number, local: number) => {
      const g = buf.getContext("2d")!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      g.filter = "none";
      g.fillStyle = "#000";
      g.fillRect(0, 0, buf.width, buf.height);
      g.setTransform(E.PX, 0, 0, E.PX, 0, 0);
      const s = shots[k];
      const dur = spans[k].end - spans[k].start;
      const info: ShotInfo = { ...(s.params || {}), shot: { ...s, start: beatStart + spans[k].start, end: beatStart + spans[k].end }, dur, globalT: beatStart + spans[k].start + local, p: clamp(local / dur), line: s.line };
      try {
        if (s.kind === "3d" && three) {
          // three-kit's renderer is made once, on one canvas the size of the frame, before any shot's init (player.js boot).
          glCanvas ??= mk(buf.width, buf.height);
          three.getRenderer(glCanvas);
          let st = cache3D.get(s.id);
          if (!st) {
            for (const [key, v] of cache3D)
              if (cache3D.size >= 2) {
                v.dispose?.();
                v.stage?.dispose?.();
                cache3D.delete(key);
              }
            st = s.init?.(three, info);
            cache3D.set(s.id, st);
          }
          s.draw(st, local, info, three);
          (st.stage || st).render();
          g.save();
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.drawImage(glCanvas, 0, 0, buf.width, buf.height);
          g.restore();
          if (s.overlay) {
            g.save();
            s.overlay(g, local, info, st);
            g.restore();
          }
        } else {
          g.save();
          s.draw(g, local, info);
          g.restore();
        }
      } catch (e) {
        // The player's rule: an error is drawn in red on the frame, so a broken shot is never mistaken for a finished one.
        g.setTransform(E.PX, 0, 0, E.PX, 0, 0);
        text(g, `ERROR ${s.id}@${local.toFixed(2)}: ${(e instanceof Error ? e.message : String(e)).slice(0, 80)}`, E.W / 2, E.H / 2, { size: 34, color: "#ff4040", font: FONTS.ui, weight: 900 });
      }
    };

    drawShot(bufA, i, lt);
    const tr = shot.in || { type: "cut" };
    const tdur = tr.dur ?? (tr.type === "whip" ? 0.35 : 0.5);
    const Wp = main.width;
    const Hp = main.height;
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.globalAlpha = 1;
    mg.globalCompositeOperation = "source-over";
    const grade = E.style.grade;
    mg.filter = grade.filter && grade.filter !== "none" ? grade.filter : "none";
    if (tr.type !== "cut" && i > 0 && lt < tdur) {
      const k = ease.inOut(lt / tdur);
      drawShot(bufB, i - 1, t - spans[i - 1].start);
      if (tr.type === "fade") {
        mg.drawImage(bufB, 0, 0);
        mg.globalAlpha = k;
        mg.drawImage(bufA, 0, 0);
      } else if (tr.type === "dip" || tr.type === "dipWhite") {
        mg.drawImage(k < 0.5 ? bufB : bufA, 0, 0);
        mg.filter = "none";
        mg.globalAlpha = k < 0.5 ? k * 2 : (1 - k) * 2;
        mg.fillStyle = tr.type === "dip" ? "#000" : "#fff";
        mg.fillRect(0, 0, Wp, Hp);
      } else if (tr.type === "flash") {
        mg.drawImage(bufA, 0, 0);
        mg.filter = "none";
        mg.globalAlpha = (1 - lt / tdur) ** 2;
        mg.fillStyle = "#fff";
        mg.fillRect(0, 0, Wp, Hp);
      } else if (tr.type === "whip") {
        const dir = tr.dir || 1;
        for (let s = 0; s < 4; s++) {
          mg.globalAlpha = 0.3;
          mg.drawImage(bufB, -dir * k * Wp * 1.1 - dir * s * Wp * 0.02, 0);
          mg.drawImage(bufA, dir * (1 - k) * Wp * 1.1 + dir * s * Wp * 0.02, 0);
        }
      } else if (tr.type === "zoom") {
        mg.drawImage(bufB, 0, 0);
        const s = 1.15 - 0.15 * k;
        mg.globalAlpha = k;
        mg.translate(Wp / 2, Hp / 2);
        mg.scale(s, s);
        mg.drawImage(bufA, -Wp / 2, -Hp / 2);
        mg.setTransform(1, 0, 0, 1, 0, 0);
      } else mg.drawImage(bufA, 0, 0);
    } else mg.drawImage(bufA, 0, 0);
    mg.globalAlpha = 1;
    mg.filter = "none";
    mg.setTransform(1, 0, 0, 1, 0, 0);
    const { lut, sat } = lutOf(E.styleId);
    if (lut) {
      const img = mg.getImageData(0, 0, Wp, Hp);
      const d = img.data;
      const [R, G, B] = lut;
      for (let p = 0; p < d.length; p += 4) {
        let r = R[d[p]];
        let gg = G[d[p + 1]];
        let b = B[d[p + 2]];
        if (sat !== 1) {
          const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
          r = l + (r - l) * sat;
          gg = l + (gg - l) * sat;
          b = l + (b - l) * sat;
        }
        d[p] = r;
        d[p + 1] = gg;
        d[p + 2] = b;
      }
      mg.putImageData(img, 0, 0);
    }
    if (grade.tint) {
      mg.globalCompositeOperation = grade.tint[1];
      mg.fillStyle = alpha(grade.tint[0], grade.tint[2]);
      mg.fillRect(0, 0, Wp, Hp);
      mg.globalCompositeOperation = "source-over";
    }
    if (shot.vignette !== false && grade.vignette > 0) {
      const v = mg.createRadialGradient(Wp / 2, Hp / 2, Math.min(Wp, Hp) * 0.35, Wp / 2, Hp / 2, Math.max(Wp, Hp) * 0.62);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, `rgba(0,0,0,${grade.vignette})`);
      mg.fillStyle = v;
      mg.fillRect(0, 0, Wp, Hp);
    }
    if (grade.grain > 0) {
      mg.save();
      mg.globalAlpha = grade.grain;
      mg.globalCompositeOperation = "overlay";
      mg.drawImage(grain[f % 4], 0, 0, Wp, Hp);
      mg.restore();
    }
    mg.setTransform(E.PX, 0, 0, E.PX, 0, 0);
    if (captionsOn) captions(mg, beatStart + t, {});
    const barsOf = (s: Shot2D) => {
      const b = s.bars ?? E.cfg.bars;
      if (typeof b === "number") return b;
      const table: Record<string, number> = { none: 0, wide: vertical ? 0 : 60, scope: vertical ? 170 : 138, thin: vertical ? 60 : 30 };
      return table[b ?? "none"] ?? 0;
    };
    const cur = barsOf(shot);
    const prevB = i > 0 ? barsOf(shots[i - 1]) : cur;
    const bar = prevB + (cur - prevB) * ease.inOut(prog(lt, 0, 0.6));
    if (bar > 0) {
      mg.fillStyle = "#000";
      mg.fillRect(0, 0, E.W, bar);
      mg.fillRect(0, E.H - bar, E.W, bar);
    }
    const fade = Math.max(fadeIn > 0 ? 1 - t / fadeIn : 0, fadeOut > 0 ? 1 - (beatSeconds - t) / fadeOut : 0);
    if (fade > 0) {
      mg.fillStyle = `rgba(0,0,0,${clamp(fade)})`;
      mg.fillRect(0, 0, E.W, E.H);
    }
    mg.setTransform(1, 0, 0, 1, 0, 0);
    // The words the engine drew, for the frame QA: the canvas holds them as text it can read.
    main.dataset.qaText = [...new Set(E.qaText as string[])].join(" · ");
    E.qaText = null;
    if (handle !== null && !released.current) {
      released.current = true;
      continueRender(handle);
    }
  });

  return <canvas ref={ref} width={outW} height={outH} data-qa="hero" style={{ position: "absolute", left: 0, top: 0, width: outW, height: outH, ...canvasStyle }} />;
};

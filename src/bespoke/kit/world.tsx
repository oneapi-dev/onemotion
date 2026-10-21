import { createContext, Fragment, useContext, type ComponentType, type ReactNode } from "react";
import { Sequence, useCurrentFrame } from "remotion";
import { BeatContext, beatScope } from "./beat";
import { E, lmix } from "./cinetic";
import { useFilm } from "./film";
import { clamp01, mix, prog } from "./motion";
import { Sfx } from "./sound";

/**
 * One world for the whole film. Every beat is a station: a frame-sized place
 * (W x H) in one big world, laid out by `layout`. The camera holds on a
 * beat's station with a slow push and travels to the next station on the
 * next beat. Nothing fades out between beats: what a beat built stays where
 * it is and the camera leaves it, so a film reads as one continuous space,
 * never as slides. Everything is a pure function of the frame.
 */

export type WorldLayout = "row" | "column" | "diagonal" | "zigzag" | "grid" | "scatter";
export type WorldMove = "glide" | "swoop" | "whip" | "cut";
/** A station in world px: (x, y) its top-left corner, its size, and its turn in degrees. */
export type Station = { id: string; x: number; y: number; w: number; h: number; roll: number };
/** The camera: world point (x, y) at the centre of the frame, scale k, turn r in degrees, blur in px (a whip). */
export type WorldCam = { x: number; y: number; k: number; r: number; blur: number };
/** @internal The camera's travel from station `from` into station `to`, frames a to b. */
export type WorldLeg = { from: number; to: number; a: number; b: number; move: WorldMove };

export type WorldScope = {
  stations: Station[];
  /** A station by its beat id. */
  station: (id: string) => Station;
  /** The camera at this frame. */
  cam: WorldCam;
  /** A point of station `id`, given in its frame pixels (0..W, 0..H), in world pixels: where a World child goes to sit in that station. */
  at: (id: string, x: number, y: number) => { x: number; y: number };
  /** Where a world point is on screen at this frame. */
  toScreen: (p: { x: number; y: number }) => { x: number; y: number };
};

/** Frames a move takes, how far it pulls back mid-way, how much it banks (degrees), its curve. */
const DUR: Record<WorldMove, number> = { glide: 22, swoop: 26, whip: 12, cut: 0 };
const DIP: Record<WorldMove, number> = { glide: 0.04, swoop: 0.26, whip: 0.1, cut: 0 };
const BANK: Record<WorldMove, number> = { glide: 0, swoop: 1.2, whip: 2.5, cut: 0 };
const EASE: Record<WorldMove, (x: number) => number> = { glide: E.glide, swoop: E.smooth, whip: E.whip, cut: (x) => (x < 1 ? 0 : 1) };
/** Frames a station stays mounted after its beat even out of view: the tail of its last sounds. */
const TAIL = 90;

/** Deterministic 0..1 from a string. */
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

const turn = (x: number, y: number, deg: number) => {
  const r = (deg * Math.PI) / 180;
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
};

/** Stations for these beats, in world px: neighbours `gap` (a fraction of the frame) apart, never overlapping. */
export function worldLayout(ids: string[], W: number, H: number, layout: WorldLayout = "row", gap = 0.25): Station[] {
  const sx = W * (1 + gap);
  const sy = H * (1 + gap);
  const cols = Math.max(1, Math.ceil(ids.length / (ids.length > 6 ? 3 : 2)));
  return ids.map((id, i) => {
    let x = i * sx;
    let y = 0;
    let roll = 0;
    if (layout === "column") {
      x = 0;
      y = i * sy;
    } else if (layout === "diagonal") {
      x = i * sx * 0.55;
      y = i * sy;
    } else if (layout === "zigzag") {
      x = i * sx * 0.6;
      y = (i % 2) * sy;
    } else if (layout === "grid") {
      const r = Math.floor(i / cols);
      x = (r % 2 ? cols - 1 - (i % cols) : i % cols) * sx;
      y = r * sy;
    } else if (layout === "scatter") {
      y = (hash(`${id}:y`) - 0.5) * H * 0.8;
      roll = (hash(`${id}:r`) - 0.5) * 6;
    }
    return { id, x, y, w: W, h: H, roll };
  });
}

/**
 * @internal The camera's travels: into each station after the first, setting off just before its beat
 * so the station's first entrances arrive with the camera.
 */
export function worldLegs(starts: number[], ends: number[], moves: WorldMove[]): WorldLeg[] {
  const legs: WorldLeg[] = [];
  for (let i = 1; i < starts.length; i++) {
    const move = moves[i] ?? "swoop";
    const room = Math.min(ends[i - 1] - starts[i - 1], ends[i] - starts[i]);
    const d = Math.max(0, Math.min(DUR[move], Math.floor(room * 0.6)));
    const a = starts[i] - Math.round(d * 0.3);
    legs.push({ from: i - 1, to: i, a, b: a + d, move });
  }
  return legs;
}

/** Frames the finale's pull-back takes, and how far before the end it starts. */
const FINALE_MOVE = 36;
const FINALE_LEAD = 54;

/** @internal The camera that frames every station at once, with a margin. */
export function overview(stations: Station[], W: number, H: number): WorldCam {
  const x0 = Math.min(...stations.map((s) => s.x));
  const y0 = Math.min(...stations.map((s) => s.y));
  const x1 = Math.max(...stations.map((s) => s.x + s.w));
  const y1 = Math.max(...stations.map((s) => s.y + s.h));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, k: Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.9, r: 0, blur: 0 };
}

/** @internal The camera at frame t, with the finale's pull-back over the whole world when `finale` is given. */
export function worldCamWithFinale(t: number, stations: Station[], legs: WorldLeg[], total: number, push: number, finale: WorldCam | null): WorldCam {
  const c = worldCam(t, stations, legs, total, push);
  if (!finale) return c;
  const at = total - FINALE_LEAD;
  const p = prog(t, at, at + FINALE_MOVE, E.smooth);
  if (p <= 0) return c;
  return { x: mix(c.x, finale.x, p), y: mix(c.y, finale.y, p), k: lmix(c.k, finale.k, p), r: mix(c.r, finale.r, p), blur: 0 };
}

/** @internal The camera at frame t: a slow push on each hold, the legs between holds. */
export function worldCam(t: number, stations: Station[], legs: WorldLeg[], total: number, push = 0.03): WorldCam {
  if (!stations.length) return { x: 0, y: 0, k: 1, r: 0, blur: 0 };
  const hold = (i: number, from: number, to: number): WorldCam => {
    const s = stations[i];
    return { x: s.x + s.w / 2, y: s.y + s.h / 2, k: 1 + push * prog(t, from, to, E.dolly), r: -s.roll, blur: 0 };
  };
  if (!legs.length || t < legs[0].a) return hold(0, 0, legs.length ? legs[0].a : total);
  for (let j = 0; j < legs.length; j++) {
    const l = legs[j];
    const next = legs[j + 1];
    if (t < l.b) {
      const A = stations[l.from];
      const B = stations[l.to];
      const raw = clamp01((t - l.a) / (l.b - l.a || 1));
      const p = EASE[l.move](raw);
      const bump = Math.sin(Math.PI * raw);
      return {
        x: mix(A.x + A.w / 2, B.x + B.w / 2, p),
        y: mix(A.y + A.h / 2, B.y + B.h / 2, p),
        k: lmix(1 + push, 1, p) * (1 - DIP[l.move] * bump * bump),
        r: mix(-A.roll, -B.roll, p) + BANK[l.move] * bump * Math.sign(B.x - A.x),
        blur: l.move === "whip" ? 9 * bump * bump : 0,
      };
    }
    if (!next || t < next.a) return hold(l.to, l.b, next ? next.a : total);
  }
  return hold(stations.length - 1, 0, total);
}

/** @internal Whether any of a station shows in the frame under camera c. */
export function inView(s: Station, c: WorldCam, W: number, H: number): boolean {
  const r = (Math.abs(c.r) * Math.PI) / 180;
  const sr = (Math.abs(s.roll) * Math.PI) / 180;
  const fx = ((W / 2) * Math.cos(r) + (H / 2) * Math.sin(r)) / c.k;
  const fy = ((W / 2) * Math.sin(r) + (H / 2) * Math.cos(r)) / c.k;
  const hx = (s.w / 2) * Math.cos(sr) + (s.h / 2) * Math.sin(sr);
  const hy = (s.w / 2) * Math.sin(sr) + (s.h / 2) * Math.cos(sr);
  return Math.abs(s.x + s.w / 2 - c.x) < (fx + hx) * 1.02 && Math.abs(s.y + s.h / 2 - c.y) < (fy + hy) * 1.02;
}

/** @internal The part of the line between two stations' centres that runs through the gap, outside both, or null when they touch. */
export function gapSegment(A: Station, B: Station): { x1: number; y1: number; x2: number; y2: number } | null {
  const ax = A.x + A.w / 2;
  const ay = A.y + A.h / 2;
  const bx = B.x + B.w / 2;
  const by = B.y + B.h / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const exit = (s: Station) => Math.min(dx ? s.w / 2 / Math.abs(dx) : Infinity, dy ? s.h / 2 / Math.abs(dy) : Infinity);
  const ta = exit(A);
  const tb = exit(B);
  if (ta + tb >= 1) return null;
  return { x1: ax + dx * ta, y1: ay + dy * ta, x2: bx - dx * tb, y2: by - dy * tb };
}

const WorldContext = createContext<WorldScope | null>(null);

export const useWorld = (): WorldScope => {
  const w = useContext(WorldContext);
  if (!w) throw new Error("useWorld() must be used inside <World> (its children, `under` or `over`)");
  return w;
};

type Route = { color: string; width?: number; dot?: string };

/** The film's thread: a line through the gaps between stations, drawn as the camera travels each one; `dot` rides it. */
const RouteLine = ({ t, stations, legs, color, width = 3, dot }: Route & { t: number; stations: Station[]; legs: WorldLeg[] }) => (
  <>
    {legs.map((l) => {
      const seg = gapSegment(stations[l.from], stations[l.to]);
      if (!seg) return null;
      const p = prog(t, l.a - 6, l.a - 6 + Math.max(8, l.b - l.a), E.smooth);
      if (p <= 0) return null;
      const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      const ang = (Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) * 180) / Math.PI;
      const q = prog(t, l.a, l.b, EASE[l.move]);
      const r = width * 2.4;
      return (
        <Fragment key={l.to}>
          <div style={{ position: "absolute", left: seg.x1, top: seg.y1 - width / 2, width: len, height: width, borderRadius: width, background: color, transformOrigin: `0 ${width / 2}px`, transform: `rotate(${ang}deg) scaleX(${p})` }} />
          {dot && t >= l.a && t < l.b + 8 ? (
            <div style={{ position: "absolute", left: mix(seg.x1, seg.x2, q) - r, top: mix(seg.y1, seg.y2, q) - r, width: r * 2, height: r * 2, borderRadius: "50%", background: dot, opacity: 1 - prog(t, l.b, l.b + 8) }} />
          ) : null}
        </Fragment>
      );
    })}
  </>
);

/**
 * The stage of a film of beats: each beat's component (`of`, by beat id)
 * renders in its own station on its own clock (useCurrentFrame() is 0 at
 * the beat's start, useBeat() works inside), and stays there after its
 * beat. The station box is a centred flex column inside the safe area:
 * flow content is laid out by flex; absolute children are placed in frame
 * pixels as on a full frame. `children` are drawn in world pixels behind
 * the stations (things that carry across beats, a route, a thread: place
 * them with useWorld().at), so they never cross a station's words; `front`
 * is the same, drawn over the stations. `under` and `over` are screen
 * layers behind and in front of the world, inside it so they can read the
 * camera (parallax). The first station runs `open` frames ahead, so frame 0
 * (the thumbnail) already shows it under way. `finale="reveal"` pulls the
 * camera back over the whole world in the last seconds.
 */
export const World = ({
  of,
  layout = "row",
  gap = 0.25,
  move = "swoop",
  moves,
  push = 0.03,
  route,
  sound = true,
  open = 15,
  finale,
  under,
  over,
  front,
  children,
}: {
  of: Record<string, ComponentType>;
  layout?: WorldLayout;
  gap?: number;
  move?: WorldMove;
  moves?: Partial<Record<string, WorldMove>>;
  push?: number;
  route?: Route | false;
  sound?: boolean;
  open?: number;
  finale?: "reveal";
  under?: ReactNode;
  over?: ReactNode;
  front?: ReactNode;
  children?: ReactNode;
}) => {
  const t = useCurrentFrame();
  const film = useFilm();
  const { W, H, safe, total } = film;
  const placed = film.beats.filter((b) => of[b.id]);
  const stations = worldLayout(
    placed.map((b) => b.id),
    W,
    H,
    layout,
    gap,
  );
  const legs = worldLegs(
    placed.map((b) => b.start),
    placed.map((b) => b.end),
    placed.map((b) => moves?.[b.id] ?? move),
  );
  const cam = worldCamWithFinale(t, stations, legs, total, push, finale === "reveal" && stations.length > 1 ? overview(stations, W, H) : null);
  const station = (id: string) => {
    const s = stations.find((x) => x.id === id);
    if (!s) throw new Error(`useWorld().station("${id}"): no station "${id}" (stations: ${stations.map((x) => x.id).join(", ")})`);
    return s;
  };
  const scope: WorldScope = {
    stations,
    station,
    cam,
    at: (id, x, y) => {
      const s = station(id);
      const v = turn(x - s.w / 2, y - s.h / 2, s.roll);
      return { x: s.x + s.w / 2 + v.x, y: s.y + s.h / 2 + v.y };
    },
    toScreen: (p) => {
      const v = turn((p.x - cam.x) * cam.k, (p.y - cam.y) * cam.k, cam.r);
      return { x: W / 2 + v.x, y: H / 2 + v.y };
    },
  };
  const pad = `${safe.top}px ${W - safe.right}px ${H - safe.bottom}px ${safe.left}px`;
  const blur = cam.blur > 0.5 ? `blur(${cam.blur.toFixed(1)}px)` : undefined;
  return (
    <WorldContext.Provider value={scope}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {under}
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${W / 2}px, ${H / 2}px) rotate(${cam.r}deg) scale(${cam.k}) translate(${-cam.x}px, ${-cam.y}px)` }}>
          {route ? <RouteLine {...route} t={t} stations={stations} legs={legs} /> : null}
          {children}
          {placed.map((b, i) => {
            const s = stations[i];
            const C = of[b.id];
            const from = i === 0 ? b.start - Math.max(0, open) : b.start;
            if (t < from || (t > b.end + TAIL && !inView(s, cam, W, H))) return null;
            return (
              <div
                key={b.id}
                data-station={b.id}
                style={{ position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h, boxSizing: "border-box", padding: pad, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: s.roll ? `rotate(${s.roll}deg)` : undefined, filter: blur }}
              >
                <Sequence from={from} durationInFrames={Math.max(1, total - from)} layout="none" name={b.id}>
                  <BeatContext.Provider value={beatScope(film, b)}>
                    <C />
                  </BeatContext.Provider>
                </Sequence>
              </div>
            );
          })}
          {front}
        </div>
        {over}
      </div>
      {sound ? legs.map((l) => (l.move === "cut" ? null : <Sfx key={l.to} name={l.move === "whip" ? "swoosh" : "whoosh"} at={l.a - 1} volume={0.22} />)) : null}
    </WorldContext.Provider>
  );
};

/** A dot or line grid behind the world that moves with the camera at `depth` (0.3 to 0.6 reads as far away): parallax for the backdrop. Put it in <World under={...} />. */
export const WorldGrid = ({ depth = 0.45, size = 64, color = "rgba(0,0,0,0.08)", kind = "dots", weight = 1.6 }: { depth?: number; size?: number; color?: string; kind?: "dots" | "lines"; weight?: number }) => {
  const { cam } = useWorld();
  const { W, H } = useFilm();
  const s = Math.max(4, size * (1 + (cam.k - 1) * depth));
  const wrap = (v: number) => ((v % s) + s) % s;
  const m = Math.ceil((Math.max(W, H) * 0.2) / s) * s + s;
  const image = kind === "lines" ? `linear-gradient(${color} ${weight}px, transparent ${weight}px), linear-gradient(90deg, ${color} ${weight}px, transparent ${weight}px)` : `radial-gradient(circle, ${color} ${weight}px, transparent ${weight + 0.8}px)`;
  return (
    <div
      style={{ position: "absolute", left: -m, top: -m, width: W + 2 * m, height: H + 2 * m, backgroundImage: image, backgroundSize: `${s}px ${s}px`, transform: `translate(${wrap(-cam.x * depth * (s / size))}px, ${wrap(-cam.y * depth * (s / size))}px) rotate(${cam.r * depth}deg)` }}
    />
  );
};

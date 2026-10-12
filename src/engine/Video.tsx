import { useMemo } from "react";
import { AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CARDS } from "./cards";
import { Glow } from "./glow";
import { LookContext, makeLook, type Look } from "./looks";
import type { VideoInput } from "./plan";
import { cameraAt, moveWindow, planTiming, stations, type Camera, type Station } from "./rig";
import { Soundtrack } from "./soundtrack";

/**
 * The engine: one continuous shot through a room. Cards stand along a
 * route; the camera whips from one to the next on the beat, holds with a
 * slow push while a card plays, and passes it by. Depth of field, a floor,
 * drifting dust and motion blur sell the space.
 *
 * The 3D is computed here, not by CSS: every card, mote and floor line is
 * projected through the camera to a 2D position and scale, and drawn far to
 * near. Browser export (@remotion/web-renderer) draws the DOM to a canvas
 * without CSS perspective, radial gradients or blend modes, so the engine
 * only uses what that renderer draws; the preview and a server render then
 * show the same picture.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Seeded random, so every render of a plan is identical. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashString(v: string): number {
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The room: its edge color, a lit center and two soft glows, drifting with the camera. */
const Room: React.FC<{ look: Look; cam: Camera }> = ({ look, cam }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, u } = look;
  const px = -cam.x * 0.025 - cam.yaw * 6 * u;
  const py = -cam.y * 0.03;
  return (
    <AbsoluteFill style={{ background: look.bgEdge, overflow: "hidden" }}>
      <Glow left={W / 2 - W * 0.675} top={H * 0.44 - H * 0.625} width={W * 1.35} height={H * 1.25} color={look.bg} falloff={0.8} />
      <Glow left={W * 0.38 + px + Math.sin(frame / 80) * 40 * u - W * 0.45} top={H * 0.05 + py - W * 0.3} width={W * 0.9} height={W * 0.6} color={look.glow[0]} />
      <Glow left={W * 0.9 - px * 1.4 - W * 0.4} top={H * 0.95 - py - W * 0.275} width={W * 0.8} height={W * 0.55} color={look.glow[1]} />
    </AbsoluteFill>
  );
};

/**
 * Projects a room point to the screen the way the CSS camera does:
 * translate by -camera, rotateY(-yaw), rotateX(-pitch), rotateZ(roll), then
 * perspective onto the plane at z = 0 seen from z = perspective.
 */
type Projector = ReturnType<typeof projector>;

function projector(cam: Camera, width: number, height: number, perspective: number) {
  const rad = Math.PI / 180;
  const [cy, sy] = [Math.cos(-cam.yaw * rad), Math.sin(-cam.yaw * rad)];
  const [cx, sx] = [Math.cos(-cam.pitch * rad), Math.sin(-cam.pitch * rad)];
  const [cz, sz] = [Math.cos(cam.roll * rad), Math.sin(cam.roll * rad)];
  return (x: number, y: number, z: number) => {
    let px = x - cam.x;
    let py = y - cam.y;
    let pz = z - cam.z;
    [px, pz] = [px * cy + pz * sy, -px * sy + pz * cy];
    [py, pz] = [py * cx - pz * sx, py * sx + pz * cx];
    [px, py] = [px * cz - py * sz, px * sz + py * cz];
    const k = perspective / (perspective - pz);
    return { x: px, y: py, z: pz, k, sx: width / 2 + px * k, sy: height / 2 + py * k };
  };
}

/**
 * A grid floor under the route, fading into the room's haze. Drawn as 2D
 * lines projected through the camera rather than as a huge 3D plane: the
 * same picture at a sliver of the cost, in a server render and in a browser.
 */
const Floor: React.FC<{ look: Look; y: number; cam: Camera; perspective: number }> = ({ look, y, cam, perspective }) => {
  const { width, height, u } = look;
  const project = projector(cam, width, height, perspective);
  const cell = 240 * u;
  const near = cam.z + perspective * 0.75;
  const far = cam.z - 15000 * u;
  const span = width * 3;
  const segs: { x1: number; y1: number; x2: number; y2: number; a: number }[] = [];
  const line = (a: [number, number, number], b: [number, number, number]) => {
    let p = project(...a);
    let q = project(...b);
    const limit = perspective * 0.92;
    if (p.z >= limit && q.z >= limit) return;
    // Clip the end that runs past the camera.
    if (p.z >= limit || q.z >= limit) {
      const t = (limit - p.z) / (q.z - p.z);
      const m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as [number, number, number];
      if (p.z >= limit) p = project(...m);
      else q = project(...m);
    }
    const depth = (cam.z - (a[2] + b[2]) / 2) / (15000 * u);
    const alpha = Math.max(0, 1 - depth) ** 1.6;
    if (alpha < 0.02) return;
    segs.push({ x1: p.sx, y1: p.sy, x2: q.sx, y2: q.sy, a: alpha });
  };
  // Lines across, fixed to the room: snap to the grid.
  const z0 = Math.floor(near / cell) * cell;
  for (let z = z0; z > far; z -= cell) line([cam.x - span, y, z], [cam.x + span, y, z]);
  // Lines along, in pieces so each piece can fade with distance.
  const x0 = Math.floor((cam.x - span) / cell) * cell;
  const piece = cell * 4;
  for (let x = x0; x < cam.x + span; x += cell) {
    for (let z = Math.floor(near / piece) * piece + piece; z > far; z -= piece) line([x, y, z], [x, y, z - piece]);
  }
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
      {segs.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={look.grid} strokeOpacity={s.a} strokeWidth={1.4 * u} />
      ))}
    </svg>
  );
};

type Mote = { x: number; y: number; z: number; r: number; a: number; drift: number };

const Dust: React.FC<{ look: Look; motes: Mote[]; project: Projector; perspective: number }> = ({ look, motes, project, perspective }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {motes.map((m, i) => {
        const p = project(m.x, m.y + Math.sin(frame / 40 + m.drift) * 20 * look.u, m.z);
        if (p.z > perspective * 0.8 || p.z < -9000 * look.u) return null;
        const r = m.r * p.k;
        if (r < 0.4) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: p.sx - r,
              top: p.sy - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              background: i % 5 === 0 ? `rgba(${look.accentRgb},${m.a})` : `rgba(${look.textRgb},${m.a * 0.6})`,
            }}
          />
        );
      })}
    </>
  );
};

export const Video: React.FC<VideoInput> = ({ plan, format, brand: site, shots }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const look = useMemo(() => makeLook(plan, format, width, height), [plan, format, width, height]);
  const timing = useMemo(() => planTiming(plan), [plan]);
  const u = look.u;
  const route = useMemo(() => stations(plan.scenes.length, plan.path ?? "dolly", width, height, u), [plan.scenes.length, plan.path, width, height, u]);
  const brand = useMemo(() => ({ ...site, name: site.name || plan.brand || "" }), [site, plan.brand]);
  const cam = cameraAt(frame, timing, route, u);
  const perspective = 1500 * u;
  const Z = 2300 * u;

  const motes = useMemo(() => {
    const rnd = seeded(hashString(plan.angle + plan.scenes.length));
    const zMin = route[route.length - 1].pos.z - 4000 * u;
    return Array.from({ length: 70 }, () => ({
      x: (rnd() * 2 - 1) * width * 1.6,
      y: (rnd() * 2 - 1) * height * 1.3 + route[Math.floor(rnd() * route.length)].pos.y,
      z: 1500 * u + rnd() * (zMin - 1500 * u),
      r: (3 + rnd() * 7) * u,
      a: 0.12 + rnd() * 0.3,
      drift: rnd() * 10,
    }));
  }, [plan.angle, plan.scenes.length, route, width, height, u]);

  const floorY = Math.max(...route.map((s) => s.pos.y)) + height * 0.62;
  const project = projector(cam, width, height, perspective);
  // Cards in view, drawn far to near: the canvas exporter has no z-index.
  const placed = route
    .map((st, i) => ({ i, p: project(st.pos.x, st.pos.y, st.pos.z) }))
    .filter(({ p }) => p.z < Z * 0.7 && p.z > -Z * 3.2)
    .sort((a, b) => a.p.z - b.p.z);
  const blur = Math.min(4, Math.max(0, cam.speed - 40) / 26);

  return (
    <LookContext.Provider value={look}>
      <AbsoluteFill>
          <Room look={look} cam={cam} />
          <Floor look={look} y={floorY} cam={cam} perspective={perspective} />
          <AbsoluteFill style={{ overflow: "hidden", filter: blur > 0.3 ? `blur(${blur}px)` : undefined }}>
            <Dust look={look} motes={motes} project={project} perspective={perspective} />
            {placed.map(({ i, p }) => {
              const scene = plan.scenes[i];
              const Card = CARDS[scene.type];
              const from = Math.max(0, moveWindow(i, timing)[0] - 70);
              const land = moveWindow(i, timing)[1];
              // Content starts mid-flight, so a card is already building as
              // it comes into focus; the first one from frame two.
              const start = i === 0 ? 2 : land - Math.round(timing.move * 0.8);
              const end = i < plan.scenes.length - 1 ? timing.starts[i + 1] : timing.total;
              return (
                <Placed key={i} station={route[i]} cam={cam} p={p} Z={Z}>
                  <Sequence from={from} layout="none">
                    <Card scene={scene} at={Math.max(0, start - from)} frames={Math.max(30, end - start)} index={i} count={plan.scenes.length} brand={brand} shots={shots} />
                  </Sequence>
                </Placed>
              );
            })}
          </AbsoluteFill>
          <AbsoluteFill
            style={{
              pointerEvents: "none",
              background: `linear-gradient(180deg, rgba(0,0,0,${look.mode === "dark" ? 0.18 : 0.03}), transparent 30%, transparent 70%, rgba(0,0,0,${look.mode === "dark" ? 0.25 : 0.05}))`,
            }}
          />
          <Grain look={look} />
          <Soundtrack plan={plan} timing={timing} />
      </AbsoluteFill>
    </LookContext.Provider>
  );
};

/**
 * One card in the room: placed where the camera sees it and scaled by its
 * distance, turned by what is left of its angle to the camera, faded in from
 * the haze ahead and out as the camera passes, and defocused by its distance
 * from the plane in focus.
 */
const Placed: React.FC<{ station: Station; cam: Camera; p: ReturnType<Projector>; Z: number; children: React.ReactNode }> = ({ station, cam, p, Z, children }) => {
  // Cards ahead wait dim in the haze; the one in focus is whole.
  const opacity = interpolate(p.z, [-Z * 3.2, -Z * 1.8, -Z * 0.6, -Z * 0.25, Z * 0.3, Z * 0.68], [0, 0.12, 0.2, 1, 1, 0], clamp);
  if (opacity <= 0.001) return null;
  // Defocus only where it shows: a card the camera is leaving or nearing.
  const defocus = p.z > -Z * 0.75 ? Math.min(14, (Math.abs(p.z) / Z) * 9) : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transformOrigin: "0 0",
        transform: `translate(${p.sx}px, ${p.sy}px) rotate(${cam.roll}deg) rotateY(${station.rotY - cam.yaw}deg) rotateX(${station.rotX - cam.pitch}deg) scale(${p.k}) translate(-50%, -50%)`,
        opacity,
        filter: defocus > 1.2 ? `blur(${defocus}px)` : undefined,
      }}
    >
      {children}
    </div>
  );
};

/** Frames a plan runs. */
export const planFrames = (plan: VideoInput["plan"]) => planTiming(plan).total;

const NOISE_TILE = 256;
const NOISE = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${NOISE_TILE * 9}" height="${NOISE_TILE * 9}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`,
)}`;

/** Top of the stack: film grain, shifted every frame, and a soft vignette. */
const Grain: React.FC<{ look: Look }> = ({ look }) => {
  const frame = useCurrentFrame();
  const v = look.mode === "dark" ? 0.38 : 0.1;
  return (
    <>
      <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden", opacity: look.mode === "dark" ? 0.06 : 0.04 }}>
        <Img
          src={NOISE}
          style={{
            position: "absolute",
            left: -((frame * 7) % NOISE_TILE),
            top: -((frame * 13) % NOISE_TILE),
            width: NOISE_TILE * 9,
            height: NOISE_TILE * 9,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: `linear-gradient(90deg, rgba(0,0,0,${v}) 0%, transparent 24%, transparent 76%, rgba(0,0,0,${v}) 100%), linear-gradient(180deg, rgba(0,0,0,${v * 0.8}) 0%, transparent 26%, transparent 74%, rgba(0,0,0,${v}) 100%)`,
        }}
      />
    </>
  );
};

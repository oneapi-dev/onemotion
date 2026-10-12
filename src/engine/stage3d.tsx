import { useFrame } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, Matrix4, PerspectiveCamera, ShaderMaterial } from "three";
import type { Look } from "./looks";
import type { Camera, Station } from "./rig";

/**
 * The room drawn by WebGL behind the HTML cards: a floor with its grid and
 * dust with bokeh. The room's glows stay HTML
 * underneath; the canvas is transparent and everything in it fades out with
 * distance, so the floor melts into them instead of ending on a line.
 *
 * Room space is the engine's: px, y down, the camera at `cam` with the eye
 * `perspective` behind it (projector in rig.ts). Three.js is y up, so a
 * room point goes in as (x, -y, z) and the view matrix is the engine's
 * rotation conjugated by that flip; the floor under a card's HTML position
 * then agrees with it to the pixel. @remotion/web-renderer copies the
 * canvas as pixels, hence preserveDrawingBuffer.
 */

export type Mote = { x: number; y: number; z: number; r: number; a: number; drift: number; accent: boolean };

const FLIP = new Matrix4().makeScale(1, -1, 1);

/** Splits "rgba(r,g,b,a)", "r,g,b" or a hex into a three.js color and an opacity. */
function paint(css: string): { color: Color; opacity: number } {
  const m = css.match(/rgba?\(([^)]+)\)/) ?? css.match(/^(\d+\s*,\s*\d+\s*,\s*\d+)$/);
  if (!m) return { color: new Color(css), opacity: 1 };
  const [r, g, b, a = 1] = m[1].split(",").map((v) => Number.parseFloat(v));
  return { color: new Color(r / 255, g / 255, b / 255), opacity: a };
}

function viewMatrix(cam: Camera, perspective: number): Matrix4 {
  const rad = Math.PI / 180;
  const [cy, sy] = [Math.cos(-cam.yaw * rad), Math.sin(-cam.yaw * rad)];
  const [cx, sx] = [Math.cos(-cam.pitch * rad), Math.sin(-cam.pitch * rad)];
  const [cz, sz] = [Math.cos(cam.roll * rad), Math.sin(cam.roll * rad)];
  // prettier-ignore
  const ry = new Matrix4().set(cy, 0, sy, 0, 0, 1, 0, 0, -sy, 0, cy, 0, 0, 0, 0, 1);
  // prettier-ignore
  const rx = new Matrix4().set(1, 0, 0, 0, 0, cx, -sx, 0, 0, sx, cx, 0, 0, 0, 0, 1);
  // prettier-ignore
  const rz = new Matrix4().set(cz, -sz, 0, 0, sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  return new Matrix4()
    .makeTranslation(0, 0, -perspective)
    .multiply(FLIP)
    .multiply(rz)
    .multiply(rx)
    .multiply(ry)
    .multiply(FLIP)
    .multiply(new Matrix4().makeTranslation(-cam.x, cam.y, -cam.z));
}

// Distance fade shared by everything on the floor: whole up close, gone by `far`.
const FADE = /* glsl */ `
  uniform float uFar;
  float fade(float d) { return pow(clamp(1.0 - d / uFar, 0.0, 1.0), 1.6); }
`;

const FLOOR_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying float vDist;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 view = viewMatrix * world;
    vDist = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

const FLOOR_FRAG = /* glsl */ `
  uniform vec3 uTint;
  uniform float uTintA;
  uniform vec3 uGrid;
  uniform float uGridA;
  uniform float uCell;
  uniform float uLine;
  varying vec3 vWorld;
  varying float vDist;
  ${FADE}
  void main() {
    vec2 p = vWorld.xz / uCell;
    vec2 w = fwidth(p);
    // Distance to the nearest line, in screen px, against a line uLine px wide.
    vec2 g = abs(fract(p - 0.5) - 0.5) / max(w, 1e-5);
    float line = 1.0 - clamp(min(g.x, g.y) - uLine * 0.5 + 0.5, 0.0, 1.0);
    // Cells a few px wide alias into moire: fade the grid out before that.
    line *= 1.0 - smoothstep(0.12, 0.35, max(w.x, w.y));
    float f = fade(vDist);
    // Grid over tint, unpremultiplied: the canvas is composited as straight alpha.
    float a = uTintA * f;
    float la = line * uGridA * f;
    float out_a = la + a * (1.0 - la);
    vec3 c = (uGrid * la + uTint * a * (1.0 - la)) / max(out_a, 1e-5);
    gl_FragColor = vec4(c, out_a);
  }
`;

const DUST_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aDrift;
  attribute float aAccent;
  uniform float uFrame;
  uniform float uU;
  uniform float uFocus;
  varying float vAlpha;
  varying float vAccent;
  varying float vSoft;
  void main() {
    vec3 pos = position;
    pos.y -= sin(uFrame / 40.0 + aDrift) * 20.0 * uU;
    vec4 view = modelViewMatrix * vec4(pos, 1.0);
    float d = -view.z;
    // Circle of confusion: a mote off the focal plane grows and dims.
    float coc = clamp(abs(d - uFocus) / uFocus, 0.0, 3.0);
    float size = aSize * 2.0 * uFocus / max(d, 1.0) * (1.0 + coc * 1.6);
    gl_PointSize = clamp(size, 0.0, 220.0);
    vAlpha = aAlpha / (1.0 + coc * 0.5);
    // Too close to the lens, or too far to matter.
    vAlpha *= smoothstep(uFocus * 0.15, uFocus * 0.35, d) * (1.0 - smoothstep(uFocus * 4.0, uFocus * 7.0, d));
    vSoft = clamp(0.12 + coc * 0.35, 0.12, 0.9);
    vAccent = aAccent;
    gl_Position = projectionMatrix * view;
  }
`;

const DUST_FRAG = /* glsl */ `
  uniform vec3 uText;
  uniform vec3 uAccent;
  varying float vAlpha;
  varying float vAccent;
  varying float vSoft;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(1.0 - vSoft, 1.0, r);
    if (a <= 0.0) discard;
    vec3 c = mix(uText, uAccent, vAccent);
    gl_FragColor = vec4(c, a * vAlpha * mix(0.6, 1.0, vAccent));
  }
`;

type Props = {
  look: Look;
  cam: Camera;
  route: Station[];
  motes: Mote[];
  floorY: number;
  perspective: number;
  frame: number;
};

/** Points the camera and sets this frame's uniforms. */
function sync(camera: PerspectiveCamera, props: Props, dust: ShaderMaterial) {
  const { cam, perspective, look, frame } = props;
  camera.fov = (2 * Math.atan(look.height / 2 / perspective) * 180) / Math.PI;
  camera.aspect = look.width / look.height;
  camera.near = 20 * look.u;
  camera.far = 40000 * look.u;
  camera.updateProjectionMatrix();
  viewMatrix(cam, perspective).invert().decompose(camera.position, camera.quaternion, camera.scale);
  camera.updateMatrixWorld(true);
  dust.uniforms.uFrame.value = frame;
  dust.uniforms.uFocus.value = perspective;
}

/** Everything WebGL draws, updated inside advance() right before each frame. */
const Room: React.FC<Props> = (props) => {
  const { look, route, motes, floorY } = props;
  const { u } = look;
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const far = 15000 * u;

  const floor = useMemo(() => {
    const grid = paint(look.grid);
    const dark = look.mode === "dark";
    return new ShaderMaterial({
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTint: { value: dark ? new Color(0, 0, 0) : paint(look.bgEdge).color },
        uTintA: { value: dark ? 0.15 : 0.25 },
        uGrid: { value: grid.color },
        uGridA: { value: Math.min(1, grid.opacity * 2.2) },
        uCell: { value: 240 * u },
        uLine: { value: Math.max(1, 1.4 * u) },
        uFar: { value: far },
      },
    });
  }, [look.grid, look.mode, look.bgEdge, u, far]);

  const dust = useMemo(() => {
    const geo = new BufferGeometry();
    const n = motes.length;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const alpha = new Float32Array(n);
    const drift = new Float32Array(n);
    const accent = new Float32Array(n);
    motes.forEach((m, i) => {
      pos.set([m.x, -m.y, m.z], i * 3);
      size[i] = m.r;
      alpha[i] = m.a;
      drift[i] = m.drift;
      accent[i] = m.accent ? 1 : 0;
    });
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("aSize", new BufferAttribute(size, 1));
    geo.setAttribute("aAlpha", new BufferAttribute(alpha, 1));
    geo.setAttribute("aDrift", new BufferAttribute(drift, 1));
    geo.setAttribute("aAccent", new BufferAttribute(accent, 1));
    const mat = new ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uFrame: { value: 0 },
        uU: { value: u },
        uFocus: { value: 1500 * u },
        uText: { value: paint(look.textRgb).color },
        uAccent: { value: paint(look.accentRgb).color },
      },
    });
    return { geo, mat };
  }, [motes, u, look.textRgb, look.accentRgb]);

  // GPU resources outlive React: free them when a new plan replaces them.
  useEffect(() => () => floor.dispose(), [floor]);
  useEffect(
    () => () => {
      dust.geo.dispose();
      dust.mat.dispose();
    },
    [dust],
  );
  useFrame((state) => sync(state.camera as PerspectiveCamera, latest.current, dust.mat));

  const size = 240 * u * 160;
  const midZ = (route[0].pos.z + route[route.length - 1].pos.z) / 2;
  return (
    <>
      <mesh position={[0, -floorY, midZ]} rotation={[-Math.PI / 2, 0, 0]} material={floor} renderOrder={0}>
        <planeGeometry args={[size, size]} />
      </mesh>
      <points geometry={dust.geo} material={dust.mat} renderOrder={1} frustumCulled={false} />
    </>
  );
};

export const Stage3D: React.FC<Props & { blur: number }> = ({ blur, ...props }) => {
  const { width, height } = props.look;
  return (
    <div style={{ position: "absolute", inset: 0, filter: blur > 0.3 ? `blur(${blur}px)` : undefined }}>
      <ThreeCanvas width={width} height={height} dpr={1} gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true, premultipliedAlpha: false }} flat linear>
        <Room {...props} />
      </ThreeCanvas>
    </div>
  );
};

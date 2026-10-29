/* eslint-disable */
// @ts-nocheck
// Ported from the aiTrends 2D Studio engine (kit v0.1.0, engine/three-kit.js), kept as close to the original
// as the move allows: it draws into a Canvas 2D context, frame by frame, and runs inside a Remotion
// <canvas> (kit/studio2d/Studio2D.tsx plays the shots, grades and letterboxes the frame like its player).
// engine/three-kit.js — low-poly 3D for establishing shots, orbits and fly-throughs (Three.js).
// Same look as the 2D shots: flat colours, black stick figures with a light outline, warm key light,
// real shadows, additive light shafts, bloom. 1 world unit = 1 metre.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { E, S, mood, shade, rng, key, ease, clamp, lerp } from './core';
import { POSES } from './rig2d';
export { THREE };

let R = null;
export function getRenderer(canvas) {
  if (R) return R;
  R = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  R.setPixelRatio(1); R.setSize(Math.round(E.W * E.PX), Math.round(E.H * E.PX), false);
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0; R.outputColorSpace = THREE.SRGBColorSpace;
  return R;
}
const C = (c) => new THREE.Color(c);
export const mat = (c, o = {}) => { const { flat, ...rest } = o; return new THREE.MeshStandardMaterial({ color: C(c), roughness: 0.9, metalness: 0, flatShading: !!flat, ...rest }); };
export const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: C(c), ...o });
export function canvasTex(w, h, draw, repeat = null) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); } return t; }

// stage({ mood:'dusk', fov:35, bloom, fog:[near,far], sky:[top,bottom] | colour, shadowSize:14 })
export function stage(o = {}) {
  const M = mood(o.mood || 'dusk'), st = S();
  const scene = new THREE.Scene(); const sky = o.sky || M.sky;
  scene.background = Array.isArray(sky) ? canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); sky.forEach((c, i) => gr.addColorStop(i / (sky.length - 1), c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) : C(sky);
  if (o.fog !== false) scene.fog = new THREE.Fog(C(o.fogColor || M.dark), ...(o.fog || [18, 70]));
  const camera = new THREE.PerspectiveCamera(o.fov || 35, E.W / E.H, 0.1, 500);
  const hemi = new THREE.HemisphereLight(C(o.ambientSky || M.ambient), C(M.dark), o.ambient ?? 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(C(o.keyColor || M.key), o.keyIntensity ?? 2.3); sun.position.set(...(o.keyPos || [-6, 10, -8])); sun.castShadow = true;
  const ss = o.shadowSize || 14; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -ss, right: ss, top: ss, bottom: -ss, near: 0.5, far: 80 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const w = Math.round(E.W * E.PX), h = Math.round(E.H * E.PX);
  const composer = new EffectComposer(R, new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), o.bloom ?? (st.grade.bloom ?? 0.55) * 0.7, 0.5, o.bloomThreshold ?? 0.88); composer.addPass(bloom); composer.addPass(new OutputPass());
  const api = {
    scene, camera, composer, sun, hemi, M, bloom,
    add: (...objs) => { objs.forEach(ob => scene.add(ob)); return objs[0]; },
    render: () => composer.render(),
    dispose: () => { scene.traverse(x => { x.geometry?.dispose(); [].concat(x.material || []).forEach(m => { m.map?.dispose(); m.dispose(); }); }); composer.renderTarget1?.dispose(); composer.renderTarget2?.dispose(); },
  };
  return api;
}
// --- primitive builders (all return meshes, already shadow-enabled) ---
const prep = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };
export const box = (w, h, d, material, x = 0, y = 0, z = 0) => { const m = prep(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof material === 'string' ? mat(material) : material)); m.position.set(x, y, z); return m; };
export const cyl = (rt, rb, h, material, x = 0, y = 0, z = 0, seg = 16) => { const m = prep(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof material === 'string' ? mat(material) : material)); m.position.set(x, y, z); return m; };
export const cone = (r, h, material, x = 0, y = 0, z = 0, seg = 8) => { const m = prep(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), typeof material === 'string' ? mat(material, { flat: true }) : material)); m.position.set(x, y, z); return m; };
export const sphere = (r, material, x = 0, y = 0, z = 0) => { const m = prep(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), typeof material === 'string' ? mat(material) : material)); m.position.set(x, y, z); return m; };
export const plane = (w, h, material, x = 0, y = 0, z = 0) => { const m = prep(new THREE.Mesh(new THREE.PlaneGeometry(w, h), typeof material === 'string' ? mat(material) : material), false, true); m.position.set(x, y, z); return m; };
export function ground(w, d, color, tex = null) { const m = plane(w, d, mat('#ffffff', { color: C(color), map: tex })); m.rotation.x = -Math.PI / 2; return m; }
export const planks = (base = '#6a4332', n = 16, rep = [4, 4]) => canvasTex(512, 512, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 3; for (let x = 0; x <= w; x += w / n) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } }, rep);
export const tiles = (base = '#3a3a48', n = 8, rep = [4, 4]) => canvasTex(512, 512, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo((i * w) / n, 0); g.lineTo((i * w) / n, h); g.stroke(); g.beginPath(); g.moveTo(0, (i * h) / n); g.lineTo(w, (i * h) / n); g.stroke(); } }, rep);
// glowing window pane with mullions (emissive, blooms)
export function windowPane(w, h, o = {}) { const { glowColor = '#ffe7b0', frame = '#2b1a12', cols = 4, rows = 5, power = 0.85, lit = true, interior = false } = o; const t = canvasTex(256, Math.round(256 * h / w), (g, W, H) => { if (lit) { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, glowColor); gr.addColorStop(1, shade(glowColor, -0.45)); g.fillStyle = gr; } else g.fillStyle = '#1a1c2a'; g.fillRect(0, 0, W, H); if (interior) { g.fillStyle = 'rgba(30,18,14,.75)'; g.fillRect(0, H * 0.6, W, 8); for (let k = 0; k < 7; k++) g.fillRect(14 + k * 34, H * 0.6 - 30 - (k % 3) * 8, 14, 30 + (k % 3) * 8); g.beginPath(); g.arc(W * 0.7, H * 0.9, W * 0.12, 0, 7); g.fill(); } g.fillStyle = frame; for (let i = 0; i <= cols; i++) g.fillRect((i * W) / cols - 5, 0, 10, H); for (let j = 0; j <= rows; j++) g.fillRect(0, (j * H) / rows - 5, W, 10); }); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(power, power * 0.95, power * 0.85) })); return m; }
// soft additive light shaft from (x,y,z) pointing along dir
let _shaftTex = null;
export function shaft(w, len, color = '#ffcf8a', opacity = 0.05) { _shaftTex ||= canvasTex(64, 256, (g, W, H) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); const gx = g.createLinearGradient(0, 0, W, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.2, 'rgba(0,0,0,0)'); gx.addColorStop(0.8, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, W, H); }); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshBasicMaterial({ color: C(color), map: _shaftTex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.castShadow = false; return m; }
// building with emissive window grid
export function building(w, h, d, o = {}) { const { color = '#2a2238', win = '#ffcf8a', lit = 0.55, seed = 3 } = o; const r = rng(seed); const cols = Math.max(2, Math.round(w / 1.6)), rows = Math.max(2, Math.round(h / 2.2)); const t = canvasTex(cols * 32, rows * 40, (g, W, H) => { g.fillStyle = color; g.fillRect(0, 0, W, H); for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { g.fillStyle = r() < lit ? win : shade(color, -0.35); g.fillRect(i * 32 + 8, j * 40 + 10, 16, 22); } }); const front = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: C('#ffffff'), emissiveIntensity: 0.55, roughness: 1 }); const side = mat(color); const m = prep(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, front, side])); m.position.y = h / 2; return m; }
export function tree3D(x, z, s = 1, color = '#1c1626') { const g = new THREE.Group(); g.add(cyl(0.12 * s, 0.16 * s, 2.2 * s, color, 0, 1.1 * s, 0, 8)); for (const [dx, dy, dz, r] of [[0, 3, 0, 1.1], [-0.6, 2.5, 0.3, 0.8], [0.6, 2.6, -0.2, 0.85]]) g.add(sphere(r * s, mat(color, { flat: true }), dx * s, dy * s, dz * s)); g.position.set(x, 0, z); return g; }
export function pine3D(x, z, s = 1, color = '#1c1626') { const m = cone(0.7 * s, 4 * s, color, x, 2 * s, z, 7); return m; }
// instanced crowd on tiered stands: rows along x, stepping back in z and up in y
export function crowd3D(o = {}) { const { rows = 12, perRow = 80, width = 60, step = 0.8, rise = 0.5, colors = ['#3a3358', '#4a4068', '#2e2a48', '#5a4a70'], seed = 4, z0 = 0, y0 = 0 } = o; const r = rng(seed); const geo = new THREE.CapsuleGeometry(0.16, 0.45, 3, 6); const mesh = new THREE.InstancedMesh(geo, mat('#ffffff'), rows * perRow); const m4 = new THREE.Matrix4(), col = new THREE.Color(); let i = 0; for (let j = 0; j < rows; j++) for (let k = 0; k < perRow; k++) { m4.makeTranslation(-width / 2 + (k + r() * 0.5) * (width / perRow), y0 + j * rise + 0.5, z0 - j * step); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.set(colors[Math.floor(r() * colors.length)])); i++; } mesh.castShadow = false; mesh.receiveShadow = true; const steps = new THREE.Group(); for (let j = 0; j < rows; j++) steps.add(box(width, 0.3, step, mat(shade(colors[0], -0.4)), 0, y0 + j * rise, z0 - j * step)); const g = new THREE.Group(); g.add(mesh, steps); return g; }

// ---------- 3D stick figure (shares POSES with the 2D rig) ----------
const U = 1 / 140; // 2D rig units -> metres (figure ≈ 1.7 m)
export function figure3D(outfit = {}, o = {}) {
  const st = S(), ink = mat(st.ink, { roughness: 0.75 }), rimC = o.rim || '#ffd39b', out = new THREE.MeshBasicMaterial({ color: C(rimC), side: THREE.BackSide });
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g); g.scale.setScalar((o.s || 1) * (outfit.kid ? 0.72 : 1));
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12), sphGeo = new THREE.SphereGeometry(1, 16, 12);
  const clothes = outfit.top && outfit.top !== 'none' ? mat(outfit.top === 'labcoat' ? '#ebe7f0' : outfit.color || '#d64a33') : null;
  const limbs = [];
  const mk = (a, b, r, m = ink) => { const core = new THREE.Mesh(cylGeo, m), ol = new THREE.Mesh(cylGeo, out); core.castShadow = true; g.add(ol, core); const j = new THREE.Mesh(sphGeo, m), jo = new THREE.Mesh(sphGeo, out); j.castShadow = true; g.add(jo, j); limbs.push({ a, b, r, core, ol, j, jo }); };
  const long = ['hoodie', 'tracksuit', 'labcoat', 'trench', 'suit'].includes(outfit.top);
  mk('sh', 'hip', clothes ? 0.085 : 0.05, clothes || ink);
  mk('hip', 'kF', 0.045); mk('kF', 'fF', 0.042, outfit.legs ? mat(outfit.legs) : ink); mk('hip', 'kB', 0.045); mk('kB', 'fB', 0.042, outfit.legs ? mat(outfit.legs) : ink);
  mk('sh', 'eF', clothes && outfit.top !== 'dress' ? 0.055 : 0.04, clothes && outfit.top !== 'dress' ? clothes : ink); mk('eF', 'hF', long ? 0.05 : 0.038, long ? clothes : ink);
  mk('sh', 'eB', clothes && outfit.top !== 'dress' ? 0.055 : 0.04, clothes && outfit.top !== 'dress' ? clothes : ink); mk('eB', 'hB', long ? 0.05 : 0.038, long ? clothes : ink);
  const head = new THREE.Group(); const hs = new THREE.Mesh(sphGeo, ink); hs.scale.setScalar(26 * U); hs.castShadow = true; const ho = new THREE.Mesh(sphGeo, out); ho.scale.setScalar(26 * U * 1.07); head.add(ho, hs);
  const eyeM = basic(st.feature); for (const z of [-0.06, 0.06]) { const e = new THREE.Mesh(sphGeo, eyeM); e.scale.setScalar(0.022); e.position.set(0.17, 0.02, z); head.add(e); }
  const hc = outfit.headColor || '#f2c21a', hm = mat(hc, { roughness: 0.5 });
  if (['cap', 'capBack', 'visor'].includes(outfit.head)) { const dome = new THREE.Mesh(new THREE.SphereGeometry(0.195, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hm); dome.position.y = 0.03; const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 20, 1, false, -0.9, 1.8), hm); brim.position.set(outfit.head === 'capBack' ? -0.1 : 0.1, 0.04, 0); if (outfit.head === 'capBack') brim.rotation.y = Math.PI; head.add(dome, brim); }
  if (outfit.head === 'beanie') { const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hm); dome.scale.y = 1.15; const pom = new THREE.Mesh(sphGeo, mat(shade(hc, 0.3))); pom.scale.setScalar(0.06); pom.position.y = 0.25; head.add(dome, pom); }
  if (outfit.head === 'fedora') { const fm = mat(hc); const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.02, 24), fm); brim.position.y = 0.1; const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.17, 20), fm); crown.position.y = 0.19; head.add(brim, crown); }
  if (outfit.head === 'headband') { const band = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 24), hm); band.rotation.x = Math.PI / 2; band.position.y = 0.08; head.add(band); }
  if (outfit.head === 'hood') { const hood = new THREE.Mesh(sphGeo, mat(outfit.headColor || outfit.color || '#d64a33')); hood.scale.setScalar(0.23); hood.position.set(-0.04, 0.01, 0); head.add(hood); }
  g.add(head);
  let coat = null; if (['labcoat', 'trench', 'dress'].includes(outfit.top)) { coat = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 1, 12, 1, true), clothes); coat.material.side = THREE.DoubleSide; coat.castShadow = true; g.add(coat); }
  const P3 = (p, k) => { const near = /F$/.test(k) ? 0.1 : /B$/.test(k) ? -0.1 : 0; return new THREE.Vector3(p[0] * U, -p[1] * U, near); };
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  root.setPose = (pose) => {
    const p = typeof pose === 'string' ? POSES[pose] : pose;
    for (const L of limbs) { const A = P3(p[L.a], L.a), B = P3(p[L.b], L.b); const len = A.distanceTo(B); tmp.copy(B).sub(A).normalize();
      for (const [m, k] of [[L.core, 1], [L.ol, 1.22]]) { m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(up, tmp); m.scale.set(L.r * k, len, L.r * k); }
      L.j.position.copy(B); L.j.scale.setScalar(L.r); L.jo.position.copy(B); L.jo.scale.setScalar(L.r * 1.22); }
    const H = P3(p.head, 'head'); head.position.copy(H);
    if (coat) { const S0 = P3(p.sh, 'sh'), Hp = P3(p.hip, 'hip'); const bottom = Hp.clone().add(new THREE.Vector3(0, outfit.top === 'dress' ? -0.3 : -0.42, 0)); coat.position.copy(S0).add(bottom).multiplyScalar(0.5); coat.scale.y = S0.distanceTo(bottom); coat.quaternion.setFromUnitVectors(up, tmp.copy(S0).sub(bottom).normalize()); }
    return root;
  };
  root.setPose(o.pose || 'stand'); return root;
}
// camera helpers
export function orbit(camera, t, o = {}) { const { target = [0, 1, 0], radius = 8, height = 3, from = -0.6, to = 0.2, dur = 5, e = ease.inOut } = o; const k = e(clamp(t / dur)); const a = lerp(from, to, k), r = typeof radius === 'number' ? radius : lerp(radius[0], radius[1], k), h = typeof height === 'number' ? height : lerp(height[0], height[1], k); camera.position.set(target[0] + Math.sin(a) * r, h, target[2] + Math.cos(a) * r); camera.lookAt(...target); }
// dolly(camera, t, [[0, {pos:[x,y,z], look:[x,y,z]}], [4, {...}]])
export function dolly(camera, t, keys) { const v = key(t, keys); camera.position.set(...v.pos); camera.lookAt(...v.look); if (v.fov) { camera.fov = v.fov; camera.updateProjectionMatrix(); } }

/* eslint-disable */
// @ts-nocheck
// Ported from the aiTrends 2D Studio reference project (reaction-time); only its imports changed.
import { s2, rig } from '@kit';
import { registerShot } from './registry';
// shots/02_orbit3d.js — s008: 3D orbit around the café table (Three.js). init() builds once, draw() animates.
const { E, V, mood, ease, prog } = s2;
const { POSES } = rig;
import { MAX, JAKE } from './cast';

registerShot('s008', {
  kind: '3d',
  init(T) {
    const M = mood('golden');
    const st = T.stage({ mood: 'golden', fov: V(34, 52), fog: [14, 45], keyPos: [-8, 9, 6], keyIntensity: 2.8, ambient: 1.3 });
    const { THREE } = T;
    st.add(T.ground(60, 60, M.floor, T.tiles(M.floor, 10, [10, 10])));
    // café facade: wall, warm windows, striped awning
    st.add(T.box(30, 7, 0.4, M.wall, 0, 3.5, -4));
    for (const x of [-6, -3, 3, 6]) { const w = T.windowPane(2.2, 2.6, { glowColor: M.practical, cols: 2, rows: 1, power: 0.8, interior: true }); w.position.set(x, 2.1, -3.78); st.add(w); }
    const door = T.windowPane(1.3, 2.6, { glowColor: M.practical, cols: 1, rows: 1, power: 1.05 }); door.position.set(0, 1.3, -3.78); st.add(door);
    for (let i = 0; i < 30; i++) st.add(T.box(1, 0.6, 1.1, i % 2 ? '#efe4d4' : '#b8402f', -15 + i + 0.5, 3.9, -3.3));
    // table, chairs, cup
    st.add(T.cyl(0.55, 0.55, 0.05, '#2a1d22', 0, 0.75, 0, 24), T.cyl(0.05, 0.05, 0.75, '#2a1d22', 0, 0.37, 0), T.cyl(0.3, 0.3, 0.03, '#2a1d22', 0, 0.015, 0));
    const cup = T.cyl(0.05, 0.04, 0.09, '#f2ece4', 0.15, 0.82, 0.05); st.add(cup);
    for (const sx of [-1, 1]) { st.add(T.box(0.45, 0.05, 0.45, '#24181e', sx * 0.85, 0.48, 0), T.box(0.05, 0.6, 0.45, '#24181e', sx * 1.08, 0.78, 0)); for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) st.add(T.box(0.04, 0.48, 0.04, '#24181e', sx * 0.85 + lx, 0.24, lz)); }
    // the two friends (same outfits as the 2D shots)
    const max = T.figure3D(MAX, { rim: M.rim, pose: POSES.sit }); max.position.set(-0.85, 0, 0); st.add(max);
    const jake = T.figure3D(JAKE, { rim: M.rim, pose: POSES.sitBack }); jake.position.set(0.85, 0, 0); jake.rotation.y = Math.PI; st.add(jake);
    // lamp posts + trees for depth
    for (const x of [-9, 9]) st.add(T.cyl(0.06, 0.08, 4, '#15121c', x, 2, 1.5));
    st.add(T.tree3D(-12, 2, 1.2, '#2a1f2a'), T.tree3D(12, 1, 1.1, '#2a1f2a'));
    const shafts: any[] = []; for (const x of [-6, -3, 3, 6]) { const s = T.shaft(2.2, 5, M.practical, 0.06); s.position.set(x, 1.6, -2.2); s.rotation.x = -0.75; st.add(s); shafts.push(s); }
    return { stage: st, max, jake, cup };
  },
  draw(s, t, info, T) {
    s.max.setPose({ ...POSES.sit, eF: [24, -150], hF: [34, -170] });          // Max still holding up the caught fly
    T.orbit(s.stage.camera, t, { target: [0, 0.9, 0], radius: V(5.2, 6.8), height: [2.6, 1.9], from: -0.9, to: 0.35, dur: info.dur });
  },
});

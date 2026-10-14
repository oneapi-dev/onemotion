// Synthesizes Motion's audio kit: deterministic, no downloads, no licences.
//
//   public/audio/<track>.mp3       48 s music beds at a fixed tempo
//   public/audio/<track>-end.mp3   the track's closing hit, rung out
//   public/audio/<sfx>.mp3         whoosh, swoosh, impact, riser, tick, pop, ding, type, click
//   src/engine/music.ts              tempo and bar length of each bed (generated)
//
// Every bed is arranged in bars (intro, groove, a break, a fuller groove) so a
// video cut on the beat lands on the music's own structure. Renders WAV, then
// encodes MP3 with the ffmpeg Remotion ships; without it the WAVs are kept.
//
// Run: node scripts/make-audio.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "audio");
const META = join(ROOT, "src", "engine", "music.ts");
const SR = 44100;
const TAU = Math.PI * 2;
const BED_SECONDS = 48;

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

let seed = 20261011;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rand() * 2 - 1;

// ------------------------------------------------------------------ buses

function bus(seconds) {
  const n = Math.ceil(seconds * SR);
  return { L: new Float32Array(n), R: new Float32Array(n), n };
}

function put(b, i, v, pan = 0) {
  if (i < 0 || i >= b.n) return;
  b.L[i] += v * Math.cos(((pan + 1) * Math.PI) / 4);
  b.R[i] += v * Math.sin(((pan + 1) * Math.PI) / 4);
}

function mixInto(dst, src, gain = 1, gainAt = null) {
  for (let i = 0; i < Math.min(dst.n, src.n); i++) {
    const g = gainAt ? gain * gainAt(i) : gain;
    dst.L[i] += src.L[i] * g;
    dst.R[i] += src.R[i] * g;
  }
}

// ---------------------------------------------------------------- filters

/** Topology-preserving state-variable filter (Zavalishin). */
function svf() {
  let ic1 = 0;
  let ic2 = 0;
  let g = 0;
  let k = 1;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  return {
    set(cutoff, q = 0.707) {
      g = Math.tan((Math.PI * Math.min(cutoff, SR * 0.45)) / SR);
      k = 1 / q;
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    },
    run(x) {
      const v3 = x - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1;
      ic2 = 2 * v2 - ic2;
      return { low: v2, band: v1, high: x - k * v1 - v2 };
    },
  };
}

function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

function osc(wave, phase, dt) {
  switch (wave) {
    case "saw":
      return 2 * phase - 1 - blep(phase, dt);
    case "square": {
      let v = phase < 0.5 ? 1 : -1;
      v += blep(phase, dt);
      v -= blep((phase + 0.5) % 1, dt);
      return v;
    }
    case "tri":
      return 1 - 4 * Math.abs(phase - 0.5);
    default:
      return Math.sin(TAU * phase);
  }
}

// ----------------------------------------------------------------- voices

/**
 * A synth note: detuned oscillators through a resonant low-pass with its own
 * envelope, an ADSR, and a pan spread across the detuned voices.
 */
function synth(b, o) {
  const {
    t, dur, note, wave = "saw", gain = 0.2, a = 0.005, d = 0.2, s = 0.6, r = 0.2,
    cutoff = 2000, cutoffEnv = 0, cutoffDecay = 0.15, q = 0.8, voices = 1, detune = 0,
    spread = 0, sub = 0, pan = 0, vibrato = 0,
  } = o;
  const len = Math.ceil((dur + r) * SR);
  const i0 = Math.round(t * SR);
  const f0 = hz(note);
  const filters = Array.from({ length: voices }, svf);
  const phases = Array.from({ length: voices }, () => rand());
  let subPhase = 0;
  for (let k = 0; k < len; k++) {
    const tt = k / SR;
    let env;
    if (tt < a) env = tt / a;
    else if (tt < a + d) env = 1 - (1 - s) * ((tt - a) / d);
    else if (tt < dur) env = s;
    else env = s * Math.max(0, 1 - (tt - dur) / r);
    if (env <= 0 && tt > dur) break;
    const fc = cutoff + cutoffEnv * Math.exp(-tt / cutoffDecay);
    for (let v = 0; v < voices; v++) {
      if (k % 16 === 0) filters[v].set(fc, q);
      const cents = voices > 1 ? detune * ((v / (voices - 1)) * 2 - 1) : 0;
      const f = f0 * 2 ** (cents / 1200) * (1 + vibrato * Math.sin(TAU * 5.2 * tt));
      const dt = f / SR;
      phases[v] = (phases[v] + dt) % 1;
      const y = filters[v].run(osc(wave, phases[v], dt)).low;
      const p = voices > 1 ? pan + spread * ((v / (voices - 1)) * 2 - 1) : pan;
      put(b, i0 + k, (y * gain * env) / Math.sqrt(voices), p);
    }
    if (sub) {
      subPhase = (subPhase + f0 / 2 / SR) % 1;
      put(b, i0 + k, Math.sin(TAU * subPhase) * sub * env, pan);
    }
  }
}

/** Two-operator FM: bells, electric piano, marimba. */
function fm(b, { t, dur, note, gain = 0.2, ratio = 3.5, index = 3, indexDecay = 0.4, decay = 1.2, pan = 0 }) {
  const f = hz(note);
  const i0 = Math.round(t * SR);
  const len = Math.ceil((dur + decay * 2) * SR);
  for (let k = 0; k < len; k++) {
    const tt = k / SR;
    const env = Math.min(1, tt / 0.003) * Math.exp(-tt / decay) * (tt > dur ? Math.exp(-(tt - dur) * 6) : 1);
    if (env < 1e-4 && tt > 0.05) break;
    const m = Math.sin(TAU * f * ratio * tt) * index * Math.exp(-tt / indexDecay);
    put(b, i0 + k, Math.sin(TAU * f * tt + m) * gain * env, pan);
  }
}

function kick(b, t, gain = 0.9, { from = 150, to = 44, decay = 0.38, click = 0.25 } = {}) {
  const i0 = Math.round(t * SR);
  let ph = 0;
  for (let k = 0; k < 0.6 * SR; k++) {
    const tt = k / SR;
    const f = to + (from - to) * Math.exp(-tt * 32);
    ph += (TAU * f) / SR;
    const body = Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-tt / decay);
    const tick = tt < 0.004 ? noise() * click * (1 - tt / 0.004) : 0;
    put(b, i0 + k, (body + tick) * gain);
  }
}

function noiseHit(b, t, { gain = 0.3, decay = 0.05, attack = 0.001, type = "high", cutoff = 7000, q = 0.7, pan = 0, len = null, tone = 0, toneHz = 0 }) {
  const f = svf();
  f.set(cutoff, q);
  const i0 = Math.round(t * SR);
  const n = Math.ceil((len ?? decay * 7) * SR);
  for (let k = 0; k < n; k++) {
    const tt = k / SR;
    const env = Math.min(1, tt / attack) * Math.exp(-tt / decay);
    const y = f.run(noise())[type];
    const tn = tone ? Math.sin(TAU * toneHz * tt) * tone * Math.exp(-tt * 18) : 0;
    put(b, i0 + k, (y + tn) * gain * env, pan);
  }
}

const hat = (b, t, gain = 0.12, open = false, pan = 0.15) =>
  noiseHit(b, t, { gain, decay: open ? 0.16 : 0.028, type: "high", cutoff: 8500, pan });
const shaker = (b, t, gain = 0.07, pan = -0.25) => noiseHit(b, t, { gain, decay: 0.035, attack: 0.008, type: "band", cutoff: 6500, q: 1.2, pan });
const snare = (b, t, gain = 0.32) => noiseHit(b, t, { gain, decay: 0.09, type: "band", cutoff: 2200, q: 0.9, tone: 0.5, toneHz: 185 });

function clap(b, t, gain = 0.3) {
  for (const [dt, g] of [[0, 0.6], [0.011, 0.7], [0.022, 1]]) {
    noiseHit(b, t + dt, { gain: gain * g, decay: dt === 0.022 ? 0.11 : 0.008, type: "band", cutoff: 1400, q: 1.4, pan: 0.05 });
  }
}

function crash(b, t, gain = 0.16) {
  noiseHit(b, t, { gain, decay: 1.1, type: "high", cutoff: 5200, len: 4, pan: -0.1 });
  noiseHit(b, t, { gain: gain * 0.7, decay: 0.9, type: "band", cutoff: 9000, q: 0.5, len: 4, pan: 0.15 });
}

function tom(b, t, note, gain = 0.5) {
  const i0 = Math.round(t * SR);
  let ph = 0;
  for (let k = 0; k < 1.2 * SR; k++) {
    const tt = k / SR;
    const f = hz(note) * (1 + 0.6 * Math.exp(-tt * 25));
    ph += (TAU * f) / SR;
    put(b, i0 + k, Math.tanh(Math.sin(ph) * 2) * gain * Math.exp(-tt / 0.32));
  }
  noiseHit(b, t, { gain: gain * 0.25, decay: 0.03, type: "band", cutoff: 900 });
}

// ---------------------------------------------------------------- effects

/** Freeverb: 8 damped combs and 4 all-passes per side. */
function reverb(src, { room = 0.84, damp = 0.3, wet = 1 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  const out = bus(src.n / SR);
  for (const [ch, offset] of [["L", 0], ["R", 23]]) {
    const cs = combs.map((c) => ({ buf: new Float32Array(c + offset), i: 0, store: 0 }));
    const as = alls.map((c) => ({ buf: new Float32Array(c + offset), i: 0 }));
    const x = src[ch];
    const y = out[ch];
    for (let n = 0; n < src.n; n++) {
      const input = (src.L[n] + src.R[n]) * 0.015;
      let s = 0;
      for (const c of cs) {
        const o = c.buf[c.i];
        c.store = o * (1 - damp) + c.store * damp;
        c.buf[c.i] = input + c.store * room;
        c.i = (c.i + 1) % c.buf.length;
        s += o;
      }
      for (const a of as) {
        const o = a.buf[a.i];
        a.buf[a.i] = s + o * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        s = o - s;
      }
      y[n] = s * wet;
      void x;
    }
  }
  return out;
}

/** Ping-pong delay with a darkening feedback path. */
function delay(src, seconds, { feedback = 0.38, tone = 3500 } = {}) {
  const d = Math.round(seconds * SR);
  const out = bus(src.n / SR);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  const fl = svf();
  const fr = svf();
  fl.set(tone);
  fr.set(tone);
  let i = 0;
  for (let n = 0; n < src.n; n++) {
    const yl = bl[i];
    const yr = br[i];
    out.L[n] = yl;
    out.R[n] = yr;
    bl[i] = fl.run((src.L[n] + src.R[n]) * 0.5 + yr * feedback).low;
    br[i] = fr.run(yl * feedback).low;
    i = (i + 1) % d;
  }
  return out;
}

/** Gain curve that ducks under each kick: the pump of dance music. */
function sidechain(kicks, depth = 0.55, release = 0.16) {
  const sorted = [...kicks].sort((x, y) => x - y);
  return (i) => {
    const t = i / SR;
    let lo = 0;
    let hi = sorted.length - 1;
    let last = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= t) {
        last = sorted[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (last < 0) return 1;
    const dt = t - last;
    return 1 - depth * Math.exp(-dt / release) * Math.min(1, dt / 0.004);
  };
}

// ---------------------------------------------------------------- output

function master(b, peak = 0.89) {
  let max = 0;
  for (let i = 0; i < b.n; i++) {
    b.L[i] = Math.tanh(b.L[i] * 1.15);
    b.R[i] = Math.tanh(b.R[i] * 1.15);
    max = Math.max(max, Math.abs(b.L[i]), Math.abs(b.R[i]));
  }
  const g = max > 0 ? peak / max : 1;
  for (let i = 0; i < b.n; i++) {
    b.L[i] *= g;
    b.R[i] *= g;
  }
  return b;
}

function fadeOut(b, seconds) {
  const n = Math.round(seconds * SR);
  for (let k = 0; k < n; k++) {
    const g = 1 - k / n;
    const i = b.n - n + k;
    b.L[i] *= g;
    b.R[i] *= g;
  }
}

const TMP = join(ROOT, ".motion-audio-tmp");
const FFMPEG = join(ROOT, "node_modules", "@remotion", process.platform === "win32" ? "compositor-win32-x64-msvc" : `compositor-${process.platform}-${process.arch}`, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

function save(name, b) {
  const data = Buffer.alloc(b.n * 4);
  for (let i = 0; i < b.n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.L[i])) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.R[i])) * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  const wav = join(TMP, `${name}.wav`);
  writeFileSync(wav, Buffer.concat([h, data]));
  if (existsSync(FFMPEG)) {
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "192k", join(OUT, `${name}.mp3`)]);
    console.log(`wrote public/audio/${name}.mp3`);
  } else {
    writeFileSync(join(OUT, `${name}.wav`), Buffer.concat([h, data]));
    console.log(`wrote public/audio/${name}.wav (no ffmpeg found for MP3)`);
  }
}

// ------------------------------------------------------------------ tracks

/**
 * One bed. `chords` are [root, ...tones] in MIDI; one chord per bar. Parts
 * come in by bar: `intro` bars of pad and filtered hats, groove until
 * `breakAt`, two bars of break, then the full arrangement.
 */
function arrange(spec) {
  const { bpm, chords, intro = 2, breakAt = 10 } = spec;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = Math.ceil(BED_SECONDS / bar);
  const seconds = bars * bar;
  const drums = bus(seconds + 4);
  const bass = bus(seconds + 4);
  const keys = bus(seconds + 4);
  const send = bus(seconds + 4);
  const echo = bus(seconds + 4);
  const kicks = [];
  const ctx = {
    beat, bar, bars,
    chord: (n) => chords[n % chords.length],
    inBreak: (n) => n >= breakAt && n < breakAt + 2,
    full: (n) => n >= breakAt + 2,
    groove: (n) => n >= intro && !(n >= breakAt && n < breakAt + 2),
    kick: (t, g, o) => {
      kicks.push(t);
      kick(drums, t, g, o);
    },
  };
  spec.play({ drums, bass, keys, send, echo, ...ctx });
  const out = bus(seconds + 4);
  const duck = sidechain(kicks, spec.duck ?? 0.5);
  mixInto(out, drums, 1);
  mixInto(out, bass, 1, duck);
  mixInto(out, keys, 1, duck);
  mixInto(out, delay(echo, beat * 0.75, { feedback: 0.4 }), 0.5, duck);
  mixInto(out, reverb(send, { room: spec.room ?? 0.84 }), 1);
  const trimmed = { L: out.L.subarray(0, Math.ceil(seconds * SR)), R: out.R.subarray(0, Math.ceil(seconds * SR)), n: Math.ceil(seconds * SR) };
  fadeOut(trimmed, bar);
  return { buf: master(trimmed), bpm, bar, bars };
}

/** The closing hit: last chord, kick, crash, rung out through the reverb. */
function stinger(spec) {
  const b = bus(4.5);
  const send = bus(4.5);
  const [root, ...tones] = spec.chords[0];
  if (spec.endKick !== false) kick(b, 0.02, 0.9, { decay: 0.6 });
  crash(b, 0.02, 0.14);
  for (const n of tones) {
    synth(b, { t: 0.02, dur: 0.05, note: n, wave: "saw", gain: 0.16, a: 0.002, d: 1.8, s: 0, r: 0.6, cutoff: 900, cutoffEnv: 3000, cutoffDecay: 0.35, voices: 3, detune: 12, spread: 0.7 });
    synth(send, { t: 0.02, dur: 0.05, note: n, wave: "saw", gain: 0.2, a: 0.002, d: 1.5, s: 0, r: 0.6, cutoff: 1400, voices: 3, detune: 12, spread: 0.7 });
    fm(b, { t: 0.02, dur: 0.1, note: n + 12, gain: 0.08, ratio: 3.5, index: 2.5, decay: 1.4 });
  }
  synth(b, { t: 0.02, dur: 0.1, note: root - 12, wave: "saw", gain: 0.3, a: 0.002, d: 1.2, s: 0, r: 0.3, cutoff: 300, cutoffEnv: 500, sub: 0.35 });
  mixInto(b, reverb(send, { room: 0.9 }), 1.2);
  fadeOut(b, 1.2);
  return master(b, 0.85);
}

// Chords: [root, tones...]. Roots sit around C2; tones around C4.
const Am = [45, 57, 60, 64];
const F = [41, 57, 60, 65];
const C = [48, 55, 60, 64];
const G = [43, 55, 59, 62];
const Em = [40, 55, 59, 64];
const D = [38, 54, 57, 62];
const Cmaj = [48, 60, 64, 67];
const Gmaj = [43, 59, 62, 67];
const Dmaj7 = [38, 54, 57, 61, 62];
const Bm7 = [47, 54, 57, 59, 62];
const Gmaj7 = [43, 54, 59, 62, 66];
const A6 = [45, 54, 57, 61, 64];
const Dm = [38, 57, 62, 65];
const Bb = [46, 58, 62, 65];

const TRACKS = {
  // Steady, confident: four on the floor, off-beat bass, a 16th pluck arp.
  drive: {
    bpm: 118,
    chords: [Am, F, C, G],
    play({ drums, bass, keys, send, echo, beat, bar, bars, chord, groove, full, inBreak, kick: k }) {
      for (let n = 0; n < bars; n++) {
        const t0 = n * bar;
        const [root, ...tones] = chord(n);
        for (const note of tones) {
          synth(keys, { t: t0, dur: bar, note, wave: "saw", gain: 0.05, a: 0.3, d: 0.4, s: 0.8, r: 0.6, cutoff: inBreak(n) ? 700 + 600 * ((n % 2) + 0.5) : 1500, voices: 4, detune: 14, spread: 0.8 });
          synth(send, { t: t0, dur: bar, note, wave: "saw", gain: 0.035, a: 0.3, s: 0.8, r: 0.6, cutoff: 1500, voices: 2, detune: 10, spread: 0.8 });
        }
        for (let b = 0; b < 4; b++) {
          const t = t0 + b * beat;
          if (groove(n)) k(t, 0.85);
          if (groove(n)) hat(drums, t + beat / 2, 0.1, b === 3 && n % 4 === 3);
          if (n >= 1 && !groove(n)) hat(drums, t + beat / 2, inBreak(n) ? 0.09 : 0.05);
          if (groove(n) && (b === 1 || b === 3)) clap(drums, t, 0.26);
          if (groove(n) || inBreak(n)) synth(bass, { t: t + beat / 2, dur: beat * 0.4, note: root, wave: "saw", gain: inBreak(n) ? 0.22 : 0.32, a: 0.003, d: 0.12, s: 0.5, r: 0.06, cutoff: 260, cutoffEnv: 900, cutoffDecay: 0.08, sub: 0.28 });
        }
        if (full(n) || (groove(n) && n >= 6)) {
          const pattern = [0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 3, 2, 1, 2, 1];
          pattern.forEach((p, s) => {
            const note = tones[p % tones.length] + 12;
            synth(keys, { t: t0 + s * (beat / 4), dur: beat / 6, note, wave: "square", gain: 0.055, a: 0.002, d: 0.12, s: 0.1, r: 0.08, cutoff: 700, cutoffEnv: 3200, cutoffDecay: 0.06, pan: s % 2 ? 0.35 : -0.35 });
            synth(echo, { t: t0 + s * (beat / 4), dur: beat / 6, note, wave: "square", gain: 0.03, a: 0.002, d: 0.1, s: 0, r: 0.05, cutoff: 2200 });
          });
        }
        if (n % 8 === 7 && groove(n)) for (let s = 0; s < 4; s++) snare(drums, t0 + 3 * beat + s * (beat / 4), 0.1 + s * 0.05);
        if ((n === 2 || n === 12) && groove(n)) crash(drums, t0);
      }
    },
  },
  // Upbeat, happy: syncopated bass, shaker 16ths, marimba hook.
  bright: {
    bpm: 124,
    chords: [Cmaj, Gmaj, [45, 57, 60, 64], [41, 57, 60, 65]],
    duck: 0.35,
    play({ drums, bass, keys, send, echo, beat, bar, bars, chord, groove, full, inBreak, kick: k }) {
      const hook = [0, 2, 4, 2, 5, 4, 2, 0];
      for (let n = 0; n < bars; n++) {
        const t0 = n * bar;
        const [root, ...tones] = chord(n);
        for (const note of tones) synth(send, { t: t0, dur: bar, note: note + 12, wave: "tri", gain: 0.05, a: 0.2, s: 0.8, r: 0.5, cutoff: 3000 });
        for (let s = 0; s < 16; s++) if (n >= 1) shaker(drums, t0 + s * (beat / 4), s % 4 === 2 ? 0.09 : 0.05);
        for (let b = 0; b < 4; b++) {
          const t = t0 + b * beat;
          if (groove(n)) k(t, 0.75);
          if (groove(n) && (b === 1 || b === 3)) clap(drums, t, 0.3);
        }
        if (groove(n) || inBreak(n)) {
          for (const [step, oct] of [[0, 0], [3, 0], [6, 12], [8, 0], [11, 0], [14, 12]]) {
            synth(bass, { t: t0 + step * (beat / 4), dur: beat * 0.3, note: root + oct, wave: "square", gain: 0.2, a: 0.003, d: 0.1, s: 0.4, r: 0.05, cutoff: 500, cutoffEnv: 1200, cutoffDecay: 0.05, sub: 0.3 });
          }
        }
        hook.forEach((h, s) => {
          if (n < 1) return;
          const scale = [60, 62, 64, 65, 67, 69, 71, 72];
          const note = scale[(h + (n % 4)) % scale.length] + (full(n) ? 12 : 0);
          fm(keys, { t: t0 + s * (beat / 2), dur: 0.1, note, gain: 0.11, ratio: 4, index: 1.6, indexDecay: 0.08, decay: 0.28, pan: s % 2 ? 0.3 : -0.3 });
          if (full(n)) fm(echo, { t: t0 + s * (beat / 2), dur: 0.1, note, gain: 0.05, ratio: 4, index: 1.6, indexDecay: 0.08, decay: 0.2 });
        });
        if (n === 2 || n === 12) crash(drums, t0, 0.12);
      }
    },
  },
  // Soft and elegant: half-time, electric piano, warm pad, sustained sub.
  calm: {
    bpm: 90,
    chords: [Dmaj7, Bm7, Gmaj7, A6],
    intro: 1,
    breakAt: 8,
    duck: 0.2,
    room: 0.9,
    play({ drums, bass, keys, send, beat, bar, bars, chord, groove, kick: k }) {
      for (let n = 0; n < bars; n++) {
        const t0 = n * bar;
        const [root, ...tones] = chord(n);
        for (const note of tones) {
          synth(keys, { t: t0, dur: bar, note, wave: "tri", gain: 0.06, a: 0.6, s: 0.9, r: 1, cutoff: 1800, voices: 2, detune: 6, spread: 0.6 });
          synth(send, { t: t0, dur: bar, note, wave: "tri", gain: 0.05, a: 0.6, s: 0.9, r: 1, cutoff: 1800 });
        }
        synth(bass, { t: t0, dur: bar * 0.95, note: root, wave: "sine", gain: 0.3, a: 0.05, s: 0.9, r: 0.3, cutoff: 400 });
        [0, 1.5, 2.5, 3].forEach((b, i) => {
          const note = tones[(i + n) % tones.length] + 12;
          fm(keys, { t: t0 + b * beat, dur: 0.4, note, gain: 0.09, ratio: 1, index: 1.4, indexDecay: 0.6, decay: 1.1, pan: i % 2 ? 0.25 : -0.25 });
          fm(send, { t: t0 + b * beat, dur: 0.4, note, gain: 0.07, ratio: 1, index: 1.2, decay: 1.1 });
        });
        if (groove(n)) {
          k(t0, 0.55, { decay: 0.3 });
          k(t0 + 2.5 * beat, 0.4, { decay: 0.3 });
          noiseHit(drums, t0 + 2 * beat, { gain: 0.16, decay: 0.05, type: "band", cutoff: 1800, q: 2, tone: 0.3, toneHz: 420 });
          for (let s = 0; s < 8; s++) hat(drums, t0 + s * (beat / 2), s % 2 ? 0.035 : 0.055);
        }
      }
    },
  },
  // Driving electronic: rolling 16th bass, open hats, a stab every bar.
  pulse: {
    bpm: 126,
    chords: [Em, Em, C, D],
    duck: 0.6,
    play({ drums, bass, keys, send, echo, beat, bar, bars, chord, groove, full, inBreak, kick: k }) {
      for (let n = 0; n < bars; n++) {
        const t0 = n * bar;
        const [root, ...tones] = chord(n);
        for (let b = 0; b < 4; b++) {
          const t = t0 + b * beat;
          if (groove(n)) k(t, 0.95);
          if (groove(n)) hat(drums, t + beat / 2, 0.1, true);
          if (full(n) && (b === 1 || b === 3)) clap(drums, t, 0.25);
        }
        if (n >= 1) for (let s = 0; s < 16; s++) hat(drums, t0 + s * (beat / 4), s % 4 === 0 ? 0.06 : 0.035, false, -0.2);
        if (n >= 1) {
          for (let s = 0; s < 16; s++) {
            if (s % 4 === 0) continue;
            synth(bass, { t: t0 + s * (beat / 4), dur: beat / 5, note: root + (s % 8 === 7 ? 12 : 0), wave: "saw", gain: 0.24, a: 0.002, d: 0.08, s: 0.3, r: 0.04, cutoff: 220, cutoffEnv: groove(n) ? 1400 : 500, cutoffDecay: 0.05, sub: 0.2 });
          }
        }
        const stabAt = [0, 0.75, 2.5];
        for (const sb of stabAt) {
          if (!groove(n) && !inBreak(n)) continue;
          for (const note of tones) {
            synth(keys, { t: t0 + sb * beat, dur: 0.12, note: note + 12, wave: "saw", gain: 0.05, a: 0.002, d: 0.15, s: 0, r: 0.1, cutoff: 900, cutoffEnv: inBreak(n) ? 600 : 3500, cutoffDecay: 0.09, voices: 3, detune: 16, spread: 0.6 });
            synth(echo, { t: t0 + sb * beat, dur: 0.1, note: note + 12, wave: "saw", gain: 0.025, a: 0.002, d: 0.1, s: 0, r: 0.1, cutoff: 1800 });
          }
        }
        for (const note of tones) synth(send, { t: t0, dur: bar, note, wave: "saw", gain: 0.03, a: 0.5, s: 0.8, r: 0.6, cutoff: 1100, voices: 2, detune: 12 });
        if (n === 2 || n === 12) crash(drums, t0, 0.13);
        if (n % 4 === 3 && groove(n)) noiseHit(drums, t0 + 2 * beat, { gain: 0.06, attack: 0.9, decay: 3, len: 1.05, type: "high", cutoff: 3000 });
      }
    },
  },
  // Trailer scale: low string ostinato, toms, a hit on every second bar.
  epic: {
    bpm: 100,
    chords: [Dm, Bb, F, [45, 57, 61, 64]],
    intro: 1,
    breakAt: 9,
    duck: 0.25,
    room: 0.92,
    play({ drums, bass, keys, send, beat, bar, bars, chord, groove, full, kick: k }) {
      for (let n = 0; n < bars; n++) {
        const t0 = n * bar;
        const [root, ...tones] = chord(n);
        for (let s = 0; s < 8; s++) {
          synth(bass, { t: t0 + s * (beat / 2), dur: beat * 0.4, note: root + (s % 2 ? 12 : 0), wave: "saw", gain: 0.13, a: 0.01, d: 0.2, s: 0.5, r: 0.1, cutoff: 600, cutoffEnv: 500, cutoffDecay: 0.1, voices: 3, detune: 10, spread: 0.5 });
        }
        for (const note of tones) {
          synth(keys, { t: t0, dur: bar, note: note - 12, wave: "saw", gain: 0.045, a: 0.8, s: 0.9, r: 0.8, cutoff: 1200, voices: 4, detune: 10, spread: 0.9 });
          synth(send, { t: t0, dur: bar, note, wave: "saw", gain: 0.04, a: 0.8, s: 0.9, r: 0.8, cutoff: 1400, voices: 2, detune: 8 });
        }
        if (groove(n)) {
          k(t0, 1, { from: 120, to: 38, decay: 0.7 });
          tom(drums, t0 + 1.5 * beat, 45, 0.35);
          tom(drums, t0 + 2.5 * beat, 43, 0.35);
          tom(drums, t0 + 3 * beat, 40, 0.4);
          if (full(n)) for (let s = 0; s < 8; s++) hat(drums, t0 + s * (beat / 2), 0.04);
          snare(drums, t0 + 2 * beat, 0.25);
        }
        if (n % 2 === 0 && n >= 1) {
          crash(drums, t0, 0.1);
          synth(send, { t: t0, dur: 0.6, note: root - 12, wave: "saw", gain: 0.25, a: 0.01, d: 1, s: 0.2, r: 1, cutoff: 500, voices: 3, detune: 20 });
        }
      }
    },
  },
};

// --------------------------------------------------------------------- sfx

function sweep(seconds, { from, to, peakAt = 0.5, gain = 0.5, q = 1.5, pan = [-0.6, 0.6], type = "band" }) {
  const b = bus(seconds + 0.6);
  const f = svf();
  const n = Math.round(seconds * SR);
  for (let k = 0; k < n; k++) {
    const x = k / n;
    const fc = from * (to / from) ** x;
    if (k % 16 === 0) f.set(fc, q);
    const env = x < peakAt ? (x / peakAt) ** 2 : ((1 - x) / (1 - peakAt)) ** 1.5;
    put(b, k, f.run(noise())[type] * gain * env, pan[0] + (pan[1] - pan[0]) * x);
  }
  mixInto(b, reverb(b, { room: 0.7 }), 0.6);
  return master(b, 0.8);
}

function makeSfx() {
  const out = {};
  out.whoosh = sweep(0.55, { from: 300, to: 4500, peakAt: 0.62, gain: 0.6 });
  out.swoosh = sweep(0.28, { from: 900, to: 6000, peakAt: 0.5, gain: 0.5, q: 2 });

  const impact = bus(2.6);
  kick(impact, 0, 1, { from: 110, to: 32, decay: 0.8, click: 0.4 });
  noiseHit(impact, 0, { gain: 0.35, decay: 0.18, type: "low", cutoff: 1800, len: 1 });
  mixInto(impact, reverb(impact, { room: 0.88 }), 0.7);
  out.impact = master(impact, 0.85);

  const riser = bus(2.2);
  const f = svf();
  let ph = 0;
  for (let k = 0; k < 2 * SR; k++) {
    const x = k / (2 * SR);
    if (k % 16 === 0) f.set(400 * 20 ** x, 2);
    const env = x ** 2.2;
    ph = (ph + (hz(45 + 24 * x) * 1) / SR) % 1;
    const tone = osc("saw", ph, hz(45 + 24 * x) / SR) * 0.15;
    put(riser, k, (f.run(noise()).band * 0.5 + tone) * env, Math.sin(x * 14) * 0.4 * x);
  }
  out.riser = master(riser, 0.8);

  const tick = bus(0.12);
  noiseHit(tick, 0, { gain: 0.6, decay: 0.004, type: "high", cutoff: 5000 });
  fm(tick, { t: 0, dur: 0.01, note: 96, gain: 0.25, ratio: 2, index: 1, decay: 0.02 });
  out.tick = master(tick, 0.7);

  const pop = bus(0.3);
  const ip = Math.round(0);
  let pph = 0;
  for (let k = 0; k < 0.12 * SR; k++) {
    const tt = k / SR;
    pph += (TAU * (900 * Math.exp(-tt * 30) + 280)) / SR;
    put(pop, ip + k, Math.sin(pph) * Math.exp(-tt / 0.03) * 0.8);
  }
  out.pop = master(pop, 0.75);

  const ding = bus(2);
  fm(ding, { t: 0, dur: 0.05, note: 88, gain: 0.4, ratio: 3.5, index: 2.2, indexDecay: 0.15, decay: 0.6 });
  fm(ding, { t: 0.06, dur: 0.05, note: 95, gain: 0.25, ratio: 3.5, index: 1.6, indexDecay: 0.15, decay: 0.5, pan: 0.3 });
  mixInto(ding, reverb(ding, { room: 0.8 }), 0.5);
  out.ding = master(ding, 0.75);

  // Typing: a second and a half of key clicks at uneven intervals.
  const type = bus(1.6);
  for (let t = 0.01; t < 1.5; t += 0.045 + rand() * 0.06) {
    noiseHit(type, t, { gain: 0.35 + rand() * 0.2, decay: 0.006, type: "band", cutoff: 2500 + rand() * 2500, q: 1.5, pan: rand() * 0.6 - 0.3 });
    noiseHit(type, t, { gain: 0.15, decay: 0.012, type: "low", cutoff: 400 });
  }
  out.type = master(type, 0.6);

  // A mouse click: a sharp press with a plastic body, then a softer release.
  // Its energy sits around 1.5 to 4 kHz, above the music's bass and pads, so
  // it reads through a mix without being loud.
  const click = bus(0.25);
  for (const [t, g] of [[0, 1], [0.07, 0.45]]) {
    noiseHit(click, t, { gain: 1.6 * g, decay: 0.006, type: "band", cutoff: 3200, q: 1.2 });
    noiseHit(click, t, { gain: 0.6 * g, decay: 0.01, type: "band", cutoff: 2200, q: 5, tone: 0.25, toneHz: 2300 });
    noiseHit(click, t, { gain: 0.15 * g, decay: 0.01, type: "low", cutoff: 300 });
  }
  out.click = master(click, 0.9);

  // Everything below was added later. New sounds go at the end, after every
  // older one, so the seeded noise of the older sounds never changes.

  // A marker on paper or a whiteboard: friction noise in irregular strokes.
  const marker = bus(0.75);
  {
    const f = svf();
    f.set(2600, 0.9);
    let stroke = 0;
    for (let k = 0; k < 0.7 * SR; k++) {
      const tt = k / SR;
      // Strokes of 60 to 140 ms, each pressing in and lifting off.
      if (tt >= stroke) stroke = tt + 0.06 + rand() * 0.08;
      const into = 1 - (stroke - tt) / 0.14;
      const press = Math.sin(Math.PI * Math.min(1, Math.max(0, into))) ** 0.6;
      const fade = Math.min(1, tt / 0.02) * Math.min(1, (0.7 - tt) / 0.08);
      const y = f.run(noise()).band;
      put(marker, k, y * 0.9 * press * fade * (0.75 + 0.25 * Math.sin(tt * 90)), -0.1 + 0.2 * Math.sin(tt * 7));
    }
  }
  out.marker = master(marker, 0.7);

  // A pencil: finer, higher and drier than the marker.
  const pencil = bus(0.5);
  {
    const f = svf();
    f.set(5200, 1.4);
    for (let k = 0; k < 0.45 * SR; k++) {
      const tt = k / SR;
      const grain = rand() > 0.6 ? 1 : 0.35;
      const env = Math.min(1, tt / 0.015) * Math.min(1, (0.45 - tt) / 0.06) * (0.6 + 0.4 * Math.sin(tt * 55));
      put(pencil, k, f.run(noise()).band * grain * env * 0.8, 0.15);
    }
  }
  out.pencil = master(pencil, 0.6);

  // An error tone: two short descending notes, soft square, no alarm.
  const error = bus(0.45);
  for (const [t, note] of [[0, 76], [0.13, 72]]) {
    let ph = 0;
    const dt = hz(note) / SR;
    for (let k = 0; k < 0.11 * SR; k++) {
      const tt = k / SR;
      ph = (ph + dt) % 1;
      const env = Math.min(1, tt / 0.004) * Math.exp(-tt / 0.06);
      put(error, Math.round(t * SR) + k, (osc("square", ph, dt) * 0.35 + Math.sin(TAU * ph) * 0.4) * env * 0.5);
    }
  }
  out.error = master(error, 0.55);

  // A success: two rising bell notes.
  const success = bus(1.2);
  fm(success, { t: 0, dur: 0.05, note: 84, gain: 0.35, ratio: 3, index: 1.6, indexDecay: 0.12, decay: 0.35 });
  fm(success, { t: 0.09, dur: 0.05, note: 91, gain: 0.3, ratio: 3, index: 1.4, indexDecay: 0.12, decay: 0.45, pan: 0.2 });
  mixInto(success, reverb(success, { room: 0.7 }), 0.35);
  out.success = master(success, 0.65);

  // A data pulse: one tiny clean blip.
  const blip = bus(0.12);
  for (let k = 0; k < 0.08 * SR; k++) {
    const tt = k / SR;
    put(blip, k, Math.sin(TAU * hz(93) * tt) * Math.min(1, tt / 0.002) * Math.exp(-tt / 0.018) * 0.7);
  }
  out.blip = master(blip, 0.6);

  // A connection snapping in: a soft low thump with a bright click on top.
  const connect = bus(0.35);
  kick(connect, 0, 0.6, { from: 220, to: 90, decay: 0.07, click: 0.1 });
  noiseHit(connect, 0.004, { gain: 0.5, decay: 0.004, type: "band", cutoff: 3600, q: 1.5 });
  out.connect = master(connect, 0.75);

  // A glitch: short stuttered bursts of crushed noise.
  const glitch = bus(0.32);
  {
    let t = 0;
    while (t < 0.26) {
      const len = 0.012 + rand() * 0.03;
      const step = 1 + Math.floor(rand() * 6);
      const tone = 300 + rand() * 2400;
      let hold = 0;
      for (let k = 0; k < len * SR; k++) {
        if (k % step === 0) hold = Math.sign(Math.sin(TAU * tone * (k / SR))) * 0.5 + noise() * 0.5;
        put(glitch, Math.round(t * SR) + k, hold * 0.45, rand() * 0.6 - 0.3);
      }
      t += len + rand() * 0.025;
    }
  }
  out.glitch = master(glitch, 0.5);

  // A notification: a soft two-tone chime.
  const notify = bus(1);
  fm(notify, { t: 0, dur: 0.04, note: 88, gain: 0.28, ratio: 2, index: 1.2, indexDecay: 0.1, decay: 0.3 });
  fm(notify, { t: 0.07, dur: 0.04, note: 93, gain: 0.24, ratio: 2, index: 1.1, indexDecay: 0.1, decay: 0.35 });
  out.notify = master(notify, 0.6);

  // One key press, for typing in step with the picture.
  const key = bus(0.12);
  noiseHit(key, 0, { gain: 0.5, decay: 0.006, type: "band", cutoff: 3200, q: 1.5 });
  noiseHit(key, 0, { gain: 0.2, decay: 0.012, type: "low", cutoff: 420 });
  out.key = master(key, 0.6);

  // A clean sub-bass hit: weight without a boom tail.
  const sub = bus(1.4);
  kick(sub, 0, 1, { from: 70, to: 38, decay: 0.55, click: 0.04 });
  out.sub = master(sub, 0.8);
  return out;
}

// --------------------------------------------------------------------- main

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
// Old WAV kit and old beds go: the template only loads what is written below.
for (const f of readdirSync(OUT)) if (/\.(wav|mp3)$/.test(f)) rmSync(join(OUT, f));

const meta = {};
for (const [name, spec] of Object.entries(TRACKS)) {
  const { buf, bpm, bar, bars } = arrange(spec);
  save(name, buf);
  save(`${name}-end`, stinger(spec));
  meta[name] = { bpm, bars, seconds: Math.round(bar * bars * 1000) / 1000, intro: spec.intro ?? 2, breakAt: spec.breakAt ?? 10 };
}
for (const [name, b] of Object.entries(makeSfx())) save(name, b);
rmSync(TMP, { recursive: true, force: true });

const ext = existsSync(FFMPEG) ? "mp3" : "wav";
writeFileSync(
  META,
  `// Generated by scripts/make-audio.mjs. Do not edit by hand.\n` +
    `export const AUDIO_EXT = ${JSON.stringify(ext)};\n\n` +
    `/**
 * Each music bed's tempo and bar layout: scene cuts snap to its beats; the
 * groove starts after \`intro\` bars; bars \`breakAt\` and the next one are a
 * breakdown, which a video lines up to end on its closing scene.
 */\n` +
    `export const MUSIC = ${JSON.stringify(meta, null, 2)} as const;\n`,
);
console.log("wrote src/engine/music.ts");

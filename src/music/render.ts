import { staticFile } from "remotion";
import type { Timing } from "../engine/rig";
import { arrange, type Song, type SongEvent } from "./arrange";
import type { Inst } from "./genres/types";
import { master } from "./master";
import { rngOf } from "./rng";
import { SAMPLES } from "./samples";
import type { Score } from "./score";
import { encodeWav } from "./wav";

/**
 * Renders a song to audio in the page with the Web Audio API, offline:
 * faster than real time, no speakers involved. composeTrack then masters it
 * (master.ts) and encodes it as WAV.
 *
 * A rendering graph pays for every connected node in every 128-sample
 * block, sounding or not, so notes are not all created up front: rendering
 * suspends once a second and creates the nodes of the next second's notes.
 * Each node exists from shortly before its note until it has died away.
 */

const RATE = 48000;
const WINDOW = 1;

// -------------------------------------------------------------- samples

const decoded = new Map<string, Promise<AudioBuffer>>();
let decoder: OfflineAudioContext | null = null;

function sampleBuffer(file: string): Promise<AudioBuffer> {
  let p = decoded.get(file);
  if (!p) {
    decoder ??= new OfflineAudioContext(2, 1, RATE);
    const ctx = decoder;
    p = fetch(staticFile(file))
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load the sample ${file} (HTTP ${res.status}).`);
        return res.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes));
    p.catch(() => decoded.delete(file));
    decoded.set(file, p);
  }
  return p;
}

type Kit = Record<string, Record<string, { file: string; note?: string }>>;
const KIT = SAMPLES as unknown as Kit;
const SAMPLED: Partial<Record<Inst, string>> = { clap: "clap", hat: "hat", openhat: "hat", snare: "snare", crash: "crash", swell: "swell", boom: "boom", tom: "tom" };
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const midiOf = (name: string) => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name)!;
  return NAMES.indexOf(m[1]) + 12 * (Number(m[2]) + 1);
};
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Every file a song plays, so they can load before rendering starts. */
function filesFor(song: Song): string[] {
  const files = new Set<string>();
  for (const e of song.events) {
    if (e.inst === "piano") for (const s of Object.values(KIT.piano)) files.add(s.file);
    const kit = SAMPLED[e.inst];
    if (kit && e.sample && KIT[kit][e.sample]) files.add(KIT[kit][e.sample].file);
  }
  return [...files];
}

// ------------------------------------------------------------ building blocks

/** Velocity 0-1 to gain: a slight curve, so soft notes stay audible. */
const gainOf = (vel: number) => vel ** 1.4;

type Adsr = { a: number; d: number; s: number; r: number };

/**
 * An ADSR as straight segments on a gain: up to `peak` over a, down to the
 * sustain level over d, held until `t + dur`, then to silence over r.
 * Returns when the note has fully died away.
 */
function envelope(g: AudioParam, t: number, dur: number, peak: number, { a, d, s, r }: Adsr): number {
  const off = t + Math.max(dur, 0.01);
  g.setValueAtTime(0, t);
  if (off <= t + a) {
    g.linearRampToValueAtTime(peak * ((off - t) / a), off);
  } else {
    g.linearRampToValueAtTime(peak, t + a);
    const decayEnd = t + a + d;
    if (off <= decayEnd) g.linearRampToValueAtTime(peak - (peak - peak * s) * ((off - t - a) / d), off);
    else {
      g.linearRampToValueAtTime(peak * s, decayEnd);
      g.setValueAtTime(peak * s, off);
    }
  }
  g.linearRampToValueAtTime(0, off + r);
  return off + r;
}

/** Two cascaded lowpass biquads: a 24 dB/octave filter. */
function lowpass24(ctx: BaseAudioContext, freq: number, q = 0.707): { input: AudioNode; output: AudioNode; filters: BiquadFilterNode[] } {
  const a = new BiquadFilterNode(ctx, { type: "lowpass", frequency: freq, Q: q });
  const b = new BiquadFilterNode(ctx, { type: "lowpass", frequency: freq, Q: q });
  a.connect(b);
  return { input: a, output: b, filters: [a, b] };
}

/** A soft-clipping curve; `amount` 0-1 like a drive knob. */
function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = 100 * amount;
  const curve = new Float32Array(new ArrayBuffer(4096 * 4));
  for (let i = 0; i < 4096; i++) {
    const x = (i * 2) / 4096 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/**
 * The room's reverb: two seconds of decaying stereo noise after a 20 ms
 * pre-delay, made once per page from a fixed seed.
 */
let impulse: AudioBuffer | null = null;
function roomImpulse(): AudioBuffer {
  if (impulse) return impulse;
  const pre = Math.round(RATE * 0.02);
  const buf = new AudioBuffer({ length: RATE * 2, numberOfChannels: 2, sampleRate: RATE });
  const rnd = rngOf(20261013);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = pre; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.exp((-6.9 * (i - pre)) / (d.length - pre));
  }
  impulse = buf;
  return buf;
}

/** Four seconds of seeded white noise, looped by risers. */
let noise: AudioBuffer | null = null;
function noiseBuffer(): AudioBuffer {
  if (noise) return noise;
  const buf = new AudioBuffer({ length: RATE * 4, numberOfChannels: 1, sampleRate: RATE });
  const rnd = rngOf(7);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  noise = buf;
  return buf;
}

// ------------------------------------------------------------------ render

export async function renderSong(song: Song): Promise<AudioBuffer> {
  const files = filesFor(song);
  const buffers = new Map(await Promise.all(files.map(async (f) => [f, await sampleBuffer(f)] as const)));
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(song.seconds * RATE)), RATE);

  // Master: glue compression, then a fast compressor as a safety limiter;
  // master() sets the final loudness and true peak.
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -2, knee: 0, ratio: 20, attack: 0.002, release: 0.1 });
  limiter.connect(ctx.destination);
  const glue = new DynamicsCompressorNode(ctx, { threshold: -18, knee: 6, ratio: 3, attack: 0.012, release: 0.22 });
  glue.connect(limiter);
  const reverb = new ConvolverNode(ctx, { buffer: roomImpulse() });
  reverb.connect(glue);
  const bus = (level: number, send: number) => {
    const g = new GainNode(ctx, { gain: level });
    g.connect(glue);
    if (send > 0) g.connect(new GainNode(ctx, { gain: send })).connect(reverb);
    return g;
  };
  const drums = bus(0.9, 0.06);
  const cymbals = bus(0.55, 0.12);
  const keys = bus(0.75, 0.22);
  const fx = bus(0.6, 0.3);
  // Pad and bass sit under a ducker the kick pumps (sidechain).
  const duck = new GainNode(ctx, { gain: 1 });
  duck.connect(glue);
  duck.connect(new GainNode(ctx, { gain: 0.2 })).connect(reverb);
  const pads = new GainNode(ctx, { gain: 0.42 });
  pads.connect(duck);
  const bassBus = new GainNode(ctx, { gain: 0.7 });
  bassBus.connect(duck);
  const padTone = lowpass24(ctx, 1500);
  padTone.output.connect(pads);
  const braamTone = lowpass24(ctx, 950);
  braamTone.output.connect(keys);
  // Light drive: harder and the shaper saturates, so a braam's velocity no longer changes how loud it is.
  const braamDrive = new WaveShaperNode(ctx, { curve: driveCurve(0.08) });
  braamDrive.connect(braamTone.input);
  const pluckTone = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 2600 });
  pluckTone.connect(keys);

  const pianoNotes = Object.values(KIT.piano).map((p) => ({ midi: midiOf(p.note!), buffer: buffers.get(p.file)! }));

  const playSample = (buffer: AudioBuffer, dest: AudioNode, t: number, vel: number, rate = 1, dur?: number, release = 0) => {
    const src = new AudioBufferSourceNode(ctx, { buffer, playbackRate: rate });
    const g = new GainNode(ctx, { gain: dur === undefined ? vel : 0 });
    if (dur !== undefined) envelope(g.gain, t, dur, vel, { a: 0.002, d: 0.01, s: 1, r: release });
    src.connect(g).connect(dest);
    src.start(t);
    src.stop(Math.min(t + buffer.duration / rate, dur === undefined ? Infinity : t + dur + release) + 0.01);
  };

  const synth = (dest: AudioNode, e: SongEvent, type: OscillatorType, detunes: number[], adsr: Adsr) => {
    if (e.note === undefined) return;
    const g = new GainNode(ctx, { gain: 0 });
    const end = envelope(g.gain, e.time, Math.max(0.05, e.duration), gainOf(e.vel) / Math.sqrt(detunes.length), adsr);
    g.connect(dest);
    for (const detune of detunes) {
      const osc = new OscillatorNode(ctx, { type, frequency: hz(e.note), detune });
      osc.connect(g);
      osc.start(e.time);
      osc.stop(end + 0.02);
    }
  };

  /** A drum membrane: a sine falling from `top` times the note to the note, decaying away. */
  const membrane = (dest: AudioNode, t: number, freq: number, top: number, fall: number, decay: number, vel: number) => {
    const osc = new OscillatorNode(ctx, { type: "sine", frequency: freq * top });
    osc.frequency.setValueAtTime(freq * top, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + fall);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  };

  /** House bass: a sawtooth through a resonant filter that snaps open and closes. */
  const bassNote = (e: SongEvent) => {
    if (e.note === undefined) return;
    const t = e.time;
    const dur = Math.max(0.05, e.duration);
    const osc = new OscillatorNode(ctx, { type: "sawtooth", frequency: hz(e.note) });
    const tone = lowpass24(ctx, 110, 2);
    for (const f of tone.filters) {
      f.frequency.setValueAtTime(110, t);
      f.frequency.exponentialRampToValueAtTime(667, t + 0.004);
      f.frequency.exponentialRampToValueAtTime(172, t + 0.164);
      f.frequency.setValueAtTime(172, t + Math.max(dur, 0.165));
      f.frequency.exponentialRampToValueAtTime(110, t + Math.max(dur, 0.165) + 0.1);
    }
    const g = new GainNode(ctx, { gain: 0 });
    const end = envelope(g.gain, t, dur, gainOf(e.vel), { a: 0.004, d: 0.18, s: 0.45, r: 0.08 });
    osc.connect(tone.input);
    tone.output.connect(g).connect(bassBus);
    osc.start(t);
    osc.stop(end + 0.02);
  };

  /** A riser: noise through a lowpass sweeping open while it swells, cut at the card. */
  const riser = (e: SongEvent) => {
    const t = e.time;
    const dur = Math.max(0.1, e.duration);
    const src = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(), loop: true });
    const tone = lowpass24(ctx, 300);
    for (const f of tone.filters) {
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    }
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gainOf(e.vel) * 0.5, t + dur * 0.96);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(tone.input);
    tone.output.connect(g).connect(fx);
    src.start(t);
    src.stop(t + dur + 0.01);
  };

  const play = (e: SongEvent) => {
    const t = e.time;
    switch (e.inst) {
      case "piano": {
        if (e.note === undefined) return;
        const near = pianoNotes.reduce((a, b) => (Math.abs(b.midi - e.note!) < Math.abs(a.midi - e.note!) ? b : a));
        playSample(near.buffer, keys, t, gainOf(e.vel), 2 ** ((e.note - near.midi) / 12), Math.max(0.05, e.duration), 0.9);
        return;
      }
      case "kick":
        membrane(drums, t, 49, 6.5, 0.045, 0.36, gainOf(e.vel));
        return;
      case "sub":
        if (e.note !== undefined) membrane(drums, t, hz(e.note), 2.2, 0.3, Math.max(0.6, e.duration) + 0.4, gainOf(e.vel) * 0.63);
        return;
      case "bass":
        bassNote(e);
        return;
      case "pad":
        synth(padTone.input, e, "sawtooth", [-12, 0, 12], { a: 0.35, d: 0.4, s: 0.75, r: 1.3 });
        return;
      case "braam":
        synth(braamDrive, e, "sawtooth", [-19, -9.5, 0, 9.5, 19], { a: 0.11, d: 0.3, s: 0.85, r: 1.1 });
        return;
      case "pluck":
        synth(pluckTone, e, "sawtooth", [0], { a: 0.002, d: 0.17, s: 0, r: 0.08 });
        return;
      case "noise":
        riser(e);
        return;
      default: {
        const kit = SAMPLED[e.inst];
        const s = kit && e.sample ? KIT[kit][e.sample] : undefined;
        if (s) playSample(buffers.get(s.file)!, e.inst === "crash" || e.inst === "swell" || e.inst === "hat" || e.inst === "openhat" ? cymbals : drums, t, gainOf(e.vel));
      }
    }
  };

  // The sidechain is automation on one long-lived node: all of it up front.
  if (song.sidechain) {
    for (const e of song.events) {
      if (e.inst !== "kick") continue;
      duck.gain.setValueAtTime(0.3, e.time);
      duck.gain.linearRampToValueAtTime(1, e.time + Math.min(0.22, 30 / song.bpm));
    }
  }

  // Each window's notes are made when rendering reaches the window before it.
  const windows = Math.ceil(song.seconds / WINDOW);
  const byWindow: SongEvent[][] = Array.from({ length: windows + 1 }, () => []);
  for (const e of song.events) byWindow[Math.min(windows, Math.floor(e.time / WINDOW))].push(e);
  byWindow[0].forEach(play);
  byWindow[1]?.forEach(play);
  for (let w = 1; w + 1 <= windows; w++) {
    void ctx.suspend(w * WINDOW).then(() => {
      byWindow[w + 1]?.forEach(play);
      return ctx.resume();
    });
  }
  return ctx.startRendering();
}

/** The finished soundtrack of a score on a timing, as a WAV file. */
export async function composeTrack(score: Score, timing: Timing): Promise<Blob> {
  return encodeWav(master(await renderSong(arrange(score, timing))));
}

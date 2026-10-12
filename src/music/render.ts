import { staticFile } from "remotion";
import type { Timing } from "../engine/rig";
import { arrange, type Song, type SongEvent } from "./arrange";
import type { Inst } from "./genres/types";
import { master } from "./master";
import { SAMPLES } from "./samples";
import type { Score } from "./score";
import { midiName } from "./theory";
import { encodeWav } from "./wav";

/**
 * Renders a song to audio in the page with Tone.js, offline (faster than
 * real time, no speakers involved); composeTrack then masters it (master.ts).
 */

const RATE = 48000;

/** Decoded samples, shared by every render in the page. */
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

/** Velocity 0-1 to gain: a slight curve, so soft notes stay audible. */
const gainOf = (vel: number) => vel ** 1.4;

export async function renderSong(song: Song): Promise<AudioBuffer> {
  const files = filesFor(song);
  const buffers = new Map(await Promise.all(files.map(async (f) => [f, await sampleBuffer(f)] as const)));
  (globalThis as { TONE_SILENCE_LOGGING?: boolean }).TONE_SILENCE_LOGGING = true;
  const Tone = await import("tone");

  const rendered = await Tone.Offline(
    async () => {
      // Master: glue compression, then a limiter keeping peaks under -1 dB.
      const limiter = new Tone.Limiter(-1).toDestination();
      const glue = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.012, release: 0.22 }).connect(limiter);
      const reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 }).connect(glue);
      await reverb.ready;
      const bus = (level: number, send: number) => {
        const g = new Tone.Gain(level).connect(glue);
        if (send > 0) g.connect(new Tone.Gain(send).connect(reverb));
        return g;
      };
      const drums = bus(0.9, 0.06);
      const cymbals = bus(0.55, 0.12);
      const keys = bus(0.75, 0.22);
      const fx = bus(0.6, 0.3);
      // Pad and bass sit under a ducker the kick pumps (sidechain).
      const duck = new Tone.Gain(1).connect(glue);
      duck.connect(new Tone.Gain(0.2).connect(reverb));
      const pads = new Tone.Gain(0.42).connect(duck);
      const bassBus = new Tone.Gain(0.7).connect(duck);

      const toneBuf = (file: string) => new Tone.ToneAudioBuffer(buffers.get(file)!);
      const pianoUrls = Object.fromEntries(Object.values(KIT.piano).map((s) => [s.note!, toneBuf(s.file)]));
      const piano = new Tone.Sampler({ urls: pianoUrls, release: 0.9 }).connect(keys);

      const kick = new Tone.MembraneSynth({ pitchDecay: 0.045, octaves: 6.5, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.05 } }).connect(drums);
      const sub = new Tone.MembraneSynth({ pitchDecay: 0.3, octaves: 2.2, oscillator: { type: "sine" }, envelope: { attack: 0.003, decay: 1.8, sustain: 0, release: 0.4 }, volume: -4 }).connect(drums);
      const bass = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { Q: 2, type: "lowpass", rolloff: -24 },
        envelope: { attack: 0.004, decay: 0.18, sustain: 0.45, release: 0.08 },
        filterEnvelope: { attack: 0.004, decay: 0.16, sustain: 0.25, release: 0.1, baseFrequency: 110, octaves: 2.6 },
      }).connect(bassBus);
      const padFilter = new Tone.Filter(1500, "lowpass", -24).connect(pads);
      const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", count: 3, spread: 24 }, envelope: { attack: 0.35, decay: 0.4, sustain: 0.75, release: 1.3 } }).connect(padFilter);
      pad.maxPolyphony = 24;
      const braamTone = new Tone.Filter(950, "lowpass", -24).connect(keys);
      const braamDrive = new Tone.Distortion(0.22).connect(braamTone);
      const braam = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", count: 5, spread: 38 }, envelope: { attack: 0.11, decay: 0.3, sustain: 0.85, release: 1.1 } }).connect(braamDrive);
      braam.maxPolyphony = 16;
      const pluckTone = new Tone.Filter(2600, "lowpass").connect(keys);
      const pluck = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sawtooth" }, envelope: { attack: 0.002, decay: 0.17, sustain: 0, release: 0.08 }, volume: -6 }).connect(pluckTone);
      pluck.maxPolyphony = 8;
      const noiseGain = new Tone.Gain(0).connect(fx);
      const noiseFilter = new Tone.Filter(300, "lowpass", -24).connect(noiseGain);
      const noise = new Tone.Noise("pink").connect(noiseFilter);

      const shot = (e: SongEvent, dest: InstanceType<typeof Tone.Gain>) => {
        const kit = SAMPLED[e.inst];
        const s = kit && e.sample ? KIT[kit][e.sample] : undefined;
        if (!s) return;
        new Tone.ToneBufferSource(toneBuf(s.file)).connect(dest).start(e.time, 0, undefined, gainOf(e.vel));
      };

      for (const e of song.events) {
        const t = e.time;
        const note = e.note !== undefined ? midiName(e.note) : undefined;
        const dur = Math.max(0.05, e.duration);
        switch (e.inst) {
          case "piano":
            if (note) piano.triggerAttackRelease(note, dur, t, gainOf(e.vel));
            break;
          case "kick":
            kick.triggerAttackRelease("G1", 0.3, t, gainOf(e.vel));
            if (song.sidechain) {
              duck.gain.setValueAtTime(0.3, t);
              duck.gain.linearRampToValueAtTime(1, t + Math.min(0.22, 30 / song.bpm));
            }
            break;
          case "sub":
            if (note) sub.triggerAttackRelease(note, dur, t, gainOf(e.vel));
            break;
          case "bass":
            if (note) bass.triggerAttackRelease(note, dur, t, gainOf(e.vel));
            break;
          case "pad":
            if (note) pad.triggerAttackRelease(note, dur, t, gainOf(e.vel));
            break;
          case "braam":
            if (note) braam.triggerAttackRelease(note, dur, t, gainOf(e.vel));
            break;
          case "pluck":
            if (note) pluck.triggerAttackRelease(note, dur, t, gainOf(e.vel));
            break;
          case "noise":
            noise.start(t).stop(t + dur);
            noiseFilter.frequency.setValueAtTime(300, t);
            noiseFilter.frequency.exponentialRampToValueAtTime(9000, t + dur);
            noiseGain.gain.setValueAtTime(0, t);
            noiseGain.gain.linearRampToValueAtTime(gainOf(e.vel), t + dur * 0.96);
            noiseGain.gain.linearRampToValueAtTime(0, t + dur);
            break;
          case "crash":
          case "swell":
          case "hat":
          case "openhat":
            shot(e, cymbals);
            break;
          default:
            shot(e, drums);
        }
      }
    },
    song.seconds,
    2,
    RATE,
  );
  const out = rendered.get();
  if (!out) throw new Error("The soundtrack rendered no audio.");
  return out;
}

/** The finished soundtrack of a score on a timing, as a WAV file. */
export async function composeTrack(score: Score, timing: Timing): Promise<Blob> {
  return encodeWav(master(await renderSong(arrange(score, timing))));
}

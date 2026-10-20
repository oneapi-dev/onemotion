import { describe, expect, it } from "vitest";
import { integratedLoudness, limiterGain, masterGain } from "./loudness";

const SR = 48000;

const sine = (amp: number, hz: number, seconds: number, sr = SR) => Float32Array.from({ length: Math.round(seconds * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));

const peak = (channels: Float32Array[], gain: Float32Array) => channels.reduce((m, ch) => ch.reduce((p, v, i) => Math.max(p, Math.abs(v * gain[i])), m), 0);

describe("integratedLoudness", () => {
  it("reads a full-scale 997 Hz sine at -3.01 LUFS, as the standard specifies", () => {
    expect(integratedLoudness([sine(1, 997, 5)], SR)).toBeCloseTo(-3.01, 1);
    // At 44.1 kHz too: the filters are derived from the rate.
    expect(integratedLoudness([sine(1, 997, 5, 44100)], 44100)).toBeCloseTo(-3.01, 1);
  });

  it("adds the channels: the same sine on both sides of a stereo pair is 3 dB louder", () => {
    const s = sine(0.5, 997, 4);
    expect(integratedLoudness([s, s], SR) - integratedLoudness([s], SR)).toBeCloseTo(3.01, 1);
  });

  it("gates out silence, so a pause does not make a film read quieter", () => {
    const s = sine(0.5, 997, 20);
    const withPause = new Float32Array(s.length * 2);
    withPause.set(s);
    expect(integratedLoudness([withPause], SR)).toBeCloseTo(integratedLoudness([s], SR), 1);
  });

  it("is -Infinity for silence and for audio shorter than a block", () => {
    expect(integratedLoudness([new Float32Array(SR)], SR)).toBe(-Infinity);
    expect(integratedLoudness([sine(1, 997, 0.2)], SR)).toBe(-Infinity);
  });
});

describe("limiterGain", () => {
  it("holds every peak under the ceiling", () => {
    // A quiet bed with sharp hits on top, raised 12 dB.
    const x = sine(0.1, 220, 3);
    for (const at of [0.5, 1.2, 2.4]) for (let i = 0; i < 400; i++) x[Math.round(at * SR) + i] += 0.8 * Math.sin(i / 3) * Math.exp(-i / 120);
    const g = limiterGain([x], SR, 4, 10 ** (-1 / 20));
    expect(peak([x], g)).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6);
  });

  it("leaves audio under the ceiling alone", () => {
    const x = sine(0.2, 440, 1);
    const g = limiterGain([x], SR, 2, 10 ** (-1 / 20));
    expect(Math.min(...g)).toBeCloseTo(2, 5);
  });
});

describe("masterGain", () => {
  it("brings a quiet mix to the target with peaks under the ceiling", () => {
    const l = sine(0.05, 300, 6);
    const r = sine(0.04, 500, 6);
    const m = masterGain([l, r], SR, -14)!;
    expect(m.before).toBeLessThan(-25);
    expect(Math.abs(m.after + 14)).toBeLessThan(0.3);
    expect(peak([l, r], m.gain)).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6);
  });

  it("turns a loud mix down", () => {
    const x = sine(0.9, 997, 4);
    const m = masterGain([x], SR, -20)!;
    expect(m.after).toBeCloseTo(-20, 0);
  });

  it("is null for silence", () => {
    expect(masterGain([new Float32Array(SR * 2)], SR, -14)).toBeNull();
  });
});

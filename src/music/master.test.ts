import { describe, expect, it } from "vitest";
import { master } from "./master";

const RATE = 48000;
const buffer = (samples: (i: number) => number, seconds: number) => {
  const ch = [new Float32Array(RATE * seconds), new Float32Array(RATE * seconds)];
  for (const c of ch) for (let i = 0; i < c.length; i++) c[i] = samples(i);
  return { sampleRate: RATE, numberOfChannels: 2, length: ch[0].length, getChannelData: (c: number) => ch[c] };
};
const rmsDb = (b: ReturnType<typeof buffer>, from = 0, to = b.length) => {
  let sum = 0;
  const d = b.getChannelData(0);
  for (let i = from; i < to; i++) sum += d[i] * d[i];
  return 10 * Math.log10(sum / (to - from));
};
const peak = (b: ReturnType<typeof buffer>) => Math.max(...[0, 1].map((c) => b.getChannelData(c).reduce((m, v) => Math.max(m, Math.abs(v)), 0)));

describe("master", () => {
  it("brings a quiet, punchy mix up to loudness without letting any peak past -1 dBFS", () => {
    // A soft tone with a loud hit every half second: the hits used to cap the gain.
    const b = buffer((i) => 0.05 * Math.sin((2 * Math.PI * 220 * i) / RATE) + (i % (RATE / 2) < 200 ? 0.9 : 0), 4);
    master(b);
    expect(peak(b)).toBeLessThanOrEqual(0.892);
    expect(rmsDb(b, 0, RATE * 3)).toBeGreaterThan(-17);
  });

  it("does not blow up near-silence", () => {
    const b = buffer((i) => 0.001 * Math.sin((2 * Math.PI * 220 * i) / RATE), 2);
    master(b);
    expect(peak(b)).toBeLessThan(0.01);
  });

  it("fades the last moment to silence", () => {
    const b = buffer((i) => 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE), 2);
    master(b);
    expect(Math.abs(b.getChannelData(0)[b.length - 1])).toBeLessThan(1e-3);
  });
});

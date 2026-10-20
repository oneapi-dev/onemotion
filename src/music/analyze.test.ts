import { describe, expect, it } from "vitest";
import { analyzeMusic, musicStart } from "./analyze";

const SR = 22050;

/**
 * A synthetic track: a kick on every beat (louder on the first of each bar),
 * a hat between, quiet for the first `quietBars` bars and full after (the drop),
 * starting `lead` seconds in.
 */
function track(o: { bpm: number; bars: number; quietBars: number; lead: number }): Float32Array {
  const beat = 60 / o.bpm;
  const out = new Float32Array(Math.ceil((o.lead + o.bars * 4 * beat + 1) * SR));
  for (let b = 0; b < o.bars * 4; b++) {
    const t0 = o.lead + b * beat;
    const loud = b / 4 >= o.quietBars ? 1 : 0.25;
    const downbeat = b % 4 === 0 ? 1.6 : 1;
    // Kick: a decaying 60 Hz thump.
    for (let i = 0; i < SR * 0.18; i++) {
      const at = Math.round(t0 * SR) + i;
      if (at < out.length) out[at] += 0.5 * loud * downbeat * Math.sin((2 * Math.PI * 60 * i) / SR) * Math.exp(-i / (SR * 0.05));
    }
    // Hat on the off-beat: a short burst of high noise (deterministic).
    for (let i = 0; i < SR * 0.03; i++) {
      const at = Math.round((t0 + beat / 2) * SR) + i;
      if (at < out.length) out[at] += 0.08 * loud * Math.sin(i * 1.7) * Math.sin(i * 0.91) * Math.exp(-i / (SR * 0.008));
    }
  }
  return out;
}

describe("analyzeMusic", () => {
  it("finds the tempo, the downbeat and the drop of a track", () => {
    const m = analyzeMusic(track({ bpm: 120, bars: 24, quietBars: 8, lead: 0.3 }), SR);
    expect(m.bpm).toBeGreaterThan(118);
    expect(m.bpm).toBeLessThan(122);
    expect(m.downbeat).toBeCloseTo(0.3, 1);
    // The drop: bar 8, 0.3 + 8 bars of 2 s.
    expect(m.drops[0]).toBeCloseTo(0.3 + 16, 0);
  });

  it("finds a slower tempo too, and takes a known one as given", () => {
    const x = track({ bpm: 96, bars: 20, quietBars: 12, lead: 0.5 });
    const m = analyzeMusic(x, SR);
    expect(Math.abs(m.bpm - 96)).toBeLessThan(2);
    expect(analyzeMusic(x, SR, 96).bpm).toBe(96);
  });
});

describe("musicStart", () => {
  const map = { downbeat: 0.3, drops: [16.3, 48.3], seconds: 90 };

  it("starts the music so its drop lands on the film's close", () => {
    // A 20 s film whose close starts at 12 s: the music starts 4.3 s in, so 16.3 s lands at 12 s.
    expect(musicStart(map, 12, 20)).toEqual({ start: 4.3, dropAt: 12 });
  });

  it("uses a later drop when the first comes too early", () => {
    expect(musicStart(map, 30, 40)).toEqual({ start: 18.3, dropAt: 30 });
  });

  it("starts on the first downbeat when no drop fits", () => {
    expect(musicStart(map, 50, 60)).toEqual({ start: 0.3, dropAt: null });
    expect(musicStart({ ...map, drops: [] }, 12, 20)).toEqual({ start: 0.3, dropAt: null });
  });
});

/**
 * What a piece of music is made of, read from its samples: its tempo, where
 * its beats and bars fall, and its drops (the bars where the energy jumps,
 * a new section kicking in). A film is cut to this: its bars line up with
 * the music's, and its big moment lands on a drop. Pure: works on mono
 * samples, in the browser (a person's own track) and in Node (the library).
 */

export type MusicMap = {
  bpm: number;
  /** Seconds to the first beat, and to the first downbeat (the first beat of a bar). */
  firstBeat: number;
  downbeat: number;
  /** Seconds of the drops, strongest first. */
  drops: number[];
  /** The length of the audio, in seconds. */
  seconds: number;
};

const HOP_SECONDS = 0.01;

/** Energy per 10 ms frame, overall and in the low end (kick and bass), from mono samples. */
function envelopes(x: Float32Array, sampleRate: number) {
  const hop = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
  const n = Math.floor(x.length / hop);
  const all = new Float32Array(n);
  const low = new Float32Array(n);
  // A one-pole low-pass near 150 Hz keeps the kick and the bass.
  const k = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  let lp = 0;
  for (let f = 0; f < n; f++) {
    let e = 0;
    let el = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const v = x[i];
      lp += k * (v - lp);
      e += v * v;
      el += lp * lp;
    }
    all[f] = e / hop;
    low[f] = el / hop;
  }
  return { all, low, hop };
}

/** How sharply energy rises from frame to frame: where notes and drums start. */
function onsets(e: Float32Array): Float32Array {
  const o = new Float32Array(e.length);
  for (let i = 1; i < e.length; i++) o[i] = Math.max(0, Math.log(e[i] + 1e-10) - Math.log(e[i - 1] + 1e-10));
  return o;
}

/** The tempo that makes the onsets repeat most, between 70 and 180 BPM, favouring the usual 90 to 140. */
function tempo(o: Float32Array): number {
  const minLag = Math.round(60 / 180 / HOP_SECONDS);
  const maxLag = Math.round(60 / 70 / HOP_SECONDS);
  let best = minLag;
  let bestScore = -Infinity;
  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < o.length; i++) s += o[i] * o[i - lag];
    const bpm = 60 / (lag * HOP_SECONDS);
    // A gentle preference for the common range settles octave doubts (60 vs 120).
    const weight = Math.exp(-0.5 * ((Math.log2(bpm / 118) / 0.6) ** 2));
    scores[lag] = s * weight;
    if (scores[lag] > bestScore) {
      bestScore = scores[lag];
      best = lag;
    }
  }
  // Parabolic refinement between neighbouring lags.
  const a = scores[best - 1] ?? scores[best];
  const b = scores[best];
  const c = scores[best + 1] ?? scores[best];
  const shift = a - 2 * b + c === 0 ? 0 : (0.5 * (a - c)) / (a - 2 * b + c);
  return 60 / ((best + Math.max(-0.5, Math.min(0.5, shift))) * HOP_SECONDS);
}

/** Sum of an envelope sampled on a grid: phase + k * period (in frames), from `from` on. */
function gridSum(e: Float32Array, phase: number, period: number): number {
  let s = 0;
  for (let t = phase; t < e.length; t += period) {
    const i = Math.round(t);
    s += Math.max(e[i] ?? 0, e[i - 1] ?? 0, e[i + 1] ?? 0);
  }
  return s;
}

/**
 * Tempo, beats, bars and drops. `bpm` may be given when it is already known
 * (the library's were measured when it was built); otherwise it is found.
 */
export function analyzeMusic(mono: Float32Array, sampleRate: number, bpm?: number): MusicMap {
  const { all, low } = envelopes(mono, sampleRate);
  const seconds = mono.length / sampleRate;
  const o = onsets(all);
  const ol = onsets(low);
  const found = bpm && bpm > 0 ? bpm : tempo(o);
  const period = 60 / found / HOP_SECONDS;

  // The beat phase: the grid offset the onsets agree with most.
  let phase = 0;
  let best = -Infinity;
  for (let p = 0; p < period; p += 1) {
    const s = gridSum(o, p, period) + gridSum(ol, p, period);
    if (s > best) {
      best = s;
      phase = p;
    }
  }
  // The downbeat: of the four beats in a bar, the one the kick and bass lean on most.
  let bar = 0;
  let bestBar = -Infinity;
  // Onsets rise as much on a soft kick as on a hard one (a ratio), so the accent is read from the bass energy itself.
  const lowPeak = low.reduce((a, b) => Math.max(a, b), 0) || 1;
  const lowNorm = low.map((v) => v / lowPeak);
  for (let j = 0; j < 4; j++) {
    const s = gridSum(lowNorm, phase + j * period, period * 4);
    if (s > bestBar) {
      bestBar = s;
      bar = j;
    }
  }
  const firstBeat = phase * HOP_SECONDS;
  const downbeat = (phase + bar * period) * HOP_SECONDS;

  // Energy per bar, then the bars where it jumps against the bars before: drops and new sections.
  const barFrames = period * 4;
  const energies: number[] = [];
  for (let s = phase + bar * period; s + barFrames <= all.length; s += barFrames) {
    let e = 0;
    for (let i = Math.round(s); i < Math.round(s + barFrames); i++) e += all[i];
    energies.push(e / barFrames);
  }
  const sorted = [...energies].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const candidates: { at: number; strength: number }[] = [];
  for (let n = 2; n < energies.length - 1; n++) {
    const before = energies.slice(Math.max(0, n - 4), n);
    const prev = before.reduce((a, b) => a + b, 0) / before.length;
    const next = (energies[n] + energies[n + 1]) / 2;
    const ratio = next / (prev + 1e-12);
    // A clear jump anywhere, or a smaller one on a phrase line (every 4 bars), where sections change.
    if ((ratio > 1.5 || (ratio > 1.35 && n % 4 === 0)) && energies[n] >= median) {
      // A jump on a phrase line (every 4 bars from the first downbeat) is a section; it counts for more.
      candidates.push({ at: downbeat + n * barFrames * HOP_SECONDS, strength: Math.log(ratio) * (n % 4 === 0 ? 1.5 : 1) });
    }
  }
  candidates.sort((a, b) => b.strength - a.strength);
  const drops: number[] = [];
  const minGap = 8 * 4 * (60 / found);
  for (const c of candidates) {
    if (drops.every((d) => Math.abs(d - c.at) >= minGap)) drops.push(Math.round(c.at * 1000) / 1000);
    if (drops.length === 6) break;
  }
  return { bpm: Math.round(found * 10) / 10, firstBeat: Math.round(firstBeat * 1000) / 1000, downbeat: Math.round(downbeat * 1000) / 1000, drops, seconds: Math.round(seconds * 100) / 100 };
}

/**
 * Where in the track a film starts: so that a drop lands exactly when the
 * film's close begins (the brand moment hits with the music), when one
 * fits in the track; otherwise on the first downbeat, so the film's bars are
 * the music's bars. `fadeTail` is the track's own fade at its end.
 */
export function musicStart(map: Pick<MusicMap, "downbeat" | "drops" | "seconds">, closeAt: number, filmSeconds: number, fadeTail = 3): { start: number; dropAt: number | null } {
  for (const d of map.drops) {
    const start = Math.round((d - closeAt) * 1000) / 1000;
    if (start >= map.downbeat - 0.02 && start + filmSeconds <= map.seconds - fadeTail) return { start: Math.max(0, start), dropAt: closeAt };
  }
  return { start: map.downbeat, dropAt: null };
}

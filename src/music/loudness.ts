/**
 * How loud a finished film sounds, and the gain that brings it to a target:
 * integrated loudness per ITU-R BS.1770 (K-weighted, gated, in LUFS), and a
 * look-ahead peak limiter so the louder mix never clips. Pure: works on
 * planar float samples, in the browser (the export) and in tests.
 */

/** Loudness for a film with a voice: the level the big platforms normalise to. */
export const TARGET_VOICED = -14;
/** A film with only music: the same platform loudness (the music's level against a voice is set in the mix, not here). */
export const TARGET_MUSIC = -14;
/** The limiter's ceiling, in dBFS: under the -1.2 dBFS true-peak limit with room for the encoder's overshoot. */
export const CEILING_DB = -1.5;

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/**
 * The two K-weighting stages (a high shelf for the head, a high-pass for the
 * low end) at a sample rate, by bilinear transform of the analog prototypes:
 * at 48 kHz these are the standard's published coefficients.
 */
function kWeighting(sampleRate: number): Biquad[] {
  // Stage 1: high shelf, +4 dB above about 1.7 kHz.
  const K = Math.tan((Math.PI * 1681.974450955533) / sampleRate);
  const Q = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20);
  const Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  const shelf: Biquad = { b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  // Stage 2: high-pass near 38 Hz.
  const K2 = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
  const Q2 = 0.5003270373238773;
  const h0 = 1 + K2 / Q2 + K2 * K2;
  const highpass: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K2 * K2 - 1)) / h0, a2: (1 - K2 / Q2 + K2 * K2) / h0 };
  return [shelf, highpass];
}

function filter(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * Integrated loudness in LUFS (BS.1770-4): K-weighted mean square over 400 ms
 * blocks with 75% overlap, gated at -70 LUFS and then 10 LU under the
 * ungated mean. Channels are weighted equally (mono, stereo). -Infinity for
 * silence or audio shorter than one block.
 */
export function integratedLoudness(channels: Float32Array[], sampleRate: number, gain?: Float32Array): number {
  const [shelf, highpass] = kWeighting(sampleRate);
  const block = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  const length = channels[0]?.length ?? 0;
  if (length < block) return -Infinity;
  // Running sums of K-weighted squares, summed across channels.
  const power = new Float64Array(length + 1);
  for (const ch of channels) {
    const x = gain ? ch.map((v, i) => v * gain[i]) : ch;
    const k = filter(filter(x, shelf), highpass);
    let acc = 0;
    for (let i = 0; i < length; i++) {
      acc += k[i] * k[i];
      power[i + 1] += acc;
    }
  }
  const blocks: number[] = [];
  for (let s = 0; s + block <= length; s += step) blocks.push((power[s + block] - power[s]) / block);
  const lufs = (z: number) => -0.691 + 10 * Math.log10(z);
  const mean = (zs: number[]) => zs.reduce((a, b) => a + b, 0) / zs.length;
  const loud = blocks.filter((z) => lufs(z) > -70);
  if (!loud.length) return -Infinity;
  const relative = lufs(mean(loud)) - 10;
  const gated = loud.filter((z) => lufs(z) > relative);
  return lufs(mean(gated));
}

/**
 * The per-sample gain of a peak limiter at `ceiling` (linear) on audio first
 * raised by `gain`: it looks `lookahead` seconds ahead so it is already down
 * when a peak arrives, and recovers over `release` seconds. The result times
 * the audio never exceeds the ceiling.
 */
export function limiterGain(channels: Float32Array[], sampleRate: number, gain: number, ceiling: number, lookahead = 0.005, release = 0.08): Float32Array {
  const n = channels[0]?.length ?? 0;
  const L = Math.max(1, Math.round(lookahead * sampleRate));
  // The most each sample allows.
  const allow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const ch of channels) p = Math.max(p, Math.abs(ch[i]));
    allow[i] = p * gain > ceiling ? ceiling / (p * gain) : 1;
  }
  // The least allowed over the next L samples (a monotonic deque: linear time).
  const ahead = new Float32Array(n);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && allow[q[tail - 1]] >= allow[i]) tail--;
    q[tail++] = i;
    while (q[head] > i + L) head++;
    ahead[i] = allow[q[head]];
  }
  // Averaged over the L samples before: a smooth dip that is still at or under what every sample allows.
  const out = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += ahead[i];
    if (i >= L + 1) sum -= ahead[i - L - 1];
    out[i] = sum / Math.min(i + 1, L + 1);
  }
  // Recover gently: never faster than the release, never above the dip.
  const k = 1 - Math.exp(-1 / (release * sampleRate));
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = Math.min(out[i], g + (1 - g) * k);
    out[i] = g * gain;
  }
  return out;
}

/**
 * The per-sample gain that brings audio to `target` LUFS with peaks held
 * under `ceilingDb`. The limiter takes a little loudness off, so the gain is
 * corrected once against the limited result. Gain is held to +-20 dB: a near
 * silent film is not pumped up into noise. Null for silence.
 */
export function masterGain(channels: Float32Array[], sampleRate: number, target: number, ceilingDb = CEILING_DB): { gain: Float32Array; before: number; after: number } | null {
  const before = integratedLoudness(channels, sampleRate);
  if (!Number.isFinite(before)) return null;
  const ceiling = 10 ** (ceilingDb / 20);
  const clamp = (db: number) => Math.max(-20, Math.min(20, db));
  let db = clamp(target - before);
  let gain = limiterGain(channels, sampleRate, 10 ** (db / 20), ceiling);
  let after = integratedLoudness(channels, sampleRate, gain);
  if (Math.abs(target - after) > 0.3) {
    db = clamp(db + (target - after));
    gain = limiterGain(channels, sampleRate, 10 ** (db / 20), ceiling);
    after = integratedLoudness(channels, sampleRate, gain);
  }
  return { gain, before, after };
}

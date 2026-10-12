/** What master() works on: the shape of a Web Audio AudioBuffer. */
export type PcmBuffer = { sampleRate: number; numberOfChannels: number; length: number; getChannelData(channel: number): Float32Array };

const TARGET_DB = -15;
const CEILING = 0.891; // -1 dBFS
const MAX_GAIN_DB = 18;
const LOOKAHEAD = 0.005;
const RELEASE = 0.12;
const FADE = 0.4;

/** Loudness of the parts that are not near-silent: mean power of 400 ms windows above -50 dB, in dB. */
function gatedDb(channels: Float32Array[], rate: number): number | null {
  const win = Math.round(rate * 0.4);
  let power = 0;
  let count = 0;
  for (let start = 0; start + win <= channels[0].length; start += win) {
    let sum = 0;
    for (const ch of channels) for (let i = start; i < start + win; i++) sum += ch[i] * ch[i];
    const p = sum / (win * channels.length);
    if (p > 1e-5) {
      power += p;
      count++;
    }
  }
  return count ? 10 * Math.log10(power / count) : null;
}

/**
 * Gain on every sample, at most 1, that keeps `peaks[i] * gain[i]` under
 * the ceiling: each reduction starts LOOKAHEAD before its peak, ramps over
 * that time (no clicks) and recovers over RELEASE.
 */
function limiterGain(peaks: Float32Array, rate: number): Float32Array {
  const n = peaks.length;
  const look = Math.max(1, Math.round(rate * LOOKAHEAD));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) need[i] = peaks[i] > CEILING ? CEILING / peaks[i] : 1;
  // Minimum of need over [i, i + look], with a monotonic deque.
  const ahead = new Float32Array(n);
  const q: number[] = [];
  let head = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (q.length > head && need[q[q.length - 1]] >= need[i]) q.pop();
    q.push(i);
    while (q[head] > i + look) head++;
    ahead[i] = need[q[head]];
  }
  // A moving average over the lookahead keeps every peak covered and ramps the attack.
  const gain = new Float32Array(n);
  let sum = 0;
  const k = 1 - Math.exp(-1 / (RELEASE * rate));
  let last = 1;
  for (let i = 0; i < n; i++) {
    sum += ahead[i];
    if (i >= look) sum -= ahead[i - look];
    const avg = sum / Math.min(i + 1, look);
    last = Math.min(avg, last + (1 - last) * k);
    gain[i] = last;
  }
  return gain;
}

/**
 * Masters a rendered soundtrack in place: up to about -15 dB loudness (never
 * more than +18 dB of gain, so near-silence stays quiet), every peak held at
 * or under -1 dBFS by a lookahead limiter, and a 0.4 s fade at the very end.
 */
export function master<T extends PcmBuffer>(audio: T): T {
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  const rate = audio.sampleRate;
  const dry = channels.map((c) => c.slice());
  const loud = gatedDb(dry, rate);
  const peaks = new Float32Array(audio.length);
  let gain = loud === null ? 1 : Math.min(10 ** ((TARGET_DB - loud) / 20), 10 ** (MAX_GAIN_DB / 20));
  // The limiter takes energy out of the peaks; measure again and make up for it.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < audio.length; i++) {
      let p = 0;
      for (const d of dry) p = Math.max(p, Math.abs(d[i]));
      peaks[i] = p * gain;
    }
    const limit = limiterGain(peaks, rate);
    for (let c = 0; c < channels.length; c++) for (let i = 0; i < audio.length; i++) channels[c][i] = dry[c][i] * gain * limit[i];
    const now = gatedDb(channels, rate);
    if (loud === null || now === null || Math.abs(TARGET_DB - now) < 0.5 || pass === 2) break;
    gain = Math.min(gain * 10 ** ((TARGET_DB - now) / 20), 10 ** (MAX_GAIN_DB / 20));
  }
  const fade = Math.round(rate * FADE);
  for (const ch of channels) for (let i = Math.max(0, ch.length - fade); i < ch.length; i++) ch[i] *= (ch.length - 1 - i) / fade;
  return audio;
}

/**
 * How loud the music sits: a bed under the picture, never the lead. With a
 * voice-over it stays about 16 dB under the voice (and dips another 8 dB
 * while a line is spoken); without one it is a little louder, still a bed.
 * Measured: the library tracks are loudness-matched at about -16 to -20 dBFS
 * RMS; a track a person brings is matched to them first.
 */

/** The music's level with a voice-over, and without one (0 to 1, on the matched track). */
export const MUSIC_UNDER_VOICE = 0.32;
export const MUSIC_ALONE = 0.45;

/** How far the music dips while a line is spoken (0.4 is about -8 dB), and over how many frames it moves. */
export const DUCK = 0.4;
export const DUCK_FRAMES = 6;

/** The level a film's music plays at unless the person set one. */
export const defaultLevel = (voiced: boolean) => (voiced ? MUSIC_UNDER_VOICE : MUSIC_ALONE);

/** The loudness a person's own track is matched to: the middle of the library. */
export const TARGET_RMS_DB = -18;

/** RMS of audio samples, in dBFS. */
export function rmsDb(channels: Float32Array[]): number {
  let sum = 0;
  let n = 0;
  for (const c of channels) {
    // Every 4th sample is plenty for a level, and quick on a long track.
    for (let i = 0; i < c.length; i += 4) {
      sum += c[i] * c[i];
      n++;
    }
  }
  return n ? 20 * Math.log10(Math.sqrt(sum / n) + 1e-9) : -Infinity;
}

/** The gain that brings a track measured at `db` to the library's loudness, within sane bounds. */
export const matchGain = (db: number) => (Number.isFinite(db) ? Math.min(2.5, Math.max(0.1, 10 ** ((TARGET_RMS_DB - db) / 20))) : 1);

/**
 * The quality floor OneMotion holds every model to, cheap or not: what is
 * measured on the film itself, never taken on the model's word. A film too
 * thin for its beats, beats that look the same one after another, a concept
 * too short for a story, a review score under the floor: each sends the work
 * back. Pure, except `signature` (it decodes an image in the browser).
 */

/** The review score a film must reach before it is done (a model below it gets more rounds). */
export const MIN_SCORE = 7;
/** Rounds a film below the floor may get after the usual two. */
export const EXTRA_REVIEWS = 2;
/** Lines of scene code per beat below which a film is a sketch, not a film. */
const LINES_PER_BEAT = 35;
/** A film (without a length in the brief) shorter than this is too short to tell a story. */
export const MIN_SECONDS = 20;

/** Characters of code in one line of ordinarily formatted scene code: how much code a "line" stands for. */
const CHARS_PER_LINE = 40;

/**
 * How much code a file holds, in ordinarily formatted lines: its working
 * lines (no blank or comment lines), or its code's characters over
 * CHARS_PER_LINE when that is more. A model that writes a beat minified on
 * a few long lines has written as much as one that spreads it over forty.
 */
export function codeSize(src: string): number {
  const working = src.split("\n").filter((l) => l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l));
  const chars = working.reduce((n, l) => n + l.replace(/\s+/g, "").length, 0);
  return Math.max(working.length, Math.round(chars / CHARS_PER_LINE));
}

/** The scene's code, in ordinarily formatted lines that do something (no stub beats). */
export function codeLines(files: Record<string, string>): number {
  return Object.entries(files)
    .filter(([, src]) => !/its agent writes this file/.test(src))
    .reduce((n, [, src]) => n + codeSize(src), 0);
}

/** A defect line when the film is too thin for its beats, or null. */
export function thinness(files: Record<string, string>, beats: number): string | null {
  const lines = codeLines(files);
  if (!beats || lines >= LINES_PER_BEAT * beats) return null;
  return `the film is thin: ${lines} lines of scene code for ${beats} beats. Give every beat its own component with its own picture (its hero, its supporting layers, its motion and its sounds), not one shared layout with the words swapped`;
}

/** Whether the brief names a length ("15-second", "30 detik", "45 s"). */
export const namesLength = (brief: string) => /\b\d{1,3}\s*(?:-|\s)?(?:s|sec|secs|seconds?|detik|dtk)\b/i.test(brief);

/** Whether a concept is too short for the story it has to tell (when the brief leaves the length open). */
export const tooShort = (beats: { seconds: number }[], brief: string) => !namesLength(brief) && beats.reduce((a, b) => a + b.seconds, 0) < MIN_SECONDS;

/** What the art director is told when the concept is too short. */
export const SHORT_FIX = `The concept is too short to tell its story: make it at least ${MIN_SECONDS} seconds (a launch or offer film 20 to 30), with room for the situation, the tension, the turn and what changes after. Keep everything else. Reply with the complete concept JSON only.`;

/** The mean absolute difference (0 to 255) between two signatures of the same size. */
export function difference(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return a.length ? d / a.length : 255;
}

/** Below this difference, two held frames of different beats look the same. */
export const SAME_FRAME = 9;

/** A small greyscale picture of a still, for comparing frames. */
export async function signature(image: Blob): Promise<Float32Array | null> {
  try {
    const bmp = await createImageBitmap(image);
    const c = new OffscreenCanvas(48, 27);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, 48, 27);
    bmp.close();
    const px = ctx.getImageData(0, 0, 48, 27).data;
    const out = new Float32Array(48 * 27);
    for (let i = 0; i < out.length; i++) out[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    return out;
  } catch {
    return null;
  }
}

/**
 * Defect lines for beats in a row whose held frames look the same: the
 * holds (one per beat, in order) and their signatures.
 */
export function sameness(holds: { beat: string; frame: number; sig: Float32Array | null }[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < holds.length; i++) {
    const a = holds[i - 1];
    const b = holds[i];
    if (!a.sig || !b.sig) continue;
    if (difference(a.sig, b.sig) < SAME_FRAME) out.push(`${a.beat} (frame ${a.frame}) and ${b.beat} (frame ${b.frame}) look nearly the same: two beats in a row must change at least two of composition, scale of the hero, position, background and camera`);
  }
  return out;
}

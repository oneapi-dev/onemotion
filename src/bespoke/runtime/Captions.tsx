import { useCurrentFrame } from "remotion";
import type { Beat, BeatWord } from "../kit/film";

export type CaptionStyle = { bg?: string; fg?: string; hot?: string; font?: string };

const IN = 3;
const OUT = 12;
/** A caption shows a phrase at a time: at most this many words or characters, broken after punctuation where it can. */
const MAX_WORDS = 7;
const MAX_CHARS = 42;

/**
 * A line's words as caption phrases: a new phrase after a sentence or a
 * clause ends, or when the phrase is full. A long narration then reads a
 * phrase at a time instead of filling the frame.
 */
export function captionChunks(words: BeatWord[]): BeatWord[][] {
  const chunks: BeatWord[][] = [];
  let cur: BeatWord[] = [];
  let chars = 0;
  for (const w of words) {
    if (cur.length && (cur.length >= MAX_WORDS || chars + 1 + w.text.length > MAX_CHARS)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(w);
    chars += (chars ? 1 : 0) + w.text.length;
    // A clause ends here: break, unless the phrase would be a lonely word or two.
    if (/[.!?;:,]["')\]]?$/.test(w.text) && cur.length >= 3) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
  }
  if (cur.length) {
    // A short tail joins the phrase before it when they fit together.
    const prev = chunks[chunks.length - 1];
    if (prev && cur.length <= 2 && prev.length + cur.length <= MAX_WORDS + 1) prev.push(...cur);
    else chunks.push(cur);
  }
  return chunks;
}

/**
 * The voice-over as captions in the bottom band, a phrase at a time, the
 * word being said highlighted. Drawn only for recorded lines (estimated word
 * times would drift from the voice); a scene turns them off with `export
 * const captions = false` or styles them with `export const captionStyle`.
 */
export const Captions = ({ beats, W, H, style }: { beats: Beat[]; W: number; H: number; style?: CaptionStyle }) => {
  const t = useCurrentFrame();
  const line = beats.find((b) => b.spoken && b.words.length && t >= b.words[0].at - IN && t < b.words[b.words.length - 1].end + OUT);
  if (!line) return null;
  const chunks = captionChunks(line.words);
  // The phrase being said, or the last one said while the line's caption fades.
  let k = chunks.findIndex((c, i) => t < (chunks[i + 1]?.[0].at ?? Infinity));
  if (k < 0) k = chunks.length - 1;
  const words = chunks[k];
  const first = line.words[0].at;
  const last = line.words[line.words.length - 1].end;
  const fade = Math.min(1, (t - (first - IN)) / IN, (last + OUT - t) / 6);
  const portrait = H > W;
  const size = Math.round((portrait ? 46 : 40) * (W / (portrait ? 1080 : 1920)));
  const bg = style?.bg ?? "rgba(12,12,14,0.86)";
  const fg = style?.fg ?? "#FFFFFF";
  const hot = style?.hot ?? "#FFD54A";
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: Math.round(H * (portrait ? 0.08 : 0.055)), display: "flex", justifyContent: "center", opacity: Math.max(0, fade), pointerEvents: "none" }}>
      <div style={{ maxWidth: W * (portrait ? 0.86 : 0.7), padding: `${size * 0.32}px ${size * 0.6}px`, borderRadius: size * 0.4, background: bg, color: fg, fontFamily: style?.font ? `"${style.font}", Inter, sans-serif` : "Inter, Helvetica, sans-serif", fontWeight: 600, fontSize: size, lineHeight: 1.3, textAlign: "center" }}>
        {words.map((w, i) => (
          <span key={i} style={{ color: t >= w.at && t < (words[i + 1]?.at ?? chunks[k + 1]?.[0].at ?? last + OUT) ? hot : fg }}>
            {w.text}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </div>
  );
};

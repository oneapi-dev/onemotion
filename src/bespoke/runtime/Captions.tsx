import { useCurrentFrame } from "remotion";
import type { Beat } from "../kit/film";

export type CaptionStyle = { bg?: string; fg?: string; hot?: string; font?: string };

const IN = 3;
const OUT = 12;

/**
 * The voice-over as captions in the bottom band, the word being said
 * highlighted. Drawn only for recorded lines (estimated word times would
 * drift from the voice); a scene turns them off with `export const
 * captions = false` or styles them with `export const captionStyle`.
 */
export const Captions = ({ beats, W, H, style }: { beats: Beat[]; W: number; H: number; style?: CaptionStyle }) => {
  const t = useCurrentFrame();
  const line = beats.find((b) => b.spoken && b.words.length && t >= b.words[0].at - IN && t < b.words[b.words.length - 1].end + OUT);
  if (!line) return null;
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
        {line.words.map((w, i) => (
          <span key={i} style={{ color: t >= w.at && t < (line.words[i + 1]?.at ?? last + OUT) ? hot : fg }}>
            {w.text}
            {i < line.words.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </div>
  );
};

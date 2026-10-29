import { Chars, Fit } from "@kit";
import { DISPLAY, INK, MONO, MUTED, SIZE } from "../theme";

/** A small mono kicker over a measured serif headline (one Fit per line), revealed character by character from frame `at`. */
export const Headline = ({ lines, kicker, t, at, maxW }: { lines: string[]; kicker?: string; t: number; at: number; maxW: number }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {kicker ? <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: SIZE.kicker, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginBottom: 10 }}>{kicker}</div> : null}
    {lines.map((line, i) => (
      <Fit key={i} text={line} font={DISPLAY} weight={500} size={SIZE.headline} maxW={maxW} style={{ color: INK }}>
        <Chars text={line} t={t} at={at + i * 10} step={1.2} mode="rise" />
      </Fit>
    ))}
  </div>
);

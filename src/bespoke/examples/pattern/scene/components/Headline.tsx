import { Chars, Fit } from "@kit";
import { DISPLAY, INK, SIZE } from "../theme";

/** One measured headline line, revealed character by character from frame `at`. Fit keeps it inside maxW. */
export const Headline = ({ text, t, at, maxW }: { text: string; t: number; at: number; maxW: number }) => (
  <Fit text={text} font={DISPLAY} weight={700} size={SIZE.headline} maxW={maxW} style={{ color: INK }}>
    <Chars text={text} t={t} at={at} step={1.6} mode="rise" />
  </Fit>
);

import { useCurrentFrame } from "remotion";
import { FormulaSteps, prog, useBeat, useFilm, type Tok } from "@kit";
import { Headline } from "../components/Headline";
import { ACCENT, DIST, INK, MATH, MUTED, SIZE, TEXT, VARS } from "../theme";

/** The equation's three forms: tokens keep their keys, so "h", "=", "sin", "(", "x", ")" glide to their new places. */
const STEPS: Tok[][] = [
  [{ s: "h" }, { s: "=" }, { s: "sin" }, { s: "(" }, { s: "x" }, { s: ")" }],
  [{ s: "h" }, { s: "=" }, { s: "A" }, { s: "sin" }, { s: "(" }, { s: "x" }, { s: ")" }],
  [{ s: "h" }, { s: "=" }, { s: "A" }, { s: "sin" }, { s: "(" }, { s: "x" }, { s: "−" }, { s: "t" }, { s: ")" }],
];

const Key = ({ name, c, what, o }: { name: string; c: string; what: string; o: number }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 14, opacity: o }}>
    <span style={{ fontFamily: MATH, fontSize: SIZE.label * 1.4, color: c }}>{name}</span>
    <span style={{ fontFamily: TEXT, fontSize: SIZE.label, color: MUTED }}>{what}</span>
  </div>
);

// Each rewrite lands on the word that names it: "sine" builds, "scaled" brings A in, "time" sets it moving.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe } = useFilm();
  const { cue } = useBeat();
  const at = [Math.max(0, cue("sine") - 10), cue("scaled") - 4, cue("time") - 4];
  const key = prog(t, at[0] + 30, at[0] + 42);
  return (
    <>
      <Headline text="Height is a sine of distance." t={t} at={0} maxW={Math.min(W * 0.8, safe.right - safe.left)} />
      <FormulaSteps t={t} steps={STEPS} at={at} dur={21} size={SIZE.formula} font={MATH} ink={INK} colors={VARS} style={{ marginTop: H * 0.09 }} />
      <div style={{ display: "flex", gap: W * 0.05, marginTop: H * 0.07 }}>
        <Key name="h" c={ACCENT} what="height" o={key} />
        <Key name="x" c={DIST} what="distance" o={key} />
      </div>
    </>
  );
}

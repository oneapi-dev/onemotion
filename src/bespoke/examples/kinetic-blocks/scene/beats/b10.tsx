import { useCurrentFrame } from "remotion";
import { Stretch, useBeat } from "@kit";
import { ACCENT, LOOK, PAPER } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { len } = useBeat();
  return <Stretch t={t} at={0} len={len} word="ELASTIC." grounds={[[0, ACCENT], [4, PAPER], [5, ACCENT]]} {...LOOK} />;
}

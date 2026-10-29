import { useCurrentFrame } from "remotion";
import { Progress, useBeat } from "@kit";
import { INK, LOOK, PAPER } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { len } = useBeat();
  return <Progress t={t} at={0} len={len} lines={["RENDERED", "ON A LAPTOP."]} cards={[["SWELL", LOOK.accent, INK], ["IS", PAPER, INK], ["COMING.", LOOK.accent, INK], ["BE", PAPER, INK], ["THERE.", LOOK.accent, INK]]} {...LOOK} />;
}

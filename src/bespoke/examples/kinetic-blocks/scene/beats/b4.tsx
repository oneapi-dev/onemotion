import { useCurrentFrame } from "remotion";
import { FlyWords, useBeat } from "@kit";
import { LOOK, PAPER } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { len } = useBeat();
  return <FlyWords t={t} at={0} len={len} words={[["CAMERA", PAPER], ["FLIES", LOOK.accent], ["THROUGH", PAPER], ["THE TYPE.", LOOK.accent]]} {...LOOK} />;
}

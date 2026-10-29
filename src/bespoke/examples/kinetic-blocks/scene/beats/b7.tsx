import { useCurrentFrame } from "remotion";
import { Hero, useBeat } from "@kit";
import { LOOK } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { len } = useBeat();
  return <Hero t={t} at={0} len={len} kicker="MADE BY" title="TIDEPOOL" sub="for people who surf before work" {...LOOK} />;
}

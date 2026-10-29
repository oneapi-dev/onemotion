import { useCurrentFrame } from "remotion";
import { Graph, useBeat } from "@kit";
import { LOOK } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { len } = useBeat();
  return <Graph t={t} at={0} len={len} number="0" label="KEYFRAMES" sub="dragged by hand" {...LOOK} />;
}

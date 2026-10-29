import { useCurrentFrame } from "remotion";
import { Notes, useBeat } from "@kit";
import { LOOK } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { len } = useBeat();
  return <Notes t={t} at={0} len={len} preview="ELASTIC." notes={[["hotter orange", "recolor"], ["cut the intro in half", "trim"], ["more punch", "punch"]]} {...LOOK} />;
}

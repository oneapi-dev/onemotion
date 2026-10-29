import { useCurrentFrame } from "remotion";
import { Chain, useBeat } from "@kit";
import { LOOK } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { len } = useBeat();
  return <Chain t={t} at={0} len={len} nodes={[["BRIEF", "brief.md"], ["CODE", "scene.tsx"], ["FILM.", "1080p", LOOK.accent]]} {...LOOK} />;
}

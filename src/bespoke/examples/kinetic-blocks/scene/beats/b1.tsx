import { useCurrentFrame } from "remotion";
import { PictureShot, useBeat } from "@kit";
import { ART, LOOK } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { len } = useBeat();
  return <PictureShot t={t} at={0} len={len} src={ART} words={[[1, "MONSTERS"], [3, "NEXT DOOR.", LOOK.accent]]} focus={[0.64, 0.5]} weather="rain" cutIns={[[5, 1.6, [0.64, 0.48]]]} font={LOOK.font} weight={LOOK.weight} />;
}

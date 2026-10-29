import { useCurrentFrame } from "remotion";
import { Counters, onBeat, useFilm } from "@kit";
import { LOOK } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { pulse } = useFilm();
  return <Counters t={t} at={0} step={onBeat(0, 3, pulse)} counters={[["1", "WEB PAGE"], ["12", "SCENES"], ["0", "KEYFRAMES"]]} source={"const film = useFilm();\nconst t = useCurrentFrame();\nreturn <KineticType t={t} shots={shots} />;"} {...LOOK} />;
}

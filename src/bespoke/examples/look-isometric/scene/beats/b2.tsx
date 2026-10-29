import { useCurrentFrame } from "remotion";
import { IsoBlock, useBeat, useFilm } from "@kit";
import { Headline } from "../components/Headline";
import { Label, SENSORS, SERVER, Sensor, Stage, traffic } from "../components/Model";
import { ACCENT } from "../theme";

// The sensors are already standing; the server rises on "server" and the readings start flowing into it.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, safe } = useFilm();
  const { cue } = useBeat();
  const server = cue("server") - 10;
  return (
    <>
      <Headline text="Their readings travel to one server." t={t} at={0} maxW={Math.min(W * 0.8, safe.right - safe.left)} />
      <Stage t={t}>
        {SENSORS.map((s, i) => (
          <Sensor key={i} x={s.x} y={s.y} t={t} at={-100} />
        ))}
        <IsoBlock {...SERVER} color={ACCENT} t={t} at={server} label={<Label>Server</Label>} />
        {traffic(t, cue("travel"))}
      </Stage>
    </>
  );
}

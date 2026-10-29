import { useCurrentFrame } from "remotion";
import { isoBuild, useBeat, useFilm } from "@kit";
import { Headline } from "../components/Headline";
import { Label, SENSORS, Sensor, Stage } from "../components/Model";

// b1 opens the film: the first sensor is already rising on frame 0, so the thumbnail is not empty.
// The model builds bottom-up, back to front, 8 frames per sensor (pad, then its post 4 frames later).
export default function Beat() {
  const t = useCurrentFrame();
  const { W, safe } = useFilm();
  const { cue } = useBeat();
  const starts = isoBuild(SENSORS, Math.min(cue("reef"), 8) - 6, 8);
  return (
    <>
      <Headline text="Sensors on the reef read every wave." t={t} at={-20} maxW={Math.min(W * 0.8, safe.right - safe.left)} />
      <Stage t={t}>
        {SENSORS.map((s, i) => (
          <Sensor key={i} x={s.x} y={s.y} t={t} at={starts[i]} hot label={i === 1 ? <Label>Reef sensors</Label> : undefined} />
        ))}
      </Stage>
    </>
  );
}

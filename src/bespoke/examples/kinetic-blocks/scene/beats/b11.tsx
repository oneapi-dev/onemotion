import { useCurrentFrame } from "remotion";
import { KineticType, Rewind, onBeat, useBeat, useFilm } from "@kit";
import { ACCENT, LOOK, PAPER } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { len } = useBeat();
  const { pulse } = useFilm();
  const b = (k: number) => onBeat(0, k, pulse);
  // The layer it rewinds: a short run of shots on its own clock.
  const Run = () => {
    const f = useCurrentFrame();
    return <KineticType t={f} sound={false} font={LOOK.font} weight={LOOK.weight} ground={LOOK.ground} shots={[{ at: 0, text: "THE SWELL", style: "slam" }, { at: b(2), text: ["IS", "COMING."], style: "stack", ground: ACCENT }, { at: b(4), text: "FIRST.", style: "punch", ground: PAPER }]} />;
  };
  return (
    <Rewind t={t} at={0} dur={len} from={b(6)} color={LOOK.color} accent={LOOK.accent}>
      <Run />
    </Rewind>
  );
}

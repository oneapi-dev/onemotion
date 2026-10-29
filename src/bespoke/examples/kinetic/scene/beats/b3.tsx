import { useCurrentFrame } from "remotion";
import { KineticType, onBeat, useBeat, useFilm } from "@kit";
import { ACCENT, DARK, DISPLAY, INK, PAPER } from "../theme";

// The title punches out of depth, "reads the ocean" slams in, then the camera flies through the O of OCEAN
// into its orange counter, the logo card's ground.
export default function Beat() {
  const t = useCurrentFrame();
  const { pulse } = useFilm();
  const { len } = useBeat();
  const b = (k: number) => onBeat(0, k, pulse);
  // The zoom takes the last beat and a half, so the counter fills the frame on the cut to the logo card.
  const zoom = len - b(1.5);
  return (
    <KineticType
      t={t}
      font={DISPLAY}
      weight={400}
      paper={PAPER}
      ink={INK}
      ground={DARK}
      zoom={{ at: zoom, dur: len - zoom, char: 0 }}
      shots={[
        { at: 0, text: "TIDEPOOL", style: "punch", fx: "punch", accent: ACCENT },
        { at: b(2), text: ["READS THE", "OCEAN."], style: "split", ground: ACCENT, color: INK, accent: PAPER, in: "left", fx: "hit" },
      ]}
    />
  );
}

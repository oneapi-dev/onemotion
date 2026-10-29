import { useCurrentFrame } from "remotion";
import { useFilm } from "@kit";
import { Headline } from "../components/Headline";

// b1 opens the film, so its first frame is the thumbnail: the map is already there and the line is rising.
// The words sit in the band of open ground above the world map, top left, clear of the pins.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe } = useFilm();
  return (
    <div style={{ position: "absolute", left: safe.left, top: Math.max(safe.top, H * 0.06) }}>
      <Headline kicker="Tidepool" lines={["Surf forecasts, now on 6 coasts."]} t={t} at={-20} maxW={W * 0.6} />
    </div>
  );
}

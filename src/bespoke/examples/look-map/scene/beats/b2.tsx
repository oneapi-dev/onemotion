import { useCurrentFrame } from "remotion";
import { useFilm } from "@kit";
import { Headline } from "../components/Headline";

// The camera has flown to Australia; the words sit over the Indian Ocean, bottom left, away from the route.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe } = useFilm();
  return (
    <div style={{ position: "absolute", left: safe.left, bottom: H - safe.bottom }}>
      <Headline kicker="Australia" lines={["Sydney to Bali,", "one swell."]} t={t} at={12} maxW={W * 0.3} />
    </div>
  );
}

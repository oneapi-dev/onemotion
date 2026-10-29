import { useCurrentFrame } from "remotion";
import { Shell, Tilt, useFilm } from "@kit";
import { TEXT } from "../theme";

// Keynote UI morph: a button grows into the forecast card (contents never scale); then the card, now a plain
// card-sized element, tilts in depth and lands flat.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H } = useFilm();
  const from = { x: W / 2 - 160, y: H * 0.6, w: 320, h: 96, r: 48 };
  const to = { x: W * 0.2, y: H * 0.16, w: W * 0.6, h: H * 0.66, r: 36 };
  const card = (
    <div style={{ padding: 56, fontFamily: TEXT }}>
      <div style={{ fontSize: 32, fontWeight: 500, color: "#86868B" }}>Bondi · now</div>
      <div style={{ fontSize: 200, fontWeight: 700, color: "#1D1D1F", letterSpacing: -6 }}>2.4 m</div>
    </div>
  );
  return (
    <div style={{ position: "absolute", inset: 0, background: "#F5F5F7" }}>
      {t < 40 ? (
        <Shell t={t} at={16} dur={24} from={from} to={to} fill="#FFFFFF" old={<div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "#0071E3", borderRadius: 48, fontFamily: TEXT, fontWeight: 700, fontSize: 34, color: "#FFFFFF" }}>Check swell</div>} next={card} />
      ) : (
        <Tilt t={t} at={40} dur={30} ry={-14} rx={4} style={{ position: "absolute", left: to.x, top: to.y, width: to.w, height: to.h, background: "#FFFFFF", borderRadius: to.r }}>
          {card}
        </Tilt>
      )}
    </div>
  );
}

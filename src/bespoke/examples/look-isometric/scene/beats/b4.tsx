import { useCurrentFrame } from "remotion";
import { IsoBlock, IsoPacket, IsoPath, prog, useBeat, useFilm } from "@kit";
import { Headline } from "../components/Headline";
import { Label, PHONE, SENSORS, SERVER, Sensor, Stage, TO_PHONE } from "../components/Model";
import { ACCENT, BLOCK, INK, MUTED, TEXT } from "../theme";

/** The forecast as the phone shows it: real UI laid flat on the slab's top face. */
const Screen = ({ t, at }: { t: number; at: number }) => {
  const o = prog(t, at, at + 12);
  const bars = [0.4, 0.55, 0.8, 1, 0.7, 0.5];
  return (
    <div style={{ position: "absolute", inset: 8, borderRadius: 10, background: "#FBFAF8", padding: 14, fontFamily: TEXT, color: INK, opacity: o, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 15, color: MUTED, fontWeight: 600 }}>Swell, dawn</div>
      <div style={{ fontSize: 34, fontWeight: 600, color: ACCENT }}>1.4 m</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 46, marginTop: 6 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, height: `${b * 100 * prog(t, at + 6 + i * 2, at + 18 + i * 2)}%`, background: i === 3 ? ACCENT : `${INK}30`, borderRadius: 2 }} />
        ))}
      </div>
    </div>
  );
};

// Sensors and server stand as before; the phone drops in on "phone", one packet rides to it and the forecast appears as it lands.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, safe } = useFilm();
  const { cue } = useBeat();
  const phone = cue("phone") - 12;
  const send = phone + 14;
  return (
    <>
      <Headline text="Then it reaches your phone." t={t} at={0} maxW={Math.min(W * 0.8, safe.right - safe.left)} />
      <Stage t={t}>
        {SENSORS.map((s, i) => (
          <Sensor key={i} x={s.x} y={s.y} t={t} at={-100} />
        ))}
        <IsoBlock {...SERVER} color={BLOCK} t={t} at={-100} />
        <IsoBlock {...PHONE} color={INK} t={t} at={phone} from="drop" top={<Screen t={t} at={send + 26} />} label={<Label>Your phone</Label>} />
        <IsoPath points={TO_PHONE} t={t} at={send - 6} dur={16} color={`${INK}40`} />
        <IsoPacket points={TO_PHONE} t={t} at={send} dur={28} color={ACCENT} size={0.32} />
      </Stage>
    </>
  );
}

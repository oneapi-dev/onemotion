import { useCurrentFrame } from "remotion";
import { Asset, Sfx, pop, prog, useBeat, useFilm } from "@kit";
import { Headline } from "../components/Headline";
import { MUTED, SIZE, STAGE, TEXT } from "../theme";

/**
 * Brands appear as their REAL logos, fetched with fetch_image (saved as
 * these asset names), each with its name under it in type. Never an empty
 * card standing in for a logo.
 */
const APPS = [
  { asset: "calendar-logo", name: "Calendar" },
  { asset: "mail-logo", name: "Mail" },
  { asset: "maps-logo", name: "Maps" },
];

export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe } = useFilm();
  const { cue, len } = useBeat();
  const apps = cue("apps"); // the logos arrive on the word "apps", one after another
  const exit = prog(t, len - 2, len + 10);
  const logo = Math.round(W * 0.09);
  return (
    <div style={{ position: "absolute", left: safe.left, top: H * STAGE.top, width: safe.right - safe.left, opacity: 1 - exit }}>
      <Headline text="From the apps you already use." t={t} at={0} maxW={safe.right - safe.left} />
      <div style={{ display: "flex", gap: W * 0.06, marginTop: H * 0.08 }}>
        {APPS.map((a, i) => {
          const s = pop(t, apps + i * 5);
          return (
            <div key={a.asset} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: Math.min(1, s), transform: `translateY(${(1 - Math.min(1, s)) * 30}px) scale(${0.85 + 0.15 * s})` }}>
              <Asset name={a.asset} width={logo} height={logo} />
              <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: SIZE.label, color: MUTED }}>{a.name}</div>
              <Sfx name="tick" at={apps + i * 5 - 1} volume={0.25} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useCurrentFrame } from "remotion";
import { MapStage, Sfx, moveE, useFilm, type MapKey, type MapPin } from "@kit";
import { ACCENT, BG, INK, LAND, MONO, SIZE, TEXT, TINT } from "../theme";

/** The six coasts, in the order they drop. Each label is a name (two words at most), placed clear of its neighbours. */
const COASTS: Omit<MapPin, "at">[] = [
  { lng: 151.21, lat: -33.87, label: "Sydney", side: "right" },
  { lng: 115.17, lat: -8.72, label: "Bali", side: "left" },
  { lng: -158.05, lat: 21.6, label: "North Shore", side: "bottom" },
  { lng: -122.03, lat: 36.97, label: "Santa Cruz", side: "left" },
  { lng: -9.42, lat: 38.96, label: "Ericeira", side: "left" },
  { lng: -1.56, lat: 43.48, label: "Biarritz", side: "top" },
];

/**
 * The film's one map. Frames come from the film's cues, so the camera and the pins land on the words.
 * The camera is smooth; pins, labels, the route and the lit country step at 15 fps (the news-map cadence).
 */
export const TideMap = () => {
  const t = useCurrentFrame();
  const { cue } = useFilm();
  const b2 = cue("b2");
  const b3 = cue("b3");
  const pins: MapPin[] = COASTS.map((c, i) => ({ ...c, at: 8 + i * 8 }));
  const cam: MapKey[] = [
    [0, { lng: 0, lat: 16, zoom: 1 }],
    [b2 - 6, { lng: 0, lat: 16, zoom: 1.04 }],
    [b2 + 42, { fit: [108, -44, 158, -4], pad: 0.08 }, moveE],
    [b3 - 4, { fit: [108, -44, 158, -4], pad: 0.06 }],
    [b3 + 40, { lng: 0, lat: 16, zoom: 1 }, moveE],
  ];
  return (
    <>
      <MapStage
        t={t}
        cam={cam}
        pins={pins}
        highlight={[{ id: "AUS", at: b2 + 30, color: TINT }]}
        routes={[{ path: [[151.21, -33.87], [131, -20], [115.17, -8.72]], at: b2 + 40, dur: 54, arc: 0.06, width: 4 }]}
        ground={BG}
        land={LAND}
        line={BG}
        accent={ACCENT}
        ink={INK}
        font={TEXT}
        mono={MONO}
        labelSize={SIZE.label}
        stepped
      />
      {pins.map((p, i) => (
        <Sfx key={i} name="tick" at={p.at - 1} volume={0.2} />
      ))}
      <Sfx name="whoosh" at={b2 - 4} volume={0.18} />
      <Sfx name="pencil" at={b2 + 40} volume={0.2} />
    </>
  );
};

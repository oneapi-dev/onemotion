import type { ReactNode } from "react";
import { IsoBlock, IsoGrid, IsoPacket, IsoPath, IsoScene, useFilm, type IsoPt } from "@kit";
import { ACCENT, BLOCK, INK, SIZE, TEXT } from "../theme";

/** The model in cells: three sensors in front, the server at the origin, the phone to the right. */
export const SENSORS = [
  { x: -3.2, y: 3 },
  { x: -1.6, y: 3 },
  { x: 0, y: 3 },
];
export const SERVER = { x: -0.8, y: -0.8, w: 1.6, d: 1.6, h: 2.4 };
export const PHONE = { x: 2.6, y: -3.2, w: 2.4, d: 4, h: 0.2 };

/** Floor routes from each sensor's foot to the server's front face. */
export const ROUTES: IsoPt[][] = SENSORS.map((s) => [
  [s.x + 0.5, s.y + 0.5, 0],
  [s.x + 0.5, 1.8, 0],
  [0, 1.8, 0],
  [0, 0.8, 0],
]);
/** From the server's right face to the middle of the phone's screen. */
export const TO_PHONE: IsoPt[] = [
  [0.8, 0, 0],
  [1.8, 0, 0],
  [1.8, -1.2, 0],
  [3.8, -1.2, 0.2],
];

export const Label = ({ children }: { children: ReactNode }) => <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: SIZE.label, color: INK }}>{children}</div>;

/** The stage every beat draws on: same size, origin and unit in each, so the model reads as one object. */
export const Stage = ({ t, children }: { t: number; children: ReactNode }) => {
  const { W, H } = useFilm();
  const u = Math.min(W / 40, H / 22);
  return (
    <IsoScene t={t} u={u} w={W * 0.62} h={H * 0.6} oy={H * 0.29} drift={14}>
      <IsoGrid n={6} color={`${INK}14`} />
      {children}
    </IsoScene>
  );
};

/** A sensor: a pad with a post on it. `hot` gives the post the accent. */
export const Sensor = ({ x, y, t, at, hot, label }: { x: number; y: number; t: number; at: number; hot?: boolean; label?: ReactNode }) => (
  <>
    <IsoBlock x={x} y={y} w={1} d={1} h={0.3} color={BLOCK} t={t} at={at} />
    <IsoBlock x={x + 0.3} y={y + 0.3} z={0.3} w={0.4} d={0.4} h={1.2} color={hot ? ACCENT : BLOCK} t={t} at={at + 4} from="grow" label={label} />
  </>
);

/**
 * The routes and the packets riding them, one every `every` frames from `at`. A plain list, not a component:
 * the scene sorts its direct children back to front (routes under the blocks, each packet at its own depth).
 */
export const traffic = (t: number, at: number, every = 27) => [
  ...ROUTES.map((r, i) => <IsoPath key={`r${i}`} points={r} t={t} at={at + i * 4} dur={18} color={`${INK}40`} width={2} />),
  ...ROUTES.map((r, i) => <IsoPacket key={`p${i}`} points={r} t={t} at={at + 18 + i * 9} dur={30} every={every} color={ACCENT} size={0.32} />),
];

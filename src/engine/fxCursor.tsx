import type { ReactNode } from "react";
import { Easing, Img, interpolate, useCurrentFrame } from "remotion";
import { useFx } from "./fx";
import { useLook } from "./looks";

/**
 * A pointer that glides in from below right, clicks the element it wraps
 * (which dips like a pressed button, with a ripple at the tip) and rests on
 * it. `at` is the frame the glide starts; the click lands about a second
 * later. Shown only when the scene asks for a cursor.
 */

const glideEase = Easing.bezier(0.3, 0, 0.2, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const GLIDE = 24;

// The pointer as an image, not inline SVG: the browser exporter rasterizes inline SVG anew every frame.
const pointer = (fill: string, edge: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 36"><path d="M1.5 1.5 L1.5 29 L8.6 22.4 L13.4 33.2 L18.6 31 L13.9 20.4 L23.6 20.4 Z" fill="${fill}" stroke="${edge}" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  )}`;
const POINTER_LIGHT = pointer("#ffffff", "#111111");
const POINTER_DARK = pointer("#111111", "#ffffff");
const CLICK = 30;

export const CursorTarget: React.FC<{ at: number; children: ReactNode }> = ({ at, children }) => {
  const fx = useFx();
  const look = useLook();
  const frame = useCurrentFrame();
  if (!fx.cursor) return <>{children}</>;
  const u = look.u;
  const f = frame - at;
  const g = glideEase(interpolate(f, [0, GLIDE], [0, 1], clamp));
  const rest = f > CLICK + 16 ? Math.sin((f - CLICK - 16) / 14) * 4 * u : 0;
  const x = (1 - g) * 360 * u + rest;
  const y = (1 - g) * 280 * u - Math.sin(g * Math.PI) * 60 * u + rest * 0.6;
  const press = interpolate(f, [CLICK, CLICK + 3, CLICK + 10], [1, 0.94, 1], clamp);
  const tip = interpolate(f, [CLICK, CLICK + 3, CLICK + 8], [1, 0.82, 1], clamp);
  const ripple = interpolate(f, [CLICK, CLICK + 18], [0, 1], clamp);
  const light = look.mode === "dark";
  const size = 54 * u;
  return (
    <div style={{ position: "relative", display: "inline-block", transform: `scale(${press})` }}>
      {children}
      {f >= 0 ? (
        <div style={{ position: "absolute", left: "64%", top: "58%", transform: `translate(${x}px, ${y}px)`, opacity: Math.min(1, f / 4) }}>
          {f >= CLICK && ripple < 1 ? (
            <div
              style={{
                position: "absolute",
                left: -ripple * 70 * u,
                top: -ripple * 70 * u,
                width: ripple * 140 * u,
                height: ripple * 140 * u,
                borderRadius: "50%",
                border: `${3 * u}px solid ${look.accentA}`,
                opacity: 0.8 * (1 - ripple),
              }}
            />
          ) : null}
          <Img src={light ? POINTER_LIGHT : POINTER_DARK} style={{ position: "absolute", left: 0, top: 0, width: size, height: size * 1.38, transformOrigin: "0 0", transform: `scale(${tip})` }} />
        </div>
      ) : null}
    </div>
  );
};

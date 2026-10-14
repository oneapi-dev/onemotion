// Shells for UI moments: windows, a phone, a cursor, the brand's mark. What
// goes inside (a dashboard, an editor, a chat) is the scene's to invent.
// Adapted from remotion-opus-skill's kit (MIT, (c) 2026 direkturcrypto).
import type { CSSProperties, ReactNode } from "react";
import { Img } from "remotion";
import { useFilm } from "./film";
import { pop, prog } from "./motion";
import { Sfx } from "./sound";

/** The brand's logo, or a monogram tile in its colour when it has none. */
export const Mark = ({ size, style }: { size: number; style?: CSSProperties }) => {
  const { brand } = useFilm();
  if (brand.logo) return <Img src={brand.logo} style={{ width: size, height: size, objectFit: "contain", flex: "none", ...style }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.24, background: brand.colors[0] ?? "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.56, fontFamily: "Inter, sans-serif", flex: "none", ...style }}>
      {brand.name.slice(0, 1).toUpperCase()}
    </div>
  );
};

/** Window chrome: a macOS window, a browser (tab and address bar), or a terminal. Content goes inside, below the bar. */
export const Window = ({ kind = "mac", w, h, title = "", url = "", dark = false, children, style }: { kind?: "mac" | "browser" | "terminal"; w: number; h: number; title?: string; url?: string; dark?: boolean; children?: ReactNode; style?: CSSProperties }) => {
  const term = kind === "terminal";
  const isDark = dark || term;
  const bar = kind === "browser" ? 88 : 46;
  const bg = isDark ? (term ? "#1A1B1E" : "#1E1F22") : "#F4F4F5";
  const fg = isDark ? "#E8E8EA" : "#1B1B1F";
  const line = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: 14, overflow: "hidden", background: term ? "#0F1012" : isDark ? "#141517" : "#FFFFFF", boxShadow: "0 30px 70px -30px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.12)", fontFamily: "Inter, Helvetica, sans-serif", ...style }}>
      <div style={{ height: bar, background: bg, borderBottom: `1px solid ${line}`, display: "flex", flexDirection: "column", color: fg }}>
        <div style={{ height: 46, display: "flex", alignItems: "center", padding: "0 16px", gap: 8 }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
          ))}
          {kind === "browser" ? (
            <div style={{ marginLeft: 14, padding: "8px 16px", borderRadius: "10px 10px 0 0", background: isDark ? "#2A2B2F" : "#FFFFFF", fontSize: 15, maxWidth: 280, overflow: "hidden", whiteSpace: "nowrap" }}>{title}</div>
          ) : (
            <div style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 600, opacity: 0.75, marginRight: 60, fontFamily: term ? "'JetBrains Mono', monospace" : undefined }}>{title}</div>
          )}
        </div>
        {kind === "browser" ? (
          <div style={{ height: 42, display: "flex", alignItems: "center", padding: "0 14px", gap: 12 }}>
            <span style={{ opacity: 0.5, fontSize: 16 }}>‹ ›</span>
            <div style={{ flex: 1, height: 30, borderRadius: 15, background: isDark ? "#2A2B2F" : "#EBEBED", display: "flex", alignItems: "center", padding: "0 14px", fontSize: 15, opacity: 0.85 }}>{url}</div>
          </div>
        ) : null}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: bar, bottom: 0, color: fg, fontFamily: term ? "'JetBrains Mono', monospace" : undefined }}>{children}</div>
    </div>
  );
};

/** A phone body; `w` is its outer width (the screen is w - 24 wide, about 2.07 times as tall). */
export const Phone = ({ w = 430, dark = true, time = "9:41", children, screenBg, style }: { w?: number; dark?: boolean; time?: string; children?: ReactNode; screenBg?: string; style?: CSSProperties }) => {
  const fg = dark ? "#FFFFFF" : "#0B0B0B";
  return (
    <div style={{ position: "relative", width: w, height: w * 2.07, borderRadius: w * 0.16, background: "#0D0D0F", boxShadow: "0 40px 90px -30px rgba(0,0,0,0.55)", padding: 12, boxSizing: "border-box", ...style }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: w * 0.135, overflow: "hidden", background: screenBg ?? (dark ? "#000" : "#F2F2F7") }}>
        <div style={{ position: "absolute", inset: 0, paddingTop: w * 0.12 }}>{children}</div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: w * 0.12, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${w * 0.08}px`, color: fg, fontFamily: "Inter, Helvetica, sans-serif", fontWeight: 600, fontSize: w * 0.04 }}>
          <span>{time}</span>
          <span style={{ width: w * 0.3, height: w * 0.075, borderRadius: 999, background: "#000" }} />
          <span style={{ letterSpacing: 2 }}>▮▮▮</span>
        </div>
      </div>
    </div>
  );
};

const pointer = (fill: string, edge: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 36"><path d="M1.5 1.5 L1.5 29 L8.6 22.4 L13.4 33.2 L18.6 31 L13.9 20.4 L23.6 20.4 Z" fill="${fill}" stroke="${edge}" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  )}`;
const POINTER_LIGHT = pointer("#ffffff", "#111111");
const POINTER_DARK = pointer("#111111", "#ffffff");

/**
 * A mouse pointer with its tip at (x, y). Each frame in `clicks` presses it,
 * rings a ripple and plays the click sound. Move it by animating x and y.
 */
export const Cursor = ({ t, x, y, clicks = [], dark = false, ring = "#111", size = 46, sound = true }: { t: number; x: number; y: number; clicks?: number[]; dark?: boolean; ring?: string; size?: number; sound?: boolean }) => {
  const last = clicks.filter((c) => t >= c).pop();
  const press = last !== undefined ? Math.max(0, 1 - (t - last) / 6) : 0;
  const ripple = last !== undefined && t - last < 18 ? prog(t, last, last + 18) : -1;
  return (
    <>
      {sound ? clicks.map((c) => <Sfx key={c} name="click" at={c - 1} volume={0.9} />) : null}
      <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, pointerEvents: "none" }}>
        {ripple >= 0 ? <div style={{ position: "absolute", left: -6 - 30 * ripple, top: -6 - 30 * ripple, width: 12 + 60 * ripple, height: 12 + 60 * ripple, borderRadius: "50%", border: `3px solid ${ring}`, opacity: 1 - ripple }} /> : null}
        <Img src={dark ? POINTER_DARK : POINTER_LIGHT} style={{ position: "absolute", left: -2, top: -2, width: size, height: size * 1.38, transformOrigin: "0 0", transform: `scale(${1 - press * 0.12})` }} />
      </div>
    </>
  );
};

/** A notification banner that springs in at frame `at` (phone style). */
export const Notification = ({ t, at, app, title, body, w = 900, icon, dark = false }: { t: number; at: number; app: string; title: string; body: string; w?: number; icon?: ReactNode; dark?: boolean }) => {
  if (t < at - 2) return null;
  const p = pop(t, at, 5);
  return (
    <div style={{ width: w, borderRadius: 34, padding: "24px 28px", background: dark ? "rgba(40,40,44,0.94)" : "rgba(250,250,252,0.96)", boxShadow: "0 30px 60px -30px rgba(0,0,0,0.45)", display: "flex", gap: 20, alignItems: "center", transform: `translateY(${((1 - Math.min(1, p)) * -80).toFixed(1)}px) scale(${(0.92 + 0.08 * p).toFixed(3)})`, opacity: Math.min(1, p * 1.5), fontFamily: "Inter, Helvetica, sans-serif", color: dark ? "#FFF" : "#111" }}>
      <div style={{ width: 76, height: 76, borderRadius: 18, overflow: "hidden", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "#E5E5EA" }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 24, opacity: 0.6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{app}</div>
        <div style={{ fontSize: 32, fontWeight: 700, marginTop: 2 }}>{title}</div>
        <div style={{ fontSize: 30, opacity: 0.85, marginTop: 2 }}>{body}</div>
      </div>
    </div>
  );
};

/**
 * A real image fetched for this film (a logo, a product icon, a provider
 * mark) by the name it was saved under. It keeps its proportions inside
 * the box you give it. An unknown name draws nothing, so a scene never
 * shows a broken image; the check render warns. `tone="light"` draws a
 * one-colour dark logo in white (for dark backgrounds), `tone="dark"` a
 * light one in near-black; a colour logo is drawn as it is.
 */
export const Asset = ({ name, width, height, tone, style }: { name: string; width?: number; height?: number; tone?: "light" | "dark"; style?: CSSProperties }) => {
  const { assets } = useFilm();
  const src = (tone ? assets[`${name}@${tone}`] : undefined) ?? assets[name];
  if (!src) {
    console.warn(`[QA] asset "${name}" was never fetched (have: ${Object.keys(assets).filter((k) => !k.includes("@")).join(", ") || "none"})`);
    return null;
  }
  return <Img src={src} style={{ width, height, objectFit: "contain", flex: "none", ...style }} />;
};

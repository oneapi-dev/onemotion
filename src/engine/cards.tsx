import type { CSSProperties, ReactNode } from "react";
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Glow } from "./glow";
import { useLook, type Look } from "./looks";
import { REVEAL_MASK_PAD, REVEAL_TILT, clamp, easeInOut, easeOut, revealDrop } from "./motion";
import type { PlanScene, VideoInput } from "./plan";
import { countAt, fit, numberIn } from "./text";
import { chatTimes, checkTimes, kineticTimes, tokens } from "./timing";

/**
 * The cards a flythrough passes. Each is drawn flat at the size it fills on
 * arrival and placed in the room by the world. `at` is the local frame the
 * camera lands on it: content waits for the camera, so the approach shows
 * the card's frame and the payoff plays while the shot holds.
 */
export type CardProps = {
  scene: PlanScene;
  at: number;
  /** Frames the scene lasts after landing. */
  frames: number;
  index: number;
  count: number;
  brand: VideoInput["brand"];
  shots: VideoInput["shots"];
};

/** Size a card is drawn at, by layout. Headlines and the close have none. */
export function cardSize(look: Look, type: PlanScene["type"]): { w: number; h: number } {
  const u = look.u;
  const tall = look.layout === "tall";
  const square = look.layout === "square";
  const base = tall ? { w: 920, h: 1160 } : square ? { w: 920, h: 820 } : { w: 1260, h: 720 };
  switch (type) {
    case "chat":
    case "code":
      return { w: base.w * u, h: (tall ? 1100 : square ? 820 : 760) * u };
    case "stat":
      return { w: base.w * u * 0.8, h: (tall ? 820 : 640) * u };
    default:
      return { w: base.w * u, h: base.h * u };
  }
}

const SHELL_LESS = new Set<PlanScene["type"]>(["hook", "statement", "kinetic", "announce", "logo", "cta", "stat", "converge"]);
export const isShellLess = (t: PlanScene["type"]) => SHELL_LESS.has(t);

function useSince(at: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { f: frame - at, fps };
}

// --------------------------------------------------------------- primitives

/**
 * Headline type revealed word by word from behind a mask, the last word in
 * the accent gradient. Reads as cut, not faded.
 */
export const Reveal: React.FC<{
  text: string;
  size: number;
  at: number;
  align?: "left" | "center";
  maxWidth?: number;
  weight?: number;
  color?: string;
  accentLast?: boolean;
  per?: number;
  lineHeight?: number;
  family?: string;
}> = ({ text, size, at, align = "center", maxWidth, weight, color, accentLast = true, per = 3, lineHeight = 1.02, family }) => {
  const look = useLook();
  const { f, fps } = useSince(at);
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: size * 0.24,
        maxWidth,
        fontFamily: family ?? look.display,
        fontWeight: weight ?? look.weight,
        fontSize: size,
        lineHeight,
        letterSpacing: `${look.tracking}em`,
        color: color ?? look.text,
        textAlign: align,
      }}
    >
      {words.map((w, i) => {
        const p = spring({ frame: f - i * per, fps, config: { damping: 20, stiffness: 130, mass: 0.8 } });
        const last = accentLast && i === words.length - 1 && words.length > 1;
        const fill: CSSProperties = last ? { color: look.accentA } : {};
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * REVEAL_MASK_PAD, marginBottom: -size * REVEAL_MASK_PAD, verticalAlign: "top" }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${interpolate(p, [0, 1], [revealDrop(size, lineHeight), 0])}px) rotate(${interpolate(p, [0, 1], [REVEAL_TILT, 0])}deg)`,
                transformOrigin: "0 100%",
                ...fill,
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Body copy rising in after its delay. */
const Line: React.FC<{ children: ReactNode; at: number; size: number; align?: "left" | "center"; maxWidth?: number; color?: string; weight?: number }> = ({
  children,
  at,
  size,
  align = "center",
  maxWidth,
  color,
  weight = 500,
}) => {
  const look = useLook();
  const { f, fps } = useSince(at);
  const p = spring({ frame: f, fps, config: { damping: 22, stiffness: 110 } });
  return (
    <div
      style={{
        fontFamily: look.body,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.4,
        color: color ?? look.textSoft,
        textAlign: align,
        maxWidth,
        opacity: Math.min(1, p * 1.4),
        transform: `translateY(${interpolate(p, [0, 1], [24 * look.u, 0])}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** The brand mark: the site's logo, or a monogram in the accent. */
const Mark: React.FC<{ brand: VideoInput["brand"]; size: number }> = ({ brand, size }) => {
  const look = useLook();
  if (brand.logo_src) return <Img src={brand.logo_src} style={{ width: size, height: size, objectFit: "contain" }} />;
  const letter = [...(brand.name || "•").trim()][0]?.toUpperCase() ?? "•";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundImage: `linear-gradient(135deg, ${look.accentA}, ${look.accentB})`,
        color: look.onAccent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: look.display,
        fontWeight: 800,
        fontSize: size * 0.52,
      }}
    >
      {letter}
    </div>
  );
};

const TYPE_LABEL: Partial<Record<PlanScene["type"], string>> = {
  features: "Features",
  steps: "How it works",
  checklist: "Checklist",
  specs: "Specs",
  bars: "Compare",
  compare: "Side by side",
  chat: "Live",
  code: "Code",
  quote: "Said",
  offer: "Offer",
  screenshot: "Product",
  device: "Mobile",
};

/** The card body in the look's construction, with an index in the corner. */
export const Shell: React.FC<{ scene: PlanScene; index: number; count: number; w: number; h?: number; children: ReactNode; pad?: number; dark?: boolean }> = ({
  scene,
  index,
  count,
  w,
  h,
  children,
  pad,
  dark,
}) => {
  const look = useLook();
  const u = look.u;
  const p = pad ?? 50 * u;
  const base: CSSProperties = { width: w, height: h, boxSizing: "border-box", position: "relative", overflow: "hidden", padding: p, display: "flex", flexDirection: "column" };
  let skin: CSSProperties;
  switch (look.card) {
    case "glass":
      skin = {
        borderRadius: 36 * u,
        background: `linear-gradient(160deg, rgba(255,255,255,${look.mode === "dark" ? 0.11 : 0.75}), rgba(255,255,255,${look.mode === "dark" ? 0.03 : 0.45}) 45%), ${look.cardBg}`,
        border: `${1.5 * u}px solid ${look.cardEdge}`,
        boxShadow: look.mode === "dark" ? `0 ${60 * u}px ${140 * u}px rgba(0,0,0,0.55)` : `0 ${40 * u}px ${100 * u}px rgba(60,30,120,0.18)`,
      };
      break;
    case "ink":
      skin = { borderRadius: 12 * u, background: look.cardBg, border: `${3.5 * u}px solid ${look.cardEdge}`, boxShadow: `${16 * u}px ${16 * u}px 0 ${look.cardEdge}` };
      break;
    case "outline":
      skin = {
        borderRadius: 8 * u,
        background: `${look.cardBg}`,
        backgroundImage: `linear-gradient(rgba(${look.accentRgb},0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(${look.accentRgb},0.05) 1px, transparent 1px)`,
        backgroundSize: `${40 * u}px ${40 * u}px`,
        border: `${2.5 * u}px solid ${look.cardEdge}`,
      };
      break;
    default:
      skin = {
        borderRadius: 30 * u,
        background: look.cardBg,
        border: `${1.5 * u}px solid ${look.cardEdge}`,
        boxShadow: look.mode === "dark" ? `0 ${60 * u}px ${140 * u}px rgba(0,0,0,0.65)` : `0 ${36 * u}px ${90 * u}px rgba(20,20,30,0.16), 0 ${2 * u}px ${6 * u}px rgba(0,0,0,0.05)`,
      };
  }
  if (dark) skin = { ...skin, background: "#0f1116", border: `${1.5 * u}px solid rgba(255,255,255,0.1)` };
  const label = scene.eyebrow && scene.type !== "code" ? scene.eyebrow : TYPE_LABEL[scene.type] ?? "";
  const soft = dark ? "#8b93a1" : look.textSoft;
  return (
    <div style={{ ...base, ...skin }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 * u, flex: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 * u }}>
          <div style={{ width: 12 * u, height: 12 * u, borderRadius: look.card === "ink" || look.card === "outline" ? 0 : 3 * u, background: look.accentA }} />
          <div style={{ fontFamily: look.mono, fontSize: 21 * u, letterSpacing: "0.18em", textTransform: "uppercase", color: soft }}>{label}</div>
        </div>
        <div style={{ fontFamily: look.mono, fontSize: 21 * u, letterSpacing: "0.12em", color: soft }}>
          {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </div>
      </div>
      <div style={{ flex: h ? 1 : "none", minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      {look.card === "glass" || look.card === "solid" ? <Glare /> : null}
    </div>
  );
};

/** A soft band of light crossing the card every few seconds. */
const Glare: React.FC = () => {
  const look = useLook();
  const frame = useCurrentFrame();
  const cycle = 110;
  const x = interpolate(frame % cycle, [30, 80], [-60, 160], { ...clamp, easing: easeInOut });
  const a = look.mode === "dark" ? 0.07 : 0.35;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: `linear-gradient(115deg, transparent ${x - 22}%, rgba(255,255,255,${a}) ${x}%, transparent ${x + 22}%)`,
      }}
    />
  );
};

/** A card's own heading, sized to the card. */
const Heading: React.FC<{ text?: string; at: number; w: number; max?: number; color?: string }> = ({ text, at, w, max = 74, color }) => {
  const look = useLook();
  if (!text) return null;
  return (
    <div style={{ marginBottom: 34 * look.u, flex: "none" }}>
      <Reveal text={text} size={fit(text, w, max * look.u, 2, look.displaySerif ? 0.5 : 0.56)} at={at} align="left" maxWidth={w} per={2} color={color} />
    </div>
  );
};

// -------------------------------------------------------------------- cards

export const HeadlineCard: React.FC<CardProps> = ({ scene, at, brand }) => {
  const look = useLook();
  const { f } = useSince(at);
  const w = look.width * (look.layout === "wide" ? 0.7 : 0.8);
  const title = scene.title ?? "";
  const size = fit(title, w, (look.layout === "wide" ? 160 : 140) * look.u, look.layout === "wide" ? 2 : 3, look.displaySerif ? 0.48 : 0.55);
  const words = title.split(/\s+/).length;
  const sub = at + words * 3 + 10;
  const rule = interpolate(f, [words * 3 + 4, words * 3 + 24], [0, 1], { ...clamp, easing: easeOut });
  return (
    <div style={{ width: w, display: "flex", flexDirection: "column", alignItems: "center", gap: 30 * look.u }}>
      {scene.type === "hook" && brand.name ? (
        <div style={{ display: "flex", alignItems: "center", gap: 14 * look.u, opacity: interpolate(f, [0, 10], [0, 1], clamp) }}>
          {brand.logo_src ? <Mark brand={brand} size={44 * look.u} /> : <div style={{ width: 12 * look.u, height: 12 * look.u, borderRadius: "50%", background: look.accentA }} />}
          <span style={{ fontFamily: look.mono, fontSize: 22 * look.u, letterSpacing: "0.2em", textTransform: "uppercase", color: look.textSoft }}>{brand.name}</span>
        </div>
      ) : null}
      <Reveal text={title} size={size} at={at} maxWidth={w} />
      <div style={{ width: 200 * look.u * rule, height: 6 * look.u, borderRadius: 6 * look.u, backgroundImage: `linear-gradient(90deg, ${look.accentA}, ${look.accentB})` }} />
      {scene.body ? (
        <Line at={sub} size={42 * look.u} maxWidth={w * 0.8}>
          {scene.body}
        </Line>
      ) : null}
    </div>
  );
};

export const KineticCard: React.FC<CardProps> = ({ scene, at, frames }) => {
  const look = useLook();
  const { f, fps } = useSince(at);
  const items = scene.items ?? [];
  const starts = kineticTimes(items.length, Math.max(30, frames - 6));
  let idx = 0;
  starts.forEach((s, i) => {
    if (f >= s) idx = i;
  });
  const word = items[idx]?.title ?? "";
  const local = f - starts[idx];
  const p = spring({ frame: local, fps, config: { damping: 15, stiffness: 180, mass: 0.7 } });
  const w = look.width * 0.84;
  const size = fit(word, w * 0.86, (look.layout === "wide" ? 280 : 220) * look.u, word.includes(" ") ? 2 : 1, 0.6);
  const flip = idx % 2 === 1;
  return (
    <div style={{ width: w, height: look.height * (look.layout === "tall" ? 0.5 : 0.68), display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
      {flip ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 44 * look.u,
            backgroundImage: `linear-gradient(120deg, ${look.accentA}, ${look.accentB})`,
            transform: `scale(${interpolate(p, [0, 1], [0.7, 1])})`,
            opacity: Math.min(1, p * 2),
          }}
        />
      ) : null}
      <div
        style={{
          position: "relative",
          fontFamily: look.display,
          fontWeight: 800,
          fontSize: size,
          lineHeight: 0.96,
          letterSpacing: `${look.tracking}em`,
          textAlign: "center",
          color: flip ? look.onAccent : look.text,
          opacity: Math.min(1, p * 1.6),
          filter: `blur(${interpolate(p, [0, 1], [12, 0])}px)`,
          transform: `scale(${interpolate(p, [0, 1], [1.35, 1]) * interpolate(local, [0, 40], [1, 1.05], clamp)})`,
        }}
      >
        {word}
      </div>
    </div>
  );
};

export const AnnounceCard: React.FC<CardProps> = ({ scene, at, brand }) => {
  const look = useLook();
  const u = look.u;
  const { f, fps } = useSince(at);
  const w = look.width * (look.layout === "wide" ? 0.72 : 0.8);
  const title = scene.title ?? "";
  const size = fit(title, w, (look.layout === "wide" ? 200 : 160) * u, look.layout === "wide" ? 1 : 2, look.displaySerif ? 0.5 : 0.57);
  const badge = spring({ frame: f, fps, config: { damping: 12, stiffness: 160, mass: 0.7 } });
  const nameAt = at + 8;
  const words = title.split(/\s+/).length;
  const after = 8 + words * 3 + 10;
  const chips = scene.items ?? [];
  return (
    <div style={{ width: w, display: "flex", flexDirection: "column", alignItems: "center", gap: 34 * u, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "45%",
          width: w * 1.1,
          height: w * 0.8,
          marginLeft: -w * 0.55,
          marginTop: -w * 0.4,
          transform: `scale(${interpolate(f, [0, 40], [0.4, 1], { ...clamp, easing: easeOut })})`,
          opacity: interpolate(f, [0, 12], [0, 1], clamp),
        }}
      >
        <Glow left={0} top={0} width={w * 1.1} height={w * 0.8} color={`rgba(${look.accentRgb},${look.mode === "dark" ? 0.22 : 0.14})`} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 * u, opacity: Math.min(1, badge * 1.5), transform: `scale(${interpolate(badge, [0, 1], [0.5, 1])})` }}>
        {brand.logo_src ? <Mark brand={brand} size={64 * u} /> : null}
        {scene.eyebrow ? (
          <div
            style={{
              padding: `${14 * u}px ${30 * u}px`,
              borderRadius: look.card === "ink" || look.card === "outline" ? 6 * u : 999,
              backgroundImage: `linear-gradient(110deg, ${look.accentA}, ${look.accentB})`,
              color: look.onAccent,
              fontFamily: look.mono,
              fontWeight: 600,
              fontSize: 26 * u,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              boxShadow: `0 0 ${50 * u}px rgba(${look.accentRgb},0.45)`,
            }}
          >
            {scene.eyebrow}
          </div>
        ) : null}
      </div>
      <Reveal text={title} size={size} at={nameAt} maxWidth={w} accentLast={false} lineHeight={0.98} />
      {scene.body ? (
        <Line at={at + after - 6} size={44 * u} maxWidth={w * 0.82}>
          {scene.body}
        </Line>
      ) : null}
      {chips.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 * u }}>
          {chips.map((c, i) => {
            const p = spring({ frame: f - after - i * 4, fps, config: { damping: 16, stiffness: 150 } });
            return (
              <div
                key={i}
                style={{
                  padding: `${14 * u}px ${28 * u}px`,
                  borderRadius: look.card === "ink" || look.card === "outline" ? 6 * u : 999,
                  border: `${look.card === "ink" ? 3 : 1.5}px solid ${look.card === "ink" ? look.cardEdge : `rgba(${look.textRgb},0.18)`}`,
                  background: look.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)",
                  fontFamily: look.body,
                  fontWeight: 600,
                  fontSize: 30 * u,
                  color: look.text,
                  whiteSpace: "nowrap",
                  opacity: Math.min(1, p * 1.5),
                  transform: `translateY(${interpolate(p, [0, 1], [30 * u, 0])}px) scale(${interpolate(p, [0, 1], [0.85, 1])})`,
                }}
              >
                {c.title}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export const SpecsCard: React.FC<CardProps> = ({ scene, at, frames, index, count }) => {
  const look = useLook();
  const u = look.u;
  const { w, h } = cardSize(look, "specs");
  const { f, fps } = useSince(at);
  const items = scene.items ?? [];
  const cols = look.layout === "wide" ? (items.length === 4 ? 2 : Math.min(3, items.length)) : items.length <= 2 ? items.length : 2;
  const inner = w - 110 * u;
  const gap = 20 * u;
  const cellW = (inner - gap * (cols - 1)) / cols;
  const value = Math.min(...items.map((it) => fit(it.body ?? "", cellW - 56 * u, (cols <= 2 ? 110 : 88) * u, 1, 0.6)));
  void h;
  return (
    <Shell scene={scene} index={index} count={count} w={w}>
      <Heading text={scene.title} at={at} w={inner} />
      <div style={{ display: "flex", flexWrap: "wrap", gap, alignContent: "flex-start" }}>
        {items.map((it, i) => {
          const p = spring({ frame: f - 6 - i * 5, fps, config: { damping: 18, stiffness: 130 } });
          return (
            <div
              key={i}
              style={{
                width: cellW,
                boxSizing: "border-box",
                padding: `${26 * u}px ${26 * u}px`,
                borderRadius: (look.card === "ink" || look.card === "outline" ? 4 : 20) * u,
                background: look.mode === "dark" ? "rgba(255,255,255,0.05)" : `rgba(${look.textRgb},0.035)`,
                border: look.card === "ink" ? `${2.5 * u}px solid ${look.cardEdge}` : `${1.5 * u}px solid rgba(${look.textRgb},0.08)`,
                opacity: Math.min(1, p * 1.5),
                transform: `translateY(${interpolate(p, [0, 1], [40 * u, 0])}px)`,
              }}
            >
              <div style={{ fontFamily: look.mono, fontSize: 21 * u, letterSpacing: "0.14em", textTransform: "uppercase", color: look.textSoft, whiteSpace: "nowrap", overflow: "hidden" }}>{it.title}</div>
              <div
                style={{
                  marginTop: 12 * u,
                  fontFamily: look.display,
                  fontWeight: look.weight,
                  fontSize: value,
                  lineHeight: 1.05,
                  letterSpacing: `${look.tracking}em`,
                  color: i === 0 ? undefined : look.text,
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                  ...(i === 0 ? { color: look.accentA } : {}),
                }}
              >
                {countAt(it.body ?? "", f, 8 + i * 5, Math.min(frames - 10, 46))}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};

export const BarsCard: React.FC<CardProps> = ({ scene, at, frames, index, count }) => {
  const look = useLook();
  const u = look.u;
  const { w, h } = cardSize(look, "bars");
  const { f, fps } = useSince(at);
  const items = scene.items ?? [];
  const values = items.map((it) => numberIn(it.body ?? ""));
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  const inner = w - 110 * u;
  const wide = look.layout !== "tall";
  const labelW = wide ? inner * 0.3 : inner;
  const track = wide ? inner - labelW - 24 * u : inner;
  const barH = (items.length <= 2 ? 104 : items.length === 3 ? 82 : 58) * u;
  const valueSize = (items.length <= 3 ? 52 : 40) * u;
  const end = Math.min(frames - 10, 48);
  void h;
  return (
    <Shell scene={scene} index={index} count={count} w={w}>
      <Heading text={scene.title} at={at} w={inner} />
      <div style={{ display: "flex", flexDirection: "column", gap: (wide ? 24 : 30) * u, margin: `${10 * u}px 0 ${26 * u}px` }}>
        {items.map((it, i) => {
          const grow = spring({ frame: f - 10 - i * 6, fps, config: { damping: 24, stiffness: 80 } });
          const hot = Boolean(it.highlight);
          const share = max > 0 && values[i] !== null ? Math.max(0.08, (values[i] as number) / max) : 0.8;
          const bw = track * share * grow;
          const inside = bw > track - 240 * u;
          return (
            <div key={i} style={{ display: "flex", flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "flex-start", gap: (wide ? 24 : 10) * u }}>
              <div style={{ width: labelW, textAlign: wide ? "right" : "left", fontFamily: look.body, fontWeight: hot ? 700 : 500, fontSize: fit(it.title, labelW, (items.length <= 3 ? 42 : 34) * u, 1, 0.55), color: hot ? look.text : look.textSoft, whiteSpace: "nowrap" }}>
                {it.title}
              </div>
              <div style={{ position: "relative", width: track, height: barH, display: "flex", alignItems: "center" }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: barH / 3.2, background: `rgba(${look.textRgb},0.06)` }} />
                <div
                  style={{
                    position: "relative",
                    width: bw,
                    height: barH,
                    borderRadius: barH / 3.2,
                    background: hot ? `linear-gradient(90deg, ${look.accentA}, ${look.accentB})` : `rgba(${look.textRgb},0.22)`,
                    boxShadow: hot ? `0 0 ${50 * u}px rgba(${look.accentRgb},0.4)` : undefined,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    ...(inside ? { right: track - bw + 20 * u } : { left: bw + 18 * u }),
                    fontFamily: look.display,
                    fontWeight: 800,
                    fontSize: valueSize,
                    color: inside ? (hot ? look.onAccent : look.text) : hot ? look.accentA : look.text,
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                    opacity: Math.min(1, grow * 1.6),
                  }}
                >
                  {countAt(it.body ?? "", f, 10 + i * 6, end)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {scene.body ? (
        <Line at={at + end - 8} size={24 * u} align="left" maxWidth={inner}>
          {scene.body}
        </Line>
      ) : null}
    </Shell>
  );
};

export const CompareCard: React.FC<CardProps> = ({ scene, at, index, count, brand }) => {
  const look = useLook();
  const u = look.u;
  const { w, h } = cardSize(look, "compare");
  const { f, fps } = useSince(at);
  const items = scene.items ?? [];
  const inner = w - 110 * u;
  const gap = 20 * u;
  const colW = (inner - gap) / 2;
  const cell = Math.min(...items.flatMap((it) => [fit(it.title, colW - 50 * u, 38 * u, 2, 0.53), fit(it.body ?? "", colW - 90 * u, 38 * u, 2, 0.53)]));
  return (
    <Shell scene={scene} index={index} count={count} w={w} h={h}>
      <Heading text={scene.title} at={at} w={inner} max={64} />
      <div style={{ display: "flex", gap, marginBottom: 14 * u }}>
        <div style={{ width: colW, fontFamily: look.mono, fontSize: 22 * u, letterSpacing: "0.14em", textTransform: "uppercase", color: look.textSoft, paddingLeft: 22 * u }}>{scene.left}</div>
        <div style={{ width: colW, display: "flex", gap: 12 * u, alignItems: "center", paddingLeft: 22 * u }}>
          {brand.logo_src ? <Mark brand={brand} size={32 * u} /> : null}
          <span style={{ fontFamily: look.mono, fontSize: 22 * u, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: look.accentA }}>{scene.right}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 * u, flex: 1 }}>
        {items.map((it, i) => {
          const start = 10 + i * 12;
          const row = spring({ frame: f - start, fps, config: { damping: 20, stiffness: 120 } });
          const strike = interpolate(f, [start + 10, start + 22], [0, 1], { ...clamp, easing: easeInOut });
          const win = spring({ frame: f - start - 14, fps, config: { damping: 14, stiffness: 140 } });
          const box: CSSProperties = { width: colW, boxSizing: "border-box", padding: `${18 * u}px ${22 * u}px`, borderRadius: (look.card === "ink" || look.card === "outline" ? 4 : 16) * u, display: "flex", alignItems: "center", minHeight: 88 * u };
          return (
            <div key={i} style={{ display: "flex", gap, opacity: Math.min(1, row * 1.4), transform: `translateX(${interpolate(row, [0, 1], [-40 * u, 0])}px)` }}>
              <div style={{ ...box, background: `rgba(${look.textRgb},0.04)` }}>
                <div>
                  <span
                    style={{
                      fontFamily: look.body,
                      fontWeight: 500,
                      fontSize: cell,
                      lineHeight: 1.25,
                      color: look.textSoft,
                      // The strike fades in: a line drawn on with a moving
                      // background is not something the browser exporter draws.
                      textDecorationLine: "line-through",
                      textDecorationColor: `rgba(${look.textRgb},${0.75 * strike})`,
                      textDecorationThickness: 3 * u,
                    }}
                  >
                    {it.title}
                  </span>
                </div>
              </div>
              <div
                style={{
                  ...box,
                  gap: 16 * u,
                  background: `rgba(${look.accentRgb},${look.mode === "dark" ? 0.12 : 0.08})`,
                  border: `${1.5 * u}px solid rgba(${look.accentRgb},${0.55 * Math.min(1, win)})`,
                  transform: `scale(${interpolate(win, [0, 1], [0.95, 1])})`,
                }}
              >
                <div style={{ width: 36 * u, height: 36 * u, flex: "none", borderRadius: "50%", backgroundImage: `linear-gradient(135deg, ${look.accentA}, ${look.accentB})`, display: "flex", alignItems: "center", justifyContent: "center", opacity: Math.min(1, win) }}>
                  <svg width={22 * u} height={22 * u} viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={look.onAccent} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ fontFamily: look.body, fontWeight: 700, fontSize: cell, lineHeight: 1.25, color: look.text, opacity: Math.min(1, win * 1.3) }}>{it.body}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};

export const CodeCard: React.FC<CardProps> = ({ scene, at, frames, index, count }) => {
  const look = useLook();
  const u = look.u;
  const { w, h } = cardSize(look, "code");
  const { f } = useSince(at);
  const code = scene.body ?? "";
  const lines = code.split("\n");
  const longest = Math.max(14, ...lines.map((l) => l.length));
  const inner = w - 110 * u;
  const gutter = 56 * u;
  const size = Math.min(34 * u, (inner - gutter - 20 * u) / (longest * 0.61));
  const typed = Math.round(interpolate(f, [10, Math.max(30, Math.round(frames * 0.6))], [0, code.length], clamp));
  const offsets = lines.map((_, i) => lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0));
  const ink = { plain: "#e8eaf0", comment: "#6f7887", string: look.accentA, number: "#79c0ff", keyword: "#ff7ab2" };
  const blink = Math.floor(f / 14) % 2 === 0;
  return (
    <Shell scene={{ ...scene, eyebrow: scene.eyebrow || "code" }} index={index} count={count} w={w} h={h} dark>
      {scene.title ? <Heading text={scene.title} at={at} w={inner} max={56} color="#f2f3f7" /> : null}
      <div style={{ display: "flex", alignItems: "center", gap: 10 * u, marginBottom: 18 * u }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 13 * u, height: 13 * u, borderRadius: "50%", background: c }} />
        ))}
        <span style={{ marginLeft: 10 * u, fontFamily: look.mono, fontSize: 20 * u, color: "#8b93a1" }}>{scene.eyebrow}</span>
      </div>
      <div style={{ fontFamily: look.mono, fontSize: size, lineHeight: 1.6, whiteSpace: "pre" }}>
        {lines.map((line, i) => {
          const left = typed - offsets[i];
          const visible = Math.max(0, Math.min(line.length, left));
          const active = left >= 0 && left <= line.length;
          const parts = tokens(line);
          const partStarts = parts.map((_, k) => parts.slice(0, k).reduce((n, t) => n + t.text.length, 0));
          return (
            <div key={i} style={{ display: "flex", minHeight: size * 1.6, opacity: left >= 0 ? 1 : 0.35 }}>
              <span style={{ width: gutter, flex: "none", color: "#4b5361" }}>{i + 1}</span>
              <span>
                {parts.map((tk, k) => {
                  const part = tk.text.slice(0, Math.max(0, visible - partStarts[k]));
                  return part ? (
                    <span key={k} style={{ color: ink[tk.kind] }}>
                      {part}
                    </span>
                  ) : null;
                })}
                {active && (blink || typed < code.length) ? (
                  <span style={{ display: "inline-block", width: size * 0.55, height: size * 1.15, background: look.accentA, verticalAlign: "text-bottom" }} />
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};

export const ChatCard: React.FC<CardProps> = ({ scene, at, frames, index, count, brand }) => {
  const look = useLook();
  const u = look.u;
  const { w, h } = cardSize(look, "chat");
  const { f, fps } = useSince(at);
  const items = scene.items ?? [];
  const times = chatTimes(items, frames);
  const inner = w - 110 * u;
  const text = 34 * u;
  return (
    <Shell scene={scene} index={index} count={count} w={w} h={h}>
      <Heading text={scene.title} at={at} w={inner} max={60} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 20 * u, flex: 1 }}>
        {items.map((it, i) => {
          const t = times[i];
          if (f < t.at) return null;
          const ai = it.title === "ai";
          const p = spring({ frame: f - t.at, fps, config: { damping: 16, stiffness: 160 } });
          const body = it.body ?? "";
          const typing = ai && f < t.typeFrom;
          const shown = ai ? Math.round(interpolate(f, [t.typeFrom, t.typeTo], [0, body.length], clamp)) : body.length;
          return (
            <div key={i} style={{ display: "flex", gap: 14 * u, alignItems: "flex-end", justifyContent: ai ? "flex-start" : "flex-end", opacity: Math.min(1, p * 1.5), transform: `translateY(${interpolate(p, [0, 1], [24 * u, 0])}px) scale(${interpolate(p, [0, 1], [0.94, 1])})`, transformOrigin: ai ? "left bottom" : "right bottom" }}>
              {ai ? <Mark brand={{ ...brand, name: brand.name || "AI" }} size={52 * u} /> : null}
              <div
                style={{
                  maxWidth: inner * 0.8,
                  padding: `${18 * u}px ${24 * u}px`,
                  borderRadius: 26 * u,
                  borderBottomLeftRadius: ai ? 8 * u : 26 * u,
                  borderBottomRightRadius: ai ? 26 * u : 8 * u,
                  background: ai ? `rgba(${look.textRgb},0.07)` : `linear-gradient(120deg, ${look.accentA}, ${look.accentB})`,
                  color: ai ? look.text : look.onAccent,
                  fontFamily: look.body,
                  fontWeight: 500,
                  fontSize: text,
                  lineHeight: 1.4,
                }}
              >
                {typing ? (
                  <span style={{ display: "inline-flex", gap: text * 0.22, height: text * 1.4, alignItems: "center" }}>
                    {[0, 1, 2].map((d) => (
                      <span key={d} style={{ width: text * 0.26, height: text * 0.26, borderRadius: "50%", background: look.textSoft, opacity: 0.35 + 0.65 * Math.max(0, Math.sin((f - d * 4) / 4)) }} />
                    ))}
                  </span>
                ) : (
                  body.slice(0, shown)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};

export const ChecklistCard: React.FC<CardProps> = ({ scene, at, frames, index, count }) => {
  const look = useLook();
  const u = look.u;
  const { w, h } = cardSize(look, "checklist");
  const { f, fps } = useSince(at);
  const items = scene.items ?? [];
  const ticks = checkTimes(items.length, frames);
  const inner = w - 110 * u;
  const box = 66 * u;
  const size = Math.min(...items.map((it) => fit(it.title, inner - box - 30 * u, (items.length <= 3 ? 60 : 50) * u, 2, 0.52)));
  return (
    <Shell scene={scene} index={index} count={count} w={w} h={h}>
      <Heading text={scene.title} at={at} w={inner} />
      <div style={{ display: "flex", flexDirection: "column", gap: 30 * u, flex: 1, justifyContent: "center" }}>
        {items.map((it, i) => {
          const row = spring({ frame: f - (ticks[i] - 8), fps, config: { damping: 20, stiffness: 120 } });
          const tick = interpolate(f, [ticks[i], ticks[i] + 9], [0, 1], { ...clamp, easing: easeInOut });
          const pop = spring({ frame: f - ticks[i], fps, config: { damping: 10, stiffness: 200, mass: 0.6 } });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 26 * u, opacity: Math.min(1, row * 1.5), transform: `translateX(${interpolate(row, [0, 1], [-40 * u, 0])}px)` }}>
              <div
                style={{
                  width: box,
                  height: box,
                  flex: "none",
                  borderRadius: (look.card === "ink" || look.card === "outline" ? 4 : 16) * u,
                  border: `${2.5 * u}px solid ${tick > 0 ? look.accentA : `rgba(${look.textRgb},0.2)`}`,
                  backgroundImage: tick > 0 ? `linear-gradient(135deg, ${look.accentA}, ${look.accentB})` : undefined,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: `scale(${1 + 0.15 * Math.sin(Math.min(1, pop) * Math.PI)})`,
                }}
              >
                <svg width={box * 0.6} height={box * 0.6} viewBox="0 0 24 24">
                  <path d="M4 12.5l5 5L20 6.5" fill="none" stroke={look.onAccent} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tick} />
                </svg>
              </div>
              <div style={{ fontFamily: look.display, fontWeight: Math.min(700, look.weight), fontSize: size, lineHeight: 1.15, color: look.text, letterSpacing: `${look.tracking / 2}em` }}>{it.title}</div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};

export const ListCard: React.FC<CardProps> = ({ scene, at, index, count }) => {
  // features and steps: numbered tiles that drop in one after another.
  const look = useLook();
  const u = look.u;
  const { w, h } = cardSize(look, scene.type);
  const { f, fps } = useSince(at);
  const items = scene.items ?? [];
  const inner = w - 110 * u;
  const row = look.layout === "wide" && items.length <= 4;
  const gap = 18 * u;
  const tileW = row ? (inner - gap * (items.length - 1)) / items.length : inner;
  const steps = scene.type === "steps";
  return (
    <Shell scene={scene} index={index} count={count} w={w} h={h}>
      <Heading text={scene.title} at={at} w={inner} max={64} />
      <div style={{ display: "flex", flexDirection: row ? "row" : "column", gap, flex: 1 }}>
        {items.map((it, i) => {
          const p = spring({ frame: f - 8 - i * 6, fps, config: { damping: 18, stiffness: 130 } });
          return (
            <div
              key={i}
              style={{
                width: tileW,
                flex: row ? "none" : 1,
                boxSizing: "border-box",
                padding: `${26 * u}px ${26 * u}px`,
                borderRadius: (look.card === "ink" || look.card === "outline" ? 4 : 20) * u,
                background: look.mode === "dark" ? "rgba(255,255,255,0.05)" : `rgba(${look.textRgb},0.035)`,
                border: look.card === "ink" ? `${2.5 * u}px solid ${look.cardEdge}` : `${1.5 * u}px solid rgba(${look.textRgb},0.08)`,
                display: "flex",
                flexDirection: row ? "column" : "row",
                gap: 18 * u,
                alignItems: row ? "flex-start" : "center",
                opacity: Math.min(1, p * 1.5),
                transform: `translateY(${interpolate(p, [0, 1], [50 * u, 0])}px) rotate(${interpolate(p, [0, 1], [steps ? 0 : 2, 0])}deg)`,
              }}
            >
              <div
                style={{
                  width: 58 * u,
                  height: 58 * u,
                  flex: "none",
                  borderRadius: steps ? "50%" : 14 * u,
                  background: i === 0 ? `linear-gradient(135deg, ${look.accentA}, ${look.accentB})` : `rgba(${look.accentRgb},0.14)`,
                  color: i === 0 ? look.onAccent : look.accentA,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: look.mono,
                  fontWeight: 700,
                  fontSize: 24 * u,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <div style={{ fontFamily: look.display, fontWeight: Math.min(800, look.weight), fontSize: fit(it.title, tileW - 60 * u, 40 * u, 2, 0.55), lineHeight: 1.12, color: look.text, letterSpacing: `${look.tracking / 2}em` }}>{it.title}</div>
                {it.body ? <div style={{ marginTop: 8 * u, fontFamily: look.body, fontWeight: 500, fontSize: 25 * u, lineHeight: 1.4, color: look.textSoft }}>{it.body}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
};

export const StatCard: React.FC<CardProps> = ({ scene, at, frames }) => {
  const look = useLook();
  const u = look.u;
  const { f } = useSince(at);
  const ring = 560 * u;
  const prog = interpolate(f, [4, Math.min(frames - 10, 50)], [0, 1], { ...clamp, easing: easeOut });
  const value = countAt(scene.value ?? "", f, 4, Math.min(frames - 10, 50));
  const size = fit(scene.value ?? "", ring * 0.8, 210 * u, 1, 0.6);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 * u }}>
      <div style={{ position: "relative", width: ring, height: ring, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={ring} height={ring} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <defs>
            <linearGradient id="statg" x1="0" x2="1">
              <stop offset="0" stopColor={look.accentA} />
              <stop offset="1" stopColor={look.accentB} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill="none" stroke={`rgba(${look.textRgb},0.08)`} strokeWidth="2" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="url(#statg)" strokeWidth="2.6" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog} />
        </svg>
        <div style={{ fontFamily: look.display, fontWeight: 800, fontSize: size, letterSpacing: `${look.tracking}em`, color: look.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      </div>
      <Reveal text={scene.title ?? ""} size={fit(scene.title ?? "", look.width * 0.7, 70 * u, 2, 0.55)} at={at + 12} maxWidth={look.width * 0.7} />
      {scene.body ? (
        <Line at={at + 24} size={36 * u} maxWidth={look.width * 0.6}>
          {scene.body}
        </Line>
      ) : null}
    </div>
  );
};

export const QuoteCard: React.FC<CardProps> = ({ scene, at, index, count }) => {
  const look = useLook();
  const u = look.u;
  const { w, h } = cardSize(look, "quote");
  const inner = w - 110 * u;
  const body = scene.body ?? "";
  return (
    <Shell scene={scene} index={index} count={count} w={w} h={h}>
      <div style={{ fontFamily: look.display, fontWeight: 800, fontSize: 180 * u, lineHeight: 0.6, color: look.accentA, height: 90 * u }}>“</div>
      <Reveal text={body} size={fit(body, inner, 62 * u, 4, 0.5)} at={at + 4} align="left" maxWidth={inner} per={1} accentLast={false} weight={600} lineHeight={1.18} />
      {scene.title ? (
        <div style={{ marginTop: "auto" }}>
          <Line at={at + 26} size={26 * u} align="left">
            {scene.title}
          </Line>
        </div>
      ) : null}
    </Shell>
  );
};

export const OfferCard: React.FC<CardProps> = ({ scene, at, frames, index, count }) => {
  const look = useLook();
  const u = look.u;
  const { w, h } = cardSize(look, "offer");
  const { f } = useSince(at);
  const inner = w - 110 * u;
  return (
    <Shell scene={scene} index={index} count={count} w={w} h={h}>
      <Heading text={scene.title} at={at} w={inner} />
      <div
        style={{
          fontFamily: look.display,
          fontWeight: 800,
          fontSize: fit(scene.value ?? "", inner, 230 * u, 1, 0.6),
          lineHeight: 1,
          letterSpacing: `${look.tracking}em`,
          color: look.accentA,
        }}
      >
        {countAt(scene.value ?? "", f, 8, Math.min(frames - 10, 50))}
      </div>
      {scene.body ? (
        <div style={{ marginTop: "auto", borderTop: `${2 * u}px dashed rgba(${look.textRgb},0.2)`, paddingTop: 22 * u }}>
          <Line at={at + 20} size={28 * u} align="left">
            {scene.body}
          </Line>
        </div>
      ) : null}
    </Shell>
  );
};

export const ShotCard: React.FC<CardProps> = ({ scene, at, frames, shots, brand }) => {
  const look = useLook();
  const u = look.u;
  const { f } = useSince(at);
  const shot = shots[scene.shot ?? 0];
  const device = scene.type === "device";
  const w = device ? (look.layout === "wide" ? 520 : 560) * u : cardSize(look, "screenshot").w;
  const viewH = device ? w * 2.05 : look.layout === "tall" ? w * 1.25 : w * 0.6;
  const scale = shot ? w / shot.width : 1;
  const contentH = shot ? shot.height * scale : viewH;
  const t = interpolate(f, [6, Math.max(7, frames - 4)], [0, 1], { ...clamp, easing: easeInOut });
  const transform =
    scene.motion === "scroll" || device ? `translateY(${-t * Math.max(0, contentH - viewH)}px)` : scene.motion === "pan" ? `scale(1.12) translateX(${interpolate(t, [0, 1], [3, -3])}%)` : `scale(${interpolate(t, [0, 1], [1, 1.12])})`;
  const frame = (
    <div
      style={{
        width: w,
        borderRadius: device ? 64 * u : 22 * u,
        padding: device ? 16 * u : 0,
        background: device ? "#0c0d10" : look.cardBg,
        border: `${1.5 * u}px solid ${device ? "#2a2c33" : look.cardEdge}`,
        boxShadow: `0 ${60 * u}px ${140 * u}px rgba(0,0,0,${look.mode === "dark" ? 0.6 : 0.22})`,
        overflow: "hidden",
      }}
    >
      {device ? null : (
        <div style={{ height: 52 * u, display: "flex", alignItems: "center", gap: 10 * u, padding: `0 ${20 * u}px`, borderBottom: `1px solid rgba(${look.textRgb},0.08)` }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 13 * u, height: 13 * u, borderRadius: "50%", background: c }} />
          ))}
          <div style={{ marginLeft: 14 * u, padding: `${6 * u}px ${16 * u}px`, borderRadius: 8 * u, background: `rgba(${look.textRgb},0.06)`, fontFamily: look.body, fontSize: 18 * u, color: look.textSoft }}>{brand.domain}</div>
        </div>
      )}
      <div style={{ position: "relative", width: device ? w - 32 * u : w, height: device ? viewH - 32 * u : viewH, overflow: "hidden", borderRadius: device ? 50 * u : 0, background: "#fff" }}>
        {shot?.src ? <Img src={shot.src} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: contentH, transform, transformOrigin: "50% 20%" }} /> : null}
      </div>
    </div>
  );
  const caption = scene.title ?? "";
  const capW = device && look.layout === "wide" ? look.width * 0.36 : cardSize(look, "screenshot").w;
  return (
    <div style={{ display: "flex", flexDirection: device && look.layout === "wide" ? "row" : "column", alignItems: "center", gap: 46 * u }}>
      {caption && !(device && look.layout === "wide") ? <Reveal text={caption} size={fit(caption, capW, 72 * u, 2, 0.55)} at={at} maxWidth={capW} /> : null}
      {frame}
      {device && look.layout === "wide" ? (
        <div style={{ width: capW, display: "flex", flexDirection: "column", gap: 22 * u }}>
          <Reveal text={caption} size={fit(caption, capW, 92 * u, 3, 0.55)} at={at} align="left" maxWidth={capW} />
          {scene.body ? (
            <Line at={at + 18} size={34 * u} align="left">
              {scene.body}
            </Line>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export const ConvergeCard: React.FC<CardProps> = ({ scene, at, brand }) => {
  const look = useLook();
  const u = look.u;
  const { f, fps } = useSince(at);
  const items = scene.items ?? [];
  const R = (look.layout === "wide" ? 300 : 280) * u;
  const hub = 170 * u;
  const hubIn = spring({ frame: f - 22, fps, config: { damping: 12, stiffness: 140 } });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 50 * u }}>
      <div style={{ position: "relative", width: R * 2 + 300 * u, height: R * 2 }}>
        {items.map((it, i) => {
          const a = (i / items.length) * Math.PI * 2 - Math.PI / 2;
          const p = spring({ frame: f - i * 4, fps, config: { damping: 18, stiffness: 90 } });
          const orbit = (f / 200) * (Math.PI / 6);
          const r = R * interpolate(p, [0, 1], [2.2, 1]);
          const x = Math.cos(a + orbit) * r * 1.25;
          const y = Math.sin(a + orbit) * r * 0.85;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${interpolate(p, [0, 1], [0.4, 1])})`,
                opacity: Math.min(1, p * 1.6),
                padding: `${16 * u}px ${28 * u}px`,
                borderRadius: look.card === "ink" || look.card === "outline" ? 6 * u : 999,
                background: look.mode === "dark" ? "rgba(255,255,255,0.07)" : "#ffffff",
                border: look.card === "ink" ? `${3 * u}px solid ${look.cardEdge}` : `${1.5 * u}px solid rgba(${look.textRgb},0.12)`,
                boxShadow: look.mode === "dark" ? "none" : `0 ${12 * u}px ${30 * u}px rgba(0,0,0,0.08)`,
                fontFamily: look.body,
                fontWeight: 600,
                fontSize: 32 * u,
                color: look.text,
                whiteSpace: "nowrap",
              }}
            >
              {it.title}
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) scale(${interpolate(hubIn, [0, 1], [0.3, 1])})`,
            opacity: Math.min(1, hubIn * 2),
            filter: `drop-shadow(0 0 ${50 * u}px rgba(${look.accentRgb},0.55))`,
          }}
        >
          {brand.logo_src || !brand.name ? (
            <Mark brand={brand} size={hub} />
          ) : (
            <div
              style={{
                padding: `${30 * u}px ${48 * u}px`,
                borderRadius: look.card === "ink" || look.card === "outline" ? 10 * u : 999,
                background: `linear-gradient(120deg, ${look.accentA}, ${look.accentB})`,
                color: look.onAccent,
                fontFamily: look.display,
                fontWeight: 800,
                fontSize: fit(brand.name, 420 * u, 64 * u, 1, 0.58),
                letterSpacing: `${look.tracking}em`,
                whiteSpace: "nowrap",
              }}
            >
              {brand.name}
            </div>
          )}
        </div>
      </div>
      {scene.title ? <Reveal text={scene.title} size={fit(scene.title, look.width * 0.7, 76 * u, 2, 0.55)} at={at + 28} maxWidth={look.width * 0.7} /> : null}
    </div>
  );
};

export const CloseCard: React.FC<CardProps> = ({ scene, at, brand }) => {
  const look = useLook();
  const u = look.u;
  const { f, fps } = useSince(at);
  const mark = spring({ frame: f, fps, config: { damping: 11, stiffness: 150, mass: 0.8 } });
  const btn = spring({ frame: f - 22, fps, config: { damping: 14, stiffness: 140 } });
  const name = brand.domain || brand.name;
  const burst = interpolate(f, [0, 34], [0, 1], { ...clamp, easing: easeOut });
  const breathe = 1 + Math.sin(f / 16) * 0.012;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 * u, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 90 * u,
          width: 900 * u,
          height: 900 * u,
          marginLeft: -450 * u,
          marginTop: -450 * u,
          borderRadius: "50%",
          border: `${3 * u}px solid rgba(${look.accentRgb},${0.5 * (1 - burst)})`,
          transform: `scale(${0.2 + burst})`,
        }}
      />
      {brand.logo_src ? (
        <div style={{ transform: `scale(${interpolate(mark, [0, 1], [0.3, 1])}) rotate(${interpolate(mark, [0, 1], [-25, 0])}deg)`, opacity: Math.min(1, mark * 2), filter: `drop-shadow(0 0 ${60 * u}px rgba(${look.accentRgb},0.5))` }}>
          <Mark brand={brand} size={180 * u} />
        </div>
      ) : null}
      {name ? <Reveal text={name} size={fit(name, look.width * 0.8, (brand.logo_src ? 150 : 210) * u, 1, 0.56)} at={at + (brand.logo_src ? 8 : 0)} maxWidth={look.width * 0.8} accentLast={false} /> : null}
      {scene.body ? (
        <Line at={at + 16} size={40 * u} maxWidth={look.width * 0.7}>
          {scene.body}
        </Line>
      ) : null}
      {scene.title && scene.type === "logo" ? (
        <Line at={at + 18} size={44 * u} maxWidth={look.width * 0.7}>
          {scene.title}
        </Line>
      ) : null}
      {scene.title && scene.type !== "logo" ? (
        <div
          style={{
            marginTop: 16 * u,
            padding: `${28 * u}px ${64 * u}px`,
            borderRadius: look.card === "ink" || look.card === "outline" ? 8 * u : 999,
            backgroundImage: `linear-gradient(110deg, ${look.accentA}, ${look.accentB})`,
            color: look.onAccent,
            fontFamily: look.body,
            fontWeight: 700,
            fontSize: 40 * u,
            whiteSpace: "nowrap",
            boxShadow: look.card === "ink" ? `${10 * u}px ${10 * u}px 0 ${look.cardEdge}` : `0 0 ${70 * u}px rgba(${look.accentRgb},0.5)`,
            opacity: Math.min(1, btn * 1.5),
            transform: `translateY(${interpolate(btn, [0, 1], [30 * u, 0])}px) scale(${interpolate(btn, [0, 1], [0.8, 1]) * breathe})`,
          }}
        >
          {scene.title}
        </div>
      ) : null}
    </div>
  );
};

export const CARDS: Record<PlanScene["type"], React.FC<CardProps>> = {
  hook: HeadlineCard,
  statement: HeadlineCard,
  kinetic: KineticCard,
  announce: AnnounceCard,
  logo: CloseCard,
  cta: CloseCard,
  specs: SpecsCard,
  bars: BarsCard,
  compare: CompareCard,
  code: CodeCard,
  chat: ChatCard,
  checklist: ChecklistCard,
  features: ListCard,
  steps: ListCard,
  stat: StatCard,
  quote: QuoteCard,
  offer: OfferCard,
  screenshot: ShotCard,
  device: ShotCard,
  converge: ConvergeCard,
};

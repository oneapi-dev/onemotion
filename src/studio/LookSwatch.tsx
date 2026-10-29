"use client";

import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Three-second previews of the looks in the wizard: one fictional product
 * (Tidepool, a surf forecast) in every look, so the cards differ by style
 * alone. Hand-made scenes, drawn live in the card: no file, no model.
 */

export const SWATCH = { width: 640, height: 360, fps: 30, frames: 90 } as const;

/** The faces the previews use (kit/fonts.ts names), loaded once when the gallery opens. */
export const SWATCH_FONTS: Record<string, string[]> = {
  "Inter Tight": ["700"],
  Inter: ["500"],
  "Archivo Black": ["400"],
  "Instrument Serif": ["400"],
  Caveat: ["700"],
  Lora: ["600"],
  Righteous: ["400"],
  "JetBrains Mono": ["500"],
  Fredoka: ["600"],
  "Playfair Display": ["600"],
  Anton: ["400"],
  Outfit: ["800"],
  Newsreader: ["600"],
  "IBM Plex Mono": ["500"],
};

/** 0 to 1 between two frames. */
const p = (t: number, a: number, b: number, ease: (x: number) => number = Easing.out(Easing.cubic)) => interpolate(t, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
const back = Easing.out(Easing.back(1.8));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const font = (family: string, size: number, weight: number | string, color: string, extra: CSSProperties = {}): CSSProperties => ({ fontFamily: `"${family}"`, fontSize: size, fontWeight: weight, color, lineHeight: 1, whiteSpace: "nowrap", ...extra });
const at = (x: number, y: number, extra: CSSProperties = {}): CSSProperties => ({ position: "absolute", left: x, top: y, ...extra });

function CinematicDark() {
  const t = useCurrentFrame();
  const lx = mix(120, 520, t / 90);
  return (
    <AbsoluteFill style={{ background: "#0B0C0E", overflow: "hidden" }}>
      <div style={at(lx - 260, -120, { width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,255,255,0.14), rgba(255,255,255,0))" })} />
      {Array.from({ length: 22 }, (_, i) => (
        <div key={i} style={at((i * 97) % 640, ((i * 53) % 360) - t * (0.3 + (i % 5) * 0.08), { width: 2, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.35)" })} />
      ))}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${1 + 0.07 * (t / 90)})` }}>
        <div style={{ ...font("Inter", 11, 500, "#8A8F96", { letterSpacing: 5 }), opacity: p(t, 2, 20), marginBottom: 14 }}>TIDEPOOL</div>
        <div style={{ ...font("Inter Tight", 50, 700, "#EDEDED", { letterSpacing: -1.5 }), opacity: p(t, 8, 34) }}>Read the ocean.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function PosterColorBlock() {
  const t = useCurrentFrame();
  const panels = [
    { from: 0, bg: "#FF5A1F", ink: "#111111", word: "READ" },
    { from: 30, bg: "#2440FF", ink: "#F2EDE4", word: "THE" },
    { from: 60, bg: "#F2EDE4", ink: "#111111", word: "OCEAN" },
  ];
  return (
    <AbsoluteFill style={{ background: panels[0].bg, overflow: "hidden" }}>
      {panels.map((s, i) => {
        const wipe = i === 0 ? 1 : p(t, s.from, s.from + 7, Easing.inOut(Easing.cubic));
        if (t < s.from && i > 0) return null;
        const slam = p(t, s.from + 3, s.from + 9, back);
        return (
          <div key={s.word} style={{ position: "absolute", inset: 0, background: s.bg, clipPath: `inset(0 ${100 - wipe * 100}% 0 0)` }}>
            <div style={{ ...at(-14, 150 + (1 - slam) * 60), ...font("Archivo Black", 230, 400, s.ink, { letterSpacing: -10 }) }}>{s.word}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

function EditorialLight() {
  const t = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#F6F2EA" }}>
      <div style={at(64, 236, { height: 1, width: 512 * p(t, 2, 40), background: "#1A1A1A" })} />
      <div style={at(64, 140, { height: 70, overflow: "hidden" })}>
        <div style={{ ...font("Instrument Serif", 62, 400, "#1A1A1A", { letterSpacing: -1 }), transform: `translateY(${(1 - p(t, 10, 36)) * 100}%)` }}>Read the ocean, early.</div>
      </div>
      <div style={{ ...at(64, 252), ...font("Inter", 12, 500, "#6B6B6B", { letterSpacing: 0.4 }), opacity: p(t, 32, 52) }}>Tidepool · Surf forecasts for every beach</div>
      <div style={at(560, 228, { width: 16, height: 16, borderRadius: 8, background: "#D9542B", transform: `scale(${p(t, 40, 52, back)})` })} />
    </AbsoluteFill>
  );
}

function PaperAndPrint() {
  const t = useCurrentFrame();
  const land = p(t, 0, 18, back);
  const stamp = p(t, 48, 56, back);
  return (
    <AbsoluteFill style={{ background: "#EFE6D4", backgroundImage: "radial-gradient(rgba(0,0,0,0.07) 1px, transparent 1px)", backgroundSize: "6px 6px" }}>
      <div style={at(150, 70 - (1 - land) * 260, { width: 340, height: 210, background: "#FBF7EE", boxShadow: "0 6px 14px rgba(60,40,10,0.18)", transform: `rotate(${mix(-12, -3, land)}deg)` })}>
        <div style={at(130, -12, { width: 90, height: 24, background: "rgba(236,214,150,0.85)", transform: "rotate(4deg)" })} />
        <div style={{ ...at(28, 62), ...font("Lora", 36, 600, "#2B2118") }}>Read the ocean.</div>
        <div style={{ ...at(30, 118, { clipPath: `inset(0 ${100 - p(t, 22, 46) * 100}% 0 0)` }), ...font("Caveat", 30, 700, "#355C7D", { transform: "rotate(-3deg)" }) }}>today&apos;s swell, 2.4 m!</div>
      </div>
      <div style={at(440, 210, { width: 104, height: 104, borderRadius: 52, border: "4px solid #C8402B", display: "grid", placeItems: "center", opacity: stamp, transform: `rotate(14deg) scale(${mix(1.7, 1, stamp)})` })}>
        <span style={font("Inter Tight", 17, 700, "#C8402B", { letterSpacing: 1 })}>SURF OK</span>
      </div>
    </AbsoluteFill>
  );
}

function RetroAnalog() {
  const t = useCurrentFrame();
  const glitch = t >= 40 && t < 45 ? ((t * 37) % 11) - 5 : 0;
  const zoom = t >= 70 ? 1.14 : 1;
  const title = (dx: number, color: string, opacity = 1) => <div style={{ ...at(80 + dx, 130), ...font("Righteous", 82, 400, color), opacity }}>TIDEPOOL</div>;
  return (
    <AbsoluteFill style={{ background: "#E3B04B", overflow: "hidden" }}>
      <div style={at(0, 250, { width: 640, height: 110, background: "#2A9D8F", opacity: 0.85 })} />
      <div style={at(470, 40, { width: 120, height: 120, borderRadius: 60, background: "#E76F51", opacity: 0.9 })} />
      <AbsoluteFill style={{ transform: `translateX(${glitch * 3}px) scale(${zoom})` }}>
        {title(-3, "#C1121F", 0.5)}
        {title(3, "#118AB2", 0.5)}
        {title(0, "#3B2F2F")}
        <div style={{ ...at(84, 226), ...font("Inter", 13, 500, "#3B2F2F", { letterSpacing: 4 }) }}>SURF REPORT · CH 04</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.09) 0 1px, transparent 1px 3px)" }} />
    </AbsoluteFill>
  );
}

function BrutalistMono() {
  const t = useCurrentFrame();
  const cmd = "> tidepool --forecast";
  const typed = cmd.slice(0, Math.floor(p(t, 2, 30, (x) => x) * cmd.length));
  const rows = [
    ["swell", "2.4 m"],
    ["period", "11 s"],
    ["wind", "offshore"],
  ];
  const cell = Math.floor(t / 15) % 6;
  return (
    <AbsoluteFill style={{ background: "#F2F2F2" }}>
      {[1, 2, 3].map((i) => (
        <div key={`v${i}`} style={at(i * 160, 0, { width: 2, height: 360, background: "#111" })} />
      ))}
      {[1, 2].map((i) => (
        <div key={`h${i}`} style={at(0, i * 120, { width: 640, height: 2, background: "#111" })} />
      ))}
      <div style={at((cell % 4) * 160 + 2, Math.floor(cell / 4) * 120 + 242, { width: 158, height: 118, background: "#111" })} />
      <div style={{ ...at(24, 46), ...font("JetBrains Mono", 22, 500, "#111") }}>
        {typed}
        <span style={{ opacity: Math.floor(t / 8) % 2 ? 0 : 1 }}>█</span>
      </div>
      {rows.map(([k, v], i) =>
        t >= 34 + i * 6 ? (
          <div key={k} style={{ ...at(24 + i * 160, 160), ...font("JetBrains Mono", 15, 500, "#111") }}>
            {k}
            <br />
            <br />
            <span style={{ fontSize: 24 }}>{v}</span>
          </div>
        ) : null,
      )}
    </AbsoluteFill>
  );
}

function PastelPlayful() {
  const t = useCurrentFrame();
  const bloom = Easing.out(Easing.elastic(1.2));
  const blobs = [
    { x: 70, y: 60, r: 120, c: "#BDE0FE", at: 0 },
    { x: 440, y: 30, r: 150, c: "#FFC8DD", at: 6 },
    { x: 380, y: 230, r: 110, c: "#CDEAC0", at: 12 },
  ];
  const word = "Hello, waves!";
  return (
    <AbsoluteFill style={{ background: "#FFF1E6", overflow: "hidden" }}>
      {blobs.map((b) => (
        <div key={b.c} style={at(b.x, b.y, { width: b.r, height: b.r, borderRadius: "50%", background: b.c, transform: `scale(${p(t, b.at, b.at + 26, bloom)}) translateY(${Math.sin((t + b.at) / 12) * 5}px)` })} />
      ))}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "row" }}>
        {[...word].map((ch, i) => (
          <span key={i} style={{ ...font("Fredoka", 58, 600, "#3D3A4B"), display: "inline-block", transform: `translateY(${(1 - p(t, 14 + i * 2, 30 + i * 2, back)) * 50}px)`, opacity: p(t, 14 + i * 2, 20 + i * 2), whiteSpace: "pre" }}>
            {ch}
          </span>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function LuxuryDark() {
  const t = useCurrentFrame();
  const sweep = mix(-160, 760, p(t, 30, 80, Easing.inOut(Easing.quad)));
  return (
    <AbsoluteFill style={{ background: "#0E0D0B", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ position: "relative", overflow: "hidden", padding: "6px 0" }}>
        <div style={{ ...font("Playfair Display", 44, 600, "#E9DFC7", { letterSpacing: 16 }), opacity: p(t, 6, 50, Easing.inOut(Easing.quad)) }}>TIDEPOOL</div>
        <div style={at(sweep - 320, -20, { width: 50, height: 100, background: "rgba(255,240,200,0.22)", transform: "skewX(-20deg)" })} />
      </div>
      <div style={{ width: 300 * p(t, 20, 64, Easing.inOut(Easing.quad)), height: 1, background: "#C8A45A", margin: "18px 0 14px" }} />
      <div style={{ ...font("Inter", 11, 500, "#9C8F74", { letterSpacing: 5 }), opacity: p(t, 44, 70) }}>THE OCEAN, READ EARLY</div>
    </AbsoluteFill>
  );
}

function FlatPopPhotos() {
  const t = useCurrentFrame();
  const field = t >= 45;
  const s1 = p(t, 6, 18, back);
  const s2 = p(t, 24, 34, back);
  return (
    <AbsoluteFill style={{ background: field ? "#3A5BFF" : "#F4F4F1", overflow: "hidden" }}>
      <div style={{ ...at(-10, 228), ...font("Outfit", 200, 800, field ? "#FFFFFF" : "#111111", { letterSpacing: -8 }) }}>SURF</div>
      <div style={at(330, 40, { width: 220, height: 160, borderRadius: 18, border: "6px solid #fff", overflow: "hidden", boxShadow: "0 8px 18px rgba(0,0,0,0.15)", transform: `rotate(-6deg) scale(${s1})` })}>
        <div style={{ position: "absolute", inset: 0, background: "#8ECAE6" }} />
        <div style={at(0, 92, { width: 220, height: 70, background: "#219EBC" })} />
        <div style={at(150, 24, { width: 36, height: 36, borderRadius: 18, background: "#FFB703" })} />
      </div>
      <div style={at(250, 160, { padding: "8px 16px", borderRadius: 999, background: "#FFB703", transform: `rotate(5deg) scale(${s2})` })}>
        <span style={font("Outfit", 22, 800, "#111")}>2.4 m swell</span>
      </div>
    </AbsoluteFill>
  );
}

function KineticType() {
  const t = useCurrentFrame();
  const shots = [
    { from: 0, word: "READ", bg: "#0C0E11", ink: "#F4F1EA" },
    { from: 15, word: "THE", bg: "#FF5B2E", ink: "#141210" },
    { from: 26, word: "OCEAN.", bg: "#F4F1EA", ink: "#141210" },
    { from: 52, word: "TIDEPOOL", bg: "#0C0E11", ink: "#FF5B2E" },
  ];
  const s = [...shots].reverse().find((x) => t >= x.from) ?? shots[0];
  const slam = p(t, s.from, s.from + 5, Easing.out(Easing.quad));
  const size = s.word.length > 6 ? 118 : 168;
  return (
    <AbsoluteFill style={{ background: s.bg, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      {[-1, 1].map((row) => (
        <div key={row} style={{ ...at(-((t * 4) % 300), 180 + row * 120 - size / 2), ...font("Anton", size, 400, s.ink), opacity: 0.07 }}>
          {`${s.word} ${s.word} ${s.word}`}
        </div>
      ))}
      <div style={{ ...font("Anton", size, 400, s.ink, { letterSpacing: -1 }), transform: `scale(${mix(1.25, 1, slam) * (1 + 0.04 * ((t - s.from) / 30))})` }}>{s.word}</div>
    </AbsoluteFill>
  );
}

function ContinuousAction() {
  const t = useCurrentFrame();
  const x = mix(60, 560, t / 90);
  const y = (v: number) => 220 + Math.sin(v / 60) * 34;
  const d = Array.from({ length: 33 }, (_, i) => `${i ? "L" : "M"}${i * 22 - 20},${y(i * 22 - 20)}`).join(" ");
  return (
    <AbsoluteFill style={{ background: "#F3F6F4", overflow: "hidden" }}>
      <svg width={640} height={360} style={{ position: "absolute", inset: 0 }}>
        <path d={d} fill="none" stroke="#0F3D3E" strokeWidth={4} strokeDasharray={900} strokeDashoffset={900 * (1 - p(t, 0, 30))} />
        <path d={`${d} L660,360 L-20,360 Z`} fill="rgba(15,61,62,0.08)" />
      </svg>
      <div style={at(x - 9, y(x) - 9, { width: 18, height: 18, borderRadius: 9, background: "#FF7A59" })} />
      <div style={{ ...at(x - 30, y(x) - 52), ...font("Inter Tight", 22, 700, "#0F3D3E") }}>{(2.4 * p(t, 10, 70)).toFixed(1)} m</div>
      <div style={{ ...at(40, 40), ...font("Inter", 13, 500, "#4A6B6B", { letterSpacing: 1 }) }}>how a swell travels</div>
    </AbsoluteFill>
  );
}

function CartoonCollage() {
  const t = useCurrentFrame();
  const pop = (a: number) => p(t, a, a + 12, back);
  return (
    <AbsoluteFill style={{ background: "#F5EEDC", overflow: "hidden" }}>
      <div style={at(470, 40, { width: 90, height: 90, borderRadius: 45, background: "#F4B942", transform: `scale(${pop(0)})` })} />
      <svg width={640} height={360} style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - pop(6)) * 120}px)` }}>
        <path d="M0,250 C80,215 160,285 240,250 C320,215 400,285 480,250 C560,215 640,285 720,250 L720,360 L0,360 Z" fill="#4D9DE0" />
      </svg>
      <div style={at(220, 176, { width: 0, height: 0, borderLeft: "40px solid transparent", borderRight: "40px solid transparent", borderBottom: "56px solid #E15554", transform: `scale(${pop(14)}) rotate(${Math.sin(t / 8) * 4}deg)` })} />
      <div style={{ ...at(60, 70), ...font("Caveat", 34, 700, "#3B3B58", { transform: "rotate(-4deg)" }), opacity: p(t, 24, 36) }}>high tide at 6:40</div>
      {["SWELL", "WIND"].map((w, i) => (
        <div key={w} style={at(60 + i * 104, 130, { padding: "6px 14px", borderRadius: 999, background: i ? "#7768AE" : "#3BB273", transform: `scale(${pop(32 + i * 6)})` })}>
          <span style={font("Inter Tight", 14, 700, "#fff", { letterSpacing: 1 })}>{w}</span>
        </div>
      ))}
    </AbsoluteFill>
  );
}

function VisualJournalism() {
  const t = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#0A0A0A", overflow: "hidden" }}>
      <div style={at(340, 40, { width: 250, height: 280, background: "#2B2F33", transform: `scale(${1 + 0.05 * (t / 90)})` })}>
        <div style={at(0, 170, { width: 250, height: 110, background: "#3D4A52" })} />
        <div style={{ ...at(8, 8, { padding: "3px 6px", background: "#000" }), ...font("JetBrains Mono", 10, 500, "#CFCFCF") }}>SOURCE: BUOY 42</div>
      </div>
      <svg width={640} height={360} style={{ position: "absolute", inset: 0 }}>
        <circle cx={470} cy={210} r={36} fill="none" stroke="#F5E663" strokeWidth={3} strokeDasharray="6 6" strokeDashoffset={0} pathLength={240} style={{ clipPath: `inset(0 ${100 - p(t, 40, 64) * 100}% 0 0)` }} />
      </svg>
      <div style={at(40, 120, { position: "absolute" })}>
        <div style={font("Inter Tight", 40, 700, "#F2F2F2", { letterSpacing: -1 })}>Swells are</div>
        <div style={{ position: "relative", marginTop: 6, display: "inline-block" }}>
          <div style={at(-4, 6, { height: 34, width: 140 * p(t, 18, 34), background: "#F5E663" })} />
          <span style={{ ...font("Inter Tight", 40, 700, "#0A0A0A", { letterSpacing: -1 }), position: "relative", color: t >= 24 ? "#0A0A0A" : "#F2F2F2" }}>rising.</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function WhiteCatalog() {
  const t = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#FFFFFF", overflow: "hidden" }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={at(i * 160, 0, { width: 1, height: 360, background: "#ECECEC" })} />
      ))}
      <div style={at(350, 70, { width: 90, height: 240, borderRadius: "50%", background: "#FF8C42", transform: `rotate(${mix(40, 28, p(t, 0, 24))}deg) translateY(${(1 - p(t, 0, 20, back)) * 40}px)` })}>
        <div style={at(43, 20, { width: 4, height: 200, background: "#FFF3E6" })} />
      </div>
      <svg width={640} height={360} style={{ position: "absolute", inset: 0 }}>
        <ellipse cx={395} cy={190} rx={120} ry={140} fill="none" stroke="#1F7AE0" strokeWidth={3} pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - p(t, 34, 60))} transform="rotate(-8 395 190)" />
      </svg>
      <div style={{ ...at(48, 120), ...font("Outfit", 56, 800, "#111", { letterSpacing: -2 }) }}>SURF KIT</div>
      <div style={{ ...at(52, 184), ...font("Caveat", 32, 700, "#1F7AE0"), opacity: p(t, 20, 34) }}>no. 04, the shortboard</div>
    </AbsoluteFill>
  );
}

function VintageSketch() {
  const t = useCurrentFrame();
  const drawn = p(t, 0, 50, (x) => x);
  return (
    <AbsoluteFill style={{ background: "#E8DCC2", overflow: "hidden" }}>
      <svg width={640} height={360} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <clipPath id="wave">
            <path d="M330,300 C360,170 470,110 590,150 C520,165 500,220 560,260 C500,250 470,280 470,300 Z" />
          </clipPath>
        </defs>
        <g clipPath="url(#wave)">
          {Array.from({ length: 40 }, (_, i) => (i / 40 <= drawn ? <line key={i} x1={320 + i * 8} y1={100} x2={300 + i * 8} y2={310} stroke="#4A3B2A" strokeWidth={1.4} /> : null))}
        </g>
        <path d="M330,300 C360,170 470,110 590,150" fill="none" stroke="#4A3B2A" strokeWidth={2} pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - drawn)} />
        <path d="M250,120 C300,110 330,140 360,170" fill="none" stroke="#9C4A2F" strokeWidth={2} pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - p(t, 50, 70))} />
      </svg>
      <div style={{ ...at(48, 130), ...font("Lora", 40, 600, "#3A2C1E") }}>On the tides</div>
      <div style={{ ...at(150, 92), ...font("Caveat", 26, 700, "#9C4A2F"), opacity: p(t, 60, 74) }}>the breaking crest</div>
    </AbsoluteFill>
  );
}

function CartoonStage() {
  const t = useCurrentFrame();
  const wave = (y: number, phase: number, color: string) => {
    const pts = Array.from({ length: 34 }, (_, i) => `${i ? "L" : "M"}${i * 20 - 10},${y + Math.sin((i * 20 + t * 4 + phase) / 30) * 6}`).join(" ");
    return <path d={`${pts} L680,360 L-10,360 Z`} fill={color} />;
  };
  const bob = Math.sin(t / 9) * 5;
  const jump = (t % 45) / 45;
  return (
    <AbsoluteFill style={{ background: "#BEE3F8", overflow: "hidden" }}>
      <div style={at(500, 30, { width: 70, height: 70, borderRadius: 35, background: "#FFD166", transform: `rotate(${t * 2}deg)`, boxShadow: "0 0 0 10px rgba(255,209,102,0.35)" })} />
      {[0, 1].map((i) => (
        <div key={i} style={at(((i * 300 + t * (1.2 + i * 0.4)) % 760) - 120, 40 + i * 40, { width: 90, height: 28, borderRadius: 14, background: "#fff" })} />
      ))}
      {[0, 1].map((i) => (
        <div key={i} style={{ ...at(((t * 3 + i * 60) % 700) - 40, 90 + i * 20), ...font("Inter Tight", 18, 700, "#334"), transform: `scaleY(${t % 8 < 4 ? 1 : -1})` }}>v</div>
      ))}
      <svg width={640} height={360} style={{ position: "absolute", inset: 0 }}>
        {wave(220, 0, "#4CA3DD")}
        <g transform={`translate(260, ${200 + bob}) rotate(${bob})`}>
          <path d="M-40,0 L40,0 L28,18 L-28,18 Z" fill="#8D5524" />
          <line x1={0} y1={0} x2={0} y2={-46} stroke="#5A3A1A" strokeWidth={3} />
          <path d="M2,-44 L30,-8 L2,-8 Z" fill="#fff" />
        </g>
        <circle cx={130 + jump * 60} cy={260 - Math.sin(jump * Math.PI) * 70} r={8} fill="#F28482" />
        <g transform={`translate(470, ${236 - bob})`}>
          <rect x={-8} y={-22} width={16} height={26} rx={4} fill="#E63946" />
        </g>
        {wave(262, 40, "#2F7FB8")}
        {wave(300, 90, "#1D5F8A")}
      </svg>
    </AbsoluteFill>
  );
}

function KineticEditorial() {
  const t = useCurrentFrame();
  const out = p(t, 66, 80, Easing.in(Easing.cubic));
  const word = "READ";
  const rise = (i: number, n: number) => {
    const d = Math.abs(i - (n - 1) / 2) * 3;
    const edge = ((n - 1) / 2 - Math.abs(i - (n - 1) / 2)) * 2;
    return `translateY(${((1 - p(t, 4 + d, 18 + d)) * 120 - out * 140 * p(t, 66 + edge, 78 + edge)).toFixed(1)}%)`;
  };
  return (
    <AbsoluteFill style={{ background: "#F4F1EA", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...font("Inter", 11, 900, "#14110F", { letterSpacing: "0.45em", textIndent: "0.45em" }), opacity: p(t, 0, 12) * (1 - out), marginBottom: 16 }}>TIDEPOOL · ISSUE 04</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <div style={{ display: "flex", overflow: "hidden", padding: "0 2px 6px" }}>
          {[...word].map((ch, i) => (
            <span key={i} style={{ ...font("Anton", 112, 400, "#14110F", { letterSpacing: "-0.02em" }), display: "inline-block", transform: rise(i, word.length) }}>
              {ch}
            </span>
          ))}
        </div>
        <span style={{ ...font("Instrument Serif", 84, 400, "#D9542B", { fontStyle: "italic" }), opacity: p(t, 20, 32) * (1 - out) }}>the</span>
        <span style={{ ...font("Anton", 112, 400, "transparent", { WebkitTextStroke: "2.5px #14110F" }), opacity: p(t, 28, 40) * (1 - out) }}>OCEAN</span>
      </div>
    </AbsoluteFill>
  );
}

function RisographPrint() {
  const t = useCurrentFrame();
  const tt = Math.floor(t / 2) * 2;
  const s = p(tt, 30, 37, Easing.out(Easing.quad));
  const ghost = (dx: number, dy: number, color: string, op: number) => <div style={{ ...at(80 + dx, 118 + dy), ...font("Archivo Black", 92, 400, color), opacity: op }}>TIDEPOOL</div>;
  return (
    <AbsoluteFill style={{ background: "#F1EAD9", backgroundImage: `radial-gradient(rgba(43,58,122,${tt % 4 ? 0.14 : 0.1}) 1px, transparent 1.4px)`, backgroundSize: "7px 7px", overflow: "hidden" }}>
      <div style={at(330, 120 - p(tt, 0, 10) * 30, { width: 230, height: 230, borderRadius: 115, background: "#2B3A7A" })} />
      <div style={at(250, 210, { width: 220, height: 120, background: "#FF5A1F", opacity: p(tt, 6, 8) })} />
      <div style={at(330, 210, { width: 140, height: 120, background: "#2B140F", opacity: p(tt, 6, 8), clipPath: "inset(0 0 0 0 round 0 0 0 0)" })} />
      {ghost(4, 3, "#FF5A1F", 0.55)}
      {ghost(0, 0, "#2B3A7A", 1)}
      <div style={at(470, 40, { padding: "10px 16px", borderRadius: 999, background: "#FF5A1F", opacity: tt >= 30 ? 1 : 0, transform: `scale(${mix(1.18, 1, s)}) rotate(${mix(9, 4, s)}deg)` })}>
        <span style={font("Archivo Black", 18, 400, "#F1EAD9")}>SURF OK</span>
      </div>
    </AbsoluteFill>
  );
}

function KeynoteUiMorph() {
  const t = useCurrentFrame();
  const g = p(t, 18, 40, Easing.inOut(Easing.cubic));
  const r = { x: mix(250, 110, g), y: mix(240, 70, g), w: mix(140, 420, g), h: mix(44, 230, g), rad: mix(22, 18, g) };
  const tilt = mix(-16, 0, p(t, 40, 64));
  return (
    <AbsoluteFill style={{ background: "#F5F5F7" }}>
      <div style={{ ...at(110, 30), ...font("Inter Tight", 20, 700, "#1D1D1F") }}>
        Check the swell. <span style={{ color: "#86868B" }}>Anywhere.</span>
      </div>
      <div style={at(r.x, r.y, { width: r.w, height: r.h, borderRadius: r.rad, background: g > 0 ? "#FFFFFF" : "#0071E3", boxShadow: g > 0 ? "0 10px 30px rgba(0,0,0,0.08)" : "none", overflow: "hidden", transform: `perspective(900px) rotateY(${t >= 40 ? tilt : 0}deg)` })}>
        <div style={{ ...at(0, 0, { width: 140, height: 44, display: "grid", placeItems: "center" }), opacity: 1 - p(t, 18, 24) }}>
          <span style={font("Inter Tight", 15, 700, "#FFFFFF")}>Check swell</span>
        </div>
        <div style={{ position: "absolute", inset: 18, opacity: p(t, 30, 40), transform: `translateY(${(1 - p(t, 30, 40)) * 14}px)` }}>
          <div style={font("Inter", 12, 500, "#86868B")}>Bondi · now</div>
          <div style={{ ...font("Inter Tight", 54, 700, "#1D1D1F", { letterSpacing: -2 }), marginTop: 6 }}>2.4 m</div>
          <div style={{ display: "flex", gap: 6, marginTop: 18, alignItems: "flex-end", height: 60 }}>
            {[30, 46, 38, 58, 50, 42, 34].map((h, i) => (
              <div key={i} style={{ width: 34, height: h * p(t, 36 + i * 2, 50 + i * 2), borderRadius: 6, background: i === 3 ? "#0071E3" : "#D2D2D7" }} />
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function PaperDocumentary() {
  const t = useCurrentFrame();
  const tt = Math.floor(t / 2) * 2;
  const torn = Array.from({ length: 30 }, (_, i) => `${i * 14}px ${((Math.sin(i * 7.1) + 1) * 4).toFixed(1)}px`).join(", ");
  const tornB = Array.from({ length: 30 }, (_, i) => `${(29 - i) * 14}px ${(82 - (Math.sin(i * 3.7) + 1) * 4).toFixed(1)}px`).join(", ");
  const drop = p(tt, 26, 36, back);
  return (
    <AbsoluteFill style={{ background: "#F1E6D0", overflow: "hidden" }}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(20,33,61,0.16) 1.4px, transparent 2px)", backgroundSize: "9px 9px" }} />
      <div style={at(330, 40 - (1 - drop) * 200, { width: 230, height: 160, background: "#FBF7EE", boxShadow: "4px 6px 0 rgba(20,20,20,0.15)", transform: `rotate(${mix(-10, 3, drop)}deg)` })}>
        <div style={at(20, 20, { width: 190, height: 90, background: "#14213D" })} />
        <div style={{ ...at(20, 122), ...font("Inter Tight", 14, 700, "#14213D") }}>1958 · the first forecast</div>
      </div>
      <div style={at(40, 150, { width: 410, height: 86, background: "#FBF7EE", clipPath: `polygon(${torn}, ${tornB})`, transform: `translateX(${(1 - p(tt, 4, 14, Easing.out(Easing.cubic))) * -460}px)` })}>
        <div style={{ ...at(22, 18), ...font("Anton", 46, 400, "#14213D", { textShadow: "-1.5px 0 rgba(184,49,42,0.55), 1.5px 0 rgba(40,140,200,0.45)" }) }}>WHY WAVES BREAK</div>
      </div>
      <svg width={640} height={360} style={{ position: "absolute", inset: 0 }}>
        <ellipse cx={445} cy={110} rx={70} ry={42} fill="none" stroke="#B8312A" strokeWidth={4} pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - p(tt, 44, 62))} transform="rotate(-6 445 110)" />
      </svg>
      <div style={{ ...at(40, 262, { padding: "6px 12px", background: "#F2C230" }), ...font("Inter Tight", 16, 700, "#14213D"), opacity: p(tt, 56, 60) }}>A swell travels for days.</div>
    </AbsoluteFill>
  );
}

// Whiteboard and living diagram previews (built with the explain blocks), data newsroom and pictogram.
const k01 = (t: number, a: number, b: number, e: (x: number) => number = (x) => x) => interpolate(t, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
/** Near-linear draw with 3-frame soft ends (the nib never lurches). */
const soft = (t: number, a: number, b: number) => {
  const D = b - a;
  const x = t - a;
  const e = Math.min(3, D / 2);
  const v = 1 / (D - e);
  return x <= 0 ? 0 : x >= D ? 1 : x < e ? (v * x * x) / (2 * e) : x > D - e ? 1 - (v * (D - x) ** 2) / (2 * e) : v * (x - e / 2);
};
const ease = Easing.bezier(0.65, 0, 0.35, 1);

// The wave, sampled once by arc length so the pen moves at an even speed.
const WAVE = (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 240; i++) {
    const u = i / 240;
    const amp = 34 + 86 * Math.exp(-(((u - 0.5) / 0.16) ** 2));
    pts.push([60 + 520 * u, 262 - amp * (0.5 - 0.5 * Math.cos(Math.PI * 6 * u))]);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
})();
/** The drawn part of the wave at progress s: its points, the last one the exact tip. */
const waveTo = (s: number): [number, number][] => {
  const L = s * WAVE.len;
  const out: [number, number][] = [];
  for (let i = 0; i < WAVE.pts.length; i++) {
    if (WAVE.cum[i] <= L) {
      out.push(WAVE.pts[i]);
      continue;
    }
    const a = WAVE.pts[i - 1];
    const b = WAVE.pts[i];
    const k = (L - WAVE.cum[i - 1]) / (WAVE.cum[i] - WAVE.cum[i - 1]);
    out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    break;
  }
  return out;
};
const PEAK = { x: 320, y: 262 - 120, rx: 46, ry: 30 };
const ringAt = (s: number): [number, number] => {
  const a = -Math.PI / 2 + s * Math.PI * 2 * 1.08;
  return [PEAK.x + Math.cos(a) * PEAK.rx, PEAK.y + Math.sin(a) * PEAK.ry];
};

/** A marker, tip at (0, 0), leaning up and right; lifted by `up` (0..1). */
const Marker = ({ x, y, up, alpha, ink }: { x: number; y: number; up: number; alpha: number; ink: string }) => (
  <svg width={1} height={1} style={{ position: "absolute", left: x, top: y, overflow: "visible", opacity: alpha }}>
    <g transform={`translate(${5 + 6 * up} ${6 + 9 * up}) scale(0.42) rotate(38)`} opacity={0.1 * (1 - up / 2)}>
      <rect x={-21} y={-250} width={42} height={228} rx={10} />
    </g>
    <g transform={`translate(${3 * up} ${-8 * up}) scale(0.42) rotate(38)`}>
      <rect x={-21} y={-250} width={42} height={212} rx={10} fill="#F1F1EE" stroke="#2A2A2A" strokeWidth={3} />
      <rect x={-21} y={-250} width={42} height={50} rx={10} fill={ink} />
      <rect x={-16} y={-41} width={32} height={19} rx={3} fill="#2A2A2A" />
      <path d="M-9 -22 L9 -22 L5 -3 L-5 -3 Z" fill={ink} />
    </g>
  </svg>
);

/** Whiteboard: a marker draws the wave, circles the best one in blue, writes the label. */
function Whiteboard() {
  const t = useCurrentFrame();
  const INK = "#161616";
  const BLUE = "#1E5BD8";
  const w = soft(t, 4, 44); // the wave: 40 frames
  const r = soft(t, 51, 65); // the circle, after a 7-frame hop
  const l = soft(t, 72, 86); // the label, after another hop
  const wave = waveTo(Math.max(0.0001, w));
  const ring: [number, number][] = [];
  for (let i = 0; i <= 80; i++) if (i / 80 <= r) ring.push(ringAt(i / 80));
  if (r > 0) ring.push(ringAt(r));
  const label = { x: 384, y: 92, w: 142 };
  const hop = (a: [number, number], b: [number, number], t0: number) => {
    const h = k01(t, t0, t0 + 7, ease);
    return { x: a[0] + (b[0] - a[0]) * h, y: a[1] + (b[1] - a[1]) * h, up: Math.sin(Math.PI * h) };
  };
  const waveEnd = WAVE.pts[WAVE.pts.length - 1];
  const tip = wave[wave.length - 1];
  const nib =
    t < 44
      ? { x: tip[0], y: tip[1], up: 1 - k01(t, 0, 4, ease) }
      : t < 51
        ? hop(waveEnd, ringAt(0), 44)
        : t < 65
          ? { x: ringAt(r)[0], y: ringAt(r)[1], up: 0 }
          : t < 72
            ? hop(ringAt(1), [label.x, label.y + 10], 65)
            : { x: label.x + label.w * l, y: label.y + 10 - Math.abs(Math.sin(l * 14)) * 3, up: k01(t, 86, 90, ease) };
  const line = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <AbsoluteFill style={{ background: "#FBFBF8" }}>
      <div style={{ position: "absolute", left: 40, top: 26, fontFamily: '"Caveat"', fontWeight: 700, fontSize: 34, color: INK, lineHeight: 1 }}>Tidepool</div>
      <svg width={640} height={360} style={{ position: "absolute", inset: 0 }}>
        <path d="M44 262 L596 262" stroke={INK} strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
        {w > 0 ? <path d={line(wave)} fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {r > 0 ? <path d={line(ring)} fill="none" stroke={BLUE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
      </svg>
      <div style={{ position: "absolute", left: label.x, top: label.y - 22, width: label.w, fontFamily: '"Caveat"', fontWeight: 700, fontSize: 34, color: BLUE, lineHeight: 1.2, whiteSpace: "nowrap", clipPath: `inset(0 ${(1 - l) * 100}% 0 0)` }}>the best set</div>
      <Marker x={nib.x} y={nib.y} up={nib.up} alpha={k01(t, 0, 4) * (1 - k01(t, 86, 90))} ink={t >= 48 ? BLUE : INK} />
    </AbsoluteFill>
  );
}

/** Living diagram: buoys feed Tidepool, Tidepool rates three beaches; the chosen path lights and a pulse runs along it. */
function LivingDiagram() {
  const t = useCurrentFrame();
  const INK = "#1B1B1F";
  const GREY = "#9A9A94";
  const BLUE = "#1E5BD8";
  const PAPER = "#FFFFFF";
  const nodes = [
    { id: "buoys", label: "Buoys", sub: "raw swell", x: 100, y: 180 },
    { id: "tide", label: "Tidepool", sub: "forecast", x: 320, y: 180 },
    { id: "north", label: "North", sub: "flat", x: 544, y: 80 },
    { id: "reef", label: "Reef", sub: "clean", x: 544, y: 180 },
    { id: "point", label: "Point", sub: "windy", x: 544, y: 280 },
  ];
  const W = 116;
  const H = 52;
  const edges = [["buoys", "tide"], ["tide", "north"], ["tide", "reef"], ["tide", "point"]] as const;
  const lit = (id: string) => id === "buoys" || id === "tide" || id === "reef";
  // A 3-second cut of the real timings: nodes 5 apart (14 f each), edges from 9 f before the last lands, labels 4 apart, focus, pulse.
  const focus = 54;
  const dimOf = (on: boolean) => 1 - (on ? 0 : 0.65 * k01(t, focus, focus + 9, ease));
  const hot = k01(t, focus, focus + 9, ease);
  const pos = (id: string) => nodes.find((n) => n.id === id) ?? nodes[0];
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <svg width={640} height={360} style={{ position: "absolute", inset: 0 }}>
        {edges.map(([a, b], i) => {
          const A = pos(a);
          const B = pos(b);
          const x1 = A.x + W / 2 + 8;
          const x2 = B.x - W / 2 - 8;
          const y1 = A.y + (B.y - A.y) * ((x1 - A.x) / (B.x - A.x));
          const y2 = A.y + (B.y - A.y) * ((x2 - A.x) / (B.x - A.x));
          const len = Math.hypot(x2 - x1, y2 - y1);
          const d = k01(t, 25 + i * 3, 25 + i * 3 + 16, ease);
          const on = lit(a) && lit(b);
          const delay = a === "buoys" ? 0 : 16;
          const u = on ? k01(t, focus + 2 + delay, focus + 18 + delay) : 0;
          return (
            <g key={a + b} opacity={dimOf(on)}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={GREY} strokeWidth={1.6} strokeDasharray={len} strokeDashoffset={len * (1 - d)} strokeLinecap="round" />
              {on ? <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={BLUE} strokeWidth={1.8} strokeOpacity={hot} strokeLinecap="round" /> : null}
              {u > 0 && u < 1 ? <circle cx={x1 + (x2 - x1) * u} cy={y1 + (y2 - y1) * u} r={4.5} fill={BLUE} stroke={PAPER} strokeWidth={1.5} /> : null}
            </g>
          );
        })}
      </svg>
      {nodes.map((n, i) => {
        const s = k01(t, i * 5, i * 5 + 14, Easing.bezier(0.23, 1, 0.32, 1));
        const lab = k01(t, 40 + i * 4, 50 + i * 4);
        const on = lit(n.id);
        return (
          <div key={n.id} style={{ position: "absolute", left: n.x - W / 2, top: n.y - H / 2, width: W, height: H, boxSizing: "border-box", border: `1.6px solid ${on && hot > 0.5 ? BLUE : GREY}`, borderRadius: 9, background: PAPER, opacity: s * dimOf(on), transform: `scale(${0.85 + 0.15 * s})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
            <div style={{ fontFamily: '"Inter"', fontWeight: 500, fontSize: 15, color: INK, opacity: lab, transform: `translateY(${(1 - lab) * 4}px)`, lineHeight: 1 }}>{n.label}</div>
            <div style={{ fontFamily: '"JetBrains Mono"', fontWeight: 500, fontSize: 10.5, color: INK, opacity: lab * 0.6, lineHeight: 1 }}>{n.sub}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

const num = (v: number) => Math.round(v).toLocaleString("en-US");

function DataNewsroom() {
  const t = useCurrentFrame();
  const V = [12, 15, 19, 31, 38, 41];
  const M = ["Jan", "Mar", "May", "Jul", "Sep", "Nov"];
  const ink = "#1A1A1A";
  const acc = "#C8442B";
  const base = 296;
  return (
    <AbsoluteFill style={{ background: "#F5F3EE" }}>
      <div style={{ position: "absolute", left: 32, top: 22, fontFamily: '"IBM Plex Mono"', fontSize: 10, letterSpacing: "0.14em", color: acc, opacity: p(t, 0, 10) }}>TIDEPOOL · RIDERS</div>
      <div style={{ position: "absolute", left: 32, top: 38, fontFamily: '"Newsreader"', fontWeight: 600, fontSize: 30, color: ink, opacity: p(t, 0, 12) }}>Riders tripled after swell alerts</div>
      <svg width={640} height={360} style={{ position: "absolute", inset: 0 }}>
        <line x1={32} x2={32 + 576 * p(t, 4, 16)} y1={base} y2={base} stroke={ink} strokeOpacity={0.5} />
        {V.map((v, i) => {
          const k = p(t, 12 + i * 5, 26 + i * 5);
          const h = (v / 41) * 170 * k;
          const x = 48 + i * 94;
          return (
            <g key={i}>
              <rect x={x} y={base - h} width={64} height={h} fill={i === 3 ? acc : "#BDB8AE"} />
              <text x={x + 32} y={base - h - 8} textAnchor="middle" fontFamily="Inter" fontSize={13} fontWeight={600} fill={ink} opacity={k} style={{ fontVariantNumeric: "tabular-nums" }}>{num(v * k)}k</text>
              <text x={x + 32} y={base + 16} textAnchor="middle" fontFamily="Inter" fontSize={11} fill={ink} fillOpacity={0.6}>{M[i]}</text>
            </g>
          );
        })}
        <g opacity={p(t, 50, 58)}>
          <line x1={330} x2={330} y1={base - 150} y2={base - 150 - 26 * p(t, 50, 60)} stroke={ink} strokeOpacity={0.7} />
          <text x={336} y={base - 172} fontFamily="Inter" fontSize={12} fontWeight={600} fill={ink}>Swell alerts launch</text>
        </g>
      </svg>
      <div style={{ position: "absolute", left: 32, right: 32, top: 326, borderTop: "1px solid rgba(26,26,26,0.14)", paddingTop: 5, fontFamily: '"IBM Plex Mono"', fontSize: 9, color: "#6E6A63", opacity: p(t, 60, 72) }}>Source: Tidepool rider logs (illustrative)</div>
    </AbsoluteFill>
  );
}

const PERSON = "M12 2.5a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2zM4.8 21.5v-4c0-3.1 2.9-5.6 7.2-5.6s7.2 2.5 7.2 5.6v4z";
function PictogramSwatch() {
  const t = useCurrentFrame();
  const acc = "#0B7A75";
  return (
    <AbsoluteFill style={{ background: "#F6F4EF", alignItems: "center" }}>
      <div style={{ marginTop: 40, fontFamily: '"IBM Plex Mono"', fontSize: 10, letterSpacing: "0.14em", color: acc, opacity: p(t, 0, 10) }}>TIDEPOOL SURVEY</div>
      <div style={{ marginTop: 8, fontFamily: '"Newsreader"', fontWeight: 600, fontSize: 28, color: "#16181A", opacity: p(t, 0, 12) }}>7 of 10 surfers check the forecast first</div>
      <div style={{ display: "flex", gap: 12, marginTop: 48 }}>
        {Array.from({ length: 10 }, (_, i) => {
          const on = i < 7 ? p(t, 16 + i * 4, 24 + i * 4) : 0;
          return (
            <div key={i} style={{ position: "relative", width: 44, height: 44 }}>
              <svg width={44} height={44} viewBox="0 0 24 24" style={{ position: "absolute", opacity: 0.25 * p(t, i, i + 10) }}><path d={PERSON} fill="#9A958C" /></svg>
              <svg width={44} height={44} viewBox="0 0 24 24" style={{ position: "absolute", opacity: on, transform: `translateY(${(1 - on) * 3}px)` }}><path d={PERSON} fill={acc} /></svg>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 30, fontFamily: "Inter", fontSize: 13, color: "#6F6B64", opacity: p(t, 52, 64) }}>
        <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: acc, marginRight: 6 }} />Checks the forecast first
        <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: "#9A958C", opacity: 0.3, margin: "0 6px 0 22px" }} />Goes by eye
      </div>
    </AbsoluteFill>
  );
}

// Editorial map preview: a hand-drawn coast, so the wizard does not load the world data.
// Editorial map, 640x360, 90 frames: Tidepool, "now in 6 coasts". A hand-drawn Australia and island arc
// (map units = frame px at zoom 1); the camera pushes in smoothly, the overlays step at 15 fps.
const M_BG = "#F3EEE4";
const M_LAND = "#56636B";
const M_INK = "#1C1F23";
const M_ACCENT = "#D9532B";
const M_TINT = "#EBB8A3";
const M_AUS = "M236 196 L248 176 L270 166 L286 170 L300 152 L318 158 L326 140 L340 160 L352 182 L366 206 L372 232 L364 254 L348 272 L326 280 L306 272 L290 262 L272 268 L254 270 L240 258 L232 236 L230 212 Z";
const M_TAS = "M326 292 L340 290 L337 304 L328 305 Z";
const M_NZ = "M424 262 L434 252 L440 266 L430 284 L420 294 L414 286 Z";
const M_ISLANDS = ["M140 120 L190 126 L214 132 L190 136 L150 130 Z", "M222 136 L250 138 L238 142 Z", "M262 102 L292 94 L306 108 L286 114 Z", "M330 112 L376 106 L404 122 L382 130 L346 126 Z"];
const M_PINS = [
  { x: 360, y: 238, label: "Sydney", at: 14, dx: 12 },
  { x: 218, y: 136, label: "Bali", at: 24, dx: -12 },
];
const M_ROUTE = "M360 238 Q296 168 218 136";
const M_clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const M_inOut = Easing.bezier(0.65, 0, 0.35, 1);

function EditorialMap() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.floor(frame / 2) * 2; // overlays on twos
  const p = interpolate(frame, [0, 48], [0, 1], { ...M_clamp, easing: M_inOut });
  const z = Math.exp(Math.log(1.5) * p); // zoom 1 -> 1.5 in log space
  const cx = 320 + (270 - 320) * p;
  const cy = 180 + (196 - 180) * p;
  const sx = (x: number) => (x - cx) * z + 320;
  const sy = (y: number) => (y - cy) * z + 180;
  const lit = interpolate(f, [30, 42], [0, 1], { ...M_clamp, easing: M_inOut });
  const draw = interpolate(f, [40, 78], [0, 1], { ...M_clamp, easing: M_inOut });
  return (
    <AbsoluteFill style={{ background: M_BG, overflow: "hidden" }}>
      <svg width={640} height={360} style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(320 180) scale(${z}) translate(${-cx} ${-cy})`}>
          {[M_AUS, M_TAS, M_NZ, ...M_ISLANDS].map((d, i) => (
            <path key={i} d={d} fill={M_LAND} fillOpacity={0.35} stroke={M_BG} strokeWidth={0.8 / z} strokeLinejoin="round" />
          ))}
          <path d={M_AUS} fill={M_TINT} fillOpacity={0.8 * lit} stroke={M_ACCENT} strokeOpacity={lit} strokeWidth={(0.5 + lit) / z} strokeLinejoin="round" />
          {draw > 0 ? <path d={M_ROUTE} fill="none" stroke={M_ACCENT} strokeWidth={2.4 / z} strokeLinecap="round" pathLength={1} strokeDasharray="1 2" strokeDashoffset={1 - draw} /> : null}
        </g>
      </svg>
      {M_PINS.map((pin) => {
        const age = f - pin.at;
        if (age < 0) return null;
        const drop = spring({ frame: age, fps, config: { damping: 12, stiffness: 120 } });
        const x = sx(pin.x);
        const y = sy(pin.y);
        const ring = interpolate(age, [6, 36], [0, 1], M_clamp);
        const label = interpolate(f, [pin.at + 18, pin.at + 30], [0, 1], M_clamp);
        return (
          <div key={pin.label}>
            <div style={{ position: "absolute", left: x - 6 - 14 * ring, top: y - 6 - 14 * ring, width: 12 + 28 * ring, height: 12 + 28 * ring, borderRadius: "50%", border: `1.5px solid ${M_ACCENT}`, opacity: ring > 0 && ring < 1 ? 0.5 * (1 - ring) : 0, boxSizing: "border-box" }} />
            <div style={{ position: "absolute", left: x - 4, top: y - 4 - 40 * (1 - drop), width: 8, height: 8, borderRadius: "50%", background: M_ACCENT, boxShadow: `0 0 0 2px ${M_BG}`, opacity: Math.min(1, drop * 1.6) }} />
            <div style={{ position: "absolute", left: x + pin.dx, top: y - 9, transform: pin.dx < 0 ? "translateX(-100%)" : undefined, opacity: label, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, color: M_INK, whiteSpace: "nowrap", textShadow: `0 0 4px ${M_BG}` }}>{pin.label}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 24, top: 288, fontFamily: "Georgia, serif", fontSize: 24, color: M_INK, opacity: interpolate(frame, [0, 12], [0, 1], M_clamp) }}>Now on 6 coasts.</div>
      <div style={{ position: "absolute", left: 24, top: 320, fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.08em", color: "#6A6F72", opacity: interpolate(f, [8, 20], [0, 1], M_clamp) }}>TIDEPOOL · SURF FORECASTS</div>
    </AbsoluteFill>
  );
}

// Isometric model and math blackboard previews.
function IsometricModel() {
  const t = useCurrentFrame();
  const q = (a: number, b: number, e: (x: number) => number = Easing.out(Easing.cubic)) => interpolate(t, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
  const u = 22;
  const O = { x: 330, y: 205 };
  const P = (x: number, y: number, z: number) => [O.x + (x - y) * 0.866 * u, O.y + (x + y) * 0.5 * u - z * u];
  const pts = (a: number[][]) => a.map((v) => P(v[0], v[1], v[2]).join(",")).join(" ");
  // One hue, three face tones (top +10 L, left base, right -15 L); the accent is the active block.
  const box = (k: string, x: number, y: number, w: number, d: number, h: number, top: string, left: string, right: string, at: number) => {
    const r = q(at, at + 15, Easing.out(Easing.back(1.4)));
    if (t < at) return null;
    return (
      <g key={k} transform={`translate(0 ${((1 - r) * 30).toFixed(1)})`} opacity={q(at, at + 6)}>
        <polygon points={pts([[x, y + d, h], [x + w, y + d, h], [x + w, y + d, 0], [x, y + d, 0]])} fill={left} />
        <polygon points={pts([[x + w, y, h], [x + w, y + d, h], [x + w, y + d, 0], [x + w, y, 0]])} fill={right} />
        <polygon points={pts([[x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h]])} fill={top} />
      </g>
    );
  };
  const grey = ["#D6D4CF", "#C3C1BB", "#A3A098"];
  const teal = ["#3A9AAD", "#2F7D8C", "#1F5560"];
  const route = [[-2.5, 3.5], [-2.5, 1.8], [0, 1.8], [0, 0.8]];
  const k = q(40, 72, Easing.inOut(Easing.cubic)) * 3;
  const i = Math.min(2, Math.floor(k));
  const f = k - i;
  const [px, py] = P(route[i][0] + (route[i + 1][0] - route[i][0]) * f, route[i][1] + (route[i + 1][1] - route[i][1]) * f, 0.15);
  const lines = Array.from({ length: 13 }, (_, n) => n - 6);
  return (
    <AbsoluteFill style={{ background: "#ECEAE5", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 640, height: 360, transform: `translate(${(-t * 0.06).toFixed(2)}px, ${(-t * 0.035).toFixed(2)}px)` }}>
        <svg width={640} height={360}>
          {lines.map((n) => (
            <g key={n} stroke="#23262B" strokeOpacity={0.08}>
              <line x1={P(n, -6, 0)[0]} y1={P(n, -6, 0)[1]} x2={P(n, 6, 0)[0]} y2={P(n, 6, 0)[1]} />
              <line x1={P(-6, n, 0)[0]} y1={P(-6, n, 0)[1]} x2={P(6, n, 0)[0]} y2={P(6, n, 0)[1]} />
            </g>
          ))}
          <polyline points={pts(route.map((r) => [r[0], r[1], 0]))} fill="none" stroke="#23262B" strokeOpacity={0.25} strokeWidth={1.5} strokeDasharray="200" strokeDashoffset={200 * (1 - q(30, 44))} />
          {box("s", -3, 3, 1, 1, 0.3, grey[0], grey[1], grey[2], 0)}
          {box("p", -2.7, 3.3, 0.4, 0.4, 1.4, teal[0], teal[1], teal[2], 4)}
          {box("srv", -0.8, -0.8, 1.6, 1.6, 2.4, grey[0], grey[1], grey[2], 8)}
          {box("ph", 2.6, -3.2, 2.2, 3.6, 0.2, "#3A3E45", "#23262B", "#101215", 12)}
          {t >= 40 && t <= 72 ? <rect x={px - 4} y={py - 4} width={8} height={8} fill="#2F7D8C" transform={`rotate(45 ${px} ${py})`} /> : null}
        </svg>
      </div>
      <div style={{ position: "absolute", left: 32, top: 28, fontFamily: '"Inter"', fontSize: 11, fontWeight: 500, letterSpacing: 4, color: "#6E6D69", opacity: q(4, 20) }}>TIDEPOOL</div>
      <div style={{ position: "absolute", left: 32, top: 46, fontFamily: '"Inter Tight"', fontSize: 26, fontWeight: 700, color: "#23262B", opacity: q(10, 30), transform: `translateY(${(1 - q(10, 30)) * 8}px)` }}>Reef to phone.</div>
    </AbsoluteFill>
  );
}

function MathBlackboard() {
  const t = useCurrentFrame();
  const q = (a: number, b: number, e: (x: number) => number = Easing.out(Easing.cubic)) => interpolate(t, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
  const [X0, Y0, W, H] = [70, 70, 500, 170];
  const ax = q(0, 21, Easing.inOut(Easing.cubic));
  const draw = q(18, 57, (x) => x);
  const lead = draw * Math.PI * 2;
  const M = (x: number, y: number) => [X0 + (x / (Math.PI * 2)) * W, Y0 + H / 2 - y * (H * 0.4)];
  const n = Math.max(2, Math.round(draw * 80));
  const d = Array.from({ length: n }, (_, i) => M((lead * i) / (n - 1), Math.sin((lead * i) / (n - 1)))).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [tx, ty] = M(lead, Math.sin(lead));
  const toks: { s: string; c?: string; at: number }[] = [
    { s: "h", c: "#F2B544", at: 52 },
    { s: "=", at: 55 },
    { s: "A", at: 58 },
    { s: "sin", at: 61 },
    { s: "(", at: 64 },
    { s: "x", c: "#8FB4CF", at: 67 },
    { s: ")", at: 70 },
  ];
  return (
    <AbsoluteFill style={{ background: "#1C2026", overflow: "hidden" }}>
      <svg width={640} height={360} style={{ position: "absolute", transform: `scale(${1 + 0.04 * (t / 90)})`, transformOrigin: "320px 160px" }}>
        {Array.from({ length: 9 }, (_, i) => X0 + (i * W) / 8).map((x, i) => (
          <line key={i} x1={x} y1={Y0} x2={x} y2={Y0 + H} stroke="#E8E4DA" strokeOpacity={0.12 * q(4 + Math.abs(i) * 3, 12 + Math.abs(i) * 3) * (1 - 0.45 * q(42, 54))} />
        ))}
        <line x1={X0} y1={Y0 + H / 2} x2={X0 + W * ax} y2={Y0 + H / 2} stroke="#E8E4DA" strokeWidth={1.5} />
        <line x1={X0} y1={Y0 + H / 2 - (H / 2) * ax} x2={X0} y2={Y0 + H / 2 + (H / 2) * ax} stroke="#E8E4DA" strokeWidth={1.5} />
        {draw > 0 ? <path d={d} fill="none" stroke="#F2B544" strokeWidth={2.5} strokeLinecap="round" /> : null}
        {draw > 0 ? <circle cx={tx} cy={ty} r={4} fill="#F2B544" /> : null}
      </svg>
      {draw > 0 ? <div style={{ position: "absolute", left: tx + 10, top: ty - 24, fontFamily: '"Inter"', fontSize: 12, fontWeight: 500, color: "#F2B544", fontVariantNumeric: "tabular-nums" }}>h = {Math.sin(lead).toFixed(2)}</div> : null}
      <div style={{ position: "absolute", left: 0, right: 0, top: 268, display: "flex", justifyContent: "center", gap: 9, fontFamily: '"Newsreader"', fontSize: 40, fontWeight: 600, color: "#E8E4DA" }}>
        {toks.map((k, i) => {
          const o = q(k.at, k.at + 13);
          return (
            <span key={i} style={{ color: k.c ?? "#E8E4DA", opacity: o, transform: `translateY(${((1 - o) * 10).toFixed(1)}px)`, marginLeft: k.s === "(" || k.s === "x" || k.s === ")" ? -7 : 0 }}>
              {k.s}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function AutoPick() {
  const t = useCurrentFrame();
  const tiles = ["#FF5A1F", "#F6F2EA", "#0B0C0E", "#BDE0FE"];
  const on = Math.floor(t / 22) % 4;
  return (
    <AbsoluteFill style={{ background: "#15181C", alignItems: "center", justifyContent: "center", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 72px)", gap: 10 }}>
        {tiles.map((c, i) => (
          <div key={c} style={{ width: 72, height: 46, borderRadius: 8, background: c, outline: i === on ? "3px solid #F2F2F2" : "none", outlineOffset: 3, opacity: i === on ? 1 : 0.55 }} />
        ))}
      </div>
      <div style={font("Inter Tight", 20, 700, "#F2F2F2")}>Picked for your brand</div>
    </AbsoluteFill>
  );
}

const SCENES: Record<string, () => ReactNode> = {
  auto: AutoPick,
  "cinematic-dark": CinematicDark,
  "poster-color-block": PosterColorBlock,
  "editorial-light": EditorialLight,
  "paper-and-print": PaperAndPrint,
  "retro-analog": RetroAnalog,
  "brutalist-mono": BrutalistMono,
  "pastel-playful": PastelPlayful,
  "luxury-dark": LuxuryDark,
  "flat-pop-with-photos": FlatPopPhotos,
  "kinetic-type": KineticType,
  "kinetic-editorial": KineticEditorial,
  "risograph-print": RisographPrint,
  "keynote-ui-morph": KeynoteUiMorph,
  "paper-documentary": PaperDocumentary,
  whiteboard: Whiteboard,
  "living-diagram": LivingDiagram,
  "data-newsroom": DataNewsroom,
  pictogram: PictogramSwatch,
  "editorial-map": EditorialMap,
  "isometric-model": IsometricModel,
  "math-blackboard": MathBlackboard,
  "continuous-action": ContinuousAction,
  "cartoon-collage": CartoonCollage,
  "visual-journalism": VisualJournalism,
  "white-catalog": WhiteCatalog,
  "vintage-sketch": VintageSketch,
  "cartoon-stage": CartoonStage,
};

/** Whether a look has its own preview. */
export const hasSwatch = (id: string) => id in SCENES;

/** The preview of one look, as a Remotion component (props: `look`, a look id). */
export function LookSwatch({ look }: { look: string }) {
  const Scene = SCENES[look] ?? AutoPick;
  return <Scene />;
}

"use client";

import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

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

import { createContext, useContext } from "react";
import { loadFace, monoFont } from "./fonts";
import type { LookName, MotionFormat, Plan } from "./plan";

/**
 * A look is the whole surface of a flythrough: the room's colors, how cards
 * are built (glass, solid, ink on paper, outlined), the floor and the type.
 * The brand's own color, when the plan carries one, replaces the accent; the
 * room stays the look's, which is where two videos differ at a glance.
 */
export type CardStyle = "glass" | "solid" | "ink" | "outline";

type LookSpec = {
  mode: "dark" | "light";
  /** Room: center and edge of the background gradient. */
  bg: string;
  bgEdge: string;
  text: string;
  textSoft: string;
  /** The accent (one color, twice: no gradients), replaced by the brand color. */
  accent: [string, string];
  card: CardStyle;
  cardBg: string;
  cardEdge: string;
  /** Floor grid line color. */
  grid: string;
  /** Mesh glows behind everything. */
  glow: [string, string];
  /** Display weight and tracking for this look's type. */
  weight: number;
  tracking: number;
};

export const LOOKS: Record<LookName, LookSpec> = {
  // Ink-dark room, frosted dark cards, one chartreuse signal color.
  midnight: {
    mode: "dark",
    bg: "#10151c",
    bgEdge: "#05070a",
    text: "#eef2f6",
    textSoft: "#9ca8b4",
    accent: ["#c9ef4b", "#c9ef4b"],
    card: "glass",
    cardBg: "rgba(20,26,34,0.92)",
    cardEdge: "rgba(255,255,255,0.10)",
    grid: "rgba(160,178,196,0.16)",
    glow: ["rgba(120,150,180,0.14)", "rgba(201,239,75,0.06)"],
    weight: 800,
    tracking: -0.035,
  },
  // Bright white studio, crisp white cards, orange-red.
  graphite: {
    mode: "light",
    bg: "#f4f3f0",
    bgEdge: "#dedcd7",
    text: "#17181a",
    textSoft: "#55585e",
    accent: ["#ff4f1f", "#ff4f1f"],
    card: "solid",
    cardBg: "#ffffff",
    cardEdge: "rgba(20,20,20,0.08)",
    grid: "rgba(20,20,20,0.08)",
    glow: ["rgba(255,79,31,0.08)", "rgba(255,255,255,0.7)"],
    weight: 800,
    tracking: -0.04,
  },
  // Warm paper, ink borders, hard shadows, red.
  paper: {
    mode: "light",
    bg: "#f3ecdf",
    bgEdge: "#e2d6c1",
    text: "#1b1a17",
    textSoft: "#57503f",
    accent: ["#d9301a", "#d9301a"],
    card: "ink",
    cardBg: "#fbf7ef",
    cardEdge: "#1b1a17",
    grid: "rgba(27,26,23,0.10)",
    glow: ["rgba(217,48,26,0.07)", "rgba(255,250,240,0.6)"],
    weight: 800,
    tracking: -0.03,
  },
  // Soft greige room, white cards, deep green.
  sage: {
    mode: "light",
    bg: "#edf0e8",
    bgEdge: "#d6dccf",
    text: "#16211a",
    textSoft: "#4a574d",
    accent: ["#1f7a4d", "#1f7a4d"],
    card: "solid",
    cardBg: "#fbfcf9",
    cardEdge: "rgba(22,33,26,0.08)",
    grid: "rgba(22,33,26,0.08)",
    glow: ["rgba(31,122,77,0.09)", "rgba(255,255,255,0.6)"],
    weight: 800,
    tracking: -0.035,
  },
  // White lab, blue outlines on a grid.
  mono: {
    mode: "light",
    bg: "#ffffff",
    bgEdge: "#eef1f7",
    text: "#0d1220",
    textSoft: "#475066",
    accent: ["#2457ff", "#2457ff"],
    card: "outline",
    cardBg: "#ffffff",
    cardEdge: "#2457ff",
    grid: "rgba(36,87,255,0.12)",
    glow: ["rgba(36,87,255,0.07)", "rgba(36,87,255,0.04)"],
    weight: 700,
    tracking: -0.03,
  },
  // Near black with an ember glow, amber.
  ember: {
    mode: "dark",
    bg: "#170e08",
    bgEdge: "#050302",
    text: "#fff4ea",
    textSoft: "#c9ad99",
    accent: ["#ff9a1f", "#ff9a1f"],
    card: "solid",
    cardBg: "#20140d",
    cardEdge: "rgba(255,154,31,0.18)",
    grid: "rgba(255,140,60,0.13)",
    glow: ["rgba(255,120,30,0.22)", "rgba(255,60,20,0.12)"],
    weight: 800,
    tracking: -0.035,
  },
};

type RGB = [number, number, number];

function hex(v: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((v || "").trim());
  if (!m) return null;
  return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
}

function lum([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const rgbOf = (c: RGB) => c.map(Math.round).join(",");

export type Look = LookSpec & {
  name: LookName;
  accentA: string;
  accentB: string;
  accentRgb: string;
  textRgb: string;
  onAccent: string;
  display: string;
  displaySerif: boolean;
  body: string;
  mono: string;
  /** Pixels per design unit: 1 at 1080 on the short side. */
  u: number;
  layout: "wide" | "tall" | "square";
  width: number;
  height: number;
};

export function makeLook(plan: Plan, format: MotionFormat, width: number, height: number): Look {
  const name: LookName = plan.look && plan.look in LOOKS ? plan.look : "graphite";
  const spec = LOOKS[name];
  const room = hex(spec.bg) ?? [0, 0, 0];
  // The brand color leads when it reads on this room; else the look's own.
  let a = hex(spec.accent[0]) as RGB;
  let b = hex(spec.accent[1]) as RGB;
  // Only a color read from the brand's own website; the director's palette
  // guess would fight the look.
  const brand = hex(plan.brand_color ?? "");
  if (brand && contrast(brand, room) >= 2.2 && !(Math.max(...brand) - Math.min(...brand) < 24)) {
    a = brand;
    b = brand;
  }
  const white: RGB = [255, 255, 255];
  const black: RGB = [14, 14, 16];
  const display = loadFace(plan.fonts?.display ?? "Inter Tight", "Inter Tight");
  const body = loadFace(plan.fonts?.body ?? "Inter", "Inter");
  const toHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  return {
    ...spec,
    name,
    accentA: toHex(a),
    accentB: toHex(b),
    accentRgb: rgbOf(a),
    textRgb: rgbOf(hex(spec.text) as RGB),
    onAccent: contrast(a, white) >= contrast(a, black) ? "#ffffff" : "#0e0e10",
    display: display.family,
    displaySerif: display.serif,
    body: body.family,
    mono: monoFont(),
    u: Math.min(width, height) / 1080,
    layout: format === "landscape" ? "wide" : format === "portrait" ? "tall" : "square",
    width,
    height,
  };
}

export const LookContext = createContext<Look | null>(null);

export function useLook(): Look {
  const look = useContext(LookContext);
  if (!look) throw new Error("useLook outside a LookContext");
  return look;
}

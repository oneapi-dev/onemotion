// The math blackboard: a dark flat board, chalk-white ink, and two colours that each mean one quantity
// for the whole film (height is amber, distance a pale blue). No glow, no gradients.
export const BOARD = "#1C2026";
export const INK = "#E8E4DA";
export const MUTED = "#8E8C86";
/** Height (h): the film's accent. */
export const ACCENT = "#F2B544";
/** Distance (x): the second colour, quieter than the accent. */
export const DIST = "#8FB4CF";

export const DISPLAY = "Fraunces";
export const MATH = "Newsreader";
export const TEXT = "Inter";

/** One colour per variable, by its text. */
export const VARS: Record<string, string> = { h: ACCENT, x: DIST };

/** Type scale at 1920 wide. */
export const SIZE = { headline: 68, formula: 120, label: 28 };

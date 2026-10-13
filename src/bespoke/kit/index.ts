// @kit: what a bespoke scene may import besides react and remotion. The
// clock (useFilm) is required; everything else is an optional helper, not a
// template. Scenes are expected to invent their own components.
export { useFilm, type Film, type Beat, type Brand } from "./film";
export { clamp01, outE, inOut, flyE, lin, prog, pop, hitEnv, seeded, kf, typed, remap, mix, type KP } from "./motion";
export { Fit, fit, textW, Chars, Caret, Typewriter, Odometer, CountUp, Highlight, Strike } from "./text";
export { Draw, Ink, path, pointAt, samplePath, type Stroke } from "./draw";
export { useHits, Grain, Burst, Confetti, type Hit } from "./fx";
export { Mark, Window, Phone, Cursor } from "./ui";
export { Sfx, SFX, type SfxName } from "./sound";
export { FONT_NAMES } from "./fonts";

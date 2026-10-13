// @kit: what a bespoke scene may import besides react and remotion. The
// clock (useFilm) is required; everything else is an optional helper, not a
// template. Scenes are expected to invent their own components.
export { useFilm, type Film, type Beat, type Brand } from "./film";
export { Beats, useBeat, type BeatScope } from "./beat";
export { clamp01, outE, inOut, flyE, lin, prog, pop, hitEnv, seeded, kf, typed, remap, mix, type KP } from "./motion";
export { Fit, fit, textW, Chars, Caret, Typewriter, Odometer, CountUp, Highlight, Strike } from "./text";
export { Draw, Ink, path, pointAt, samplePath, type Stroke } from "./draw";
export { Annotate, type AnnotateKind } from "./annotate";
export { useHits, Grain, Burst, Confetti, Whip, type Hit } from "./fx";
export { camAt, project3D, Billboard3D, Particles3D, Floor3D, focusWeight, type Vec3, type Cam3, type CamKey } from "./space";
export { Mark, Window, Phone, Cursor, Notification } from "./ui";
export { Sfx, SFX, type SfxName } from "./sound";
export { FONT_NAMES } from "./fonts";

/* eslint-disable @typescript-eslint/no-explicit-any */
// The 2D studio engine as a scene sees it: untyped, as the original JavaScript is, so shots are written the way
// the aiTrends kit writes them (const { E, V, mood, layer } = s2; rig.drawFigure(g, { ... }); fx2.dust(g, t)).
import * as core from "./core";
import * as rigMod from "./rig2d";
import * as fxMod from "./fx2d";
import * as uiMod from "./ui2d";
import { BASE_MOODS, STYLES } from "./styles";

export const s2: any = core;
export const rig: any = rigMod;
export const fx2: any = fxMod;
export const ui2: any = uiMod;
export const STUDIO_STYLES: any = STYLES;
export const STUDIO_MOODS: any = BASE_MOODS;

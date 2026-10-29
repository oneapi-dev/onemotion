// The reference project's registerShot, kept per film: each shot file registers its shots here.
import type { Shot2D } from "@kit";

export const SHOTS: Record<string, Omit<Shot2D, "id">> = {};
export const registerShot = (id: string, def: Omit<Shot2D, "id">) => {
  SHOTS[id] = def;
};

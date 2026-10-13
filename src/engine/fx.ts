import { createContext, useContext } from "react";
import type { SceneFx } from "./plan";

/** The effects of the scene a card belongs to; cards read them through their headline and number components. */
export const FxContext = createContext<SceneFx>({});
export const useFx = () => useContext(FxContext);

/**
 * A stable pseudo-random number in [0, 1) for a pair of integers: the same
 * letter scrambles to the same glyph on the same frame in every render.
 */
export function noise(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

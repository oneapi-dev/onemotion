import { describe, expect, it } from "vitest";
import { REVEAL_MASK_PAD, REVEAL_TILT, revealDrop } from "./motion";

describe("revealDrop", () => {
  // Display type is set below line-height 1.2, so caps and ascenders reach
  // above the line box; a fifth of the size covers the tallest faces used.
  const overshoot = 0.2;

  it.each([0.96, 0.98, 1.02, 1.1])("keeps a waiting word fully under its mask at line-height %s", (lineHeight) => {
    const size = 200;
    const box = lineHeight * size;
    // The tilt turns the word about its bottom-left corner; its top-left
    // corner rises by box * (1 - cos) while it waits.
    const rise = box * (1 - Math.cos((REVEAL_TILT * Math.PI) / 180));
    const inkTop = revealDrop(size, lineHeight) - rise - overshoot * size;
    const maskBottom = box + REVEAL_MASK_PAD * size;
    expect(inkTop).toBeGreaterThanOrEqual(maskBottom);
  });
});

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Emitting the kit's declarations runs the TypeScript compiler: seconds. */
const EMIT_MS = 30_000;

describe("the kit's API in the prompt", () => {
  it(
    "is the kit as it is now (run `npm run kit:api` after changing the kit)",
    () => {
      const now = execFileSync(process.execPath, ["scripts/kit-api.mjs", "--stdout"], { cwd: process.cwd(), encoding: "utf8" });
      // Line endings are the checkout's business (CRLF on Windows), not the API's.
      expect(readFileSync(path.join(process.cwd(), "src", "bespoke", "kit", "api.txt"), "utf8").replace(/
/g, "
")).toBe(now.replace(/
/g, "
"));
    },
    EMIT_MS,
  );

  it("names the stage and its props, and leaves the runtime's plumbing out", () => {
    const api = readFileSync(path.join(process.cwd(), "src", "bespoke", "kit", "api.txt"), "utf8");
    expect(api).toContain("export declare const World: (props: { of: Record<string, ComponentType>; layout?: WorldLayout;");
    expect(api).toContain("export declare const PriceCount: (props: {");
    for (const internal of ["FilmProvider", "makeCue", "worldCam", "BeatContext"]) expect(api).not.toContain(internal);
    expect(api.length).toBeLessThan(25_000);
  });
});

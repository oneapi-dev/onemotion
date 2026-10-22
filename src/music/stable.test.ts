import { describe, expect, it } from "vitest";
import { tokenLeft } from "./stable";

const jwt = (exp: number) => `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;

describe("a Stable Audio token's time left", () => {
  it("reads the expiry inside the token", () => {
    const now = 1_792_587_530_000;
    expect(tokenLeft(jwt(now / 1000 + 4 * 3600 - 60), now)).toBe("Valid for about 3 h 59 min");
    expect(tokenLeft(jwt(now / 1000 + 20 * 60), now)).toBe("Valid for about 20 min");
    expect(tokenLeft(jwt(now / 1000 - 5), now)).toBe("expired");
  });

  it("says when it is not a token at all", () => {
    expect(tokenLeft("sk_not-a-jwt")).toBe("Not a Stable Audio token");
    expect(tokenLeft(undefined)).toBe("Not a Stable Audio token");
  });
});

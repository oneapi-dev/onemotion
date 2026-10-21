import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { agentPrompt, conceptPrompt, reviewPrompt } = await import("./prompts");
const { describeRecent } = await import("./run");

describe("prompts", () => {
  it("has the creative director write a style brief from the menus", () => {
    const p = conceptPrompt();
    expect(p).toContain('"look": {');
    expect(p).toContain("# STYLE DIRECTIONS");
    expect(p).toContain("- Grainy gradient:");
    expect(p).toContain("# CONCEPTS");
    expect(p).toContain("- Claim, how, result:");
    expect(p).toContain("No template skeleton");
  });

  it("has the agents follow the look and avoid slides, and the review check for them", () => {
    expect(agentPrompt()).toContain("The concept's \"look\" is your style brief");
    expect(agentPrompt()).toContain("Two levels of text at most per beat");
    expect(reviewPrompt()).toContain("6. Story checks");
    expect(reviewPrompt()).toContain("7. Slide checks");
  });

  it("builds every film as one world, and carries the kit's API instead of its source", () => {
    const p = agentPrompt();
    expect(p).toContain("<World of={BEATS} />");
    expect(p).toContain("# @kit API");
    expect(p).not.toContain("overlap={10}");
    expect(p).not.toContain("--- @kit/blocks.tsx ---");
    // The motion designer reads this on every step: it was 119k characters with the kit's source in it.
    expect(p.length).toBeLessThan(60_000);
    // Rules that fought restraint and each other are gone.
    expect(p).not.toContain("no picture holds completely still");
    expect(p).not.toContain("An impact gets a short screen shake");
    expect(reviewPrompt()).toContain("fade or slide out for the next one");
  });

  it("asks the creative director for a story device the viewer can name, not an abstract shape", () => {
    expect(conceptPrompt()).toContain("never an abstract stand-in for an idea (a box, a capsule, a glowing line, particles)");
  });

  it("tells the creative director how recent films looked", () => {
    expect(describeRecent({ style: "s", metaphor: "m", world: "w", genre: "house", direction: "Poster color-block", concept: "Pure typography", display: "Anton" })).toBe(
      'direction "Poster color-block", concept "Pure typography", style "s", metaphor "m", world "w", display font Anton, music house',
    );
    expect(describeRecent({ style: "s", metaphor: "m", world: "w", genre: "house", track: "advertime" })).toBe('style "s", metaphor "m", world "w", music advertime');
  });
});

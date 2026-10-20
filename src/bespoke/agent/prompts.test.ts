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

  it("tells the creative director how recent films looked", () => {
    expect(describeRecent({ style: "s", metaphor: "m", world: "w", genre: "house", direction: "Poster color-block", concept: "Pure typography", display: "Anton" })).toBe(
      'direction "Poster color-block", concept "Pure typography", style "s", metaphor "m", world "w", display font Anton, music house',
    );
    expect(describeRecent({ style: "s", metaphor: "m", world: "w", genre: "house", track: "advertime" })).toBe('style "s", metaphor "m", world "w", music advertime');
  });
});

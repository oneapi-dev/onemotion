import { describe, expect, it } from "vitest";
import { basicBrief, cleanBrief, defaultBrief, defaultIdea, formatLine, ideaFromBrief, siteOf, TEMPLATES, writerPrompt } from "./briefs";

describe("basic briefs", () => {
  it("makes a launch film for OneAPI when nothing is given", () => {
    const b = defaultBrief("");
    expect(b).toMatch(/^Create a 30-second launch film for OneAPI \(oneapi\.id\)\./);
    expect(b).toContain("Read oneapi.id for what it is");
    expect(b).toContain("No voice-over");
    expect(b).toContain("No fake clients, partnerships, statistics");
  });

  it("is about the website given, not OneAPI, when there is one", () => {
    expect(siteOf("https://router.bynara.id/")).toBe("router.bynara.id");
    const b = defaultBrief("https://router.bynara.id/");
    expect(b).toMatch(/^Create a 30-second launch film for router\.bynara\.id\./);
    expect(b).not.toMatch(/OneAPI/);
  });

  it("carries the idea, the look and the language", () => {
    const b = basicBrief({ ...defaultIdea("announcement", "oneapi.id"), idea: "Bayar $2 dapat $10 usage", look: "paper-and-print", language: "English", voice: true });
    expect(b).toContain("The idea: Bayar $2 dapat $10 usage");
    expect(b).toContain('Look: the "Paper and print" style direction');
    expect(b).toContain("Voice-over in English.");
  });
});

describe("the brief writer", () => {
  const site = { url: "https://router.bynara.id", title: "NaraRouter", description: "AI gateway", text: "OpenAI-compatible and Anthropic-compatible APIs" };

  it("asks for a creative director's brief with a timed storyboard, from the site's facts only", () => {
    const { system, user } = writerPrompt({ ...defaultIdea("launch", "router.bynara.id"), idea: "Introducing NaraRouter", seconds: 30 }, site, formatLine("landscape"));
    expect(system).toContain("use only what the WEBSITE and the person's IDEA say");
    expect(system).toContain("Storyboard: 4 to 6 timed sections covering 0 to 30 seconds");
    expect(system).toContain("Deliverable: 16:9, 1920 x 1080, 30 fps, 30 seconds at most.");
    expect(system).toContain("the address router.bynara.id");
    expect(system).not.toMatch(/NaraRouter|OneAPI/);
    expect(user).toContain("IDEA (the person's own words; keep every fact and number exactly): Introducing NaraRouter");
    expect(user).toContain("TEXT: OpenAI-compatible and Anthropic-compatible APIs");
  });

  it("still writes without the website, and every kind has a goal and an opening", () => {
    expect(writerPrompt(defaultIdea("tutorial"), null, formatLine("portrait")).user).toContain("the website could not be read");
    for (const t of TEMPLATES) expect(writerPrompt(defaultIdea(t.id), site, formatLine("square")).system).toContain(`The first 2 seconds show ${t.hook} or the offer.`);
  });

  it("strips a fence around the model's brief and caps its length", () => {
    expect(cleanBrief("Here you go:\n```markdown\nCreate a film.\n```")).toBe("Create a film.");
    expect(cleanBrief("x".repeat(13_000)).length).toBeLessThan(12_100);
  });
});

describe("a rough brief as an idea", () => {
  it("reads the length, the voice-over and the language from it", () => {
    const a = ideaFromBrief("bikin video promosi oneapi.id 30 detik, $2 dapat $10 usage. tanpa voice over", "");
    expect(a.seconds).toBe(30);
    expect(a.voice).toBe(false);
    expect(a.language).toBe("Bahasa Indonesia");
    expect(a.idea).toContain("$2 dapat $10 usage");
    const b = ideaFromBrief("Create a 45 seconds launch film for the product with a voice-over, in English", "router.bynara.id");
    expect(b.seconds).toBe(45);
    expect(b.voice).toBe(true);
    expect(b.language).toBe("English");
    expect(ideaFromBrief("No voice-over is required. Make it 30 seconds max and premium.", "").voice).toBe(false);
  });
});

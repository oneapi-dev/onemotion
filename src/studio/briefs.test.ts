import { describe, expect, it } from "vitest";
import { buildBrief, defaultAnswers, defaultBrief, siteOf, TEMPLATES } from "./briefs";

describe("briefs", () => {
  it("makes a launch promo for OneAPI when nothing is given", () => {
    const b = defaultBrief("");
    expect(b).toMatch(/^A 20-second launch promo for OneAPI \(oneapi\.id\)\./);
    expect(b).toContain("read it from oneapi.id");
    expect(b).toContain("Call to action: try it at oneapi.id.");
    expect(b).toContain("Voice-over: yes, in Bahasa Indonesia.");
  });

  it("is about the website given, not OneAPI, when there is one", () => {
    const b = defaultBrief("https://kopikenangan.co.id/");
    expect(siteOf("https://kopikenangan.co.id/")).toBe("kopikenangan.co.id");
    expect(b).toMatch(/^A 20-second launch promo for kopikenangan\.co\.id\./);
    expect(b).not.toMatch(/OneAPI/);
  });

  it("writes every answer into the brief, and leaves out what is empty", () => {
    const b = buildBrief({
      ...defaultAnswers("tutorial", "oneapi.id"),
      subject: "Call any model from Python",
      points: ["Create a key", "", "Send a request"],
      look: "sketch",
      voice: false,
      language: "English",
      seconds: 30,
    });
    expect(b).toMatch(/^A 30-second how-to for OneAPI \(oneapi\.id\)\./);
    expect(b).toContain("What the viewer will be able to do: Call any model from Python");
    expect(b).toContain("The steps, in order:\n- Create a key\n- Send a request");
    expect(b).toContain("Look: hand-drawn");
    expect(b).toContain("No voice-over");
    expect(b).toContain("Language of every word on screen: English.");
    expect(b).not.toMatch(/\n\n/);
  });

  it("has a story and a goal for every kind of video", () => {
    for (const t of TEMPLATES) {
      const b = buildBrief(defaultAnswers(t.id));
      expect(b).toContain(`Goal: ${t.goal}.`);
      expect(b).toContain(`Story: ${t.story}.`);
    }
  });
});

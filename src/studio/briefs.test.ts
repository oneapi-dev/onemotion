import { describe, expect, it } from "vitest";
import { applySuggestion, buildBrief, defaultAnswers, defaultBrief, readSuggestion, siteOf, suggestPrompt, TEMPLATES } from "./briefs";

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

describe("custom briefs and AI suggestions", () => {
  it("names a custom video's own kind and goal", () => {
    const b = buildBrief({ ...defaultAnswers("custom", "oneapi.id"), kind: "a recruiting video for backend engineers", goal: "get engineers to apply." });
    expect(b).toMatch(/^A 20-second video: a recruiting video for backend engineers for OneAPI \(oneapi\.id\)\./);
    expect(b).toContain("Goal: get engineers to apply.");
  });

  it("asks the model for the message only, from the website, in the brief's language", () => {
    const { system, user } = suggestPrompt({ ...defaultAnswers("feature", ""), subject: "MiMo V2.6" }, { url: "https://oneapi.id", title: "OneAPI", description: "One key", text: "Models: MiMo V2.6" });
    expect(system).toContain("Use ONLY what the website says");
    expect(system).toContain("Write in Bahasa Indonesia");
    expect(user).toContain("THE PERSON'S OWN ANGLE (keep it): MiMo V2.6");
    expect(user).toContain("TEXT: Models: MiMo V2.6");
  });

  it("reads a model's answer safely and keeps what the person typed", () => {
    const s = readSuggestion({ product: "OneAPI", subject: "Satu key untuk semua model", points: ["Claude, GPT, Gemini", 42, "Bayar sesuai pakai", "extra"], cta: "Coba di oneapi.id", audience: "Aliens", junk: true });
    expect(s.points).toEqual(["Claude, GPT, Gemini", "Bayar sesuai pakai", "extra"]);
    expect(s.audience).toBe("Developers");
    const a = applySuggestion({ ...defaultAnswers("launch"), subject: "Mine", points: ["", "Also mine", ""] }, s);
    expect(a.subject).toBe("Mine");
    expect(a.points).toEqual(["Claude, GPT, Gemini", "Also mine", "extra"]);
    expect(a.product).toBe("OneAPI");
    expect(a.cta).toBe("Coba di oneapi.id");
  });
});

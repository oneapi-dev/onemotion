import { describe, expect, it } from "vitest";
import { applySuggestion, buildBrief, defaultAnswers, defaultBrief, improvePrompt, readImproved, readSuggestion, siteOf, suggestPrompt, TEMPLATES } from "./briefs";

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
      look: "paper-and-print",
      voice: false,
      language: "English",
      seconds: 30,
    });
    expect(b).toMatch(/^A 30-second how-to for OneAPI \(oneapi\.id\)\./);
    expect(b).toContain("What the viewer will be able to do: Call any model from Python");
    expect(b).toContain("The steps, in order (each shown in use, not listed):\n- Create a key\n- Send a request");
    expect(b).toContain("Look: the \"Paper and print\" style direction");
    expect(b).toContain("No voice-over");
    expect(b).toContain("Language of every word on screen: English.");
    expect(b).not.toMatch(/\n\n/);
  });

  it("has a goal and an opening for every kind of video, and leaves the order to the art director", () => {
    for (const t of TEMPLATES) {
      const b = buildBrief(defaultAnswers(t.id));
      expect(b).toContain(`Goal: ${t.goal}.`);
      expect(b).toContain(`Opening: within 2 seconds, ${t.hook}.`);
      expect(b).not.toMatch(/Story:/);
    }
  });
});

describe("custom briefs and AI suggestions", () => {
  it("names a custom video's own kind and goal", () => {
    const b = buildBrief({ ...defaultAnswers("custom", "oneapi.id"), kind: "a recruiting video for backend engineers", goal: "get engineers to apply." });
    expect(b).toMatch(/^A 20-second film for OneAPI \(oneapi\.id\)\.\nKind of video: a recruiting video for backend engineers\n/);
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

describe("the offer", () => {
  const promo = {
    ...defaultAnswers("custom", "oneapi.id"),
    kind: "Video Promosi OneAPI.id",
    about: "AI Gateway untuk developer yang menyediakan akses ke berbagai model AI melalui satu API.",
    offer: "Bayar $2, dapat $10 usage; DeepSeek V4.1 dapat 3x usage jadi $30",
    subject: "Seperti OpenRouter, tapi harga lebih terjangkau",
    goal: "developer daftar hari ini",
    cta: "Daftar sekarang di oneapi.id",
    seconds: 30,
    voice: false,
  };

  it("opens the film on the offer, says the kind once, and keeps competitors to text", () => {
    const b = buildBrief(promo);
    expect(b).toMatch(/^A 30-second film for OneAPI \(oneapi\.id\)\.\nKind of video: Video Promosi OneAPI\.id\n/);
    expect(b).toContain("The offer, which opens the film (show it exactly as written): Bayar $2, dapat $10 usage; DeepSeek V4.1 dapat 3x usage jadi $30");
    expect(b).toContain("Opening: within 2 seconds, the offer.");
    expect(b).toContain("Goal: developer daftar hari ini.");
    expect(b).toContain("a competitor named only to compare appears as text, without its logo");
  });

  it("lets the AI find the offer on the website, and keeps the person's own", () => {
    expect(suggestPrompt(defaultAnswers("launch"), { url: "u", title: "t", description: "d", text: "x" }).system).toContain('"offer"');
    const s = readSuggestion({ offer: "Go $2 for 14 days" });
    expect(s.offer).toBe("Go $2 for 14 days");
    expect(applySuggestion({ ...defaultAnswers("launch"), offer: "Mine" }, s).offer).toBe("Mine");
    expect(applySuggestion(defaultAnswers("launch"), s).offer).toBe("Go $2 for 14 days");
  });
});

describe("improve with AI", () => {
  it("asks the model to sort the brief, keep its facts and never make the offer the goal", () => {
    const { system, user } = improvePrompt("promo oneapi, $2 dapat $10", { url: "https://oneapi.id", title: "OneAPI", description: "AI gateway", text: "Go $2" });
    expect(system).toContain("Keep every fact, number, price, name and promise exactly");
    expect(system).toContain("An offer is never the goal");
    expect(user).toContain("BRIEF:\npromo oneapi, $2 dapat $10");
    expect(user).toContain("TEXT: Go $2");
  });

  it("turns the model's sorting into a full brief, with safe defaults for anything odd", () => {
    const a = readImproved(
      { template: "custom", kind: "Video promosi", offer: "Bayar $2 dapat $10", subject: "Satu API untuk semua model", points: ["Kompatibel OpenAI"], goal: "daftar hari ini", seconds: 300, look: "nope", language: "Bahasa Indonesia", voice: "yes" },
      "oneapi.id",
    );
    expect(a.template).toBe("custom");
    expect(a.seconds).toBe(60);
    expect(a.look).toBe("auto");
    expect(a.voice).toBe(false);
    const b = buildBrief(a);
    expect(b).toContain("Kind of video: Video promosi");
    expect(b).toContain("The offer, which opens the film (show it exactly as written): Bayar $2 dapat $10");
    expect(b).toContain("Goal: daftar hari ini.");
    expect(readImproved("garbage", "").template).toBe("launch");
  });
});

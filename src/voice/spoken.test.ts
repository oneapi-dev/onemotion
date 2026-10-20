import { describe, expect, it } from "vitest";
import { DEFAULT_PRONUNCIATIONS, displayWords, mergeLexicons, numberWords, speech, spoken } from "./spoken";

describe("numberWords", () => {
  it("says whole numbers in Indonesian", () => {
    expect(numberWords(0, "id")).toBe("nol");
    expect(numberWords(5, "id")).toBe("lima");
    expect(numberWords(11, "id")).toBe("sebelas");
    expect(numberWords(17, "id")).toBe("tujuh belas");
    expect(numberWords(25, "id")).toBe("dua puluh lima");
    expect(numberWords(100, "id")).toBe("seratus");
    expect(numberWords(1000, "id")).toBe("seribu");
    expect(numberWords(1250, "id")).toBe("seribu dua ratus lima puluh");
    expect(numberWords(2000000, "id")).toBe("dua juta");
  });

  it("says whole numbers in English", () => {
    expect(numberWords(5, "en")).toBe("five");
    expect(numberWords(17, "en")).toBe("seventeen");
    expect(numberWords(42, "en")).toBe("forty-two");
    expect(numberWords(100, "en")).toBe("one hundred");
    expect(numberWords(1250, "en")).toBe("one thousand two hundred fifty");
    expect(numberWords(3000000, "en")).toBe("three million");
  });
});

describe("spoken", () => {
  it("reads prices, multiples and domains as an Indonesian speaker says them", () => {
    expect(spoken("Akun baru dapat $5, plan mulai $2 untuk 5x pemakaian di oneapi.id", "id")).toBe(
      "Akun baru dapat lima dolar, plan mulai dua dolar untuk lima kali lipat pemakaian di oneapi dot id",
    );
    expect(spoken("Input $0.07 per 1M token", "id")).toBe("Input nol koma nol tujuh dolar per satu juta token");
    expect(spoken("Hemat 40% dengan 10k+ developer", "id")).toBe("Hemat empat puluh persen dengan lebih dari sepuluh ribu developer");
  });

  it("reads them as an English speaker says them", () => {
    expect(spoken("New accounts get $5, plans start at $2 for 5x the usage on oneapi.id", "en")).toBe(
      "New accounts get five dollars, plans start at two dollars for five times the usage on oneapi dot I D",
    );
    expect(spoken("Input $0.07 per 1M tokens, 40% cheaper, 10k+ developers", "en")).toBe(
      "Input zero point zero seven dollars per one million tokens, forty percent cheaper, over ten thousand developers",
    );
    expect(spoken("A 1M context", "en")).toBe("A one million context");
  });

  it("does not say a multiple twice", () => {
    expect(spoken("Pemakaian 5x lipat", "id")).toBe("Pemakaian lima kali lipat");
    expect(spoken("5x faster, 3 times over", "en")).toBe("five times faster, three times over");
  });

  it("leaves other languages and plain text alone", () => {
    expect(spoken("Precio $5", "es")).toBe("Precio $5");
    expect(spoken("Tanpa angka sama sekali.", "id")).toBe("Tanpa angka sama sekali.");
  });
});

describe("pronunciations", () => {
  const lexicon = [
    { term: "OneAPI", say: "wanapi" },
    { term: "oneapi.id", say: "wanapi" },
    { term: "AI", say: "ei ai", lang: "id" },
    { term: "AI", say: "A I", lang: "en" },
  ];

  it("says the brand as configured and leaves the display text alone", () => {
    const s = speech("Coba OneAPI di oneapi.id, mulai $5", "id", lexicon);
    expect(s.tts).toBe("Coba wanapi di wanapi, mulai lima dolar");
    expect(s.display).toBe("Coba OneAPI di oneapi.id, mulai $5");
  });

  it("matches the longest term first, in any case, only on word edges", () => {
    expect(spoken("ONEAPI and oneapi.id", "en", lexicon)).toBe("wanapi and wanapi");
    expect(spoken("OneAPIs", "en", lexicon)).toBe("OneAPIs");
    expect(spoken("MAIN AI", "en", lexicon)).toBe("MAIN A I");
  });

  it("uses each language's own pronunciation, and capital terms match only in capitals", () => {
    expect(spoken("AI gateway", "id", lexicon)).toBe("ei ai gateway");
    expect(spoken("AI gateway", "en", lexicon)).toBe("A I gateway");
    expect(spoken("pantai ai", "id", lexicon)).toBe("pantai ai");
  });

  it("applies pronunciations in languages without number rules", () => {
    expect(spoken("Precio OneAPI $5", "es", lexicon)).toBe("Precio wanapi $5");
  });

  it("puts spoken times back on the words as written", () => {
    const s = speech("Try OneAPI for $5", "en", lexicon);
    expect(s.tts).toBe("Try wanapi for five dollars");
    // One character a tenth of a second, as a voice aligned it.
    const times = { start: [...s.tts].map((_, i) => i / 10), end: [...s.tts].map((_, i) => (i + 1) / 10) };
    const words = displayWords(s, times);
    expect(words.map((w) => w.text)).toEqual(["Try", "OneAPI", "for", "$5"]);
    expect(words[1]).toEqual({ text: "OneAPI", start: 0.4, end: 1 });
    // "$5" spans all of "five dollars".
    expect(words[3]).toEqual({ text: "$5", start: 1.5, end: 2.7 });
  });

  it("gives a word with nothing spoken for it its neighbour's time", () => {
    const s = speech("Hello ~ world", "en", [{ term: "~", say: "" }]);
    const times = { start: [...s.tts].map((_, i) => i), end: [...s.tts].map((_, i) => i + 1) };
    const words = displayWords(s, times);
    expect(words[1].start).toBe(words[0].end);
  });
});

describe("mergeLexicons", () => {
  it("lets a project's pronunciation win over the studio's for the same term and language", () => {
    const merged = mergeLexicons([{ term: "oneapi", say: "one A P I" }], DEFAULT_PRONUNCIATIONS);
    expect(spoken("OneAPI di oneapi.id", "id", merged)).toBe("one A P I di wanapi");
  });
});

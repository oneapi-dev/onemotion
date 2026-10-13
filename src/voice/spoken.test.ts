import { describe, expect, it } from "vitest";
import { numberWords, spoken } from "./spoken";

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

  it("leaves other languages and plain text alone", () => {
    expect(spoken("Precio $5", "es")).toBe("Precio $5");
    expect(spoken("Tanpa angka sama sekali.", "id")).toBe("Tanpa angka sama sekali.");
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { addColorEdit, addEdit, colorChoices, contrast, distinctColor, hex6, mayOverflow, onScreen, pickText, pinnedNote, placeOf, recolor, replaceScreenText } from "./textEdit";

vi.mock("server-only", () => ({}));
const { sceneColors, screenTexts } = await import("./screenText");
const { checkScene } = await import("./check");

function example(name: string): Record<string, string> {
  const dir = path.join(process.cwd(), "src", "bespoke", "examples", name, "scene");
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f)) files[`scene/${path.relative(dir, p).split(path.sep).join("/")}`] = readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return files;
}

describe("screenTexts", () => {
  it("finds the words on screen and leaves style, sounds and directions out", () => {
    const texts = screenTexts(example("onemotion")).map((t) => t.text);
    for (const w of ["Satu kalimat.", "Promo 20 detik untuk aplikasi kasirmu", "Buat video", "Jadi MP4.", "Ceritakan videomu. Sisanya kami kerjakan."]) expect(texts).toContain(w);
    for (const w of ["whoosh", "tick", "right", "Bricolage Grotesque", "Instrument Sans"]) expect(texts).not.toContain(w);
  });

  it("marks text built from code as something only the AI can change", () => {
    const t = screenTexts(example("onemotion")).find((x) => x.text.startsWith("Merender"));
    expect(t?.dynamic).toBe(true);
    expect(() => replaceScreenText(example("onemotion"), t!, "x")).toThrow(/Improve with AI/);
  });

  it("reads JSX text, word lists and constants", () => {
    const files = {
      "scene/index.tsx": `import { AbsoluteFill } from "remotion";
const DISPLAY = "Space Grotesk";
const LINE = "Isi sepuluh.";
const APPS = ["Calendar", "Mail"];
export const fonts = { display: "Space Grotesk" };
export const background = "#fff";
export default function Scene() {
  return (
    <AbsoluteFill style={{ fontFamily: DISPLAY, color: "#111" }}>
      <h1>  Jadi   lima belas.  </h1>
      <p title="Top up now">{LINE}</p>
      {APPS.map((a) => <span key={a}>{a}</span>)}
      <b>{true ? "Gas AI" : "Nanti"}</b>
    </AbsoluteFill>
  );
}`,
    };
    const texts = screenTexts(files).map((t) => t.text);
    expect(texts).toEqual(["Isi sepuluh.", "Calendar", "Mail", "Jadi lima belas.", "Top up now", "Gas AI", "Nanti"]);
  });
});

/** A whole-film check runs the TypeScript compiler: about 3 s on its own, longer while the rest of the suite runs. */
const TYPECHECK_MS = 20_000;

describe("replaceScreenText", () => {
  it("changes one piece of text and the scene still passes the check", () => {
    const files = example("onemotion");
    const t = screenTexts(files).find((x) => x.text === "Satu kalimat.")!;
    const next = replaceScreenText(files, t, "Bonus 50% \"hari ini\".");
    expect(next[t.file]).toContain('text={"Bonus 50% \\"hari ini\\"."}');
    const changed = Object.keys(files).filter((f) => files[f] !== next[f]);
    expect(changed).toEqual([t.file]);
    expect(checkScene(next).ok).toBe(true);
  }, TYPECHECK_MS);

  it("writes JSX text safely, braces and quotes included", () => {
    const files = example("onemotion");
    const t = screenTexts(files).find((x) => x.text === "Buat video")!;
    const next = replaceScreenText(files, t, "Buat {video} <sekarang>");
    expect(next[t.file]).toContain('{"Buat {video} <sekarang>"}');
    expect(checkScene(next).ok).toBe(true);
    const plain = replaceScreenText(files, t, "Mulai");
    expect(checkScene(plain).ok).toBe(true);
    expect(plain[t.file]).toContain(">Mulai<");
  }, TYPECHECK_MS * 2);

  it("refuses when the files changed since the text was read", () => {
    const files = example("onemotion");
    const t = screenTexts(files).find((x) => x.text === "Buat video")!;
    expect(() => replaceScreenText({ ...files, [t.file]: "" }, t, "x")).toThrow(/changed/);
  });
});

describe("finding text on the preview", () => {
  const items = screenTexts(example("onemotion"));

  it("lists what is on screen now, including a line still typing", () => {
    const now = onScreen(items, "01 / 04 · BRIEF Satu kalimat. Promo 20 detik untuk a");
    expect(now.map((t) => t.text)).toEqual(["BRIEF", "Satu kalimat.", "Promo 20 detik untuk aplikasi kasirmu"]);
    // Sharing a first word is not being on screen.
    expect(onScreen(items, "02 / 04 · ART DIRECTOR Jadi konsep.").map((t) => t.text)).toEqual(["ART DIRECTOR", "Jadi konsep."]);
  });

  it("picks the text a click landed on", () => {
    expect(pickText(items, "Satu kalimat.")?.text).toBe("Satu kalimat.");
    expect(pickText(items, "Promo 20 detik untuk a")?.text).toBe("Promo 20 detik untuk aplikasi kasirmu");
    expect(pickText(items, "zzz")).toBeNull();
  });
});

describe("hand edits", () => {
  it("keeps one entry per original text, and drops it when changed back", () => {
    let e = addEdit([], "Satu kalimat.", "Bonus 50%.");
    e = addEdit(e, "Bonus 50%.", "Bonus 50% hari ini.");
    expect(e).toEqual([{ was: "Satu kalimat.", now: "Bonus 50% hari ini." }]);
    expect(addEdit(e, "Bonus 50% hari ini.", "Satu kalimat.")).toEqual([]);
  });

  it("warns when new words are much longer", () => {
    expect(mayOverflow("Satu kalimat.", "Satu kalimat saja.")).toBe(false);
    expect(mayOverflow("Satu kalimat.", "Bonus top-up 50% hanya sampai minggu depan")).toBe(true);
  });
});

describe("colours", () => {
  it("reads the colours a scene uses, most used first, and its background", () => {
    const { colors, background } = sceneColors(example("onemotion"));
    expect(background).toBe("#121417");
    expect(colors.map((c) => c.value)).toEqual(expect.arrayContaining(["#FF5B1F", "#F1EEE8", "#121417"]));
    expect(colors[0].uses).toBeGreaterThanOrEqual(colors[colors.length - 1].uses);
  });

  it("swaps one colour everywhere, in every way it is written, alpha kept", () => {
    const files = { "scene/a.tsx": `const A = "#ff5b1f"; const B = "#FF5B1F80"; const C = "rgba(255, 91, 31, 0.4)"; const D = "#ff5b1e"; const E = \`linear-gradient(#f5b, rgb(255,91,31))\`;` };
    const out = recolor(files, "#FF5B1F", "#2f6bff")["scene/a.tsx"];
    expect(out).toBe(`const A = "#2F6BFF"; const B = "#2F6BFF80"; const C = "rgba(47, 107, 255, 0.4)"; const D = "#ff5b1e"; const E = \`linear-gradient(#f5b, rgb(47, 107, 255))\`;`);
  });

  it("recolours the opening film and it still passes the check", () => {
    const next = recolor(example("onemotion"), "#FF5B1F", "#2F6BFF");
    expect(Object.values(next).join("")).not.toMatch(/#FF5B1F/i);
    expect(checkScene(next).ok).toBe(true);
  }, TYPECHECK_MS);

  it("offers the brand first, then curated neutrals and accents, never the colour itself", () => {
    const groups = colorChoices(["#ff5b1f", "#111111", "bad"], "#FF5B1F");
    expect(groups[0]).toEqual({ label: "Brand", colors: ["#111111"] });
    expect(groups.flatMap((g) => g.colors)).not.toContain("#FF5B1F");
  });

  it("never makes two of the scene's colours the same string", () => {
    expect(distinctColor("#2F6BFF", ["#FF5B1F", "#2F6BFF"])).toBe("#2F6BFE");
    expect(distinctColor("#2F6BFF", ["#2F6BFF", "#2F6BFE"])).toBe("#2F6BFD");
    expect(distinctColor("#12A150", ["#FF5B1F"])).toBe("#12A150");
  });

  it("measures contrast like WCAG, and keeps one swap per original colour", () => {
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
    expect(hex6("#abc")).toBe("#AABBCC");
    let e = addColorEdit([], "#FF5B1F", "#2F6BFF");
    e = addColorEdit(e, "#2F6BFF", "#12A150");
    expect(e).toEqual([{ was: "#FF5B1F", now: "#12A150" }]);
    expect(addColorEdit(e, "#12A150", "#FF5B1F")).toEqual([]);
  });
});

describe("notes pinned to the video", () => {
  it("names the place on the frame in words", () => {
    expect(placeOf(0.1, 0.1)).toBe("the top left");
    expect(placeOf(0.5, 0.5)).toBe("the middle");
    expect(placeOf(0.9, 0.5)).toBe("the middle right");
    expect(placeOf(0.5, 0.9)).toBe("the bottom");
  });

  it("gives the editor the time, the scene, the place and the words with the note", () => {
    const n = pinnedNote("this headline is too big", { frame: 95, x: 0.2, y: 0.25, beat: "b1", words: "Satu kalimat." }, 30);
    expect(n).toBe('At 0:03.2 (frame 95, in b1), at the top left of the frame (20% across, 25% down), on "Satu kalimat.": this headline is too big');
    expect(pinnedNote("calmer", null, 30)).toBe("calmer");
  });
});

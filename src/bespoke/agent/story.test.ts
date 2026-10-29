import { describe, expect, it } from "vitest";
import { briefLines, crowdedClose, handTyped, isKinetic, isSlides, kineticGuard, silentBeats, slideIssues } from "./story";

const brief = `Create a premium promotional motion video for **OneAPI (https://oneapi.id)**, announcing a **LIMITED-TIME 50% TOP-UP BONUS**.

**MAIN MESSAGE:**

**TOP UP $10 → GET $15**

**+$5 BONUS CREDIT**

Create a sense of urgency through restrained, premium typography:

**“50% BONUS.”**

**“MORE CREDIT. SAME PRICE.”**

**“LIMITED TIME ONLY.”**

**TOP UP NOW**`;

const beats = (...says: string[]) => says.map((s) => ({ says: s }));

describe("story or slides", () => {
  it("finds the lines a brief sets apart, not its headings", () => {
    const lines = briefLines(brief);
    expect(lines).toEqual(expect.arrayContaining(["top up $10 → get $15", "+$5 bonus credit", "50% bonus.", "more credit. same price.", "limited time only.", "top up now"]));
    expect(lines).not.toContain("main message:");
  });

  it("calls a concept made of the brief's taglines slides (the films the cheap and the strong model made)", () => {
    expect(isSlides(beats("TOP UP $10 → GET $15", "50% BONUS.", "+$5 BONUS CREDIT", "OpenAI & Anthropic compatible", "Claude Code, Codex, Cursor", "MORE CREDIT. SAME PRICE.", "50% TOP-UP BONUS $10 → $15 LIMITED TIME ONLY TOP UP NOW oneapi.id"), brief)).toBe(true);
    expect(isSlides(beats("TOP UP $10 → GET $15", "MORE CREDIT. SAME PRICE.", "+$5 BONUS CREDIT", "OpenAI & Anthropic compatible", "50% BONUS.", "LIMITED TIME ONLY.", "TOP UP NOW"), brief)).toBe(true);
  });

  it("lets a story through, with the brief's lines placed in it", () => {
    expect(isSlides(beats("3 agents running. 2 left.", "$0.40 left", "50% BONUS.", "The work keeps going", "MORE CREDIT. SAME PRICE.", "TOP UP NOW"), brief)).toBe(false);
  });

  it("sees slides in a brief that lists its facts one per line, without quotes, but never in a storyboard", () => {
    const list = ["collaborasi antara nararouter x fenrir", "jadi Deepseek v4.1 Flash 1017 Fast", "", "pricing input US$0.30   > $0.19", "Output US$1.20   > $0.81", "Cache US$0.006  > $0.0042", "", "Speed token up to 350", "Cache hit rate up to 95%", "", "buruan cobain sekarang", "", "FROM THE FORM: Length: about 30 seconds."].join("\n");
    // The film the cheap model made: one price per beat, in the brief's order.
    expect(isSlides(beats("Deepseek v4.1 Flash 1017 Fast", "Lewat NaraRouter, hosted by Fenrir", "Input US$0.30 > $0.19", "Output US$1.20 > $0.81", "Cache US$0.006 > $0.0042 · Speed token up to 350 · Cache hit rate up to 95%", "Buruan cobain sekarang"), list)).toBe(true);
    expect(isSlides(beats("Agent stalls mid-answer", "One request, one route", "Three prices fall at once", "Speed you can feel", "Buruan cobain sekarang"), list)).toBe(false);
    expect(isSlides(beats("Scene one", "Scene two", "Scene three"), "Scene 1 (0-3 s): Scene one\nScene 2 (3-6 s): Scene two\nScene 3 (6-9 s): Scene three")).toBe(false);
  });

  it("counts the beats a scene leaves without a sound", () => {
    expect(silentBeats(5, { "scene/a.tsx": `<Sfx name="whoosh" at={0} /> <Sfx name="pop" at={9} />` })).toBe(3);
    expect(silentBeats(2, { "scene/a.tsx": `<Sfx name="whoosh" at={0} /><Sfx name="pop" at={9} /><Sfx name="tick" at={20} />` })).toBe(0);
    // A World plays each of its moves: four beats, three moves, one more sound.
    expect(silentBeats(4, { "scene/index.tsx": `<World of={BEATS} />`, "scene/beats/b1.tsx": `<Sfx name="pop" at={9} />` })).toBe(0);
    expect(silentBeats(4, { "scene/index.tsx": `<World of={BEATS} sound={false} />`, "scene/beats/b1.tsx": `<Sfx name="pop" at={9} />` })).toBe(3);
  });
});

describe("slides in the code", () => {
  it("flags a stage that plays the beats one after another in one place, and beats that fade out as they end", () => {
    // What the three films the desktop app kept were built from: <Beats overlap>, every beat fading out on `len`.
    const issues = slideIssues({
      "scene/index.tsx": "<Beats of={BEATS} overlap={10} />",
      "scene/beats/b1.tsx": "const exit = prog(t, len - 4, len + 8);\nreturn <div style={{ position: \"absolute\", inset: 0, opacity: 1 - exit }} />",
      "scene/beats/b2.tsx": "return <div style={{ opacity: 1 - prog(t, len - 2, len + 10) }} />",
      "scene/beats/b3.tsx": "const inP = prog(t, 0, 18);\nreturn <div style={{ opacity: inP }} />",
    });
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/<World of=\{BEATS\} \/>/);
    expect(issues[1]).toMatch(/^b1, b2 fade out as they end/);
  });

  it("lets one world through: stations that stay, an exit that is not on the beat's end", () => {
    expect(slideIssues({ "scene/index.tsx": "<World of={BEATS} layout=\"zigzag\" />", "scene/beats/b1.tsx": "const out = prog(t, 40, 52);\nreturn <div style={{ opacity: 1 - out }} />" })).toEqual([]);
  });
});

describe("the close", () => {
  it("flags a close crammed with every line of the brief, not a clean lockup", () => {
    expect(crowdedClose(beats("Late build", "ONEAPI 50% TOP-UP BONUS $10 → $15 +$5 BONUS CREDIT MORE CREDIT. SAME PRICE. 50% BONUS. LIMITED TIME ONLY. TOP UP NOW oneapi.id"))).toBe(true);
    expect(crowdedClose(beats("Late build", "OneAPI. $10 → $15, limited time. TOP UP NOW oneapi.id"))).toBe(false);
  });
});

describe("handTyped", () => {
  const ids = ["b1", "b2", "b3"];
  it("names the beats that place their words by hand, the close excepted", () => {
    const files = {
      "scene/beats/b1.tsx": `import { KineticType } from "@kit";\nexport default () => <KineticType t={0} shots={[]} font="A" />;`,
      "scene/beats/b2.tsx": `export default () => <div>WAKTU.</div>;`,
      "scene/beats/b3.tsx": `export default () => <LogoLockup />;`,
    };
    expect(handTyped(files, ids)).toEqual(["b2"]);
  });
  it("counts a shared component built on the engine", () => {
    const files = {
      "scene/components/Run.tsx": `export const Run = () => <KineticType t={0} shots={[]} font="A" />;`,
      "scene/beats/b1.tsx": `import { Run } from "../components/Run";\nexport default () => <Run />;`,
      "scene/beats/b2.tsx": `import { Word } from "../components/Word";\nexport default () => <Word />;`,
      "scene/components/Word.tsx": `export const Word = () => <span />;`,
    };
    expect(handTyped(files, ids)).toEqual(["b2"]);
  });
});

describe("isKinetic", () => {
  it("reads the direction and the concept", () => {
    expect(isKinetic({ look: { direction: "Kinetic type, dengan Swiss-grid datar" } })).toBe(true);
    expect(isKinetic({ look: { concept: "Kinetic launch on the beat" } })).toBe(true);
    expect(isKinetic({ look: { direction: "Flat vector", concept: "Object metaphor" } })).toBe(false);
  });
});

describe("kineticGuard", () => {
  const files = {
    "scene/beats/b1.tsx": `import { KineticType } from "@kit";\nexport default () => <KineticType t={0} shots={[]} font="A" />;`,
    "scene/beats/b2.tsx": `import { Run } from "../components/Run";\nexport default () => <Run />;`,
    "scene/components/Run.tsx": `export const Run = () => <KineticType t={0} shots={[]} font="A" />;`,
    "scene/beats/b3.tsx": `export default () => <LogoLockup />;`,
  };
  const guard = kineticGuard(() => files, ["b1", "b2", "b3"]);
  it("refuses a beat or a shared component losing the engine", () => {
    expect(guard("scene/beats/b1.tsx", `export default () => <div>WAKTU</div>;`)).toMatch(/b1/);
    expect(guard("scene/components/Run.tsx", `export const Run = () => <div />;`)).toMatch(/b2/);
  });
  it("lets the shots change, and leaves the close free", () => {
    expect(guard("scene/beats/b1.tsx", `export default () => <><Box /><KineticType t={0} shots={[]} font="B" /></>;`)).toBeNull();
    expect(guard("scene/beats/b3.tsx", `export default () => <div>oneapi.id</div>;`)).toBeNull();
  });
});

describe("isKinetic, narrowly", () => {
  it("is Kinetic type and the kinetic launch only, not every look with the word in it", () => {
    expect(isKinetic({ look: { direction: "Kinetic editorial" } })).toBe(false);
    expect(isKinetic({ look: { direction: "Kinetic type" } })).toBe(true);
  });
});

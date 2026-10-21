import { describe, expect, it, vi } from "vitest";
import { baselineFiles, closeLine, gutted, kindOf, lines, priceChange, worldOf } from "./baseline";
import { codeSize, thinness } from "./floor";
import { normalizeConcept } from "./concept";
import { beatFile } from "./parallel";

vi.mock("server-only", () => ({}));
const { checkScene } = await import("../check");
const { screenTexts } = await import("../screenText");

const concept = normalizeConcept({
  title: "Fifteen from Ten",
  palette: { bg: "#F4F2EC", ink: "#141414", accent: "#2F6BFF", support: "#8A8F96" },
  typography: { display: "Space Grotesk", text: "Inter", mono: "JetBrains Mono" },
  beats: [
    { says: "TOP UP $10 → GET $15", shows: "the price" },
    { says: "2 a.m., the agent is mid-build", shows: "a console streaming a request to the API" },
    { says: "Credits hit zero mid-answer", shows: "the stream freezes" },
    { says: "One top-up keeps it alive", shows: "the bar refills" },
    { says: "50% TOP-UP BONUS $10 → $15 LIMITED TIME ONLY TOP UP NOW oneapi.id", shows: "the logo lockup" },
  ],
});
const beats = concept.beats.map((b) => ({ id: b.id, says: b.says, shows: b.shows }));
const brand = { name: "OneAPI", url: "oneapi.id" };
/** A whole-film check runs the TypeScript compiler: seconds on its own, longer while the rest of the suite runs. */
const TYPECHECK_MS = 20_000;

describe("the baseline film", () => {
  it("picks each beat's moment from its words", () => {
    expect(beats.map((b, i) => kindOf(b, i === beats.length - 1))).toEqual(["price", "code", "headline", "headline", "close"]);
  });

  it("splits a long headline into two balanced lines", () => {
    expect(lines("Credits hit zero mid-answer, then the stream freezes")).toContain("\n");
    expect(lines("One top-up")).toBe("One top-up");
  });

  it("writes a whole film that passes the scene check and the typecheck, and shows every beat's words", () => {
    const files = baselineFiles(concept, beats, brand);
    const r = checkScene(files);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    const shown = screenTexts(files).map((t) => t.text.replace(/\n/g, " ")).join(" | ");
    for (const b of beats.slice(0, 4)) expect(shown).toContain(b.says);
    // The baseline adds no number of its own: with the beats' words as the facts, the facts check passes.
    expect(checkScene(files, beats.map((b) => b.says).join("\n")).errors).toEqual([]);
  }, TYPECHECK_MS);

  it("stages the film as one world the camera travels through, with no beat fading out like a slide", () => {
    const files = baselineFiles(concept, beats, brand);
    expect(files["scene/index.tsx"]).toContain("<World of={BEATS}");
    expect(files["scene/index.tsx"]).not.toContain("<Beats");
    for (const b of beats) expect(files[beatFile(b.id)]).not.toMatch(/len\s*-|1 - out/);
    // The World runs the opening station ahead, so the beats keep their plain clocks.
    expect(files[beatFile("b1")]).toContain("const t = useCurrentFrame();");
  });

  it("shapes the world from the concept's camera words, in English or Indonesian", () => {
    expect(worldOf({ title: "x", camera: "Kamera bergerak horizontal mengikuti garis permintaan, sesekali menukik tajam ke detail angka" })).toEqual({ layout: "row", move: "swoop" });
    expect(worldOf({ title: "x", camera: "the camera scrolls down the page, gliding" })).toEqual({ layout: "column", move: "glide" });
    expect(worldOf({ title: "x", camera: "whip pans across a zigzag of panels" })).toEqual({ layout: "zigzag", move: "whip" });
    // Nothing named: the title picks the shape, the same one every time.
    expect(worldOf({ title: "Dua meter", camera: "" })).toEqual(worldOf({ title: "Dua meter", camera: "" }));
  });

  it("closes a collaboration on both marks and both names, and still passes the check", () => {
    const files = baselineFiles(concept, beats, { ...brand, partner: "Acme" });
    const close = files[beatFile("b5")];
    expect(close).toContain("<CoMark");
    expect(close).toContain("OneAPI × Acme");
    const r = checkScene(files);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  }, TYPECHECK_MS);

  it("never puts the same moment in two beats in a row", () => {
    const two = [
      { id: "b1", says: "Call the API", shows: "a request" },
      { id: "b2", says: "One API. Real models.", shows: "the console" },
      { id: "b3", says: "Done", shows: "the logo" },
    ];
    const files = baselineFiles(concept, two, brand);
    expect(files[beatFile("b1")]).toContain("TerminalRun");
    expect(files[beatFile("b2")]).not.toContain("TerminalRun");
  });

  it("counts a price beat's first change with the decimals of the new price", () => {
    expect(priceChange("TOP UP $10 → GET $15")).toEqual({ from: 10, to: 15, decimals: 0 });
    // Sub-dollar API prices: counted with zero decimals they landed on "$0".
    expect(priceChange("Harga lama, US$0.30. Kini US$0.19.")).toEqual({ from: 0.3, to: 0.19, decimals: 2 });
    expect(priceChange("Output US$1.20 → US$0.81. Cache US$0.006 → US$0.0042.")).toEqual({ from: 1.2, to: 0.81, decimals: 2 });
  });

  it("leaves the address to the lockup's pill and keeps the close's line to 12 words", () => {
    expect(closeLine("Top up today at oneapi.id", "https://oneapi.id/")).toBe("Top up today at");
    expect(closeLine("a b c d e f g h i j k l m n", "").split(" ")).toHaveLength(12);
  });

  it("sends a beat cut to a sketch back to the baseline, and keeps a beat the designer made its own", () => {
    const base = baselineFiles(concept, beats, brand);
    const sketch = "import { useCurrentFrame } from 'remotion';\nexport default function Beat() { return null; }\n";
    const rich = Array.from({ length: 80 }, (_, i) => `const v${i} = ${i};`).join("\n");
    const now = { ...base, [beatFile("b2")]: sketch, [beatFile("b3")]: rich };
    expect(gutted(now, base)).toEqual([beatFile("b2")]);
  });

  it("keeps a beat a model wrote minified on a few long lines: it is code, not a sketch", () => {
    const base = baselineFiles(concept, beats, brand);
    // The shape gpt-6-luna writes: a whole beat in seven lines.
    const lane = (i: number) => `{n:"Lane${i}",v:"US$0.${i}0",y:.${3 + i}8}`;
    const minified = [
      'import { useCurrentFrame } from "remotion"; import { Draw, Fit, Sfx, useBeat, useFilm, prog } from "@kit"; import { INK,ACCENT,DISPLAY,MONO } from "../theme";',
      `export default function Beat(){const t=useCurrentFrame();const {W,H,safe}=useFilm();const {cue,len}=useBeat();const p=prog(t,0,20);const lanes=[${[1, 2, 3].map(lane).join(",")}];return <div style={{position:"absolute",inset:0,opacity:1-prog(t,len-5,len+7)}}>`,
      '<Draw draw={(c,f)=>{lanes.forEach((a,i)=>{c.strokeStyle=[ACCENT,INK,"#9B8064"][i];c.lineWidth=[20,15,10][i];c.beginPath();c.moveTo(-30,H*a.y);c.bezierCurveTo(W*.3,H*a.y+Math.sin(f/18+i)*8,W*.6,H*a.y,W*.91,H*a.y);c.stroke();});}}/>',
      '<div style={{position:"absolute",left:safe.left,top:H*.12}}><Fit text="Tiga tarif, satu jalur AI" font={DISPLAY} weight={700} size={94} maxW={W*.78} style={{color:INK}}/></div>',
      '{lanes.map((a,i)=><div key={a.n} style={{position:"absolute",left:W*.68,top:H*a.y-H*.055,display:"flex",gap:26,alignItems:"baseline",fontFamily:MONO,color:INK,opacity:p}}><span style={{fontSize:26}}>{a.n}</span><span style={{fontSize:38,fontWeight:600}}>{a.v}</span></div>)}',
      '<div style={{position:"absolute",left:safe.left,top:H*.82,font:"24px DM Mono",color:INK}}>tarif awal</div><Sfx name="whoosh" at={0} volume={.25}/><Sfx name="tick" at={cue("Input")} volume={.25}/></div>}',
    ].join("\n");
    expect(minified.split("\n")).toHaveLength(6);
    expect(gutted({ ...base, [beatFile("b2")]: minified }, base)).toEqual([]);
    expect(codeSize(minified)).toBeGreaterThan(12);
    expect(thinness({ ...base, [beatFile("b2")]: minified }, beats.length)).toBeNull();
  });
});

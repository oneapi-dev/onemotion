import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FilmProvider, type Film } from "./film";
import { Chain, Counters, FlyWords, Graph, Hero, Notes, PictureShot, Progress, PromptBox, Rewind, Stretch } from "./kineticBlocks";

// Canvas drawing, sounds, image loading and frozen time need a Remotion player: here they stand in as plain markup.
vi.mock("./draw", () => ({ Draw: () => null }));
vi.mock("./sound", () => ({ Sfx: () => null }));
vi.mock("./ui", () => ({ Picture: ({ src }: { src: string }) => <img src={src} alt="" /> }));
vi.mock("remotion", async (orig) => ({ ...(await orig<typeof import("remotion")>()), Freeze: ({ frame, children }: { frame: number; children: React.ReactNode }) => <div data-frame={frame}>{children}</div> }));
// No canvas in node: text measures by character count.
vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });

const pulse = 14;
const film = { W: 1920, H: 1080, fps: 30, pulse, bpm: 128 } as unknown as Film;
const html = (node: React.ReactElement) => renderToStaticMarkup(<FilmProvider value={film}>{node}</FilmProvider>);
const look = { font: "Archivo", mono: "JetBrains Mono", color: "#F4F1EA", accent: "#FF5B2E", ground: "#0C0E11" };

describe("scene blocks", () => {
  it("are pure functions of the frame, and draw nothing before they start", () => {
    const a = html(<Hero t={60} at={10} kicker="MADE BY" title="TIDEPOOL" sub="for surfers" {...look} />);
    expect(a).toBe(html(<Hero t={60} at={10} kicker="MADE BY" title="TIDEPOOL" sub="for surfers" {...look} />));
    expect(html(<Graph t={5} at={10} number="0" label="GUESSES" {...look} />)).toBe("");
  });

  it("cuts a picture in, and puts each word up on its beat", () => {
    const words: [number, string][] = [[1, "MONSTERS"], [3, "NEXT DOOR."]];
    expect(html(<PictureShot t={20} at={0} src="a.png" words={words} font="Archivo" />)).toContain("MONSTERS");
    const later = html(<PictureShot t={45} at={0} src="a.png" words={words} font="Archivo" />);
    expect(later).toContain("NEXT DOOR.");
    expect(later).not.toContain("MONSTERS");
    // A cut-in scales in on its detail for one beat.
    expect(html(<PictureShot t={30} at={0} src="a.png" cutIns={[[2, 1.65, [0.6, 0.2]]]} font="Archivo" />)).toMatch(/transform-origin:60% 20%.*scale\(1\.6[5-9]/);
  });

  it("lands the graph's number after the fold", () => {
    expect(html(<Graph t={30} at={0} number="0" label="KEYFRAMES" {...look} />)).not.toContain("KEYFRAMES");
    expect(html(<Graph t={70} at={0} number="0" label="KEYFRAMES" {...look} />)).toContain("KEYFRAMES");
  });

  it("types the prompt over time and lights its keywords", () => {
    const text: [string, boolean?][] = [["a teaser for "], ["Tidepool", true]];
    const early = html(<PromptBox t={30} at={0} text={text} {...look} />);
    const late = html(<PromptBox t={140} at={0} text={text} {...look} />);
    expect(early).not.toContain(">l<");
    expect(late).toContain("background:#FF5B2E");
    expect(late).toContain("21 CHARS");
  });

  it("flies to the last word and links the chain node by node", () => {
    const words: [string, string?][] = [["CAMERA"], ["FLIES"], ["THROUGH."]];
    expect(html(<FlyWords t={160} at={0} words={words} {...look} />)).toContain("THROUGH.");
    const nodes: [string, string?][] = [["BRIEF"], ["CODE"], ["FILM."]];
    expect(html(<Chain t={5} at={0} nodes={nodes} {...look} />)).not.toContain("FILM.");
    expect(html(<Chain t={160} at={0} nodes={nodes} {...look} />)).toContain("FILM.");
  });

  it("sends notes one by one, each with its effect", () => {
    const notes: [string, ("recolor" | "trim" | "punch")?][] = [["hotter orange", "recolor"], ["cut the intro", "trim"]];
    const first = html(<Notes t={80} at={0} preview="ELASTIC." notes={notes} {...look} />);
    // The first note was sent: the preview took the accent.
    expect(first).toMatch(/color:#FF5B2E[^>]*>ELASTIC\./);
    expect(html(<Notes t={10} at={0} preview="ELASTIC." notes={notes} {...look} />)).not.toMatch(/color:#FF5B2E[^>]*>ELASTIC\./);
  });

  it("counts one number at a time, renders to done, and stretches a word", () => {
    const counters: [string, string][] = [["1", "WEB PAGE"], ["42", "SCENES"]];
    expect(html(<Counters t={10} at={0} counters={counters} {...look} />)).toContain("WEB PAGE");
    expect(html(<Counters t={50} at={0} counters={counters} {...look} />)).toContain("SCENES");
    const progress = html(<Progress t={200} at={0} lines={["RENDERED", "ON A LAPTOP."]} cards={[["ONE", "#FF5B2E", "#141210"]]} {...look} />);
    expect(progress).toContain("DONE");
    expect(progress).toContain("100%");
    const a = html(<Stretch t={20} at={0} word="ELASTIC." {...look} />);
    const b = html(<Stretch t={50} at={0} word="ELASTIC." {...look} />);
    expect(a).toMatch(/scaleX\(1\.[2-9]\d\);/);
    expect(b).toMatch(/scaleX\(0\.[5-9]\d\);/);
  });

  it("plays a layer backwards to its first frame", () => {
    const at = (t: number) => Number(/data-frame="(\d+)"/.exec(html(<Rewind t={t} at={0} dur={60} from={300} color="#fff" accent="#f50"><i>film</i></Rewind>))?.[1]);
    expect(at(0)).toBe(300);
    expect(at(30)).toBeLessThan(300);
    expect(at(60)).toBe(0);
  });
});

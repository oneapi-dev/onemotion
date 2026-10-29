import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FilmProvider, type Film } from "./film";
import { Denial, isLight, KineticType, kineticAt, letterOnScreen, onBeat, whipFrames, whipPan, type KShot } from "./kinetic";

// No canvas in node: text measures by character count.
vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });

// 172 BPM at 30 fps: a beat is about 10.5 frames, the tempo this style runs at.
const pulse = (30 * 60) / 172;
const film = { W: 1920, H: 1080, fps: 30, pulse, bpm: 172 } as unknown as Film;
const html = (node: React.ReactElement) => renderToStaticMarkup(<FilmProvider value={film}>{node}</FilmProvider>);

const shots: KShot[] = [
  { at: 10, text: "THE CITY", style: "slam", fx: "hit" },
  { at: 21, text: ["HAS", "NEW"], style: "stack", ground: "#FFC21A", in: "right" },
  { at: 32, text: "STOMP.", style: "punch", fx: "beat" },
];

describe("beats and whips", () => {
  it("places shots on the music's grid", () => {
    expect(onBeat(100, 0, pulse)).toBe(100);
    expect(onBeat(100, 2, pulse)).toBe(121);
    expect(onBeat(100, 0.5, pulse)).toBe(105);
  });

  it("whips in half a beat, 4 to 8 frames", () => {
    expect(whipFrames(pulse)).toBe(5);
    expect(whipFrames(4)).toBe(4);
    expect(whipFrames(60)).toBe(8);
  });

  it("moves both layers on one curve and smears only mid-whip", () => {
    const start = whipPan(16, 21, 5, "right", 1920, 1080);
    const mid = whipPan(18.5, 21, 5, "right", 1920, 1080);
    const end = whipPan(21, 21, 5, "right", 1920, 1080);
    expect(start.out.x).toBeCloseTo(0);
    expect(start.in.x).toBe(-1920);
    expect(start.smear).toBe(0);
    expect(mid.smear).toBeGreaterThan(0.9);
    expect(end.in.x).toBeCloseTo(0);
    expect(end.out.x).toBe(1920);
  });

  it("knows which shot shows, and which one is still leaving inside a whip", () => {
    expect(kineticAt(shots, 5, pulse)).toBeNull();
    expect(kineticAt(shots, 12, pulse)?.i).toBe(0);
    expect(kineticAt(shots, 18, pulse)).toMatchObject({ i: 1, prev: 0, dir: "right" });
    expect(kineticAt(shots, 25, pulse)).toMatchObject({ i: 1, prev: -1, dir: null });
    expect(kineticAt(shots, 400, pulse)?.i).toBe(2);
  });

  it("reads grounds as light or dark", () => {
    expect(isLight("#F4F1EA")).toBe(true);
    expect(isLight("#FFC21A")).toBe(true);
    expect(isLight("#0B1020")).toBe(false);
    expect(isLight("rgb(20, 20, 22)")).toBe(false);
  });
});

describe("KineticType", () => {
  it("is a pure function of the frame", () => {
    expect(html(<KineticType t={40} shots={shots} font="Archivo" sound={false} />)).toBe(html(<KineticType t={40} shots={shots} font="Archivo" sound={false} />));
  });

  it("puts dark type on a light ground and keeps moving after the word lands", () => {
    const a = html(<KineticType t={26} shots={shots} font="Archivo" sound={false} />);
    const b = html(<KineticType t={30} shots={shots} font="Archivo" sound={false} />);
    expect(a).toContain("background:#FFC21A");
    expect(a).toContain("color:#141210");
    expect(a).not.toBe(b);
  });

  it("draws both shots inside a whip", () => {
    const mid = html(<KineticType t={18} shots={shots} font="Archivo" sound={false} />);
    expect(mid).toContain("THE CITY");
    expect(mid).toContain("NEW");
    expect(mid).toContain("blur(");
  });

  it("outlines a word until it fills", () => {
    const s: KShot[] = [{ at: 0, text: "TRUE.", style: "cut", fill: 8 }];
    expect(html(<KineticType t={4} shots={s} font="Archivo" sound={false} />)).toContain("-webkit-text-stroke");
    expect(html(<KineticType t={9} shots={s} font="Archivo" sound={false} />)).not.toContain("-webkit-text-stroke");
  });
});

describe("the zoom through a letter", () => {
  const run: KShot[] = [{ at: 0, text: ["READS THE", "OCEAN."], style: "split" }];

  it("aims at the letter where the drifting camera has put it", () => {
    // Measured by character count here: OCEAN. is 6 characters, its O the first.
    const still = letterOnScreen(run, 0, 0, 0, "Archivo", 800, 1920, 1080, pulse, 30);
    const later = letterOnScreen(run, 0, 0, 40, "Archivo", 800, 1920, 1080, pulse, 30);
    expect(still.x).toBeLessThan(960 - 300);
    expect(still.y).toBeGreaterThan(540);
    // The push and the word's slow scale carry the O further from the centre.
    expect(later.x).toBeLessThan(still.x);
  });

  it("flies in, then draws nothing once it is through", () => {
    const zoom = { at: 30, dur: 20, char: 0 };
    expect(html(<KineticType t={40} shots={run} font="Archivo" sound={false} zoom={zoom} />)).toMatch(/scale\((\d+\.\d+)\)/);
    expect(html(<KineticType t={50} shots={run} font="Archivo" sound={false} zoom={zoom} />)).toBe("");
  });
});

describe("Denial", () => {
  it("shows the mock, then NO, then the word filled, then cuts the mock apart", () => {
    const at = 0;
    const props = { at, word: "TIMELINE.", mock: <i>mock</i>, font: "Archivo", color: "#F4F1EA" };
    expect(html(<Denial t={2} {...props} />)).not.toContain(">NO<");
    expect(html(<Denial t={12} {...props} />)).toContain(">NO<");
    expect(html(<Denial t={12} {...props} />)).toContain("-webkit-text-stroke");
    expect(html(<Denial t={17} {...props} />)).not.toContain("-webkit-text-stroke");
    expect(html(<Denial t={60} {...props} />)).not.toContain("mock");
  });
});

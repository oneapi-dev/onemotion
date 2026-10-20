import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BarChart, ChromaWipe, FlashThrough, FocusZoom, KineticCenter, LineChart, PhoneFan, PriceCount, TerminalRun, UiReveal } from "./blocks";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("blocks", () => {
  it("counts a price to its value and lands it with a pulse that settles", () => {
    const at = 10;
    const mid = html(<PriceCount t={at + 26} at={at} from={10} to={15} prefix="$" size={200} color="#111" font="Inter" />);
    const end = html(<PriceCount t={at + 52} at={at} from={10} to={15} prefix="$" size={200} color="#111" font="Inter" />);
    const later = html(<PriceCount t={at + 90} at={at} from={10} to={15} prefix="$" size={200} color="#111" font="Inter" />);
    expect(mid).toMatch(/>1[0-5]</);
    expect(end).toContain(">15<");
    // The landing pulse scales up, then settles back to 1.
    const scaleOf = (s: string) => Number(/scale\(([\d.]+)\)/.exec(s)?.[1]);
    expect(scaleOf(html(<PriceCount t={at + 57} at={at} to={15} size={200} color="#111" font="Inter" />))).toBeGreaterThan(1.05);
    expect(scaleOf(later)).toBeCloseTo(1, 2);
  });

  it("is a pure function of the frame: the same frame renders the same markup", () => {
    const a = html(<UiReveal t={120} at={0} push={30} tilt={60}><div>card</div></UiReveal>);
    const b = html(<UiReveal t={120} at={0} push={30} tilt={60}><div>card</div></UiReveal>);
    expect(a).toBe(b);
    expect(html(<UiReveal t={0} at={10}><div>card</div></UiReveal>)).toContain("opacity:0");
  });

  it("fans three phones out from a stack", () => {
    const start = html(<PhoneFan t={0} at={0} left={<i>l</i>} center={<i>c</i>} right={<i>r</i>} />);
    const open = html(<PhoneFan t={80} at={0} left={<i>l</i>} center={<i>c</i>} right={<i>r</i>} />);
    expect(start).toContain("translateX(0px)");
    expect(open).toMatch(/translateX\(-3[34]\d(\.\d+)?px\)/);
  });

  it("builds charts from the data given, labels counting to the values", () => {
    const data = [
      { label: "A", value: 40 },
      { label: "B", value: 80 },
    ];
    expect(html(<BarChart t={200} at={0} data={data} w={600} h={400} color="#f50" ink="#111" font="Inter" />)).toContain(">80<");
    expect(html(<BarChart t={0} at={0} data={data} w={600} h={400} color="#f50" ink="#111" font="Inter" />)).toContain(">0<");
    const line = html(<LineChart t={200} at={0} data={data} w={600} h={400} color="#f50" ink="#111" font="Inter" />);
    expect(line).toContain(">80.0<");
    expect(line).toContain('stroke-dashoffset="0"');
  });

  it("types a command, then shows its output", () => {
    const early = html(<TerminalRun t={5} at={0} command="npm i oneapi" output={["added 1 package"]} />);
    const late = html(<TerminalRun t={60} at={0} command="npm i oneapi" output={["added 1 package"]} />);
    expect(early).not.toContain("npm i oneapi");
    expect(late).toContain("npm i oneapi");
    expect(late).toMatch(/opacity:1[;"].*added 1 package/);
  });

  it("transitions through white and with a wipe, ending on the second scene alone", () => {
    expect(html(<FlashThrough t={100} at={0} a={<b>A</b>} b={<b>B</b>} />)).not.toContain(">A<");
    expect(html(<FlashThrough t={0} at={0} a={<b>A</b>} b={<b>B</b>} />)).not.toContain(">B<");
    expect(html(<ChromaWipe t={0} at={0} a={<b>A</b>} b={<b>B</b>} />)).not.toContain(">B<");
    expect(html(<ChromaWipe t={30} at={0} a={<b>A</b>} b={<b>B</b>} />)).toContain("translateX(0%)");
  });

  it("centres the focus point at the key's scale", () => {
    const out = html(<FocusZoom t={50} w={1000} h={500} keys={[[0, { x: 500, y: 250, scale: 1 }], [40, { x: 200, y: 100, scale: 2 }]]}><div /></FocusZoom>);
    expect(out).toContain("translate(100px, 50px) scale(2)");
  });

  it("lays words out centred as they arrive", () => {
    // No canvas here: widths fall back to the estimate.
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    const out = html(<KineticCenter t={100} at={0} words={["More", "credit."]} font="Inter" size={100} color="#111" />);
    expect(out).toContain("More");
    expect(out).toContain("credit.");
  });
});

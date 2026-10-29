import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { explode, hsl, iso, isoArrive, isoBox, isoBuild, isoDepth, isoFaces, isoPathAt, isoSort, IsoBlock, IsoExplode, IsoGrid, IsoPath, IsoScene } from "./iso";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("isometric projection", () => {
  it("puts model axes on the 30° iso axes, z straight up", () => {
    expect(iso(0, 0, 0, 40)).toEqual({ x: 0, y: 0 });
    const x = iso(1, 0, 0, 40);
    expect(x.x).toBeCloseTo(34.64, 2);
    expect(x.y).toBeCloseTo(20, 6);
    const y = iso(0, 1, 0, 40);
    expect(y.x).toBeCloseTo(-34.64, 2);
    expect(y.y).toBeCloseTo(20, 6);
    expect(iso(0, 0, 1, 40)).toEqual({ x: 0, y: -40 });
    // Linear: the sum of the axes is the sum of their images.
    const p = iso(2, 3, 1.5, 10);
    expect(p.x).toBeCloseTo((2 - 3) * 0.866 * 10, 6);
    expect(p.y).toBeCloseTo((2 + 3) * 5 - 15, 6);
  });

  it("matches the floor matrix, so DOM laid on a plane meets the SVG faces", () => {
    // matrix(0.866,0.5,-0.866,0.5,0,0) maps local (u, 0) and (0, u) to the images of model x and y.
    const u = 40;
    const ax = { x: 0.866 * u, y: 0.5 * u };
    const ay = { x: -0.866 * u, y: 0.5 * u };
    expect(iso(1, 0, 0, u).x).toBeCloseTo(ax.x, 6);
    expect(iso(1, 0, 0, u).y).toBeCloseTo(ax.y, 6);
    expect(iso(0, 1, 0, u).x).toBeCloseTo(ay.x, 6);
    expect(iso(0, 1, 0, u).y).toBeCloseTo(ay.y, 6);
  });

  it("shades one base colour into three faces, top lightest, right darkest", () => {
    for (const base of ["#3A6EA5", "#C2593D", "#7A8B6F", "#888888"]) {
      const f = isoFaces(base);
      const [top, left, right] = [hsl(f.top)[2], hsl(f.left)[2], hsl(f.right)[2]];
      expect(top).toBeGreaterThan(left);
      expect(left).toBeGreaterThan(right);
      expect(top - left).toBeCloseTo(10, 0);
      expect(left - right).toBeCloseTo(15, 0);
      // The hue stays the base's.
      if (hsl(base)[1] > 0) expect(Math.abs(hsl(f.right)[0] - hsl(base)[0])).toBeLessThan(2);
    }
  });

  it("draws nearer boxes later: painter's order by x + y + z", () => {
    expect(isoDepth(1, 0, 0)).toBeGreaterThan(isoDepth(0, 0, 0));
    expect(isoDepth(0, 0, 1)).toBeGreaterThan(isoDepth(0, 0, 0));
    expect(isoDepth(2, 2, 0)).toBeGreaterThan(isoDepth(1, 2, 0));
    // A box on top of another draws after it.
    expect(isoDepth(0, 0, 1)).toBeGreaterThan(isoDepth(0, 0, 0));
  });

  it("paints in DOM order back to front (the export ignores z-index): grid, routes, blocks by depth, overlays", () => {
    const Wrap = (p: { x: number; y: number }) => <i data-w={p.x} />;
    const kids = [
      <i key="note" data-n="overlay" />,
      <IsoBlock key="front" x={2} y={2} color="#888" t={99} />,
      <Wrap key="wrap" x={1} y={0} />,
      <IsoPath key="route" points={[[0, 0, 0], [1, 0, 0]]} t={99} color="#000" />,
      <>
        <IsoBlock key="back" x={0} y={0} color="#888" t={99} />
      </>,
      <IsoGrid key="grid" color="#000" />,
    ];
    const order = isoSort(kids).map((c) => (c as React.ReactElement).key);
    expect(order.map((k) => String(k).replace(/^.*\$/, ""))).toEqual(["grid", "route", "back", "wrap", "front", "note"]);
  });

  it("draws labels after every block, so a block in front never covers one", () => {
    const out = html(
      <IsoScene w={400} h={300}>
        <IsoBlock x={0} y={0} color="#3A6EA5" t={40} label="Back" />
        <IsoBlock x={1} y={1} h={3} color="#C2593D" t={40} />
      </IsoScene>,
    );
    expect(out.indexOf("Back")).toBeGreaterThan(out.lastIndexOf("<polygon"));
    expect(out.match(/Back/g)).toHaveLength(1);
  });

  it("builds bottom-up and back to front, 4 frames apart", () => {
    const at = isoBuild([{ x: 2, y: 0, z: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0, z: 1 }], 10);
    expect(at).toEqual([22, 10, 14, 18]);
  });

  it("rises from 60 px below over 15 frames with a slight overshoot, then rests", () => {
    expect(isoArrive(0, 0, "rise").dy).toBeCloseTo(60, 6);
    expect(isoArrive(0, 0, "drop").dy).toBeCloseTo(-60, 6);
    const passes = Array.from({ length: 15 }, (_, i) => isoArrive(i, 0, "rise").dy).some((v) => v < -0.5);
    expect(passes).toBe(true);
    expect(isoArrive(15, 0, "rise").dy).toBe(0);
    expect(isoArrive(30, 0, "grow").k).toBe(1);
  });

  it("puts the top face where the faces meet", () => {
    const f = isoBox(0, 0, 0, 2, 1, 1, 40);
    // The top's front corner is the left and right faces' shared top corner.
    expect(f.top[2]).toEqual(f.left[1]);
    expect(f.top[2]).toEqual(f.right[1]);
  });

  it("opens an exploded view and closes it again", () => {
    expect(explode(0, 10)).toBe(0);
    expect(explode(34, 10, 24)).toBe(1);
    expect(explode(200, 10, 24, 100)).toBe(0);
    const open = html(
      <IsoScene w={400} h={300}>
        <IsoExplode t={40} at={0} gap={2}>
          <IsoBlock x={0} y={0} z={0} color="#3A6EA5" t={40} />
          <IsoBlock x={0} y={0} z={1} color="#3A6EA5" t={40} />
        </IsoExplode>
      </IsoScene>,
    );
    // The second layer is lifted 2 cells: its z-order key moves up by 200.
    expect(open).toContain(`z-index:${isoDepth(0, 0, 3)}`);
  });

  it("walks a route by length", () => {
    const route: [number, number, number][] = [
      [0, 0, 0],
      [3, 0, 0],
      [3, 1, 0],
    ];
    expect(isoPathAt(route, 0)).toEqual([0, 0, 0]);
    expect(isoPathAt(route, 0.75)).toEqual([3, 0, 0]);
    expect(isoPathAt(route, 1)).toEqual([3, 1, 0]);
  });

  it("renders a block as three faces, nothing before it starts", () => {
    expect(html(<IsoScene w={400} h={300}><IsoBlock x={0} y={0} color="#3A6EA5" t={0} at={10} /></IsoScene>)).not.toContain("<polygon");
    const out = html(<IsoScene w={400} h={300}><IsoBlock x={0} y={0} color="#3A6EA5" t={40} at={10} label="Server" /></IsoScene>);
    expect(out.match(/<polygon/g)).toHaveLength(3);
    expect(out).toContain("Server");
    expect(out).not.toContain("rotate");
  });
});

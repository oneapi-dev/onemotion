import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LineChart } from "./blocks";
import { Callout, calloutAlpha, Pictogram, pictoClip, pictoUnits, RACE_MAX_STEP, raceAt, raceLength, raceRanks, raceTrack, RankRace, ringDash, RingStat, type RaceRow } from "./data";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

/** The largest move any bar makes between two consecutive frames of a track, in slots. */
const maxStep = (track: ReturnType<typeof raceTrack>) => {
  let worst = 0;
  for (const k of track.keys) for (let f = 1; f <= track.length; f++) worst = Math.max(worst, Math.abs(track.y[k][f] - track.y[k][f - 1]));
  return worst;
};

describe("RankRace", () => {
  const overtake: RaceRow[] = [
    { label: "2021", values: { A: 100, B: 60, C: 40 } },
    { label: "2022", values: { A: 110, B: 130, C: 50 } },
    { label: "2023", values: { A: 120, B: 160, C: 55 } },
  ];

  it("moves bars continuously across an overtake, landing on each row's ranks", () => {
    const tr = raceTrack(overtake, { perRow: 45, top: 3, intro: 20 });
    expect(tr.length).toBe(20 + 2 * 45);
    // Row 0 during the intro: A on top.
    expect(tr.y.A[0]).toBe(0);
    expect(tr.y.B[0]).toBe(1);
    // Row 1 lands at intro + perRow: B has overtaken A.
    expect(tr.y.B[65]).toBeCloseTo(0, 6);
    expect(tr.y.A[65]).toBeCloseTo(1, 6);
    // Mid-overtake they pass through each other, never jumping.
    expect(tr.y.A[42]).toBeGreaterThan(0.2);
    expect(tr.y.A[42]).toBeLessThan(0.8);
    expect(maxStep(tr)).toBeLessThanOrEqual(RACE_MAX_STEP + 1e-9);
  });

  it("caps a big leap at a quarter slot a frame, then catches up", () => {
    const rows: RaceRow[] = [
      { label: "w1", values: { A: 90, B: 80, C: 70, D: 60, E: 50, F: 40, G: 30, H: 10 } },
      { label: "w2", values: { A: 90, B: 80, C: 70, D: 60, E: 50, F: 40, G: 30, H: 200 } },
      { label: "w3", values: { A: 90, B: 80, C: 70, D: 60, E: 50, F: 40, G: 30, H: 210 } },
    ];
    const tr = raceTrack(rows, { perRow: 15, top: 8, intro: 10 });
    expect(maxStep(tr)).toBeLessThanOrEqual(RACE_MAX_STEP + 1e-9);
    expect(tr.y.H[tr.length]).toBeCloseTo(0, 6);
  });

  it("values interpolate between rows and the scale follows the leader", () => {
    const tr = raceTrack(overtake, { perRow: 40, top: 3, intro: 20 });
    const mid = raceAt(tr, 40);
    expect(mid.bars.find((b) => b.key === "B")!.value).toBeCloseTo(95, 6);
    expect(mid.leader).toBeCloseTo(Math.max(105, 95, 45), 6);
    expect(raceAt(tr, 10_000).leader).toBe(160);
  });

  it("folds or drops everything past the top N", () => {
    const rows: RaceRow[] = [{ label: "x", values: { A: 5, B: 4, C: 3, D: 2, E: 1 } }];
    const r = raceRanks(rows, 3);
    expect(r.slot[0]).toEqual({ A: 0, B: 1, C: 2, D: 3, E: 3 });
    expect(r.rest[0]).toBe(3);
    const folded = raceTrack(rows, { top: 3, rest: "other" });
    expect(folded.slots).toBe(4);
    expect(folded.other).toBe(true);
    const dropped = raceTrack(rows, { top: 3, rest: "drop" });
    expect(dropped.slots).toBe(3);
    expect(dropped.alpha.D[dropped.length]).toBe(0);
    // Never more than 12 bars.
    expect(raceRanks(rows, 40).top).toBe(12);
  });

  it("renders values with thousands grouped and the step label faint", () => {
    const rows: RaceRow[] = [
      { label: "Jan", values: { Uluwatu: 1200, Canggu: 900 } },
      { label: "Feb", values: { Uluwatu: 1500, Canggu: 2400 } },
    ];
    const end = html(<RankRace t={500} at={0} rows={rows} w={1200} h={500} highlight="Canggu" color="#0B6E79" ink="#111" font="Inter" />);
    expect(end).toContain(">2,400<");
    expect(end).toContain(">Feb<");
    expect(end).toContain('fill-opacity="0.13"');
    expect(end).toContain('fill="#0B6E79"');
    expect(raceLength(2)).toBe(20 + 45 + 75);
  });
});

describe("Pictogram", () => {
  it("lights whole units and clips the partial one", () => {
    expect(pictoUnits(10, 7.4).map((u) => +u.toFixed(2))).toEqual([1, 1, 1, 1, 1, 1, 1, 0.4, 0, 0]);
    expect(pictoClip(0.4)).toBe("inset(0 60.00% 0 0)");
    expect(pictoClip(1)).toBe("inset(0 0.00% 0 0)");
    const done = html(<Pictogram t={300} at={0} value={7.4} color="#0B6E79" />);
    expect(done).toContain("clip-path:inset(0 60.00% 0 0)");
    expect(done).not.toMatch(/scale\(/);
    // 10 dim units and 8 lit overlays.
    expect(done.match(/<path/g)!.length).toBe(18);
  });

  it("lights units step frames apart", () => {
    const at = 0;
    const lit = (t: number) => html(<Pictogram t={t} at={at} value={3} total={3} color="#f00" step={3} />);
    // Unit 1 starts lighting 3 frames after unit 0.
    expect(lit(12 + 3)).toMatch(/opacity:0;clip|opacity:0;transform/);
    expect(lit(200)).not.toMatch(/opacity:0[;"]/);
  });
});

describe("RingStat", () => {
  it("hides the unreached part of the circumference", () => {
    const r = 100;
    const c = 2 * Math.PI * r;
    expect(ringDash(0.7, 1, r).offset).toBeCloseTo(c * 0.3, 6);
    expect(ringDash(0.7, 0, r).offset).toBeCloseTo(c, 6);
    expect(ringDash(0.7, 0.5, r).offset).toBeCloseTo(c * 0.65, 6);
    expect(ringDash(1.4, 1, r).offset).toBeCloseTo(0, 6);
  });

  it("counts the number with the arc", () => {
    expect(html(<RingStat t={100} at={0} value={0.7} color="#0B6E79" ink="#111" font="Inter" label="check first" />)).toContain(">70<");
    expect(html(<RingStat t={0} at={0} value={0.7} color="#0B6E79" ink="#111" font="Inter" />)).toContain(">0<");
  });
});

describe("Callout", () => {
  it("is there from 10 frames before the event to 1.5 s plus 10 after", () => {
    const e = 100;
    expect(calloutAlpha(e - 11, e)).toBe(0);
    expect(calloutAlpha(e - 5, e)).toBeGreaterThan(0);
    expect(calloutAlpha(e, e)).toBe(1);
    expect(calloutAlpha(e + 45, e)).toBe(1);
    expect(calloutAlpha(e + 50, e)).toBeGreaterThan(0);
    expect(calloutAlpha(e + 55, e)).toBe(0);
    expect(html(<svg><Callout t={e + 56} event={e} x={0} y={0} text="Launch" color="#f00" ink="#111" font="Inter" /></svg>)).not.toContain("Launch");
    expect(html(<svg><Callout t={e} event={e} x={0} y={0} text="Launch" color="#f00" ink="#111" font="Inter" /></svg>)).toContain("Launch");
  });
});

describe("LineChart additions", () => {
  const data = [
    { label: "Q1", value: 10 },
    { label: "Q2", value: 20 },
    { label: "Q3", value: 60 },
  ];
  const base = { at: 0, data, w: 600, h: 400, color: "#0B6E79", ink: "#111", font: "Inter" } as const;

  it("keeps the old markup when the new props are left out", () => {
    const a = html(<LineChart t={50} {...base} />);
    expect(a).not.toContain(" Z");
    expect(a).not.toContain("stroke-opacity");
  });

  it("fills the area only once the draw passes 90 %", () => {
    expect(html(<LineChart t={60} {...base} area />)).not.toContain(" Z");
    expect(html(<LineChart t={200} {...base} area />)).toContain('fill-opacity="0.16"');
  });

  it("draws the axes first and delays the line by 12 frames", () => {
    expect(html(<LineChart t={12} {...base} axis />)).toContain('stroke-dashoffset="1"');
    expect(html(<LineChart t={6} {...base} axis />)).toContain('stroke-opacity="0.55"');
  });

  it("shows the callout as the line reaches its point, then lets it go", () => {
    const callout = { index: 2, text: "Launch" };
    expect(html(<LineChart t={90} {...base} callout={callout} />)).toContain("Launch");
    expect(html(<LineChart t={20} {...base} callout={callout} />)).not.toContain("Launch");
    expect(html(<LineChart t={90 + 56} {...base} callout={callout} />)).not.toContain("Launch");
  });
});

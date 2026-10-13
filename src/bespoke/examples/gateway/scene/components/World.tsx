import { Cursor, Draw, Ink, Mark, Sfx, Strike, Typewriter, Window, kf, path, pointAt, pop, prog, useFilm, type Stroke } from "@kit";
import { INK } from "./palette";

/** The whole sketch, in world pixels (the camera in index.tsx flies over it). */
const W = 3200;
const H = 1800;

type Box = { x: number; y: number; w: number; h: number };
const APP: Box = { x: 180, y: 780, w: 420, h: 240 };
const GATE: Box = { x: 1290, y: 780, w: 440, h: 240 };
const PROVIDERS = [
  { x: 1260, y: 360, label: "openai sdk" },
  { x: 1900, y: 300, label: "anthropic sdk" },
  { x: 2560, y: 160, label: "google sdk" },
  { x: 2650, y: 760, label: "invoices" },
  { x: 2100, y: 1180, label: "rate limits" },
  { x: 2700, y: 1460, label: "api keys" },
  { x: 1500, y: 1480, label: "base urls" },
];
const PW = 380;
const PH = 130;
const MODELS = ["claude-sonnet-5.5", "gpt-6.1-sol", "gemini-3.8-flash", "deepseek-v4.1-flash"];
const MX = 2350;
const MY = (i: number) => 380 + i * 280;
const MW = 620;
const MH = 150;
const CODE = { x: 200, y: 1180 };

const rightMid = (b: Box): [number, number] => [b.x + b.w, b.y + b.h / 2];
const LINK = path.curve(...rightMid(APP), GATE.x, GATE.y + GATE.h / 2, -40);
const ROUTE = MODELS.map((_, i) => path.curve(...rightMid(GATE), MX, MY(i) + MH / 2, (1.5 - i) * 50));

const Label = ({ x, y, w, h, show, children, size = 46, font = "Kalam" }: Box & { show: number; children: React.ReactNode; size?: number; font?: string }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font, fontWeight: 700, fontSize: size, color: INK, opacity: show, whiteSpace: "nowrap" }}>{children}</div>
);

export const World = ({ t, accent }: { t: number; accent: string }) => {
  const { cue } = useFilm();
  const [b2, b3, b4] = [cue("b2"), cue("b3"), cue("b4")];
  const switchAt = b4 + 44;

  const strokes: Stroke[] = [
    { d: path.rect(APP.x, APP.y, APP.w, APP.h, 18), at: 0, dur: 14, width: 7, fill: "#ffffff" },
    // The mess: every provider its own box and its own tangled line, wiped when the gateway arrives.
    ...PROVIDERS.flatMap((p, i): Stroke[] => [
      { d: path.rect(p.x, p.y, PW, PH, 10), at: 8 + i * 5, dur: 12, width: 5, erase: b2 - 10, eraseDur: 10 },
      { d: path.curve(...rightMid(APP), p.x, p.y + PH / 2, (i % 2 ? 1 : -1) * (120 + i * 30)), at: 16 + i * 4, dur: 14, width: 3.5, color: "#555", rough: 3, erase: b2 - 12, eraseDur: 10 },
    ]),
    { d: path.rect(GATE.x, GATE.y, GATE.w, GATE.h, 22), at: b2, dur: 12, width: 8, fill: "#ffffff", color: accent },
    { d: LINK, at: b2 + 8, dur: 10, width: 6, arrow: true },
    ...MODELS.flatMap((_, i): Stroke[] => [
      { d: path.rect(MX, MY(i), MW, MH, 16), at: b3 + i * 4, dur: 12, width: 5, fill: "#ffffff" },
      { d: ROUTE[i], at: b3 + 6 + i * 4, dur: 12, width: 5, arrow: true },
    ]),
    // The switch: the old model crossed out, the new one circled.
    { d: path.line(MX - 20, MY(0) - 10, MX + MW + 20, MY(0) + MH + 10), at: switchAt - 4, dur: 7, width: 10, color: accent },
    { d: path.line(MX + MW + 20, MY(0) - 10, MX - 20, MY(0) + MH + 10), at: switchAt + 2, dur: 7, width: 10, color: accent },
    { d: path.ellipse(MX + MW / 2, MY(1) + MH / 2, MW * 0.62, MH * 0.85), at: switchAt + 8, dur: 16, width: 7, color: accent },
    { d: path.curve(CODE.x + 400, CODE.y, APP.x + APP.w / 2, APP.y + APP.h, 60), at: b4 - 6, dur: 12, width: 4, dash: [14, 12], color: "#555" },
  ];

  const codeIn = prog(t, b4 - 10, b4 + 6);
  const cursorX = kf(t, [[b4 + 12, 1250], [b4 + 30, 640]]);
  const cursorY = kf(t, [[b4 + 12, 1760], [b4 + 30, CODE.y + 352]]);

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}>
      <Ink strokes={strokes} width={W} height={H} />

      <Label {...APP} show={prog(t, 6, 16)}>
        your app
      </Label>
      {PROVIDERS.map((p, i) => (
        <Label key={p.label} x={p.x} y={p.y} w={PW} h={PH} size={42} show={prog(t, 14 + i * 5, 22 + i * 5) * (1 - prog(t, b2 - 10, b2))}>
          {p.label}
        </Label>
      ))}
      <div style={{ position: "absolute", left: GATE.x, top: GATE.y, width: GATE.w, height: GATE.h, display: "flex", alignItems: "center", justifyContent: "center", gap: 22, opacity: prog(t, b2 + 6, b2 + 14), transform: `scale(${0.85 + 0.15 * Math.min(1, pop(t, b2 + 6, 5))})` }}>
        <Mark size={84} />
        <BrandName />
      </div>
      {MODELS.map((m, i) => (
        <Label key={m} x={MX} y={MY(i)} w={MW} h={MH} size={40} font="JetBrains Mono" show={prog(t, b3 + 8 + i * 4, b3 + 16 + i * 4) * (i === 0 ? 1 - 0.55 * prog(t, switchAt, switchAt + 8) : 1)}>
          {m}
        </Label>
      ))}

      <Packets t={t} start={b2 + 18} modelsAt={b3 + 16} switchAt={switchAt} accent={accent} />

      <div style={{ position: "absolute", left: CODE.x, top: CODE.y, opacity: codeIn, transform: `translateY(${(1 - codeIn) * 40}px)` }}>
        <Window kind="mac" dark w={1080} h={500} title="app.ts">
          <div style={{ padding: "26px 36px", fontFamily: "JetBrains Mono", fontSize: 32, lineHeight: 1.5, color: "#E8E8EA", whiteSpace: "pre" }}>
            <div>{"const client = new OpenAI({"}</div>
            <div>
              {"  baseURL: "}
              <span style={{ color: "#9FE870" }}>{'"https://api.oneapi.id/v1"'}</span>,
            </div>
            <div>{"});"}</div>
            <div>{"await client.chat.completions.create({"}</div>
            <div>
              {"  model: "}
              <span style={{ color: "#FFB86B" }}>
                <Strike t={t} at={switchAt - 6} color={accent} thickness={5}>
                  <Typewriter text={'"claude-sonnet-5.5"'} t={t} at={b4 + 4} cps={1.5} />
                </Strike>
              </span>{" "}
              <span style={{ color: "#9FE870" }}>
                <Typewriter text={'"gpt-6.1-sol"'} t={t} at={switchAt + 2} cps={1.5} caret="#E8E8EA" caretH={34} />
              </span>
            </div>
            <div>{"  messages,"}</div>
            <div>{"});"}</div>
          </div>
        </Window>
      </div>
      {t >= b4 + 10 ? <Cursor t={t} x={cursorX} y={cursorY} clicks={[b4 + 32]} ring={accent} size={64} /> : null}

      {PROVIDERS.map((p, i) => (
        <Sfx key={p.label} name="tick" at={8 + i * 5} volume={0.35} />
      ))}
      {MODELS.map((m, i) => (
        <Sfx key={m} name="pop" at={b3 + i * 4} volume={0.25} />
      ))}
      <Sfx name="type" at={b4 + 4} volume={0.3} />
      <Sfx name="swoosh" at={switchAt - 6} volume={0.3} />
    </div>
  );
};

const BrandName = () => {
  const { brand } = useFilm();
  return <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 64, color: INK, letterSpacing: "-0.02em" }}>{brand.name}</div>;
};

/** Requests as dots: from the app into the gateway, then out along a route to a model. After the switch, every one goes to the new model. */
const Packets = ({ t, start, modelsAt, switchAt, accent }: { t: number; start: number; modelsAt: number; switchAt: number; accent: string }) => (
  <Draw
    width={W}
    height={H}
    draw={(ctx) => {
      if (t < start) return;
      const N = 9;
      const CYCLE = 44;
      for (let k = 0; k < N; k++) {
        const u = ((t - start) / CYCLE + k / N) % 1;
        let p: { x: number; y: number };
        if (u < 0.42) p = pointAt(LINK, u / 0.42);
        else if (t >= modelsAt) p = pointAt(ROUTE[t >= switchAt ? 1 : k % MODELS.length], (u - 0.42) / 0.58);
        else continue;
        ctx.globalAlpha = Math.min(1, (t - start) / 10);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.fill();
      }
    }}
  />
);

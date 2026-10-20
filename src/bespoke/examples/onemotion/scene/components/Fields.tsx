import type { ReactNode } from "react";
import { Annotate, Sfx, Typewriter, arriveE, prog, settle, stagger, useFilm, wipeIn } from "@kit";
import { DISPLAY, GRAPHITE, INK, MONO, ORANGE, PAPER, SOFT, TEXT } from "../theme";

type Step = { t: number; at: number };

/** A full-bleed colour field that wipes in over the one before it, from one edge. */
export function Field({ t, at, until, bg, from = "bottom", children }: { t: number; at: number; until: number; bg: string; from?: "top" | "bottom" | "left" | "right"; children: ReactNode }) {
  if (t < at || t >= until) return null;
  return (
    <div style={{ position: "absolute", inset: 0, background: bg, clipPath: at < 0 ? undefined : wipeIn(t, at, 14, from) }}>
      {children}
      {at >= 0 ? <Sfx name="whoosh" at={at - 2} volume={0.16} /> : null}
    </div>
  );
}

/** The step it is, small, top left: the film is a sequence of four steps and a close. */
function StepLabel({ t, at, n, name, color }: Step & { n: string; name: string; color: string }) {
  const { W } = useFilm();
  const u = W / 1920;
  const o = settle(t, at + 6, 12);
  return (
    <div style={{ position: "absolute", left: 150 * u, top: 120 * u, fontFamily: MONO, fontSize: 22 * u, letterSpacing: "0.08em", color, opacity: o }}>
      {n} / 04 · {name}
    </div>
  );
}

/** The step's one huge line: each word rises out of its own mask, one after the other. */
function Headline({ t, at, text, color }: Step & { text: string; color: string }) {
  const { W, H } = useFilm();
  const u = W / 1920;
  const words = text.split(" ");
  return (
    <div style={{ position: "absolute", left: 140 * u, top: H * 0.2, display: "flex", gap: 36 * u, fontFamily: DISPLAY, fontWeight: 800, fontSize: 210 * u, lineHeight: 1.02, letterSpacing: "-0.05em", color }}>
      {words.map((w, i) => {
        const p = prog(t, stagger(at + 8, i, words.length, 4), stagger(at + 8, i, words.length, 4) + 16, arriveE);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: 18 * u }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 110}%)` }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
}

/** 1. One sentence: the words land, the brief types itself under them, and the button is pressed. */
export function Brief({ t, at }: Step) {
  const { W, H } = useFilm();
  const u = W / 1920;
  const box = settle(t, at + 14, 14);
  const press = at + 96;
  const btn = settle(t, at + 76, 12);
  const dip = 1 - 0.05 * Math.max(0, 1 - Math.abs(t - press) / 4);
  return (
    <>
      <StepLabel t={t} at={at} n="01" name="BRIEF" color={SOFT} />
      <Headline t={t} at={at - 8} text="Satu kalimat." color={PAPER} />
      <div style={{ position: "absolute", left: 150 * u, top: H * 0.6, width: 1320 * u, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 * u, padding: `${26 * u}px ${32 * u}px`, borderRadius: 16 * u, border: `${2 * u}px solid rgba(241,238,232,0.18)`, opacity: box, transform: `translateY(${(1 - box) * 16 * u}px)` }}>
        <Typewriter text="Promo 20 detik untuk aplikasi kasirmu" t={t} at={at + 22} cps={1.1} caret={ORANGE} caretH={44 * u} style={{ fontFamily: TEXT, fontWeight: 500, fontSize: 42 * u, color: PAPER, whiteSpace: "nowrap" }} />
        <div style={{ flex: "none", padding: `${14 * u}px ${28 * u}px`, borderRadius: 12 * u, background: ORANGE, color: GRAPHITE, fontFamily: TEXT, fontWeight: 600, fontSize: 28 * u, opacity: btn, transform: `scale(${(0.94 + 0.06 * btn) * dip})` }}>Buat video</div>
      </div>
      <Sfx name="type" at={at + 22} volume={0.2} />
      <Sfx name="click" at={press - 1} volume={0.32} />
    </>
  );
}

const LOOKS = ["Poster", "Editorial", "Sketsa"];
const SWATCHES = [GRAPHITE, ORANGE, "#2F6BFF", "#E9E4DA"];

/** 2. The concept: a palette, a type specimen, and one of three looks circled. */
export function Concept({ t, at }: Step) {
  const { W, H } = useFilm();
  const u = W / 1920;
  return (
    <>
      <StepLabel t={t} at={at} n="02" name="ART DIRECTOR" color="#6B6F76" />
      <Headline t={t} at={at} text="Jadi konsep." color={INK} />
      <div style={{ position: "absolute", left: 150 * u, top: H * 0.6, display: "flex", alignItems: "center", gap: 64 * u }}>
        <div style={{ display: "flex", gap: 14 * u }}>
          {SWATCHES.map((c, i) => {
            const s = settle(t, stagger(at + 18, i, 4, 3), 12);
            return <div key={c} style={{ width: 76 * u, height: 76 * u, borderRadius: "50%", background: c, border: `${2 * u}px solid rgba(20,20,20,0.12)`, opacity: s, transform: `scale(${0.9 + 0.1 * s})` }} />;
          })}
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 120 * u, lineHeight: 1, letterSpacing: "-0.05em", color: INK, opacity: settle(t, at + 28, 14) }}>Aa</div>
        <div style={{ display: "flex", gap: 18 * u }}>
          {LOOKS.map((l, i) => {
            const s = settle(t, stagger(at + 34, i, 3, 4), 12);
            const tile = (
              <div style={{ width: 210 * u, height: 118 * u, borderRadius: 12 * u, background: i === 1 ? INK : "rgba(20,20,20,0.06)", color: i === 1 ? PAPER : INK, display: "flex", alignItems: "flex-end", padding: `${12 * u}px ${16 * u}px`, fontFamily: TEXT, fontWeight: 600, fontSize: 24 * u }}>{l}</div>
            );
            return (
              <div key={l} style={{ opacity: s, transform: `translateY(${(1 - s) * 12 * u}px)` }}>
                {i === 1 ? (
                  <Annotate kind="circle" at={at + 76} dur={16} color={ORANGE} width={5 * u} pad={14 * u}>
                    {tile}
                  </Annotate>
                ) : (
                  tile
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Sfx name="pop" at={at + 18} volume={0.16} />
      <Sfx name="marker" at={at + 76} volume={0.22} />
    </>
  );
}

/** 3. The animation: a strip of frames fills in, an object travelling through them, a playhead passing. */
export function Frames({ t, at }: Step) {
  const { W, H } = useFilm();
  const u = W / 1920;
  const n = 6;
  const fw = 232 * u;
  const gap = 16 * u;
  const head = prog(t, at + 48, at + 118);
  return (
    <>
      <StepLabel t={t} at={at} n="03" name="MOTION DESIGNER" color="rgba(20,20,20,0.6)" />
      <Headline t={t} at={at} text="Jadi animasi." color={INK} />
      <div style={{ position: "absolute", left: 150 * u, top: H * 0.6, width: n * fw + (n - 1) * gap, height: 150 * u }}>
        {Array.from({ length: n }, (_, i) => {
          const s = settle(t, stagger(at + 14, i, n, 4), 12);
          // The same object, a little further along in each frame: what an animation is.
          const x = 0.12 + (i / (n - 1)) * 0.68;
          const y = 0.62 - Math.sin((i / (n - 1)) * Math.PI) * 0.34;
          return (
            <div key={i} style={{ position: "absolute", left: i * (fw + gap), top: 0, width: fw, height: 130 * u, borderRadius: 12 * u, background: GRAPHITE, opacity: s, transform: `scale(${0.92 + 0.08 * s})`, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: "10%", right: "10%", top: "78%", height: 2 * u, background: "rgba(241,238,232,0.25)" }} />
              <div style={{ position: "absolute", left: `${x * 100}%`, top: `${y * 100}%`, width: 26 * u, height: 26 * u, marginLeft: -13 * u, marginTop: -13 * u, borderRadius: "50%", background: ORANGE }} />
              <div style={{ position: "absolute", left: 10 * u, top: 8 * u, fontFamily: MONO, fontSize: 15 * u, color: "rgba(241,238,232,0.6)" }}>{`f${String(i * 6).padStart(2, "0")}`}</div>
            </div>
          );
        })}
        <div style={{ position: "absolute", top: -12 * u, left: `${head * 100}%`, width: 4 * u, height: 154 * u, background: INK, opacity: settle(t, at + 46, 8) }} />
      </div>
      <Sfx name="tick" at={at + 14} volume={0.14} />
    </>
  );
}

/** 4. The render: the file renders on this computer, then a check is drawn. */
export function Render({ t, at }: Step) {
  const { W, H } = useFilm();
  const u = W / 1920;
  const start = at + 14;
  const done = at + 84;
  const p = prog(t, start, done, (x) => x);
  const card = settle(t, at + 10, 14);
  const check = prog(t, done, done + 12, arriveE);
  return (
    <>
      <StepLabel t={t} at={at} n="04" name="RENDER" color={SOFT} />
      <Headline t={t} at={at} text="Jadi MP4." color={PAPER} />
      <div style={{ position: "absolute", left: 150 * u, top: H * 0.6, width: 900 * u, padding: `${24 * u}px ${28 * u}px`, borderRadius: 16 * u, background: "rgba(241,238,232,0.06)", border: `${2 * u}px solid rgba(241,238,232,0.14)`, opacity: card, transform: `translateY(${(1 - card) * 16 * u}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 * u }}>
          <div style={{ width: 64 * u, height: 64 * u, borderRadius: 14 * u, background: ORANGE, display: "grid", placeItems: "center" }}>
            <div style={{ width: 0, height: 0, marginLeft: 6 * u, borderTop: `${13 * u}px solid transparent`, borderBottom: `${13 * u}px solid transparent`, borderLeft: `${20 * u}px solid ${GRAPHITE}` }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 34 * u, color: PAPER }}>promo-kasir.mp4</div>
            <div style={{ fontFamily: MONO, fontSize: 19 * u, color: SOFT, marginTop: 4 * u }}>1080p · 30 fps · 20 dtk</div>
          </div>
          <svg width={56 * u} height={56 * u} viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="26" fill={check > 0 ? ORANGE : "none"} opacity={check} />
            <path d="M16 29l8 8 16-17" fill="none" stroke={GRAPHITE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40" strokeDashoffset={40 * (1 - check)} />
          </svg>
        </div>
        <div style={{ marginTop: 22 * u, height: 8 * u, borderRadius: 4 * u, background: "rgba(241,238,232,0.12)", overflow: "hidden" }}>
          <div style={{ width: `${p * 100}%`, height: "100%", background: ORANGE }} />
        </div>
        <div style={{ marginTop: 10 * u, fontFamily: MONO, fontSize: 18 * u, color: SOFT }}>{check > 0.5 ? "Selesai, di komputermu" : `Merender di komputermu · ${Math.round(p * 100)}%`}</div>
      </div>
      <Sfx name="tick" at={start} volume={0.12} />
      <Sfx name="success" at={done} volume={0.28} />
    </>
  );
}

/** 5. The close: the mark draws its M, the name lands beside it, the line under them. */
export function Close({ t, at }: Step) {
  const { W, H } = useFilm();
  const u = W / 1920;
  const mark = settle(t, at + 10, 14);
  const m = prog(t, at + 16, at + 32, arriveE);
  const name = settle(t, at + 22, 16);
  const line = settle(t, at + 34, 16);
  const size = 170 * u;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36 * u, paddingBottom: H * 0.04 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 40 * u }}>
        <svg width={size} height={size} viewBox="0 0 64 64" style={{ opacity: mark, transform: `scale(${0.92 + 0.08 * mark})` }}>
          <rect width="64" height="64" rx="15" fill={ORANGE} />
          <path d="M16 46V18l16 18 16-18v28" fill="none" stroke={PAPER} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="130" strokeDashoffset={130 * (1 - m)} />
        </svg>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 190 * u, lineHeight: 1, letterSpacing: "-0.055em", color: INK, clipPath: wipeIn(t, at + 22, 16, "left"), transform: `translateX(${(1 - name) * -20 * u}px)` }}>OneMotion</div>
      </div>
      <div style={{ fontFamily: TEXT, fontWeight: 500, fontSize: 44 * u, color: INK, opacity: line, transform: `translateY(${(1 - line) * 12 * u}px)` }}>Ceritakan videomu. Sisanya kami kerjakan.</div>
      <div style={{ fontFamily: MONO, fontSize: 24 * u, color: "#6B6F76", opacity: settle(t, at + 44, 14) }}>dari OneAPI · oneapi.id</div>
      <Sfx name="impact" at={at + 14} volume={0.2} />
    </div>
  );
}

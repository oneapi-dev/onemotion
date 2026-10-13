"use client";

import { useState } from "react";
import type { DirectInput } from "@/director/input";
import { NARRATION_MAX, normalizePlan, SPECS, UnusablePlanError } from "@/director/rules";
import type { Plan, PlanItem, PlanScene, SceneType } from "@/engine/plan";

const LABELS: Record<SceneType, string> = {
  hook: "Opening line",
  logo: "Logo reveal",
  statement: "Big statement",
  screenshot: "Website screenshot",
  device: "Phone view",
  features: "Feature cards",
  steps: "Three steps",
  converge: "Things flowing into the brand",
  stat: "Big number",
  quote: "Testimonial",
  offer: "Promotion",
  cta: "Call to action",
  announce: "Announcement",
  chat: "Chat",
  code: "Code",
  checklist: "Checklist",
  bars: "Bar chart",
  compare: "Comparison",
  kinetic: "Big words",
  specs: "Spec sheet",
};

const FIELD: Partial<Record<SceneType, Partial<Record<"eyebrow" | "title" | "body" | "value" | "left" | "right", string>>>> = {
  hook: { title: "Headline", body: "Subline" },
  logo: { title: "Tagline" },
  statement: { title: "Statement" },
  stat: { value: "Number", title: "Label", body: "Detail" },
  quote: { body: "Quote", title: "Who said it" },
  offer: { eyebrow: "Label", title: "Headline", value: "Value", body: "Fine print" },
  cta: { title: "Button", body: "Line under the name" },
  announce: { eyebrow: "Badge", title: "Name", body: "Subline" },
  code: { eyebrow: "File name", title: "Caption", body: "Code" },
  bars: { title: "Heading", body: "Source" },
  compare: { title: "Heading", left: "Left label", right: "Right label" },
};

const ITEM: Partial<Record<SceneType, [string, string]>> = {
  announce: ["Chip", ""],
  bars: ["Label", "Value"],
  compare: ["Left side", "Right side"],
  specs: ["Label", "Value"],
  kinetic: ["Word", ""],
  chat: ["", "Message"],
};

function Field({ label, value, max, code, onChange }: { label: string; value: string; max: number; code?: boolean; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>
        {label} <em>{[...value].length}/{max}</em>
      </span>
      {code ? (
        <textarea className="code" rows={6} spellCheck={false} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

/**
 * Edit the words of each scene. Structure, timing and look stay the
 * director's; the same rules re-check and re-time the plan on save.
 */
export function Editor({ plan, input, onSave }: { plan: Plan; input: DirectInput; onSave: (p: Plan) => void }) {
  const [draft, setDraft] = useState<Plan>(() => structuredClone(plan));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const patch = (i: number, next: Partial<PlanScene>) => {
    setSaved(false);
    setDraft((p) => ({ ...p, scenes: p.scenes.map((s, j) => (j === i ? { ...s, ...next } : s)) }));
  };

  function save() {
    try {
      const fixed = normalizePlan(draft, { ...input, previous: undefined, recent: [], keepBrandColor: true });
      setDraft(structuredClone(fixed));
      setError(null);
      setSaved(true);
      onSave(fixed);
    } catch (err) {
      setError(err instanceof UnusablePlanError ? "Too few scenes would be left. Keep at least a headline and a call to action." : String(err));
    }
  }

  return (
    <div className="editor">
      {draft.scenes.map((scene, i) => {
        const spec = SPECS[scene.type];
        const names = FIELD[scene.type] ?? { title: "Heading" };
        const [itemTitle, itemBody] = ITEM[scene.type] ?? ["Item", "Detail"];
        const setItem = (k: number, next: Partial<PlanItem>) => patch(i, { items: scene.items?.map((x, j) => (j === k ? { ...x, ...next } : x)) });
        return (
          <fieldset key={i}>
            <legend>
              {i + 1}. {LABELS[scene.type]}
            </legend>
            {(["eyebrow", "value", "title", "left", "right", "body"] as const).map((f) =>
              spec[f] && names[f] ? (
                <Field key={f} label={names[f] as string} value={scene[f] ?? ""} max={spec[f] as number} code={scene.type === "code" && f === "body"} onChange={(v) => patch(i, { [f]: v })} />
              ) : null,
            )}
            {scene.narration !== undefined ? (
              <Field label="Voiceover" value={scene.narration} max={NARRATION_MAX} onChange={(v) => patch(i, { narration: v })} />
            ) : null}
            {scene.items?.map((it, k) => (
              <div className="pair" key={k}>
                {spec.itemTitle && itemTitle ? <Field label={`${itemTitle} ${k + 1}`} value={it.title} max={spec.itemTitle} onChange={(v) => setItem(k, { title: v })} /> : null}
                {spec.itemBody && itemBody !== "" ? (
                  <Field label={scene.type === "chat" ? (it.title === "ai" ? "AI reply" : "Message") : itemBody} value={it.body ?? ""} max={spec.itemBody} onChange={(v) => setItem(k, { body: v })} />
                ) : null}
              </div>
            ))}
          </fieldset>
        );
      })}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? <p className="ok">Saved. The preview shows your words{draft.scenes.some((s) => s.narration) ? "; changed voiceover lines are recorded again" : ""}.</p> : null}
      <div className="row">
        <button type="button" className="btn primary" onClick={save}>
          Save text
        </button>
      </div>
    </div>
  );
}

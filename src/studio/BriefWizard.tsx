"use client";

import { useEffect, useRef, useState } from "react";
import { applySuggestion, AUDIENCES, buildBrief, DEFAULT_SITE, defaultAnswers, LANGUAGES, LENGTHS, LOOKS, TEMPLATES, templateOf, type BriefAnswers, type TemplateId } from "./briefs";
import { suggestBrief } from "./suggest";

const STEPS = ["Product", "Message", "Look and sound"] as const;

/**
 * Three short steps that turn into a brief: the product, the message, the
 * look. The result lands in the brief box, where it stays the person's to
 * edit. Nothing here calls a model.
 */
export function BriefWizard({
  open,
  template,
  website,
  ai,
  onUse,
  onClose,
}: {
  open: boolean;
  template: TemplateId;
  website: string;
  /** The person's key and model, for "write it with AI"; null until they are set. */
  ai: { key: string; model: string } | null;
  onUse: (brief: string, website: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [a, setA] = useState<BriefAnswers>(() => defaultAnswers(template, website));
  const [step, setStep] = useState(0);
  const [writing, setWriting] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setA(defaultAnswers(template, website));
      setStep(0);
      setWriting({ busy: false, error: null });
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, template, website]);

  const t = templateOf(a.template);
  const set = <K extends keyof BriefAnswers>(k: K, v: BriefAnswers[K]) => setA((x) => ({ ...x, [k]: v }));
  const last = step === STEPS.length - 1;

  async function writeWithAI() {
    if (!ai || writing.busy) return;
    abort.current?.abort();
    abort.current = new AbortController();
    setWriting({ busy: true, error: null });
    try {
      const s = await suggestBrief({ key: ai.key, model: ai.model, answers: a, signal: abort.current.signal });
      setA((x) => applySuggestion(x, s));
      setStep(1);
      setWriting({ busy: false, error: null });
    } catch (err) {
      if (abort.current.signal.aborted) return;
      setWriting({ busy: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const aiButton = (
    <div className="ai-fill">
      <button type="button" className="btn small" onClick={() => void writeWithAI()} disabled={!ai || writing.busy}>
        {writing.busy ? `Reading ${a.website.trim() || DEFAULT_SITE} and writing…` : "✦ Write it with AI"}
      </button>
      <small className={writing.error ? "error" : "hint"}>
        {writing.error ?? (ai ? `Fills the empty fields from ${a.website.trim() || DEFAULT_SITE}; what you typed stays. One small call on your key.` : "Add your OneAPI key and a model in Settings to use this.")}
      </small>
    </div>
  );

  return (
    <dialog
      ref={ref}
      className="dialog wizard"
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      aria-labelledby="wizard-title"
    >
      <form
        method="dialog"
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!last) return setStep((s) => s + 1);
          onUse(buildBrief(a), a.website.trim());
        }}
      >
        <h2 id="wizard-title">Brief wizard</h2>
        <ol className="steps" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined}>
              <button type="button" className="step" onClick={() => setStep(i)}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <>
            <div className="field">
              <span>Kind of video</span>
              <div className="templates" role="radiogroup" aria-label="Kind of video">
                {TEMPLATES.map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={a.template === x.id} className="template" onClick={() => setA((y) => ({ ...y, template: x.id, seconds: x.seconds }))}>
                    <strong>{x.label}</strong>
                    <small>{x.hint}</small>
                  </button>
                ))}
              </div>
            </div>
            {a.template === "custom" ? (
              <>
                <label className="field">
                  <span>What kind of video</span>
                  <input type="text" value={a.kind} onChange={(e) => set("kind", e.target.value)} placeholder="e.g. a recruiting video for backend engineers" />
                </label>
                <label className="field">
                  <span>What it should do</span>
                  <input type="text" value={a.goal} onChange={(e) => set("goal", e.target.value)} placeholder="e.g. get engineers to apply this month" />
                </label>
              </>
            ) : null}
            <label className="field">
              <span>Website</span>
              <input type="text" inputMode="url" spellCheck={false} value={a.website} onChange={(e) => set("website", e.target.value)} placeholder={DEFAULT_SITE} />
            </label>
            <p className="hint">Left empty, the video is about {DEFAULT_SITE}. The art director reads the site for its own words, features, prices and logo.</p>
            <label className="field">
              <span>Product name (optional)</span>
              <input type="text" value={a.product} onChange={(e) => set("product", e.target.value)} placeholder="Read from the website" />
            </label>
            <label className="field">
              <span>What it is, in one line (optional)</span>
              <input type="text" value={a.about} onChange={(e) => set("about", e.target.value)} placeholder="Read from the website" />
            </label>
            {aiButton}
          </>
        ) : null}

        {step === 1 ? (
          <>
            {aiButton}
            <label className="field">
              <span>{t.subjectLabel}</span>
              <input type="text" value={a.subject} onChange={(e) => set("subject", e.target.value)} placeholder={t.subjectPlaceholder} />
            </label>
            <div className="field">
              <span>{t.pointsLabel}</span>
              {a.points.map((p, i) => (
                <input key={i} type="text" value={p} onChange={(e) => set("points", a.points.map((q, k) => (k === i ? e.target.value : q)))} placeholder={t.pointsPlaceholder[i]} />
              ))}
            </div>
            <label className="field">
              <span>Who it is for</span>
              <select value={a.audience} onChange={(e) => set("audience", e.target.value)}>
                {AUDIENCES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Call to action</span>
              <input type="text" value={a.cta} onChange={(e) => set("cta", e.target.value)} placeholder={`Try it at ${a.website.trim() || DEFAULT_SITE}`} />
            </label>
            <p className="hint">Anything left empty comes from the website. Numbers and claims on screen only come from the site or from what you write here.</p>
          </>
        ) : null}

        {step === 2 ? (
          <>
            {(
              [
                ["auto", "Look"],
                ["promo", "Promo and launch looks"],
                ["explainer", "Explainer looks"],
              ] as const
            ).map(([group, title]) => (
              <div className="field" key={group}>
                <span>{title}</span>
                <div className="templates compact" role="radiogroup" aria-label={title}>
                  {LOOKS.filter((l) => l.group === group).map((l) => (
                    <button key={l.id} type="button" role="radio" aria-checked={a.look === l.id} className="template" title={l.hint} onClick={() => set("look", l.id)}>
                      <strong>{l.label}</strong>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="hint">{LOOKS.find((l) => l.id === a.look)?.hint}</p>
            <div className="row wrap">
              <div className="field">
                <span>Length</span>
                <div className="seg" role="radiogroup" aria-label="Length">
                  {LENGTHS.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={a.seconds === s} onClick={() => set("seconds", s)}>
                      {s} s
                    </button>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Language</span>
                <select value={a.language} onChange={(e) => set("language", e.target.value)}>
                  {LANGUAGES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="inline">
              <input type="checkbox" checked={a.voice} onChange={(e) => set("voice", e.target.checked)} style={{ width: "auto" }} />
              <span>A voice-over (recorded when ElevenLabs is set up in Settings)</span>
            </label>
            <details className="brief-preview">
              <summary>The brief this makes</summary>
              <pre>{buildBrief(a)}</pre>
            </details>
          </>
        ) : null}

        <div className="row end">
          <button type="button" className="btn ghost" onClick={step ? () => setStep((s) => s - 1) : onClose}>
            {step ? "Back" : "Cancel"}
          </button>
          <button type="submit" className="btn primary">
            {last ? "Use this brief" : "Next"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

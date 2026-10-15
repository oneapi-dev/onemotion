"use client";

import { useEffect, useRef, useState } from "react";
import { basicBrief, DEFAULT_SITE, defaultIdea, LANGUAGES, LENGTHS, LOOKS, TEMPLATES, templateOf, type BriefIdea, type TemplateId } from "./briefs";
import { writeBrief } from "./suggest";

const GROUPS = [
  ["auto", "Let the art director choose"],
  ["promo", "Promo and launch looks"],
  ["explainer", "Explainer looks"],
] as const;

/**
 * One short form: the kind of video, the website, the idea in the person's
 * own words and a few choices. Their model then writes the whole brief from
 * the website (positioning, capabilities, a timed storyboard, motifs, sound,
 * the close). The brief lands in the brief box, still theirs to edit.
 */
export function BriefWizard({
  open,
  template,
  website,
  format,
  ai,
  onUse,
  onClose,
}: {
  open: boolean;
  template: TemplateId;
  website: string;
  /** The video size chosen in the Studio, for the brief's deliverable line. */
  format: string;
  /** The person's key and model; null until they are set. */
  ai: { key: string; model: string } | null;
  onUse: (brief: string, website: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [idea, setIdea] = useState<BriefIdea>(() => defaultIdea(template, website));
  const [writing, setWriting] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setIdea(defaultIdea(template, website));
      setWriting({ busy: false, error: null });
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, template, website]);

  const t = templateOf(idea.template);
  const set = <K extends keyof BriefIdea>(k: K, v: BriefIdea[K]) => setIdea((x) => ({ ...x, [k]: v }));
  const site = idea.website.trim() || DEFAULT_SITE;

  async function write() {
    if (!ai || writing.busy) return;
    abort.current?.abort();
    abort.current = new AbortController();
    setWriting({ busy: true, error: null });
    try {
      const r = await writeBrief({ key: ai.key, model: ai.model, idea, format, signal: abort.current.signal });
      setWriting({ busy: false, error: null });
      onUse(r.brief, r.website);
    } catch (err) {
      if (abort.current.signal.aborted) return;
      setWriting({ busy: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

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
          void write();
        }}
      >
        <h2 id="wizard-title">Brief wizard</h2>
        <p className="muted">Say what the video is about in a line. Your model reads {site} and writes the whole brief: the story, a storyboard second by second, the look and the sound.</p>

        <div className="field">
          <span>Kind of video</span>
          <div className="templates compact" role="radiogroup" aria-label="Kind of video">
            {TEMPLATES.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={idea.template === x.id} className="template" title={x.hint} onClick={() => setIdea((y) => ({ ...y, template: x.id, seconds: x.seconds }))}>
                <strong>{x.label}</strong>
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Website</span>
          <input type="text" inputMode="url" spellCheck={false} value={idea.website} onChange={(e) => set("website", e.target.value)} placeholder={`${DEFAULT_SITE} (when left empty)`} />
        </label>

        <label className="field">
          <span>What is it about? (optional)</span>
          <textarea rows={3} value={idea.idea} onChange={(e) => set("idea", e.target.value)} placeholder={`${t.ideaPlaceholder}. Add an offer, a price or anything that must be in it.`} />
        </label>

        <div className="row wrap">
          <label className="field" style={{ flex: "1 1 220px" }}>
            <span>Look</span>
            <select value={idea.look} onChange={(e) => set("look", e.target.value)}>
              {GROUPS.map(([group, title]) => (
                <optgroup key={group} label={title}>
                  {LOOKS.filter((l) => l.group === group).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: "0 1 170px" }}>
            <span>Language</span>
            <select value={idea.language} onChange={(e) => set("language", e.target.value)}>
              {LANGUAGES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">{LOOKS.find((l) => l.id === idea.look)?.hint}</p>

        <div className="row wrap">
          <div className="field">
            <span>Length</span>
            <div className="seg" role="radiogroup" aria-label="Length">
              {LENGTHS.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={idea.seconds === s} onClick={() => set("seconds", s)}>
                  {s} s
                </button>
              ))}
            </div>
          </div>
          <label className="inline" style={{ alignSelf: "flex-end" }}>
            <input type="checkbox" checked={idea.voice} onChange={(e) => set("voice", e.target.checked)} style={{ width: "auto" }} />
            <span>Voice-over</span>
          </label>
        </div>

        {writing.error ? (
          <p className="error" role="alert">
            {writing.error}
          </p>
        ) : (
          <p className="hint">{ai ? `One call on your key (${ai.model}); facts and prices come only from ${site} and what you write here.` : "Add your OneAPI key and a model in Settings to have the brief written for you, or use a basic brief."}</p>
        )}

        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => onUse(basicBrief(idea), idea.website.trim())} disabled={writing.busy}>
            Basic brief
          </button>
          <button type="submit" className="btn primary" disabled={!ai || writing.busy}>
            {writing.busy ? `Reading ${site} and writing…` : "✦ Write the brief"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

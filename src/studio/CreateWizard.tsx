"use client";

import { useState, type ReactNode } from "react";
import type { CatalogModel } from "@/director/input";
import type { MotionFormat, Tone } from "@/engine/plan";
import { prepareAsset, scaled } from "@/bespoke/agent/images";
import { findUrl } from "@/director/facts";
import { applyReview, basicBrief, briefFromIdea, defaultIdea, guideOf, isWebsite, looksLikeBrief, MAX_GUIDE, withGuide, withoutGuide, LANGUAGES, LENGTHS, LOOKS, siteOf, TEMPLATES, templateOf, websiteOk, withAnswers, type BriefIdea, type BriefReview, type Partner } from "./briefs";
import { reviewBrief, writeBrief } from "./suggest";
import { LookGallery } from "./LookGallery";

/**
 * Making a video, one question at a time: what kind, what it is about,
 * how it should look, then the brief it all adds up to (ready to edit, or
 * written in full by the person's model) and the button that makes it.
 */

type Step = 0 | 1 | 2 | 3;
const STEPS = ["What", "About", "Style", "Brief"] as const;

const FORMATS: { id: MotionFormat; label: string; hint: string }[] = [
  { id: "landscape", label: "16:9", hint: "YouTube, X, websites" },
  { id: "portrait", label: "9:16", hint: "Reels, Shorts, TikTok" },
  { id: "square", label: "1:1", hint: "Feed posts" },
];

const TONES: (Tone | "auto")[] = ["auto", "punchy", "polished", "cinematic", "playful", "deadpan", "energetic", "clean"];

/** How much the video moves, in plain words: one motion language for the whole video. */
const PACE_OPTIONS = [
  ["auto", "Let AI pick"],
  ["calm", "Calm"],
  ["balanced", "Balanced"],
  ["lively", "Lively"],
  ["loud", "Loud"],
] as const;
const PACE_HINTS: Record<(typeof PACE_OPTIONS)[number][0], string> = {
  auto: "The art director matches it to the brand and the brief (it leans calm).",
  calm: "Slow and premium: things glide in, then hold still so every word is read.",
  balanced: "Clear and confident: crisp moves, short holds.",
  lively: "Bright and bouncy: quicker moves with a little spring.",
  loud: "Fast cuts on the music's beat, like a trailer.",
};

const LOOK_GROUPS = [
  ["auto", "Let the art director choose"],
  ["promo", "Promo and launch looks"],
  ["explainer", "Explainer looks"],
] as const;

const KIND_GROUPS = [
  ["product", "Promote a product or brand"],
  ["teach", "Teach or tell: faceless videos"],
] as const;

/** Each kind's mark: a small drawing of what the video does. */
const KIND_ICON: Record<string, ReactNode> = {
  launch: <path d="M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10ZM10 19l2 2 2-2M12 9.5v.01" />,
  feature: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  tutorial: <path d="M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3" />,
  switch: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  announcement: <path d="M4 10v4h3l7 4V6l-7 4H4ZM18 9a4 4 0 0 1 0 6" />,
  collab: <path d="M9 7a5 5 0 1 0 0 10A5 5 0 0 0 9 7ZM15 7a5 5 0 1 1 0 10A5 5 0 0 1 15 7Z" />,
  explainer: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" />,
  listicle: <path d="M9 6h11M9 12h11M9 18h11M4 5l1-1v4M3.5 11.5c.3-.6 1.7-.8 2 0 .3.7-2 2-2 2.5h2M3.5 16.5h2l-1 1.2c.8 0 1.2.4 1.2 1s-.6 1-1.2 1-.9-.2-1-.4" />,
  story: <path d="M4 5c3-1 5-1 8 1v14c-3-2-5-2-8-1V5ZM20 5c-3-1-5-1-8 1v14c3-2 5-2 8-1V5Z" />,
  myth: <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0Z" />,
  custom: <path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4" />,
};

export function CreateWizard(o: {
  busy: boolean;
  ready: boolean;
  ai: { key: string; model: string } | null;
  website: string;
  onWebsite: (v: string) => void;
  /** A collaboration video's partner brand, or null. */
  partner: Partner | null;
  onPartner: (p: Partner | null) => void;
  format: MotionFormat;
  onFormat: (f: MotionFormat) => void;
  mode: "bespoke" | "plan";
  onMode: (m: "bespoke" | "plan") => void;
  tone: Tone | "auto";
  onTone: (t: Tone | "auto") => void;
  refs: string[];
  onRefs: (refs: string[]) => void;
  maxRefs: number;
  brief: string;
  onBrief: (b: string) => void;
  maxBrief: number;
  /** Make the video from the brief. */
  onMake: () => void;
  /** What the make button says while it runs, and how to stop it. */
  running: ReactNode | null;
  onStop?: () => void;
  /** A film that shows what OneMotion makes, beside the opening question. */
  hero?: ReactNode;
  /** Back to the video that was open, when there is one. */
  onCancel?: () => void;
  /** The models the person can make it with, the chosen one, and a way to change it or add the key. */
  models: CatalogModel[];
  model: string;
  hasKey: boolean;
  onModel: (id: string) => void;
  onSettings: () => void;
}) {
  const [step, setStep] = useState<Step>(o.brief.trim() ? 3 : 0);
  const [idea, setIdea] = useState<BriefIdea>(() => defaultIdea("launch", o.website));
  /** The person wrote the brief themselves (or edited it): the AI then reviews their words and keeps them, it does not write a new brief. */
  const [own, setOwn] = useState(Boolean(o.brief.trim()));
  const [writing, setWriting] = useState<{ busy: boolean; error: string | null; before: string | null; wasOwn: boolean }>({ busy: false, error: null, before: null, wasOwn: false });
  /** The person's brand guide (DESIGN.md), kept so a brief rebuilt from the form still carries it. */
  const [guide, setGuide] = useState<{ name: string; text: string } | null>(null);
  const [guideError, setGuideError] = useState<string | null>(null);
  const withOwnGuide = (b: string) => (guide ? withGuide(b, guide.name, guide.text) : b);
  /** The idea was empty when the brief step opened: the AI writer then asks for it there. */
  const [askAbout, setAskAbout] = useState(false);
  /** What the review found, and the person's answers to its questions. */
  const [review, setReview] = useState<{ found: BriefReview; answers: string[] } | null>(null);
  const set = <K extends keyof BriefIdea>(k: K, v: BriefIdea[K]) => setIdea((x) => ({ ...x, [k]: v }));
  const t = templateOf(idea.template);
  /** A kind chosen: its length, narration for a teach kind (a faceless video is told by its voice), a partner for a collaboration. */
  const pickKind = (id: BriefIdea["template"]) => {
    const k = templateOf(id);
    // A teach kind hides the website, partner and screenshots: none left over from a product kind may steer it unseen.
    const teachKind = k.group === "teach";
    setIdea((y) => ({ ...y, template: id, seconds: k.seconds, voice: teachKind ? true : y.voice, website: teachKind ? "" : y.website }));
    if (id === "collab" && !o.partner) o.onPartner({ website: "", lead: "host" });
    if (teachKind) {
      if (o.partner) o.onPartner(null);
      if (o.website) o.onWebsite("");
      if (o.refs.length) o.onRefs([]);
    }
    setOwn(false);
    setStep(1);
  };
  const site = siteOf(idea.website || o.website);
  // The website is optional (a video can be about no website at all); what is typed must be an address.
  const siteOk = websiteOk(site);
  const briefNamesSite = Boolean(findUrl(o.brief));
  // A video that teaches or tells: no product, so no website, partner or product screenshots to ask for.
  const teach = t.group === "teach";
  // A partner, once added, needs its website; a collaboration needs a partner.
  const partnerOk = o.partner ? isWebsite(o.partner.website) : idea.template !== "collab";
  const canMake = Boolean(o.brief.trim()) && siteOk && partnerOk;
  const busy = o.busy || writing.busy;
  const chat = o.models.filter((m) => m.capabilities.includes("Chat") || m.capabilities.length === 0);
  const fullIdea = (x: BriefIdea): BriefIdea => ({ ...x, website: x.website || o.website, partner: o.partner });

  /** Into the brief step: a ready brief from the answers, unless the person has written their own. */
  const toBrief = () => {
    const i = fullIdea(idea);
    if (!own && looksLikeBrief(i.idea)) {
      // A whole brief pasted as the idea is the brief: kept as written, reviewed (not rewritten) by the AI.
      o.onBrief(withOwnGuide(briefFromIdea(i)));
      setOwn(true);
    } else if (!own) o.onBrief(withOwnGuide(basicBrief(i)));
    setAskAbout(!own && !looksLikeBrief(i.idea) && !i.idea.trim());
    setStep(3);
  };

  /** The idea, as the form has it, with the brief rebuilt from it while the person has not written their own. */
  const setAbout = (text: string) => {
    const next = { ...idea, idea: text };
    setIdea(next);
    if (!own) o.onBrief(withOwnGuide(basicBrief(fullIdea(next))));
  };

  /** The partner section: the partner's fields once one is added (always for a collaboration), else a way to add one. */
  const partnerSection = o.partner ? (
    <PartnerField partner={o.partner} onChange={o.onPartner} onRemove={idea.template === "collab" ? undefined : () => o.onPartner(null)} disabled={busy} />
  ) : (
    <button type="button" className="link" onClick={() => o.onPartner({ website: "", lead: "host" })} disabled={busy}>
      + Add a partner brand (a collaboration)
    </button>
  );

  /** A DESIGN.md (or any text file) read in as the brief's brand guide. */
  async function addGuide(file: File) {
    setGuideError(null);
    if (file.size > 200_000) {
      setGuideError("That file is too large for a brand guide. Keep it to the colours, type and rules (a few pages).");
      return;
    }
    const text = (await file.text()).trim();
    if (!text) {
      setGuideError("That file is empty.");
      return;
    }
    if (/\u0000/.test(text)) {
      setGuideError("That is not a text file. Use a .md or .txt file.");
      return;
    }
    setGuide({ name: file.name, text });
    o.onBrief(withGuide(o.brief, file.name, text));
  }

  /**
   * The AI on the brief step. A brief the person wrote is reviewed: kept word
   * for word, with what is missing added below and questions only they can
   * answer. Otherwise their model writes one around what they said it is about.
   */
  async function assist() {
    if (!o.ai || writing.busy) return;
    const before = o.brief;
    setWriting({ busy: true, error: null, before: null, wasOwn: own });
    setReview(null);
    try {
      if (own) {
        const r = await reviewBrief({ key: o.ai.key, model: o.ai.model, brief: o.brief, website: o.website });
        o.onBrief(applyReview(o.brief, r.review, siteOf(r.website)));
        if (r.website && !o.website.trim()) o.onWebsite(r.website);
        setReview({ found: r.review, answers: r.review.questions.map(() => "") });
      } else {
        const r = await writeBrief({ key: o.ai.key, model: o.ai.model, idea: fullIdea(idea), format: FORMATS.find((f) => f.id === o.format)?.label ?? "16:9" });
        o.onBrief(r.brief);
        setOwn(true);
        if (r.website && !o.website.trim()) o.onWebsite(r.website);
      }
      setWriting({ busy: false, error: null, before, wasOwn: own });
    } catch (err) {
      setWriting({ busy: false, error: err instanceof Error ? err.message : String(err), before: null, wasOwn: own });
    }
  }

  const needsAbout = !own && !idea.idea.trim();

  return (
    <div className="wizard-pane">
      <header className="wizard-head">
        <div className="pane-intro">
          <h1 className="display">Make a video.</h1>
          <p>Answer four questions. An AI art director invents the look, an AI motion designer writes the video&apos;s own animation, and this computer renders it.</p>
          {o.onCancel ? (
            <button type="button" className="link" onClick={o.onCancel} disabled={busy}>
              Back to my video
            </button>
          ) : null}
        </div>
        {o.hero && step === 0 ? <div className="wizard-hero">{o.hero}</div> : null}
      </header>

      <ol className="progress" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={step === i ? "step" : undefined} data-done={step > i || undefined}>
            <button type="button" onClick={() => (i === 3 ? toBrief() : setStep(i as Step))} disabled={busy || (i >= 2 && !siteOk && !own)}>
              <span className="mono">{i + 1}</span> {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="wiz-step">
          <h2 className="step-q">What are you making?</h2>
          {KIND_GROUPS.map(([group, title]) => (
            <div key={group} className="kind-group">
              <h3 className="kind-group-title">{title}</h3>
              <div className="kinds" role="radiogroup" aria-label={title} data-group={group}>
                {TEMPLATES.filter((x) => x.group === group && x.id !== "custom").map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={idea.template === x.id} className="kind" disabled={busy} onClick={() => pickKind(x.id)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      {KIND_ICON[x.id]}
                    </svg>
                    <span className="kind-text">
                      <strong>{x.label}</strong>
                      <span>{x.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button type="button" className="link" disabled={busy} onClick={() => pickKind("custom")}>
            Something else: describe your own kind of video
          </button>
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => {
              setOwn(true);
              setStep(3);
            }}
          >
            I have my own brief, script or storyboard
          </button>
        </div>
      ) : step === 1 ? (
        <div className="wiz-step">
          <h2 className="step-q">What is it about?</h2>
          {teach ? null : (
            <>
              <WebsiteField value={idea.website || o.website} onChange={(v) => {
                set("website", v);
                o.onWebsite(v);
              }} disabled={busy} />
              {partnerSection}
            </>
          )}
          <label className="field">
            <span>{teach ? "The subject" : "In your words"}</span>
            <textarea rows={4} value={idea.idea} onChange={(e) => set("idea", e.target.value)} placeholder={teach ? `${t.ideaPlaceholder}${/[.?!]$/.test(t.ideaPlaceholder) ? "" : "."} Add any fact, number or source that must be in it.` : `${t.ideaPlaceholder}. Add an offer, a price or anything that must be in it.`} disabled={busy} />
            <small className="hint">{looksLikeBrief(idea.idea) ? "This reads as a whole brief: it becomes the brief as written, and the AI reviews it rather than rewriting it." : "A line or two is enough. Have a full brief or storyboard? Paste it here: it is used as written."}</small>
          </label>
          {teach ? null : (
            <div className="field">
              <span>Product screenshots (optional)</span>
              <div className="refs">
                {o.refs.map((url, i) => (
                  <button key={i} type="button" className="ref" aria-label={`Remove screenshot ${i + 1}`} title="Remove" onClick={() => o.onRefs(o.refs.filter((_, k) => k !== i))} disabled={busy}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" />
                  </button>
                ))}
                {o.refs.length < o.maxRefs ? (
                  <label className="ref add" title="Add screenshots">
                    <span aria-hidden="true">+</span>
                    <span className="sr-only">Add screenshots</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      disabled={busy}
                      onChange={async (e) => {
                        const files = [...(e.target.files ?? [])].slice(0, o.maxRefs - o.refs.length);
                        e.target.value = "";
                        const urls = await Promise.all(files.map((f) => scaled(f, 1280).catch(() => null)));
                        o.onRefs([...o.refs, ...urls.filter((u): u is string => Boolean(u))].slice(0, o.maxRefs));
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <small className="hint">The video remakes your real interface from these.</small>
            </div>
          )}
          <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} disabled={busy} nextDisabled={!siteOk || !partnerOk} why={!siteOk ? "Fix the website address, or clear it." : !partnerOk ? "Add the partner's website to continue." : null} />
        </div>
      ) : step === 2 ? (
        <div className="wiz-step">
          <h2 className="step-q">How should it look?</h2>
          <div className="field">
            <span>Format</span>
            <div className="formats" role="radiogroup" aria-label="Video size">
              {FORMATS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={o.format === f.id} className="format" onClick={() => o.onFormat(f.id)} disabled={busy}>
                  <span className={`shape shape-${f.id}`} aria-hidden="true" />
                  <strong>{f.label}</strong>
                  <span>{f.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Length</span>
            <div className="seg" role="radiogroup" aria-label="Length">
              {LENGTHS.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={idea.seconds === s} onClick={() => set("seconds", s)} disabled={busy}>
                  {s}s
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Look</span>
            <LookGallery looks={LOOKS} groups={LOOK_GROUPS} value={idea.look} onChange={(id) => set("look", id)} disabled={busy} />
          </div>
          <div className="field">
            <span>Energy</span>
            <div className="seg" role="radiogroup" aria-label="Energy">
              {PACE_OPTIONS.map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={(idea.pace ?? "auto") === id} onClick={() => set("pace", id)} disabled={busy}>
                  {label}
                </button>
              ))}
            </div>
            <small className="hint">{PACE_HINTS[idea.pace ?? "auto"]}</small>
          </div>
          <div className="pair">
            <label className="field">
              <span>Language</span>
              <select value={idea.language} onChange={(e) => set("language", e.target.value)} disabled={busy}>
                {LANGUAGES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Voice-over</span>
              <label className="switch">
                <input type="checkbox" role="switch" checked={idea.voice} onChange={(e) => set("voice", e.target.checked)} disabled={busy} />
                <span>{idea.voice ? "Narrated" : "Music and text only"}</span>
              </label>
            </div>
          </div>
          <StepNav onBack={() => setStep(1)} onNext={toBrief} disabled={busy} nextDisabled={!siteOk || !partnerOk} why={null} />
        </div>
      ) : (
        <div className="wiz-step">
          <h2 className="step-q">{own ? "Your brief" : "The brief"}</h2>
          <label className="field">
            <span className="field-row">
              Brief
              <span className="mono hint">
                {o.brief.length.toLocaleString("en-US")} / {o.maxBrief.toLocaleString("en-US")}
              </span>
            </span>
            <textarea
              rows={o.brief.length > 600 ? 14 : 8}
              maxLength={20_000}
              value={o.brief}
              onChange={(e) => {
                o.onBrief(e.target.value);
                setOwn(true);
              }}
              placeholder="Write what the video should be, or paste a storyboard."
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy && canMake) o.onMake();
              }}
              disabled={busy}
            />
            {o.brief.length > o.maxBrief ? <small className="error">Quick takes a short brief; switch to Bespoke for a long one.</small> : null}
          </label>
          {own && !briefNamesSite && !teach ? <WebsiteField value={o.website} onChange={o.onWebsite} disabled={busy} /> : null}
          {own && !teach ? partnerSection : null}
          {o.partner && o.mode === "plan" ? <small className="warn">Quick videos read only the partner&apos;s name from the brief; switch to Bespoke for both logos and the partner&apos;s facts.</small> : null}
          {!own && askAbout ? (
            <label className="field">
              <span>
                What is this video about?<em>for the AI writer</em>
              </span>
              <textarea rows={2} value={idea.idea} onChange={(e) => setAbout(e.target.value)} placeholder="e.g. A promo: 50% top-up bonus, from today until next Sunday" disabled={busy} />
            </label>
          ) : null}
          <div className="assist">
            <button
              type="button"
              className="btn small"
              onClick={() => void assist()}
              disabled={!o.ai || busy || !siteOk || needsAbout}
              title={!o.ai ? "Add your OneAPI key and a model in Settings first" : needsAbout ? "Say what the video is about first" : `One call on your key (${o.ai.model})`}
            >
              {writing.busy ? (site ? `Reading ${site} and ${own ? "checking" : "writing"}…` : own ? "Checking…" : "Writing…") : own ? "Improve with AI" : teach ? "Let AI write the script" : "Let AI write it in full"}
            </button>
            {writing.before !== null ? (
              <button
                type="button"
                className="btn small ghost"
                onClick={() => {
                  o.onBrief(writing.before ?? "");
                  setOwn(writing.wasOwn);
                  setReview(null);
                  setWriting({ busy: false, error: null, before: null, wasOwn: false });
                }}
                disabled={busy}
              >
                Undo
              </button>
            ) : null}
            <small className={writing.error ? "error" : "hint"}>
              {writing.error ??
                (own
                  ? `Keeps your brief exactly as written. Your model checks it${site ? " against the website" : ""}, adds only what is missing below it, and asks what only you can answer.`
                  : needsAbout
                    ? "Say what the video is about first: the AI writes the film around it, not a general introduction."
                    : teach
                      ? "Your model writes the narration, a timed storyboard, the look and the sound, and lists every fact it states at the end. Check those facts before you make the video: they come from the model's knowledge."
                      : `Your model ${site ? "reads the website and " : ""}writes a story, a timed storyboard, the look and the sound around what you said. Facts and prices stay as given.`)}
            </small>
          </div>
          <div className="field">
            <span>
              Brand guide<em>optional</em>
            </span>
            {guideOf(o.brief) ? (
              <p className="guide-chip">
                <span className="mono">{guideOf(o.brief)}</span>
                <span className="hint">in the brief, below your text</span>
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => {
                    setGuide(null);
                    o.onBrief(withoutGuide(o.brief));
                  }}
                  disabled={busy}
                >
                  Remove
                </button>
              </p>
            ) : (
              <label className="btn small file-btn">
                Add a DESIGN.md
                <input
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void addGuide(f);
                  }}
                />
              </label>
            )}
            <small className={guideError ? "error" : "hint"}>{guideError ?? `Your brand's colours, type and rules, as a DESIGN.md or text file (up to ${(MAX_GUIDE / 1000).toFixed(0)}k characters are used). The film follows it over the website's look.`}</small>
          </div>
          {review ? (
            <BriefCheck
              review={review.found}
              answers={review.answers}
              onAnswer={(i, v) => setReview((r) => (r ? { ...r, answers: r.answers.map((a, k) => (k === i ? v : a)) } : r))}
              onAdd={() => {
                o.onBrief(withAnswers(o.brief, review.found.questions.map((question, i) => ({ question, answer: review.answers[i] ?? "" }))));
                setReview({ found: { ...review.found, questions: [] }, answers: [] });
              }}
              disabled={busy}
            />
          ) : null}
          <div className="field">
            <span>Made by</span>
            <div className="seg" role="radiogroup" aria-label="How the video is made">
              <button type="button" role="radio" aria-checked={o.mode === "bespoke"} onClick={() => o.onMode("bespoke")} disabled={busy}>
                Bespoke
              </button>
              <button type="button" role="radio" aria-checked={o.mode === "plan"} onClick={() => o.onMode("plan")} disabled={busy}>
                Quick
              </button>
            </div>
            <small className="hint">{o.mode === "bespoke" ? "Its own animation code, written for this video: a few minutes and about $1 to $3 on your key." : "A template filled in: fast and cheap, videos look alike."}</small>
          </div>
          <div className="field">
            <span>AI model</span>
            {o.hasKey ? (
              <>
                {chat.length ? (
                  <select value={o.model} onChange={(e) => o.onModel(e.target.value)} disabled={busy}>
                    {!o.model ? <option value="">Choose a model</option> : null}
                    {chat.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                        {m.inputPrice ? `  ·  $${Number(m.inputPrice)} / $${Number(m.outputPrice)} per 1M tokens` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="text" spellCheck={false} value={o.model} onChange={(e) => o.onModel(e.target.value.trim())} placeholder="Model id, e.g. claude-sonnet-5-5" disabled={busy} />
                )}
                <small className="hint">{o.mode === "bespoke" ? "Billed to your OneAPI key. Bespoke needs a model that reads images and calls tools; a stronger model makes better films." : "Billed to your OneAPI key: one call."}</small>
              </>
            ) : (
              <button type="button" className="btn block" onClick={o.onSettings}>
                Add your OneAPI key to choose a model
              </button>
            )}
          </div>
          {o.mode === "plan" ? (
            <label className="field">
              <span>Tone</span>
              <select value={o.tone} onChange={(e) => o.onTone(e.target.value as Tone | "auto")} disabled={busy}>
                {TONES.map((x) => (
                  <option key={x} value={x}>
                    {x === "auto" ? "Director picks" : x[0].toUpperCase() + x.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="pane-actions">
            <button type="button" className="btn primary block big" onClick={o.onMake} disabled={busy || !canMake || o.brief.length > o.maxBrief}>
              {o.running ?? "Make the video"}
            </button>
            {!canMake && !o.running ? <p className="hint">{!o.brief.trim() ? "Write the brief first." : !partnerOk ? "Add the partner's website." : "Fix the website address, or clear it."}</p> : null}
            {o.onStop ? (
              <button type="button" className="btn block" onClick={o.onStop}>
                Stop
              </button>
            ) : null}
            {!o.ready && o.hasKey ? <p className="hint">Choose a model above first.</p> : null}
            <button type="button" className="btn block" onClick={() => setStep(own ? 0 : 2)} disabled={busy}>
              <svg className="chev" viewBox="0 0 20 20" aria-hidden="true">
                <path d="m12 5-5 5 5 5" />
              </svg>
              {own ? "Start over with the questions" : "Back"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** What "Improve with AI" found: what it added, what contradicts itself, and the questions only the person can answer. */
function BriefCheck({ review, answers, onAnswer, onAdd, disabled }: { review: BriefReview; answers: string[]; onAnswer: (i: number, v: string) => void; onAdd: () => void; disabled: boolean }) {
  const nothing = !review.additions.length && !review.questions.length && !review.conflicts.length;
  return (
    <section className="brief-check" aria-label="What the review found">
      <p className="brief-check-lead">
        {nothing ? "Nothing missing: the brief is ready as it is." : review.additions.length ? `Added ${review.additions.length} detail${review.additions.length === 1 ? "" : "s"} below your brief. Your words are unchanged.` : "Your words are unchanged; nothing needed adding."}
      </p>
      {review.conflicts.length ? (
        <div className="brief-check-group">
          <h4>Check these</h4>
          <ul>
            {review.conflicts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {review.questions.length ? (
        <div className="brief-check-group">
          <h4>Only you know</h4>
          {review.questions.map((q, i) => (
            <label key={i} className="field">
              <span>{q}</span>
              <input type="text" value={answers[i] ?? ""} onChange={(e) => onAnswer(i, e.target.value)} disabled={disabled} />
            </label>
          ))}
          <button type="button" className="btn small" onClick={onAdd} disabled={disabled || !answers.some((a) => a.trim())}>
            Add answers to the brief
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** A logo file the person chose, as a data URL a film can draw: SVG kept, anything else redrawn as PNG (transparency kept). */
async function logoOf(file: File): Promise<string> {
  if (file.size > 2_000_000) throw new Error("That logo file is over 2 MB. Use a PNG or SVG export of the logo.");
  if (!/^image\/(png|svg\+xml|webp|jpeg)$/.test(file.type)) throw new Error("Use a PNG, SVG, WebP or JPEG logo.");
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("That file could not be read."));
    r.readAsDataURL(file);
  });
  return (await prepareAsset(data, 512)).data;
}

/** The partner brand of a collaboration: its website, who leads, and a logo to use over the site's own. */
function PartnerField({ partner, onChange, onRemove, disabled }: { partner: Partner; onChange: (p: Partner) => void; onRemove?: () => void; disabled: boolean }) {
  const [logoError, setLogoError] = useState<string | null>(null);
  const typed = partner.website.trim().length > 0;
  const ok = isWebsite(partner.website);
  return (
    <fieldset className="partner">
      <legend>
        Partner brand<em>collaboration</em>
      </legend>
      <label className="field">
        <span>
          Partner website<em>required</em>
        </span>
        <input type="text" inputMode="url" spellCheck={false} value={partner.website} onChange={(e) => onChange({ ...partner, website: e.target.value })} placeholder="partner.com" disabled={disabled} aria-invalid={typed && !ok} />
        <small className={typed && !ok ? "error" : "hint"}>{typed && !ok ? "That is not a website address. Write it like partner.com." : "Its logo, colours and facts are read from it, like your own website."}</small>
      </label>
      <div className="field">
        <span>Who leads</span>
        <div className="seg" role="radiogroup" aria-label="Who leads">
          <button type="button" role="radio" aria-checked={partner.lead === "host"} onClick={() => onChange({ ...partner, lead: "host" })} disabled={disabled}>
            My brand
          </button>
          <button type="button" role="radio" aria-checked={partner.lead === "equal"} onClick={() => onChange({ ...partner, lead: "equal" })} disabled={disabled}>
            Equal
          </button>
        </div>
        <small className="hint">{partner.lead === "host" ? "Your colours, voice and call to action lead; the partner joins the story and shares the close." : "Co-branded: both logos, colours from both brands, both addresses at the close."}</small>
      </div>
      <div className="field">
        <span>
          Partner logo<em>optional</em>
        </span>
        {partner.logo ? (
          <p className="guide-chip partner-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={partner.logo} alt="Partner logo" />
            <button type="button" className="btn small ghost" onClick={() => onChange({ ...partner, logo: undefined })} disabled={disabled}>
              Remove
            </button>
          </p>
        ) : (
          <label className="btn small file-btn">
            Upload the logo
            <input
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg"
              disabled={disabled}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setLogoError(null);
                try {
                  onChange({ ...partner, logo: await logoOf(f) });
                } catch (err) {
                  setLogoError(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          </label>
        )}
        <small className={logoError ? "error" : "hint"}>{logoError ?? "Skip it and the logo comes from the partner's website. Upload a PNG or SVG when the site only has a small icon. Use a partner's logo only with their permission."}</small>
      </div>
      {onRemove ? (
        <button type="button" className="link" onClick={onRemove} disabled={disabled}>
          Remove the partner
        </button>
      ) : null}
    </fieldset>
  );
}

/** The product's website: optional, with what it is used for and a check that what is typed is an address. */
function WebsiteField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const typed = value.trim().length > 0;
  const ok = isWebsite(value);
  return (
    <label className="field">
      <span>
        Website<em>optional</em>
      </span>
      <input type="text" inputMode="url" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} placeholder="yourproduct.com" disabled={disabled} aria-invalid={typed && !ok} />
      <small className={typed && !ok ? "error" : "hint"}>{typed && !ok ? "That is not a website address. Write it like yourproduct.com, or leave it empty." : "Facts, prices, the logo and colours are read from it. Leave it empty and the video uses only what you write."}</small>
    </label>
  );
}

/** Back and Next between steps; Next says why it is not available yet. */
function StepNav({ onBack, onNext, disabled, nextDisabled, why }: { onBack: () => void; onNext: () => void; disabled: boolean; nextDisabled: boolean; why: string | null }) {
  return (
    <div className="step-nav">
      <button type="button" className="btn" onClick={onBack} disabled={disabled}>
        <svg className="chev" viewBox="0 0 20 20" aria-hidden="true">
          <path d="m12 5-5 5 5 5" />
        </svg>
        Back
      </button>
      {why ? <span className="hint step-why">{why}</span> : null}
      <button type="button" className="btn primary" onClick={onNext} disabled={disabled || nextDisabled}>
        Next
        <svg className="chev" viewBox="0 0 20 20" aria-hidden="true">
          <path d="m8 5 5 5-5 5" />
        </svg>
      </button>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FilmState } from "@/bespoke/agent/run";
import { colorChoices, contrast, distinctColor, mayOverflow, onScreen, pickText, type SceneColor, type ScreenText } from "@/bespoke/textEdit";

/**
 * The words on screen, changed by hand: no AI, no cost, a few seconds. The
 * list follows the preview (what is on screen now) or shows everything, and
 * a click on the video picks the text under it.
 */
export function TextPane(o: {
  film: FilmState;
  busy: boolean;
  /** The words the preview shows on its current frame. */
  frameText: string;
  picking: boolean;
  onPicking: (on: boolean) => void;
  /** Words the person clicked on the video, with a counter so the same click twice still picks. */
  picked: { text: string; n: number } | null;
  /** Saves one change; resolves to an error to show, or null. */
  onSave: (item: ScreenText, text: string) => Promise<string | null>;
  /** Swaps one colour everywhere; resolves to an error to show, or null. */
  onColor: (from: string, to: string) => Promise<string | null>;
}) {
  const [items, setItems] = useState<ScreenText[] | null>(null);
  const [palette, setPalette] = useState<{ colors: SceneColor[]; background: string | null }>({ colors: [], background: null });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"now" | "all">("now");
  const [focus, setFocus] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLTextAreaElement>());

  // The files change with every edit: the list (and every source range) is read again.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/scene/texts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: o.film.files }), signal: ctrl.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { texts?: ScreenText[]; colors?: SceneColor[]; background?: string | null; error?: string } | null;
        if (!res.ok || !body?.texts) throw new Error(body?.error ?? `Reading the text failed (${res.status}).`);
        setItems(body.texts);
        setPalette({ colors: body.colors ?? [], background: body.background ?? null });
        setLoadError(null);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => ctrl.abort();
  }, [o.film.files]);

  // A click on the video: the text under it, shown and ready to type into.
  const [seen, setSeen] = useState(0);
  const [missed, setMissed] = useState(false);
  if (o.picked && items && o.picked.n !== seen) {
    setSeen(o.picked.n);
    const hit = pickText(items, o.picked.text);
    setMissed(!hit);
    if (hit) {
      setFilter("all");
      setFocus(hit.id);
    }
  }
  useEffect(() => {
    if (!focus) return;
    const raf = requestAnimationFrame(() => {
      const el = rows.current.get(focus);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [focus, seen]);

  const now = useMemo(() => (items ? onScreen(items, o.frameText) : []), [items, o.frameText]);
  const list = filter === "now" ? now : (items ?? []);
  const edited = new Set((o.film.textEdits ?? []).map((e) => e.now));

  return (
    <div className="pane text-pane">
      <div className="pane-intro">
        <h3>Text and colour</h3>
        <p>Change the words and colours without the AI: saved in a few seconds, at no cost. Improve with AI keeps what you change here.</p>
      </div>
      {palette.colors.length ? <Colors palette={palette} brand={[...o.film.spec.brand.colors, ...Object.values(o.film.concept.palette)]} busy={o.busy} onColor={o.onColor} /> : null}
      <h4 className="pane-sub">Text on screen</h4>
      <div className="text-tools">
        <div className="seg" role="radiogroup" aria-label="Which text">
          <button type="button" role="radio" aria-checked={filter === "now"} onClick={() => setFilter("now")}>
            On screen now
          </button>
          <button type="button" role="radio" aria-checked={filter === "all"} onClick={() => setFilter("all")}>
            All{items ? ` ${items.length}` : ""}
          </button>
        </div>
        <button type="button" className={`btn small${o.picking ? " primary" : ""}`} aria-pressed={o.picking} onClick={() => o.onPicking(!o.picking)} disabled={o.busy}>
          {o.picking ? "Click a text on the video" : "Pick on the video"}
        </button>
      </div>
      {loadError ? <p className="error">{loadError}</p> : null}
      {missed ? <p className="hint">No editable text there. Click right on the words, or find them under All.</p> : null}
      {!items && !loadError ? <p className="hint">Reading the scene…</p> : null}
      {items && !list.length ? (
        <p className="hint">{filter === "now" ? "No text on this frame. Move the playhead to a moment with words, or show all." : "This film has no text on screen."}</p>
      ) : null}
      <ul className="text-list">
        {list.map((t) => (
          <TextRow
            key={t.id}
            item={t}
            busy={o.busy}
            focused={focus === t.id}
            yours={edited.has(t.text)}
            onSave={o.onSave}
            refFor={(el) => {
              if (el) rows.current.set(t.id, el);
              else rows.current.delete(t.id);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

/** The scene's colours: a swatch opens the colours it can become (the brand's, then curated ones), applied everywhere it is used. */
function Colors({ palette, brand, busy, onColor }: { palette: { colors: SceneColor[]; background: string | null }; brand: string[]; busy: boolean; onColor: (from: string, to: string) => Promise<string | null> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [state, setState] = useState<{ saving: string | null; error: string | null; note: string | null }>({ saving: null, error: null, note: null });
  const current = palette.colors.find((c) => c.value === open) ?? null;
  const bg = palette.background;

  async function swap(from: string, to: string) {
    setState({ saving: to, error: null, note: null });
    const error = await onColor(from, distinctColor(to, palette.colors.map((c) => c.value)));
    // A colour that read on the background and no longer does is worth saying, not refusing: the person can see the preview.
    const note = !error && bg && from !== bg && contrast(from, bg) >= 3 && contrast(to, bg) < 3 ? `${to} is hard to read on the ${bg} background (${contrast(to, bg).toFixed(1)}:1). Check the preview, or pick a stronger colour.` : null;
    setState({ saving: null, error, note });
    if (!error) setOpen(null);
  }

  return (
    <section className="colors" aria-label="Colours">
      <h4 className="pane-sub">Colours</h4>
      <div className="swatches">
        {palette.colors.map((c) => (
          <button
            key={c.value}
            type="button"
            className="swatch"
            style={{ background: c.value }}
            aria-label={`${c.value}${c.value === bg ? ", the background" : ""}, used ${c.uses} time${c.uses === 1 ? "" : "s"}`}
            aria-expanded={open === c.value}
            title={`${c.value}${c.value === bg ? " · background" : ""}`}
            onClick={() => setOpen(open === c.value ? null : c.value)}
            disabled={busy || Boolean(state.saving)}
          />
        ))}
      </div>
      {current ? (
        <div className="swatch-choices">
          <p className="hint">
            Replace <span className="mono">{current.value}</span>
            {current.value === bg ? " (the background)" : ""} everywhere it is used with:
          </p>
          {colorChoices(brand, current.value).map((g) => (
            <div key={g.label} className="swatch-group">
              <small className="hint">{g.label}</small>
              <div className="swatches">
                {g.colors.map((c) => (
                  <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={`Use ${c}`} title={c} onClick={() => void swap(current.value, c)} disabled={busy || Boolean(state.saving)} data-saving={state.saving === c || undefined} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {state.error ? <small className="error">{state.error}</small> : null}
      {state.note ? <small className="warn">{state.note}</small> : null}
    </section>
  );
}

function TextRow({ item, busy, focused, yours, onSave, refFor }: { item: ScreenText; busy: boolean; focused: boolean; yours: boolean; onSave: (item: ScreenText, text: string) => Promise<string | null>; refFor: (el: HTMLTextAreaElement | null) => void }) {
  const [draft, setDraft] = useState(item.text);
  const [state, setState] = useState<{ saving: boolean; error: string | null }>({ saving: false, error: null });
  const changed = draft !== item.text && draft.trim().length > 0;
  const where = `${item.file.replace(/^scene\//, "")}:${item.line}`;

  async function save() {
    if (!changed || state.saving) return;
    setState({ saving: true, error: null });
    const error = await onSave(item, draft.trim());
    setState({ saving: false, error });
  }

  if (item.dynamic) {
    return (
      <li className="text-row" data-dynamic>
        <p className="text-fixed">{item.text}</p>
        <small className="hint">Put together by the scene&apos;s code ({where}): change it with Improve with AI.</small>
      </li>
    );
  }
  return (
    <li className="text-row" data-focused={focused || undefined}>
      <textarea
        ref={refFor}
        rows={Math.min(4, Math.max(1, Math.ceil(draft.length / 34)))}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
          if (e.key === "Escape") setDraft(item.text);
        }}
        disabled={busy || state.saving}
        aria-label={`Text at ${where}`}
        title={where}
        spellCheck
      />
      <div className="text-row-foot">
        <small className="hint">{yours ? "Typed by you: kept as is by Improve with AI" : ""}</small>
        {changed ? (
          <span className="text-row-actions">
            <button type="button" className="btn small ghost" onClick={() => setDraft(item.text)} disabled={state.saving}>
              Cancel
            </button>
            <button type="button" className="btn small primary" onClick={() => void save()} disabled={busy || state.saving}>
              {state.saving ? "Saving…" : "Save"}
            </button>
          </span>
        ) : null}
      </div>
      {changed && mayOverflow(item.text, draft) ? <small className="warn">Much longer than before: check it still fits on the frame.</small> : null}
      {state.error ? <small className="error">{state.error}</small> : null}
    </li>
  );
}

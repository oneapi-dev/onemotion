"use client";

import { Player, Thumbnail } from "@remotion/player";
import { useEffect, useState } from "react";
import { loadFonts } from "@/bespoke/kit/fonts";
import { LookSwatch, SWATCH, SWATCH_FONTS } from "./LookSwatch";
import type { Look } from "./briefs";

/** The frame a card shows while it is not playing: each preview's look is settled by then. */
const STILL_FRAME = 56;

/**
 * The looks as cards, each with a moving preview of the same fictional
 * product, so someone who has never heard of "Editorial light" can see it.
 * Only the card under the pointer (or focused, or picked) plays; the others
 * show one frame.
 */
export function LookGallery({ looks, groups, value, onChange, disabled }: { looks: Look[]; groups: readonly (readonly [string, string])[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [live, setLive] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let on = true;
    loadFonts(SWATCH_FONTS)
      .catch(() => undefined)
      .finally(() => on && setFontsReady(true));
    return () => {
      on = false;
    };
  }, []);

  return (
    <div className="look-gallery">
      {groups.map(([group, title]) => (
        <section key={group} className="look-group" aria-label={title}>
          <h3>{title}</h3>
          <div className="look-grid" role="radiogroup" aria-label={title}>
            {looks
              .filter((l) => l.group === group)
              .map((l) => {
                const picked = l.id === value;
                const playing = fontsReady && (live === l.id || (picked && live === null));
                const props = { look: l.id };
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    className="look-card"
                    disabled={disabled}
                    onClick={() => onChange(l.id)}
                    onPointerEnter={() => setLive(l.id)}
                    onPointerLeave={() => setLive(null)}
                    onFocus={() => setLive(l.id)}
                    onBlur={() => setLive(null)}
                  >
                    <span className="look-preview" aria-hidden="true">
                      {!fontsReady ? null : playing ? (
                        <Player component={LookSwatch} inputProps={props} durationInFrames={SWATCH.frames} fps={SWATCH.fps} compositionWidth={SWATCH.width} compositionHeight={SWATCH.height} autoPlay loop acknowledgeRemotionLicense style={{ width: "100%", height: "100%" }} />
                      ) : (
                        <Thumbnail component={LookSwatch} inputProps={props} frameToDisplay={STILL_FRAME} durationInFrames={SWATCH.frames} fps={SWATCH.fps} compositionWidth={SWATCH.width} compositionHeight={SWATCH.height} style={{ width: "100%", height: "100%" }} />
                      )}
                    </span>
                    <strong>{l.label}</strong>
                    <span className="look-plain">{l.plain}</span>
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

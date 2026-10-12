import { useEffect, useEffectEvent, useState } from "react";
import { useDelayRender } from "remotion";

/** Tracks made in this page, by key: one render per score however often a frame asks. */
const made = new Map<string, Promise<string>>();

/**
 * A soundtrack rendered in the page, as a blob URL for <Audio>. Rendering
 * waits for it (delayRender), so the Player, the browser export and the CLI
 * render all get the same audio; a failed render fails the video rather
 * than leaving it silent.
 */
export function useTrack(key: string, render: () => Promise<Blob>): string | null {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  // Held from the first frame, before any effect runs.
  const [first] = useState(() => delayRender("Composing the soundtrack"));
  const [track, setTrack] = useState<{ key: string; url: string } | null>(null);
  const make = useEffectEvent(render);

  useEffect(() => {
    let live = true;
    const handle = delayRender(`Composing the soundtrack (${key.slice(0, 40)})`);
    let pending = made.get(key);
    if (!pending) {
      pending = make().then((blob) => URL.createObjectURL(blob));
      made.set(key, pending);
    }
    pending.then(
      (url) => {
        if (live) setTrack({ key, url });
        continueRender(handle);
        continueRender(first);
      },
      (err: unknown) => {
        made.delete(key);
        cancelRender(err instanceof Error ? err : new Error(String(err)));
      },
    );
    return () => {
      live = false;
      continueRender(handle);
    };
  }, [key, first, delayRender, continueRender, cancelRender]);

  return track?.key === key ? track.url : null;
}

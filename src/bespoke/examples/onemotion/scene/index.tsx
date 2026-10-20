import { useCurrentFrame } from "remotion";
import { useFilm } from "@kit";
import { Brief, Close, Concept, Field, Frames, Render } from "./components/Fields";
import { DISPLAY, GRAPHITE, MONO, ORANGE, PAPER, TEXT } from "./theme";

export const fonts = { [DISPLAY]: ["700", "800"], [TEXT]: ["400", "500", "600"], [MONO]: ["400", "500"] };
export const background = GRAPHITE;
export const captions = false;

/**
 * OneMotion in five posters: each step of making a video is a full-bleed
 * colour field that wipes over the last one, with one huge line and one
 * small, exact picture of what happens in that step.
 */
export default function Scene() {
  const t = useCurrentFrame();
  const { cue } = useFilm();
  const [b2, b3, b4, b5] = ["b2", "b3", "b4", "b5"].map((id) => cue(id));
  const end = cue("end") + 1;
  return (
    <div style={{ position: "absolute", inset: 0, background: GRAPHITE, overflow: "hidden" }}>
      <Field t={t} at={-1} until={b2 + 16} bg={GRAPHITE}>
        <Brief t={t} at={0} />
      </Field>
      <Field t={t} at={b2} until={b3 + 16} bg={PAPER} from="right">
        <Concept t={t} at={b2} />
      </Field>
      <Field t={t} at={b3} until={b4 + 16} bg={ORANGE} from="bottom">
        <Frames t={t} at={b3} />
      </Field>
      <Field t={t} at={b4} until={b5 + 16} bg={GRAPHITE} from="left">
        <Render t={t} at={b4} />
      </Field>
      <Field t={t} at={b5} until={end} bg={PAPER} from="top">
        <Close t={t} at={b5} />
      </Field>
    </div>
  );
}

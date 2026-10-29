import { useCurrentFrame } from "remotion";
import { PromptBox, useBeat } from "@kit";
import { LOOK } from "../theme";

export default function Beat() {
  const t = useCurrentFrame();
  const { len } = useBeat();
  return <PromptBox t={t} at={0} len={len} label="BRIEF.md" text={[["A 20 second teaser for "], ["Tidepool", true], [", a surf forecast that reads the "], ["swell", true], [" before you wake up."]]} {...LOOK} />;
}

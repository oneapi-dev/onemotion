import { Studio2D } from "@kit";
import { shotsOf } from "../lib/timeline";

export default function Beat() {
  return <Studio2D style="dusk" shots={shotsOf(["s001", "s002", "s003", "s004"])} fadeIn={0.5} />;
}

import { Studio2D } from "@kit";
import { shotsOf } from "../lib/timeline";

export default function Beat() {
  return <Studio2D style="dusk" shots={shotsOf(["s012"])} />;
}

import { Studio2D } from "@kit";
import { shotsOf } from "../lib/timeline";

export default function Beat() {
  return <Studio2D style="dusk" shots={shotsOf(["s005", "s006", "s007", "s008"])} />;
}

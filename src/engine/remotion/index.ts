// Entry point for rendering on a machine (scripts/render.mjs, Remotion
// Studio). The web app does not import it.
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);

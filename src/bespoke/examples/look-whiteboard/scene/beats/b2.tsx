import { useCurrentFrame } from "remotion";
import { Flow, Sfx, flowPlan, useBeat, useFilm, type FlowEdge, type FlowFocus, type FlowNode } from "@kit";
import { ACCENT, BG, GREY, INK, MONO, SIZE, TEXT } from "../theme";

/**
 * A living diagram: the parts appear (nodes, then the lines, then the words), then the voice walks
 * the path. On "gateway" the request's way in lights up; on "right" the chosen model joins it and a
 * pulse runs along the lit path. Everything not being talked about rests at 0.35.
 */
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe } = useFilm();
  const { cue } = useBeat();
  const fw = Math.min(W * 0.8, safe.right - safe.left);
  const fh = Math.min(H * 0.66, safe.bottom - safe.top);
  const nodes: FlowNode[] = [
    { id: "client", label: "Client", sub: "your app", x: fw * 0.12, y: fh * 0.5 },
    { id: "gateway", label: "Gateway", sub: "tidepool", x: fw * 0.46, y: fh * 0.5 },
    { id: "a", label: "Model A", sub: "fast", x: fw * 0.85, y: fh * 0.14 },
    { id: "b", label: "Model B", sub: "cheap", x: fw * 0.85, y: fh * 0.5 },
    { id: "c", label: "Model C", sub: "long context", x: fw * 0.85, y: fh * 0.86 },
  ];
  const edges: FlowEdge[] = [{ from: "client", to: "gateway", label: "request" }, ["gateway", "a"], ["gateway", "b"], ["gateway", "c"]];
  const at = -4;
  // The focus waits for the reveal to finish, then follows the voice.
  const built = flowPlan(nodes.length, edges.length, { at, labelCount: nodes.length + 1 }).end;
  const lit = Math.max(cue("gateway"), built + 6);
  const chosen = Math.max(cue("right"), lit + 24);
  const focus: FlowFocus = [
    [lit, ["client", "gateway"]],
    [chosen, ["client", "gateway", "a"]],
  ];
  return (
    <>
      <Flow t={t} at={at} nodes={nodes} edges={edges} focus={focus} w={fw} h={fh} ink={GREY} text={INK} accent={ACCENT} paper={BG} font={TEXT} mono={MONO} size={SIZE.node} />
      <Sfx name="connect" at={lit} volume={0.2} />
      <Sfx name="blip" at={chosen} volume={0.2} />
    </>
  );
}

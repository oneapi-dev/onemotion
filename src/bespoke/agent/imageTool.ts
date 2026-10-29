"use client";

import type { AgentTool, Workspace } from "./tools";

/**
 * Illustrations made for a film by the person's image model (an
 * OpenAI-compatible /images endpoint, e.g. NaraRouter's), for what code
 * cannot draw well: a place, an animal, a moment in history, a scene. They
 * are saved as the film's assets like a fetched logo, drawn with <Asset>,
 * and all share one art style, fixed by the first image, so the film reads
 * as one piece and not a pile of stock pictures.
 */

/** The person's image endpoint, from Settings. */
export type ImageConfig = { base: string; key: string; model: string; quality: "low" | "medium" | "high" };

/** How many images one film may still make: shared by every agent of a run, so a team cannot multiply the bill. */
export type ImageBudget = { left: number };

/** Images per film, and their weight together (they are saved with the project and every version of it). */
export const MAX_PICTURES = 8;
export const MAX_PICTURE_BYTES = 5_000_000;

/** The source key a generated asset is saved under (fetched ones are saved under their address). */
export const GENERATED = "generated:";
export const isGenerated = (sources: Record<string, string> | undefined, name: string) => Boolean(sources?.[`${GENERATED}${name}`]);

/** For the art director, when images can be made: where they serve the story, and what stays in code. */
export const ILLUSTRATION_NOTE = `ILLUSTRATIONS: the designer can make up to ${MAX_PICTURES} illustrations with an image model (places, animals, objects, scenes, moments in history), all in one art style. Plan where they serve the story: name them in the beats' "shows" ("a painted backdrop of ..."), choose a palette they can share, and keep diagrams, numbers, maps with labels, words and UI in code. A film whose world is type, UI or diagrams needs none.`;

/** For the designers, when images can be made. */
export const IMAGE_NOTE = `ILLUSTRATIONS: generate_image makes an illustration for this film (at most ${MAX_PICTURES} for the whole film, shared by everyone building it). Use it where the concept's "shows" calls for a real picture (a place, an animal, an object, a scene), in a style fitted to the theme's palette; move it with the camera and set the words over it in type. Everything exact (numbers, labels, diagrams, UI) stays in code.`;

const SIZES = { wide: "1536x1024", tall: "1024x1536", square: "1024x1024" } as const;
type Shape = keyof typeof SIZES;

/** What no image in a film shows: the film sets its words in type, and a generated face or logo is a fake one. */
const NEGATIVE = "text, letters, numbers, captions, watermark, signature, logo, user interface, blurry, distorted hands, extra limbs";

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The image could not be decoded."));
    img.src = src;
  });

/** A generated image made ready for a film: a JPEG at most `max` px on its longer side, and a small preview for the model to look at. */
export async function preparePicture(data: string, max = 1536): Promise<{ data: string; preview: string; width: number; height: number }> {
  const img = await loadImage(data);
  const draw = (limit: number, quality: number) => {
    const k = Math.min(1, limit / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d");
    if (!g) throw new Error("This browser cannot redraw images.");
    g.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/jpeg", quality), width: c.width, height: c.height };
  };
  const full = draw(max, 0.84);
  return { ...full, preview: draw(512, 0.7).data };
}

/** The whole prompt an image is made from: the agent's subject in the film's one art style, with nothing the film draws itself. */
export const fullPrompt = (prompt: string, style: string) => `${prompt.trim().replace(/\.$/, "")}. Art style: ${style.trim().replace(/\.$/, "")}. No text, letters, numbers, logos or watermarks anywhere in the image.`;

const cleanName = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/**
 * The generate_image tool. It changes `ws` in place and calls `changed`
 * after a new image, like the scene tools; `budget` is shared by the run.
 */
export function imageTool(ws: Workspace, cfg: ImageConfig, budget: ImageBudget, changed: () => void, signal?: AbortSignal, blind = false): AgentTool {
  return {
    name: "generate_image",
    description: [
      "Make an illustration for this film with the image model and save it as an asset under `name`: a place, an animal, an object, a moment in history, a scene. Use it for what code cannot draw well; diagrams, charts, maps with labels, numbers and UI are drawn in code, where they stay exact.",
      'Draw it with <Asset name="..." style={{ width: "100%", height: "100%", objectFit: "cover" }} /> as a full-bleed backdrop, or with width and height as an object in the frame. Never let it sit still like a slide: a slow push or pan, parallax with <Depth>, type and drawn marks over it.',
      "Every image of a film shares one art style: give `style` on the first call (one sentence: the medium, the palette, the light, e.g. \"flat paper cut-out illustration, cream background, ink outlines, muted teal and rust\"), fitted to the film's palette; it is kept for every image after.",
      "Never ask for text, letters, logos or a real person's face in the image. `from` edits an image this film already made (the same subject in a new state). It costs money and takes up to a minute: plan the few images the film needs.",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "a short id, e.g. sky-sunset" },
        prompt: { type: "string", description: "the subject and composition, concrete: what is in frame, where, from which angle; room left for the words if they sit over it" },
        shape: { type: "string", enum: ["wide", "tall", "square"], description: "wide for a 16:9 film's backdrop, tall for a 9:16 one, square for an object" },
        style: { type: "string", description: "the film's one art style; required on the first image, ignored after" },
        from: { type: "string", description: "optional: the name of an image this film already made, to edit instead of starting over" },
      },
      required: ["name", "prompt", "shape"],
    },
    run: async (a) => {
      const name = cleanName(a.name);
      if (!name) return { text: "Give the image a name, e.g. sky-sunset." };
      const prompt = String(a.prompt ?? "").trim();
      if (!prompt) return { text: "Describe what the image shows." };
      if (budget.left <= 0) return { text: `This film has made all ${MAX_PICTURES} of its images: reuse one, or draw the rest in code.` };
      const assets = (ws.spec.assets ??= {});
      const sources = (ws.spec.assetSources ??= {});
      if (!ws.spec.imageStyle) {
        const style = String(a.style ?? "").trim();
        if (!style) return { text: "Give `style` with the first image: one sentence of medium, palette and light that every image of this film will share." };
        ws.spec.imageStyle = style.slice(0, 300);
      }
      const shape: Shape = a.shape === "wide" || a.shape === "tall" ? a.shape : "square";
      const fromName = cleanName(a.from);
      if (fromName && !isGenerated(sources, fromName)) return { text: `"${fromName}" is not an image this film made; only those can be edited.` };
      budget.left -= 1;
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Image-Key": cfg.key },
          body: JSON.stringify({ base: cfg.base, model: cfg.model, quality: cfg.quality, size: SIZES[shape], prompt: fullPrompt(prompt, ws.spec.imageStyle), negative: NEGATIVE, image: fromName ? assets[fromName] : undefined }),
          signal,
        });
        const body = (await res.json().catch(() => null)) as { data?: string; error?: string } | null;
        if (!res.ok || !body?.data) {
          // A refused or failed request is not billed: it does not use up the film's images.
          budget.left += 1;
          return { text: `The image was not made: ${body?.error ?? res.status}. Carry on without it, or try a simpler prompt once.` };
        }
        const ready = await preparePicture(body.data);
        const weight = Object.entries(assets).reduce((n, [k, v]) => n + (k !== name && isGenerated(sources, k) ? v.length : 0), 0) + ready.data.length;
        if (weight > MAX_PICTURE_BYTES) return { text: "The film's images are too heavy together: reuse one instead of making another." };
        assets[name] = ready.data;
        sources[`${GENERATED}${name}`] = name;
        ws.dirty = true;
        changed();
        const saved = `saved as asset "${name}" (${ready.width} x ${ready.height}). Draw it with <Asset name="${name}" ... />. ${budget.left} image${budget.left === 1 ? "" : "s"} left for this film.`;
        return blind ? { text: saved } : { text: saved, images: [{ label: `image ${name}`, url: ready.preview }] };
      } catch (err) {
        if (signal?.aborted) throw err;
        budget.left += 1;
        return { text: `The image was not made: ${err instanceof Error ? err.message : String(err)}. Carry on without it.` };
      }
    },
  };
}

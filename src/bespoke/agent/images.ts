"use client";

/**
 * Renders for the model: scaled down before they are sent (a 1920 px frame
 * costs several times the tokens of a 960 px one and shows nothing more a
 * reviewer needs), and contact sheets tiled into one image.
 */

const load = (blob: Blob) => createImageBitmap(blob);

function toDataUrl(canvas: HTMLCanvasElement, quality = 0.8) {
  return canvas.toDataURL("image/jpeg", quality);
}

/** One frame as a JPEG data URL at most `width` px wide. */
export async function scaled(blob: Blob, width = 960): Promise<string> {
  const img = await load(blob);
  const k = Math.min(1, width / img.width);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
  img.close();
  return toDataUrl(c);
}

/** Frames tiled left to right, top to bottom, each labelled with its frame number. */
export async function sheet(blobs: Blob[], labels: string[], cols: number, tileWidth: number): Promise<string> {
  const imgs = await Promise.all(blobs.map(load));
  const k = tileWidth / imgs[0].width;
  const tw = Math.round(tileWidth);
  const th = Math.round(imgs[0].height * k);
  const pad = 6;
  const rows = Math.ceil(imgs.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * tw + (cols + 1) * pad;
  c.height = rows * th + (rows + 1) * pad;
  const g = c.getContext("2d");
  if (!g) return "";
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  imgs.forEach((img, i) => {
    const x = pad + (i % cols) * (tw + pad);
    const y = pad + Math.floor(i / cols) * (th + pad);
    g.drawImage(img, x, y, tw, th);
    g.font = "bold 15px sans-serif";
    const label = labels[i] ?? "";
    const w = g.measureText(label).width + 10;
    g.fillStyle = "rgba(0,0,0,0.75)";
    g.fillRect(x, y, w, 22);
    g.fillStyle = "#ffffff";
    g.fillText(label, x + 5, y + 16);
    img.close();
  });
  return toDataUrl(c, 0.78);
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The image could not be decoded."));
    img.src = src;
  });

/**
 * A fetched image made ready for a film: SVG kept as it is (small and
 * sharp at any size) unless it is heavy, anything else redrawn as PNG at
 * most `max` px on its longer side. Also returns a small preview for the
 * model to look at, and the image's size.
 */
/** What a logo's pixels are: one dark ink, one light ink, or colour. Monochrome logos get a variant for the other kind of background. */
export type AssetTone = "dark" | "light" | "colour";

export async function prepareAsset(
  data: string,
  max = 512,
): Promise<{ data: string; preview: string; width: number; height: number; tone: AssetTone; variant: string | null }> {
  const img = await loadImage(data);
  const w = img.naturalWidth || 256;
  const h = img.naturalHeight || 256;
  const canvasOf = (size: number) => {
    const k = Math.min(1, size / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };
  const draw = (size: number, type: string) => canvasOf(size).toDataURL(type);
  const tone = toneOf(canvasOf(96));
  // A one-colour logo, repainted in the opposite ink: a black mark stays visible on a dark film.
  let variant: string | null = null;
  if (tone !== "colour") {
    const c = canvasOf(max);
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = tone === "dark" ? "#FFFFFF" : "#111111";
      ctx.fillRect(0, 0, c.width, c.height);
      variant = c.toDataURL("image/png");
    }
  }
  const svg = data.startsWith("data:image/svg+xml") && data.length < 200_000;
  return { data: svg ? data : draw(max, "image/png"), preview: draw(256, "image/png"), width: w, height: h, tone, variant };
}

/** Dark or light ink when nearly every visible pixel is grey and on the same side; otherwise colour. */
function toneOf(c: HTMLCanvasElement): AssetTone {
  const ctx = c.getContext("2d");
  if (!ctx) return "colour";
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  let dark = 0;
  let light = 0;
  let grey = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    n++;
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    if (hi - lo < 40) grey++;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 90) dark++;
    else if (lum > 180) light++;
  }
  // A logo on an opaque square (no transparency) is a picture, not a mark to recolour.
  if (n === 0 || n > c.width * c.height * 0.92 || grey / n < 0.9) return "colour";
  if (dark / n > 0.85) return "dark";
  if (light / n > 0.85) return "light";
  return "colour";
}

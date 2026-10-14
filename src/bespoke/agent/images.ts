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
export async function prepareAsset(data: string, max = 512): Promise<{ data: string; preview: string; width: number; height: number }> {
  const img = await loadImage(data);
  const w = img.naturalWidth || 256;
  const h = img.naturalHeight || 256;
  const draw = (size: number, type: string) => {
    const k = Math.min(1, size / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(type);
  };
  const svg = data.startsWith("data:image/svg+xml") && data.length < 200_000;
  return { data: svg ? data : draw(max, "image/png"), preview: draw(256, "image/png"), width: w, height: h };
}

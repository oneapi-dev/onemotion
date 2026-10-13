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

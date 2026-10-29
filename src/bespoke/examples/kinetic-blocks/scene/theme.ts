// The kinetic look: three grounds, one heavy display face, a mono for labels.
export const DARK = "#0C0E11";
export const PAPER = "#F4F1EA";
export const ACCENT = "#FF5B2E";
export const INK = "#141210";
export const DISPLAY = "Archivo Black";
export const MONO = "JetBrains Mono";
export const LOOK = { font: DISPLAY, weight: 400, mono: MONO, color: PAPER, accent: ACCENT, ground: DARK };

// A drawn landscape standing in for key art: a sky, a sun and two hills.
export const ART =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2A4A"/><stop offset="1" stop-color="#F28C5B"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#s)"/><circle cx="1240" cy="520" r="170" fill="#FFD9A0"/><path d="M0 760 Q480 560 960 760 T1920 700 V1080 H0Z" fill="#2C2F4A"/><path d="M0 880 Q600 720 1200 900 T1920 860 V1080 H0Z" fill="#151726"/></svg>',
  );

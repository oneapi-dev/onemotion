import type { NextConfig } from "next";

/** Files the server reads at runtime: the scene check's TypeScript libraries, the kit (in prompts and the check) and the example films. */
const TYPED = ["@types/react", "csstype", "remotion", "@remotion/media", "@remotion/google-fonts", "@types/d3-geo", "@types/topojson-client", "@types/geojson", "@types/topojson-specification"];
const SCENE_FILES = ["./src/bespoke/kit/**/*", "./src/bespoke/examples/**/*", "./node_modules/typescript/lib/*.d.ts", ...TYPED.flatMap((p) => [`./node_modules/${p}/**/*.d.ts`, `./node_modules/${p}/package.json`])];

const nextConfig: NextConfig = {
  // The browser exporter encodes with WebCodecs and reads its own module
  // workers; nothing here needs a server render of the video.
  reactStrictMode: true,
  // The desktop app runs the studio's own server from a self-contained folder (scripts/stage-desktop.mjs).
  ...(process.env.ONEMOTION_DESKTOP_BUILD ? { output: "standalone" as const } : {}),
  // No source maps in production bundles: the shipped app carries only what it runs.
  productionBrowserSourceMaps: false,
  // The scene check runs the TypeScript compiler; it reads its own lib files at runtime.
  serverExternalPackages: ["typescript"],
  outputFileTracingIncludes: {
    "/api/scene/check": SCENE_FILES,
    "/api/scene/prompt": SCENE_FILES,
    "/api/scene/example": ["./src/bespoke/examples/**/*"],
  },
};

export default nextConfig;

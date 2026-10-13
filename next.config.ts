import type { NextConfig } from "next";

/** Public files the bespoke sandbox loads. Its iframe has an opaque origin, so module scripts and fetches from it are cross-origin. */
const SANDBOX_READS = ["/sandbox/:path*", "/audio/:path*", "/samples/:path*", "/music/:path*"];

const nextConfig: NextConfig = {
  // The browser exporter encodes with WebCodecs and reads its own module
  // workers; nothing here needs a server render of the video.
  reactStrictMode: true,
  // The scene check runs the TypeScript compiler; it reads its own lib files at runtime.
  serverExternalPackages: ["typescript"],
  outputFileTracingIncludes: {
    "/api/scene/check": ["./src/bespoke/kit/**/*", "./node_modules/typescript/lib/*.d.ts", "./node_modules/@types/react/**/*.d.ts", "./node_modules/csstype/**/*.d.ts", "./node_modules/remotion/**/*.d.ts", "./node_modules/@remotion/media/**/*.d.ts", "./node_modules/@remotion/google-fonts/**/*.d.ts"],
  },
  async headers() {
    return SANDBOX_READS.map((source) => ({ source, headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }));
  },
};

export default nextConfig;

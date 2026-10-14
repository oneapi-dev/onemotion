import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The browser exporter encodes with WebCodecs and reads its own module
  // workers; nothing here needs a server render of the video.
  reactStrictMode: true,
  // The scene check runs the TypeScript compiler; it reads its own lib files at runtime.
  serverExternalPackages: ["typescript"],
  outputFileTracingIncludes: {
    "/api/scene/check": ["./src/bespoke/kit/**/*", "./node_modules/typescript/lib/*.d.ts", "./node_modules/@types/react/**/*.d.ts", "./node_modules/csstype/**/*.d.ts", "./node_modules/remotion/**/*.d.ts", "./node_modules/@remotion/media/**/*.d.ts", "./node_modules/@remotion/google-fonts/**/*.d.ts"],
  },
};

export default nextConfig;

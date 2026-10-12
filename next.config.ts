import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The browser exporter encodes with WebCodecs and reads its own module
  // workers; nothing here needs a server render of the video.
  reactStrictMode: true,
};

export default nextConfig;

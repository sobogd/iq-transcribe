import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN access in dev (phone/other device) — Next 16 blocks
  // /_next/ dev resources from non-localhost origins by default.
  allowedDevOrigins: ["192.168.1.169"],
  // Keep ffmpeg-static out of the server bundle so its __dirname-based binary
  // path resolves against the real node_modules at runtime (not a build path).
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;

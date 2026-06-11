import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN access in dev (phone/other device) — Next 16 blocks
  // /_next/ dev resources from non-localhost origins by default.
  allowedDevOrigins: ["192.168.1.169"],
};

export default nextConfig;

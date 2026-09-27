import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    // Evidence uploads go through a Server Action.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;

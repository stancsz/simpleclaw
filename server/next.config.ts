import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    if (!isServer) {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            "bun:sqlite": false,
        };
    }
    // Ignore bun:sqlite module
    config.externals = [...(config.externals || []), 'bun:sqlite', 'bun' + ':sqlite'];
    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

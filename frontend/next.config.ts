import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    turbo: {
      rules: {}
    }
  }
};

export default nextConfig;

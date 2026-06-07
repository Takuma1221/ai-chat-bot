import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), 'better-sqlite3'];
    return config;
  },
};

export default nextConfig;

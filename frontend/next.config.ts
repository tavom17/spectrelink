import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyTimeout: 120000,
  },
  async rewrites() {
    const apiBase = process.env.API_URL ?? 'http://localhost:3001'
    return [
      // auth lives at the gateway root, not under its /api prefix — must match first
      { source: '/api/auth/:path*', destination: `${apiBase}/auth/:path*` },
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
    ]
  },
};

export default nextConfig;

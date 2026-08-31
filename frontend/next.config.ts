import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;

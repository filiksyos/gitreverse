import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud/browser testing hits the dev server at 127.0.0.1 while next binds 0.0.0.0.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    optimizePackageImports: ["three"],
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};

export default nextConfig;

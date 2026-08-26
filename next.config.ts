import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud/browser testing hits the dev server at 127.0.0.1 while next binds 0.0.0.0.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    optimizePackageImports: ["three"],
  },
  outputFileTracingIncludes: {
    "/api/reverse-game": ["./public/quaternius/**/*"],
    "/api/game-kernel/fixture": ["./public/quaternius/**/*"],
  },
  async redirects() {
    return [
      { source: "/play", destination: "/game", permanent: false },
      { source: "/play/:path*", destination: "/game", permanent: false },
    ];
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    deviceSizes: [360, 375, 384, 390, 393, 402, 412, 428, 430],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 2678400,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    unoptimized: false,
    loader: 'default',
    path: '/_next/image',
    domains: [],
    disableStaticImages: false,
  },
};

export default nextConfig;

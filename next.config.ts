import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ['i.imgur.com', 'firebasestorage.googleapis.com', 'api.dicebear.com', 'imagedelivery.net', 'ipfs.decentralized-content.com', 'ipfs.io'],
  },
};

export default nextConfig;

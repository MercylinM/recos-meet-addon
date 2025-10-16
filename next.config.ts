import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'microphone=*' 
          },
          {
            key: 'Feature-Policy',
            value: 'microphone *' 
          }
        ],
      },
    ]
  },
};

export default nextConfig;
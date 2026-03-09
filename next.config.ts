import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    staleTimes: {
      dynamic: 30, // cache navigated pages for 30s client-side
    },
  },
  transpilePackages: ["@fullcalendar"],
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
        pathname: "/campfire/**",
      },
    ],
  },
};

export default nextConfig;

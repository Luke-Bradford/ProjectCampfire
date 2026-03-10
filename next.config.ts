import type { NextConfig } from "next";

/**
 * Derive a next/image remotePatterns entry for the MinIO origin so that
 * post images can use <Image> instead of <img>.
 *
 * Priority:
 *   1. MINIO_PUBLIC_URL — the browser-facing base URL (e.g. http://localhost:9000/campfire).
 *      Used when MINIO_ENDPOINT is a Docker-internal hostname unreachable by browsers.
 *   2. MINIO_ENDPOINT + MINIO_PORT — the direct hostname/port.
 */
function minioRemotePattern(): NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number] {
  const publicUrl = process.env.MINIO_PUBLIC_URL;
  if (publicUrl) {
    const u = new URL(publicUrl);
    return {
      protocol: u.protocol.replace(":", "") as "http" | "https",
      hostname: u.hostname,
      ...(u.port ? { port: u.port } : {}),
      pathname: "/**",
    };
  }
  const hostname = process.env.MINIO_ENDPOINT ?? "localhost";
  const port = process.env.MINIO_PORT ?? "9000";
  const protocol =
    process.env.NODE_ENV === "production" ? "https" : "http";
  return { protocol, hostname, port, pathname: "/**" };
}

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    staleTimes: {
      dynamic: 30, // cache navigated pages for 30s client-side
    },
  },
  transpilePackages: ["@fullcalendar"],
  images: {
    remotePatterns: [minioRemotePattern()],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

type RemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

/**
 * Derive next/image remotePatterns entries for MinIO.
 *
 * Avatars and post images are served as plain <img> tags (not via /_next/image),
 * so MINIO_PUBLIC_URL must be browser-accessible (e.g. http://localhost:9000/campfire).
 * The app container reaches MinIO via MINIO_ENDPOINT (e.g. "minio"), which is separate.
 *
 * We allow both origins so that:
 *   1. MINIO_PUBLIC_URL origin — what storageUrl() stores; the browser-accessible URL.
 *   2. MINIO_ENDPOINT + MINIO_PORT — URLs stored before MINIO_PUBLIC_URL was configured,
 *      and any server-side image optimisation paths that use the internal hostname.
 */
function minioRemotePatterns(): RemotePattern[] {
  const patterns: RemotePattern[] = [];

  const publicUrl = process.env.MINIO_PUBLIC_URL;
  if (publicUrl) {
    const u = new URL(publicUrl);
    patterns.push({
      protocol: u.protocol.replace(":", "") as "http" | "https",
      hostname: u.hostname,
      ...(u.port ? { port: u.port } : {}),
      pathname: "/**",
    });
  }

  // Also allow the direct endpoint so URLs stored before MINIO_PUBLIC_URL was set
  // (or in non-Docker environments) continue to be accepted.
  const hostname = process.env.MINIO_ENDPOINT ?? "localhost";
  const port = process.env.MINIO_PORT ?? "9000";
  // Note: this dedup is a best-effort check on hostname + port string equality.
  // It does not normalise default ports (80/443 without explicit port), so it may
  // add a redundant entry in edge cases — harmless (allowlist is additive).
  const alreadyCovered = patterns.some(
    (p) => p.hostname === hostname && (p.port ?? "") === port
  );
  if (!alreadyCovered) {
    patterns.push({ protocol: "http" as const, hostname, port, pathname: "/**" });
  }

  return patterns;
}

const nextConfig: NextConfig = {
  output: "standalone",
  // web-push uses Node.js native crypto/net APIs that cannot be bundled by
  // Turbopack or webpack. Mark it as external so Next.js resolves it at runtime
  // from node_modules instead of attempting to bundle it.
  serverExternalPackages: ["web-push"],
  experimental: {
    staleTimes: {
      dynamic: 30, // cache navigated pages for 30s client-side
    },
  },
  transpilePackages: ["@fullcalendar"],
  images: {
    remotePatterns: [
      ...minioRemotePatterns(),
      // Steam CDN — game header/capsule images
      { protocol: "https", hostname: "cdn.akamai.steamstatic.com", pathname: "/steam/apps/**" },
      // IGDB / Twitch CDN — game cover art
      { protocol: "https", hostname: "images.igdb.com", pathname: "/**" },
      // Tenor GIF CDN — GIFs embedded via the GIF picker
      { protocol: "https", hostname: "media.tenor.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;

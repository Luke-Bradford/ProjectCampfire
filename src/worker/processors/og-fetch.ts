import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { posts } from "@/server/db/schema";
import type { EmbedMetadata } from "@/server/db/schema/posts";
import type { OgFetchJobPayload } from "@/server/jobs/og-fetch-jobs";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 500_000; // 500 KB — enough for OG tags without buffering giant pages

/** Extract a YouTube video ID from a YouTube URL, or null if not a YouTube URL. */
function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = parsed.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("?")[0];
      if (id && /^[\w-]{11}$/.test(id)) return id;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

/** Extract the value of an OG/Twitter meta tag from raw HTML. */
function extractMeta(html: string, property: string): string | undefined {
  // Match <meta property="og:title" content="…"> or <meta name="og:title" content="…">
  // Content can be before or after property/name — handle both attribute orderings.
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*?)["']` +
    `|<meta[^>]+content=["']([^"']*?)["'][^>]*(?:property|name)=["']${escaped}["']`,
    "i"
  );
  const match = pattern.exec(html);
  return match?.[1] ?? match?.[2] ?? undefined;
}

/** Decode common HTML entities in an OG tag value. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export async function processOgFetchJob(job: Job<OgFetchJobPayload>) {
  const { postId, url } = job.data;

  const videoId = extractYouTubeVideoId(url);

  // Attempt to fetch OG tags. Errors are logged but do not throw — a missing
  // embed is acceptable; we just leave embedMetadata as-is (null).
  let metadata: EmbedMetadata | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let html = "";
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Identify as a bot; many sites serve OG tags to any UA
          "User-Agent": "Campfire/1.0 (+https://github.com/Luke-Bradford/ProjectCampfire) OGFetch/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      if (!res.ok) {
        console.warn(`[og-fetch] HTTP ${res.status} for ${url} (post ${postId})`);
      } else {
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
          console.warn(`[og-fetch] non-HTML content-type "${contentType}" for ${url} — skipping`);
        } else {
          // Read up to MAX_BODY_BYTES to find the <head> section
          const reader = res.body?.getReader();
          if (reader) {
            let bytesRead = 0;
            const chunks: Uint8Array[] = [];
            let done = false;
            while (!done && bytesRead < MAX_BODY_BYTES) {
              const result = await reader.read();
              if (result.done) break;
              chunks.push(result.value);
              bytesRead += result.value.byteLength;
              // Stop once we've seen </head> — OG tags are always in <head>
              const partial = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
              if (partial.toLowerCase().includes("</head>")) {
                done = true;
              }
            }
            reader.cancel().catch(() => undefined);
            html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    if (html) {
      const title = decodeEntities(
        extractMeta(html, "og:title") ??
        extractMeta(html, "twitter:title") ??
        ""
      ).trim() || undefined;

      const description = decodeEntities(
        extractMeta(html, "og:description") ??
        extractMeta(html, "twitter:description") ??
        ""
      ).trim() || undefined;

      const thumbnailUrl = (
        extractMeta(html, "og:image") ??
        extractMeta(html, "twitter:image") ??
        undefined
      );

      metadata = {
        type: videoId ? "youtube" : "link",
        url,
        ...(title && { title }),
        ...(description && { description }),
        ...(thumbnailUrl && { thumbnailUrl }),
        ...(videoId && { videoId }),
      };
    } else if (videoId) {
      // YouTube URL but fetch failed — still record it as a YouTube embed with no OG data
      metadata = { type: "youtube", url, videoId };
    }
  } catch (err) {
    console.error(`[og-fetch] failed to fetch OG tags for ${url} (post ${postId}):`, err);
    // For YouTube URLs, store minimal metadata even if fetch failed
    if (videoId) {
      metadata = { type: "youtube", url, videoId };
    }
  }

  if (metadata) {
    await db.update(posts).set({ embedMetadata: metadata }).where(eq(posts.id, postId));
    console.log(`[og-fetch] embed stored for post ${postId} (${metadata.type}): ${url}`);
  } else {
    console.warn(`[og-fetch] no embed data extracted for post ${postId}: ${url}`);
  }
}

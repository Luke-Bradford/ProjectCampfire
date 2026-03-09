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

/** Extract the value of an OG/Twitter meta tag from raw HTML.
 *
 * Handles both attribute orderings (property/name before or after content).
 * Uses separate patterns for double- and single-quoted attribute values to avoid
 * the quote-mismatch bug where [^"'] would stop at a quote character embedded
 * inside a differently-quoted attribute value. */
function extractMeta(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Try double-quoted attribute values first (most common in OG tags)
  for (const [q, inner] of [
    ['"', '[^"]*'],
    ["'", "[^']*"],
  ] as const) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)=${q}${escaped}${q}[^>]*content=${q}(${inner})${q}` +
      `|<meta[^>]+content=${q}(${inner})${q}[^>]*(?:property|name)=${q}${escaped}${q}`,
      "i"
    );
    const match = pattern.exec(html);
    if (match) return match[1] ?? match[2];
  }
  return undefined;
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

/** Validate that a thumbnail URL is a safe HTTP(S) URL before storing it. */
function isSafeHttpUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
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
        // Consume / discard the body to release the connection
        res.body?.cancel().catch(() => undefined);
      } else {
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
          console.warn(`[og-fetch] non-HTML content-type "${contentType}" for ${url} — skipping`);
          // Discard body to release the connection
          res.body?.cancel().catch(() => undefined);
        } else {
          // Stream the response incrementally, stopping at </head> or MAX_BODY_BYTES.
          // Use TextDecoder in streaming mode so we never re-decode accumulated chunks —
          // each call to decode() only processes the new chunk, avoiding O(n²) behaviour.
          const reader = res.body?.getReader();
          if (reader) {
            const decoder = new TextDecoder("utf-8", { fatal: false });
            let bytesRead = 0;
            let accumulated = "";
            let foundHead = false;

            while (!foundHead && bytesRead < MAX_BODY_BYTES) {
              const result = await reader.read();
              if (result.done) break;
              // stream:true — decoder holds partial multi-byte sequences between calls
              accumulated += decoder.decode(result.value, { stream: true });
              bytesRead += result.value.byteLength;
              if (accumulated.toLowerCase().includes("</head>")) {
                foundHead = true;
              }
            }
            // Flush any remaining bytes in the decoder and cancel the stream
            accumulated += decoder.decode();
            reader.cancel().catch(() => undefined);
            html = accumulated;
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

      const rawThumbnail =
        extractMeta(html, "og:image") ??
        extractMeta(html, "twitter:image");

      // Only store thumbnail URLs with a safe http(s) protocol — reject javascript:, data:, etc.
      const thumbnailUrl =
        rawThumbnail && isSafeHttpUrl(rawThumbnail) ? rawThumbnail : undefined;

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

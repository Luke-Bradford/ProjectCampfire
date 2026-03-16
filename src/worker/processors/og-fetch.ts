import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { posts } from "@/server/db/schema";
import type { EmbedMetadata } from "@/server/db/schema/posts";
import type { OgFetchJobPayload } from "@/server/jobs/og-fetch-jobs";
import { logger } from "@/lib/logger";

const log = logger.child("og-fetch");

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 500_000; // 500 KB — enough for OG tags without buffering giant pages

/** Extract a YouTube video ID from a YouTube URL, or null if not a YouTube URL. */
function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = parsed.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    }
    if (host === "youtu.be") {
      // pathname never contains a query string after new URL() parsing
      const id = parsed.pathname.slice(1);
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
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

  // Try double-quoted attribute values first (most common in OG tags).
  // Use [^>"']* (not [^>]*) between attribute pairs so the gap quantifier cannot
  // match quote characters — prevents overlapping choices with the adjacent
  // quoted-value groups, which would otherwise allow catastrophic backtracking
  // on crafted inputs. Well-formed HTML never has unquoted " or ' between attrs.
  for (const [q, inner] of [
    ['"', '[^"]*'],
    ["'", "[^']*"],
  ] as const) {
    const pattern = new RegExp(
      `<meta[^>"']*(?:property|name)=${q}${escaped}${q}[^>"']*content=${q}(${inner})${q}` +
      `|<meta[^>"']*content=${q}(${inner})${q}[^>"']*(?:property|name)=${q}${escaped}${q}`,
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

  // Defense-in-depth: the URL regex in feed.ts already anchors to https?://,
  // but validate again here since the job payload is external to the worker.
  if (!isSafeHttpUrl(url)) {
    log.warn("unsafe URL scheme — skipping", { postId, url });
    return;
  }

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
        log.warn("HTTP error", { postId, url, status: res.status });
        // Consume / discard the body to release the connection
        res.body?.cancel().catch(() => undefined);
      } else {
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
          log.warn("non-HTML content-type — skipping", { postId, url, contentType });
          // Discard body to release the connection
          res.body?.cancel().catch(() => undefined);
        } else {
          // Stream the response incrementally, stopping at </head> or MAX_BODY_BYTES.
          // TextDecoder in streaming mode: each chunk decoded once, never re-decoded.
          // </head> search is bounded: we scan only the tail of the accumulated string
          // (last chunk + 6 bytes for cross-chunk boundary) so the check is O(chunk)
          // rather than O(accumulated), avoiding O(n²) behaviour over many small chunks.
          const ENDHEAD = "</head>";
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
              const chunk = decoder.decode(result.value, { stream: true });
              accumulated += chunk;
              bytesRead += result.value.byteLength;
              // Search only the tail: new chunk text + up to (ENDHEAD.length - 1) chars
              // from the previous accumulation, in case </head> straddles a chunk boundary.
              const tail = accumulated.slice(-(chunk.length + ENDHEAD.length - 1));
              if (tail.toLowerCase().includes(ENDHEAD)) {
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
      // Cap input to extractMeta at 50 KB to limit regex backtracking on crafted HTML.
      // OG tags are always in <head>; the streaming loop already stops at </head>, so
      // truncating here is a defence-in-depth measure against pathological inputs.
      const safeHtml = html.slice(0, 50_000);

      const title = decodeEntities(
        extractMeta(safeHtml, "og:title") ??
        extractMeta(safeHtml, "twitter:title") ??
        ""
      ).trim() || undefined;

      const description = decodeEntities(
        extractMeta(safeHtml, "og:description") ??
        extractMeta(safeHtml, "twitter:description") ??
        ""
      ).trim() || undefined;

      const rawThumbnail =
        extractMeta(safeHtml, "og:image") ??
        extractMeta(safeHtml, "twitter:image");

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
    log.error("failed to fetch OG tags", { postId, url, err: String(err) });
    // For YouTube URLs, store minimal metadata even if fetch failed
    if (videoId) {
      metadata = { type: "youtube", url, videoId };
    }
  }

  if (metadata) {
    await db.update(posts).set({ embedMetadata: metadata }).where(eq(posts.id, postId));
    log.info("embed stored", { postId, type: metadata.type, url });
  } else {
    log.warn("no embed data extracted", { postId, url });
  }
}

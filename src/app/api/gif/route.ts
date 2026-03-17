import { NextResponse } from "next/server";
import { env } from "@/env";
import { auth } from "@/server/auth";
import { headers } from "next/headers";

const GIPHY_BASE = "https://api.giphy.com/v1/gifs";
const LIMIT = 20;

/**
 * GET /api/gif?q=<query>
 *
 * Server-side proxy for the Giphy GIF search API.
 * Keeps GIPHY_API_KEY off the client. Returns 404 when the key is not configured
 * so the GIF picker degrades gracefully (button hidden).
 *
 * Requires an authenticated session.
 *
 * URL validation: Giphy CDN URLs follow the pattern
 *   https://media{N}.giphy.com/media/<id>/<filename>.gif
 * Both the route handler and the tRPC mutation validators use the same
 * GIPHY_URL_RE regex to keep the two sites consistent.
 */

// Exported so the tRPC feed router can import it instead of duplicating the pattern.
export const GIPHY_URL_RE = /^https:\/\/media\d*\.giphy\.com\/media\/[^/]+\/[^/]+\.gif$/;

type GiphyImage = { url: string; width: string; height: string } | undefined;

type GiphyItem = {
  id: string;
  title: string;
  images?: {
    original?: GiphyImage;
    fixed_width?: GiphyImage;
    fixed_width_small?: GiphyImage;
  };
};

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.GIPHY_API_KEY) {
    return NextResponse.json({ error: "GIF search not configured" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const endpoint = q ? `${GIPHY_BASE}/search` : `${GIPHY_BASE}/trending`;
  const url = new URL(endpoint);
  url.searchParams.set("api_key", env.GIPHY_API_KEY);
  url.searchParams.set("limit", String(LIMIT));
  url.searchParams.set("rating", "pg-13");
  url.searchParams.set("lang", "en");
  if (q) url.searchParams.set("q", q);

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    return NextResponse.json({ error: "Giphy API error" }, { status: 502 });
  }

  // Runtime guard: treat the response as unknown and validate field by field.
  const body = await res.json() as { data?: unknown };
  const items: GiphyItem[] = Array.isArray(body.data)
    ? (body.data as GiphyItem[])
    : [];

  const results = items
    .map((r) => {
      const orig = r.images?.original;
      // Prefer fixed_width_small for preview; fall back to fixed_width (never original — too large).
      const preview = r.images?.fixed_width_small ?? r.images?.fixed_width;
      return {
        id: r.id ?? "",
        title: r.title ?? "",
        url: orig?.url ?? "",
        previewUrl: preview?.url ?? "",
        width: parseInt(orig?.width ?? "0", 10),
        height: parseInt(orig?.height ?? "0", 10),
      };
    })
    .filter(
      (r) =>
        r.url &&
        r.previewUrl &&
        GIPHY_URL_RE.test(r.url) &&
        GIPHY_URL_RE.test(r.previewUrl) &&
        r.width > 0 &&
        r.height > 0
    );

  return NextResponse.json({ results });
}

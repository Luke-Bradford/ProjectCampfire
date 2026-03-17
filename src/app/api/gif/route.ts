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
 */
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

  const json = await res.json() as {
    data?: Array<{
      id: string;
      title: string;
      images?: {
        original?: { url: string; width: string; height: string };
        fixed_width_small?: { url: string; width: string; height: string };
      };
    }>;
  };

  const isGiphyUrl = (u: string) => {
    try {
      const host = new URL(u).hostname;
      return host === "media.giphy.com" || host.match(/^media\d+\.giphy\.com$/) !== null;
    } catch { return false; }
  };

  const results = (Array.isArray(json.data) ? json.data : []).map((r) => ({
    id: r.id,
    title: r.title,
    url: r.images?.original?.url ?? "",
    previewUrl: r.images?.fixed_width_small?.url ?? r.images?.original?.url ?? "",
    width: parseInt(r.images?.original?.width ?? "0", 10),
    height: parseInt(r.images?.original?.height ?? "0", 10),
  })).filter((r) => r.url && isGiphyUrl(r.url) && isGiphyUrl(r.previewUrl) && r.width > 0 && r.height > 0);

  return NextResponse.json({ results });
}

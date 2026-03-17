import { NextResponse } from "next/server";
import { env } from "@/env";
import { auth } from "@/server/auth";
import { headers } from "next/headers";

const TENOR_BASE = "https://tenor.googleapis.com/v2";
const LIMIT = 20;

/**
 * GET /api/tenor?q=<query>
 *
 * Server-side proxy for the Tenor GIF search API.
 * Keeps TENOR_API_KEY off the client. Returns 404 when the key is not configured
 * so the GIF picker can degrade gracefully.
 *
 * Requires an authenticated session — callers must be logged in.
 */
export async function GET(req: Request) {
  // Auth check — must be signed in
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.TENOR_API_KEY) {
    return NextResponse.json({ error: "GIF search not configured" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const url = new URL(q ? `${TENOR_BASE}/search` : `${TENOR_BASE}/featured`);
  url.searchParams.set("key", env.TENOR_API_KEY);
  url.searchParams.set("limit", String(LIMIT));
  url.searchParams.set("media_filter", "gif,tinygif");
  url.searchParams.set("contentfilter", "medium");
  if (q) url.searchParams.set("q", q);

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    return NextResponse.json({ error: "Tenor API error" }, { status: 502 });
  }

  const json = await res.json() as {
    results?: Array<{
      id: string;
      title: string;
      media_formats?: {
        gif?: { url: string; dims: number[] };
        tinygif?: { url: string; dims: number[] };
      };
    }>;
  };

  const isTenorUrl = (u: string) => {
    try { return new URL(u).hostname === "media.tenor.com"; } catch { return false; }
  };

  const results = (Array.isArray(json.results) ? json.results : []).map((r) => ({
    id: r.id,
    title: r.title,
    url: r.media_formats?.gif?.url ?? "",
    previewUrl: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? "",
    width: r.media_formats?.gif?.dims[0] ?? 0,
    height: r.media_formats?.gif?.dims[1] ?? 0,
  })).filter((r) => r.url && isTenorUrl(r.url) && isTenorUrl(r.previewUrl) && r.width > 0 && r.height > 0);

  return NextResponse.json({ results });
}

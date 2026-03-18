"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type GifResult = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
};

type GifPickerProps = {
  onSelect: (gif: GifResult) => void;
  onClose: () => void;
};

export type { GifResult };

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // true = open above the trigger, false = open below
  const [openUpward, setOpenUpward] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Aborts the in-flight fetch when a new query starts or the picker unmounts.
  // Prevents stale responses from overwriting newer results (and state updates after unmount).
  const fetchAbortRef = useRef<AbortController | null>(null);
  // Stable ref so event-listener effects don't re-register on every render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Decide whether to open above or below based on available viewport space.
  // The picker is ~320px tall (search + 256px grid + attribution).
  // Re-evaluated on scroll and resize so the direction stays correct if the
  // viewport shifts while the picker is open.
  useEffect(() => {
    function recompute() {
      const parent = containerRef.current?.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const spaceAbove = parentRect.top;
      const spaceBelow = window.innerHeight - parentRect.bottom;
      const next = spaceAbove >= 320 || spaceAbove >= spaceBelow;
      setOpenUpward((prev) => (prev === next ? prev : next));
    }
    recompute();
    window.addEventListener("scroll", recompute, { capture: true, passive: true });
    window.addEventListener("resize", recompute, { passive: true });
    return () => {
      window.removeEventListener("scroll", recompute, { capture: true });
      window.removeEventListener("resize", recompute);
    };
  }, []);

  // Focus the search input when the picker opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click (synchronous mousedown).
  // The toggle button that opens the picker must call e.stopPropagation() on
  // its own mousedown so it doesn't immediately trigger this handler.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // On unmount: cancel any pending debounce and abort any in-flight fetch
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      fetchAbortRef.current?.abort();
    };
  }, []);

  const search = useCallback(async (q: string) => {
    // Cancel any in-flight request before starting a new one
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    try {
      const url = `/api/gif${q ? `?q=${encodeURIComponent(q)}` : ""}`;
      const res = await fetch(url, { signal: controller.signal });
      if (res.status === 404) {
        setUnavailable(true);
        return;
      }
      const json = await res.json() as { results?: GifResult[] };
      setResults(Array.isArray(json.results) ? json.results : []);
      setLoading(false);
    } catch (err) {
      // Ignore aborted fetches — triggered by a newer query or unmount.
      // Do NOT call setLoading(false) here: the new query that triggered the abort
      // has already set loading=true and is still in flight.
      if (err instanceof Error && err.name === "AbortError") return;
      // Network error — show empty state
      setResults([]);
      setLoading(false);
    }
  }, []);

  // Load featured GIFs on mount
  useEffect(() => {
    void search("");
  }, [search]);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(v), 350);
  }

  if (unavailable) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute z-50 left-0 w-80 rounded-xl border bg-popover shadow-lg overflow-hidden",
        openUpward ? "bottom-full mb-1" : "top-full mt-1"
      )}
    >
      {/* Search */}
      <div className="p-2 border-b">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder="Search GIFs…"
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Results grid */}
      <div className="h-64 overflow-y-auto p-2">
        {loading && results.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {query ? "No results" : "No trending GIFs"}
          </div>
        ) : (
          <div className="columns-2 gap-1 space-y-1">
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelect(gif)}
                className="block w-full overflow-hidden rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Image
                  src={gif.previewUrl}
                  alt={gif.title}
                  width={gif.width ?? 160}
                  height={gif.height ?? 120}
                  className="w-full rounded object-cover hover:opacity-90 transition-opacity"
                  unoptimized
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Giphy attribution — required by Giphy API terms */}
      <div className="border-t px-3 py-1.5 text-right">
        <span className="text-[10px] text-muted-foreground">Powered by GIPHY</span>
      </div>
    </div>
  );
}

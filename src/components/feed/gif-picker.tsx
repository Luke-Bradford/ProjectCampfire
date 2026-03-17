"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus the search input when the picker opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const url = `/api/tenor${q ? `?q=${encodeURIComponent(q)}` : ""}`;
      const res = await fetch(url);
      if (res.status === 404) {
        setUnavailable(true);
        return;
      }
      const json = await res.json() as { results?: GifResult[] };
      setResults(json.results ?? []);
    } catch {
      // Network error — show empty state
      setResults([]);
    } finally {
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
      className="absolute z-50 bottom-full mb-1 left-0 w-80 rounded-xl border bg-popover shadow-lg overflow-hidden"
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
                  width={gif.width || 160}
                  height={gif.height || 120}
                  className="w-full rounded object-cover hover:opacity-90 transition-opacity"
                  unoptimized
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tenor attribution — required by Tenor API terms */}
      <div className="border-t px-3 py-1.5 text-right">
        <span className="text-[10px] text-muted-foreground">Powered by Tenor</span>
      </div>
    </div>
  );
}

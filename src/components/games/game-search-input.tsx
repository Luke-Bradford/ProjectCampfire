"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/trpc/react";
import { Input } from "@/components/ui/input";

export type GamePickResult = { id: string; title: string; coverUrl?: string | null };

export function GameSearchInput({
  onPick,
  disabled,
  autoFocus,
  placeholder = "Search games…",
}: {
  onPick: (game: GamePickResult) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchEnabled = query.trim().length >= 1;
  const { data: results, isFetching } = api.games.search.useQuery(
    { query: query.trim() },
    { enabled: searchEnabled, staleTime: 10_000 }
  );

  const quickAdd = api.games.create.useMutation({
    onSuccess: (data) => {
      onPick({ id: data.id, title: query.trim() });
    },
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); setQuickAddMode(false); }}
        onFocus={() => { if (query.trim()) setShowDropdown(true); }}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled || quickAdd.isPending}
      />
      {showDropdown && query.trim().length >= 1 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md text-sm overflow-hidden">
          {isFetching && <p className="px-3 py-2 text-muted-foreground">Searching…</p>}
          {!isFetching && results?.map((g) => (
            <button
              key={g.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setShowDropdown(false); onPick({ id: g.id, title: g.title, coverUrl: g.coverUrl }); }}
            >
              {g.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.coverUrl} alt="" className="h-8 w-6 rounded object-cover shrink-0" />
              )}
              <span className="truncate">{g.title}</span>
            </button>
          ))}
          {!isFetching && results?.length === 0 && !quickAddMode && (
            <div className="px-3 py-2 text-muted-foreground">
              No results.{" "}
              <button
                type="button"
                className="text-primary hover:underline"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuickAddMode(true)}
              >
                Add &ldquo;{query.trim()}&rdquo; as new game
              </button>
            </div>
          )}
          {quickAddMode && (
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-sm truncate">Add &ldquo;{query.trim()}&rdquo; to catalog?</span>
              <div className="flex gap-2 shrink-0">
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setQuickAddMode(false)}>Cancel</button>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  disabled={quickAdd.isPending}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => quickAdd.mutate({ title: query.trim() })}
                >
                  {quickAdd.isPending ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { api, type RouterOutputs } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GamesListSkeleton } from "@/components/ui/skeletons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Tab = "library" | "catalog";

const PLATFORMS = ["pc", "playstation", "xbox", "nintendo", "other"] as const;
type Platform = (typeof PLATFORMS)[number];

const PLATFORM_LABELS: Record<Platform, string> = {
  pc: "PC",
  playstation: "PlayStation",
  xbox: "Xbox",
  nintendo: "Nintendo",
  other: "Other",
};

// ── IGDB search result type ────────────────────────────────────────────────────

type IgdbResult = RouterOutputs["games"]["igdbSearch"][number];

// ── Add game dialog ───────────────────────────────────────────────────────────

type Step =
  | { type: "search" }
  | { type: "platform"; gameId: string; gameTitle: string }
  | { type: "manual" };

function AddGameDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ type: "search" });
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform>("pc");
  const [error, setError] = useState("");
  // Captures the selected game title before the mutation fires, avoiding stale closure
  const selectedTitleRef = useRef("");

  // Manual form fields
  const [manualTitle, setManualTitle] = useState("");
  const [manualMin, setManualMin] = useState("");
  const [manualMax, setManualMax] = useState("");

  const igdbSearch = api.games.igdbSearch.useQuery(
    { query },
    { enabled: query.length >= 2, staleTime: 30_000 }
  );

  const importFromIgdb = api.games.importFromIgdb.useMutation({
    onSuccess: ({ id }) => setStep({ type: "platform", gameId: id, gameTitle: selectedTitleRef.current }),
    onError: (err) => setError(err.message),
  });

  const create = api.games.create.useMutation({
    onError: (err) => setError(err.message),
  });

  const utils = api.useUtils();

  const toggleOwnership = api.games.toggleOwnership.useMutation({
    onSuccess: () => {
      setOpen(false);
      reset();
      // Invalidate both caches so the catalog 'Owned' badge reflects the new
      // ownership immediately without needing a manual refetch (CAMP-288).
      void utils.games.catalog.invalidate();
      onAdded();
    },
    onError: (err) => setError(err.message),
  });

  function reset() {
    setStep({ type: "search" });
    setQuery("");
    setPlatform("pc");
    setError("");
    setManualTitle("");
    setManualMin("");
    setManualMax("");
  }

  function handleOpenChange(o: boolean) {
    setOpen(o);
    if (!o) reset();
  }

  function selectIgdbResult(result: IgdbResult) {
    setError("");
    selectedTitleRef.current = result.title;
    importFromIgdb.mutate({ igdbId: result.igdbId });
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const { id } = await create.mutateAsync({
        title: manualTitle,
        minPlayers: manualMin ? parseInt(manualMin) : undefined,
        maxPlayers: manualMax ? parseInt(manualMax) : undefined,
      });
      setStep({ type: "platform", gameId: id, gameTitle: manualTitle });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function handlePlatformConfirm() {
    if (step.type !== "platform") return;
    toggleOwnership.mutate({ gameId: step.gameId, platform });
  }

  const results: IgdbResult[] = igdbSearch.data ?? [];

  // ── Search step ──────────────────────────────────────────────────────────────

  if (step.type === "search") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button>Add game</Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Search for a game</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <Input
              placeholder="e.g. Elden Ring"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setError(""); }}
              autoFocus
            />
            {query.length >= 2 && (
              <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                {igdbSearch.isLoading && (
                  <p className="p-3 text-sm text-muted-foreground">Searching…</p>
                )}
                {!igdbSearch.isLoading && results.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No results found.</p>
                )}
                {results.map((r) => (
                  <button
                    key={r.igdbId}
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted transition-colors"
                    onClick={() => selectIgdbResult(r)}
                    disabled={importFromIgdb.isPending}
                  >
                    {r.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.coverUrl} alt={r.title} className="h-12 w-9 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-12 w-9 rounded bg-muted shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[
                          r.genres.slice(0, 2).join(", "),
                          r.minPlayers && r.maxPlayers ? `${r.minPlayers}–${r.maxPlayers} players` : null,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Can&apos;t find it?{" "}
              <button
                className="underline hover:text-foreground"
                onClick={() => setStep({ type: "manual" })}
              >
                Add manually
              </button>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Manual step ──────────────────────────────────────────────────────────────

  if (step.type === "manual") {
    const isPending = create.isPending;
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button>Add game</Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add game manually</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleManualSubmit} className="space-y-4">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="game-title">Title</Label>
              <Input
                id="game-title"
                placeholder="e.g. Elden Ring"
                required
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="min-players">Min players</Label>
                <Input
                  id="min-players"
                  type="number"
                  min={1}
                  placeholder="1"
                  value={manualMin}
                  onChange={(e) => setManualMin(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-players">Max players</Label>
                <Input
                  id="max-players"
                  type="number"
                  min={1}
                  placeholder="4"
                  value={manualMax}
                  onChange={(e) => setManualMax(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <button
                type="button"
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => setStep({ type: "search" })}
              >
                ← Back to search
              </button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!manualTitle.trim() || isPending}>
                  {isPending ? "Adding…" : "Next"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Platform step ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Add game</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Which platform do you own it on?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{step.gameTitle}</p>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                  platform === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePlatformConfirm}
              disabled={toggleOwnership.isPending}
            >
              {toggleOwnership.isPending ? "Adding…" : "Add to library"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Catalog tab ───────────────────────────────────────────────────────────────

function CatalogTab() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  // Track in-flight add requests per game to avoid the shared isPending/variables
  // race — clicking game A then game B before A resolves would re-enable A's button.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const utils = api.useUtils();

  useEffect(() => {
    const trimmed = searchInput.trim();
    const t = setTimeout(() => setSearch(trimmed), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    api.games.catalog.useInfiniteQuery(
      { search: search || undefined, limit: 24 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  // Insert-only mutation — safe for double-clicks; cannot accidentally remove a game.
  const addToLibrary = api.games.addToLibrary.useMutation({
    onSuccess: (_data, variables) => {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(variables.gameId); return next; });
      void utils.games.catalog.invalidate();
      void utils.games.myGames.invalidate();
    },
    onError: (_err, variables) => {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(variables.gameId); return next; });
    },
  });

  function handleAdd(gameId: string) {
    setPendingIds((prev) => new Set(prev).add(gameId));
    addToLibrary.mutate({ gameId, platform: "pc" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${total} game${total === 1 ? "" : "s"} in catalog`}
        </p>
        <Input
          placeholder="Search catalog…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {isLoading && allItems.length === 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-1.5">
              <div className="w-full aspect-[3/4] rounded-lg bg-muted" />
              <div className="h-3 rounded bg-muted w-3/4" />
            </div>
          ))}
        </div>
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          }
          heading="No games found"
          description={search ? `No games match "${search}".` : "The catalog is empty."}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {allItems.map((g) => (
              <div key={g.id} className="group relative">
                <Link href={`/games/${g.id}`} className="block">
                  {g.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.coverUrl}
                      alt={g.title}
                      className="w-full aspect-[3/4] rounded-lg object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] rounded-lg bg-muted flex items-center justify-center">
                      <span className="text-2xl font-bold text-muted-foreground">
                        {g.title.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {g.owned && (
                    <div className="absolute top-1.5 left-1.5">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-background/80 backdrop-blur-sm">
                        Owned
                      </Badge>
                    </div>
                  )}
                </Link>
                <div className="mt-1.5 space-y-1">
                  <Link href={`/games/${g.id}`} className="text-xs font-medium leading-tight line-clamp-2 hover:underline block">
                    {g.title}
                  </Link>
                  {!g.owned && (
                    <button
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                      onClick={() => handleAdd(g.id)}
                      disabled={pendingIds.has(g.id)}
                    >
                      {pendingIds.has(g.id) ? "Adding…" : "+ Add to library"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <button
                className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ViewMode = "list" | "grid";
type SortOption = "alphabetical" | "most_played" | "recently_played" | "recently_added";

const SORT_LABELS: Record<SortOption, string> = {
  alphabetical:    "A–Z",
  most_played:     "Most played",
  recently_played: "Recently played",
  recently_added:  "Recently added",
};

/** Format playtime minutes as "142h 33m" (or "33m" if under an hour). */
function formatPlaytime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function GamesPage() {
  const [tab, setTab] = useState<Tab>("library");
  const [filterPlatform, setFilterPlatform] = useState<Platform | undefined>();
  const [showHidden, setShowHidden] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sort, setSort] = useState<SortOption>("alphabetical");

  // Read persisted preferences after mount to avoid SSR/hydration mismatch.
  useEffect(() => {
    const storedView = localStorage.getItem("games-view-mode");
    if (storedView === "list" || storedView === "grid") setViewMode(storedView);
    const storedSort = localStorage.getItem("games-sort");
    if (storedSort && storedSort in SORT_LABELS) setSort(storedSort as SortOption);
  }, []);

  // Debounce search input — update the query param 300ms after the user stops typing.
  useEffect(() => {
    const trimmed = searchInput.trim();
    const t = setTimeout(() => setSearch(trimmed), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const utils = api.useUtils();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    api.games.myGames.useInfiniteQuery(
      { platform: filterPlatform, showHidden, search: search || undefined, limit: 50, sort },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const setGameHidden = api.games.setGameHidden.useMutation({
    onSuccess: () => void utils.games.myGames.invalidate(),
  });

  function setView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("games-view-mode", mode);
  }

  function setSortOption(option: SortOption) {
    setSort(option);
    localStorage.setItem("games-sort", option);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Games</h1>
        <div className="flex items-center gap-2">
          {tab === "library" && (
            <>
              {/* Sort selector */}
              <select
                value={sort}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Sort games"
              >
                {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>

              {/* View mode toggle */}
              <div className="flex rounded-md border overflow-hidden">
                <button
                  onClick={() => setView("list")}
                  aria-label="List view"
                  className={`px-2 py-1.5 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {/* List icon */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
                <button
                  onClick={() => setView("grid")}
                  aria-label="Grid view"
                  className={`px-2 py-1.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {/* Grid icon */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                  </svg>
                </button>
              </div>
              <AddGameDialog onAdded={() => void utils.games.myGames.invalidate()} />
            </>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("library")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            tab === "library"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          My Library
        </button>
        <button
          onClick={() => setTab("catalog")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            tab === "catalog"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Browse Catalog
        </button>
      </div>

      {/* CatalogTab stays mounted to preserve search state and avoid re-firing the
          unfiltered query on every tab switch. Hidden via CSS when not active. */}
      <div className={tab === "catalog" ? undefined : "hidden"}>
        <CatalogTab />
      </div>

      {tab === "library" && (
      <>

      {/* Search */}
      <Input
        placeholder="Search your library…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="max-w-sm"
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterPlatform(undefined)}
          className={`rounded-md border px-3 py-1 text-sm transition-colors ${
            !filterPlatform ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          All
        </button>
        {PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => setFilterPlatform(filterPlatform === p ? undefined : p)}
            className={`rounded-md border px-3 py-1 text-sm transition-colors ${
              filterPlatform === p
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {PLATFORM_LABELS[p]}
          </button>
        ))}
        <button
          onClick={() => setShowHidden(!showHidden)}
          className={`ml-auto rounded-md border px-3 py-1 text-sm transition-colors ${
            showHidden ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          {showHidden ? "Show library" : "Manage hidden"}
        </button>
      </div>

      {!isLoading && total > 0 && (
        <p className="text-sm text-muted-foreground">
          {total} game{total === 1 ? "" : "s"}{showHidden ? " hidden" : ""}
        </p>
      )}

      {isLoading && allItems.length === 0 ? (
        <GamesListSkeleton />
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="6" y1="12" x2="10" y2="12" />
              <line x1="8" y1="10" x2="8" y2="14" />
              <circle cx="15" cy="13" r="1" />
              <circle cx="17" cy="11" r="1" />
              <path d="M12 17c-2.8 0-5-2.2-5-5V7c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v5c0 2.8-2.2 5-5 5z" />
            </svg>
          }
          heading={showHidden ? "No hidden games" : "No games in your library"}
          description={
            showHidden
              ? "Games you hide will appear here."
              : "Add games you own so your group can see what everyone can play together."
          }
          action={showHidden ? undefined : <AddGameDialog onAdded={() => void utils.games.myGames.invalidate()} />}
          secondaryAction={
            showHidden ? undefined : (
              <Button asChild size="sm" variant="outline">
                <Link href="/settings">Connect Steam</Link>
              </Button>
            )
          }
        />
      ) : viewMode === "grid" ? (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {allItems.map((g) => (
              <div key={g.id} className="group relative">
                <Link href={`/games/${g.id}`} className="block">
                  {g.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.coverUrl}
                      alt={g.title}
                      className="w-full aspect-[3/4] rounded-lg object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] rounded-lg bg-muted flex items-center justify-center">
                      <span className="text-2xl font-bold text-muted-foreground">
                        {g.title.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {/* Platform badge overlay */}
                  {g.platforms[0] && (
                    <div className="absolute top-1.5 left-1.5">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-background/80 backdrop-blur-sm">
                        {PLATFORM_LABELS[g.platforms[0]]}
                        {g.platforms.length > 1 && ` +${g.platforms.length - 1}`}
                      </Badge>
                    </div>
                  )}
                  {/* Playtime badge — visible on hover when data exists */}
                  {g.playtimeMinutes != null && g.playtimeMinutes > 0 && (
                    <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-background/80 backdrop-blur-sm">
                        {formatPlaytime(g.playtimeMinutes)}
                      </Badge>
                    </div>
                  )}
                </Link>
                <div className="mt-1.5 flex items-start justify-between gap-1">
                  <Link href={`/games/${g.id}`} className="text-xs font-medium leading-tight line-clamp-2 hover:underline flex-1">
                    {g.title}
                  </Link>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setGameHidden.mutate({ gameId: g.id, hidden: !g.hidden })}
                    disabled={setGameHidden.isPending && setGameHidden.variables?.gameId === g.id}
                    aria-label={g.hidden ? "Unhide" : "Hide"}
                  >
                    {g.hidden ? "↩" : "✕"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <button
                className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <ul className="space-y-2">
            {allItems.map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-lg border p-3">
                {/* Cover thumbnail */}
                <Link href={`/games/${g.id}`} className="shrink-0">
                  {g.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.coverUrl}
                      alt={g.title}
                      className="h-14 w-10 rounded object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <div className="h-14 w-10 rounded bg-muted flex items-center justify-center">
                      <span className="text-sm font-bold text-muted-foreground">{g.title.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                </Link>
                <div className="space-y-1 min-w-0 flex-1">
                  <Link href={`/games/${g.id}`} className="font-medium hover:underline truncate block">{g.title}</Link>
                  <div className="flex items-center gap-2 flex-wrap">
                    {g.platforms.map((p) => (
                      <Badge key={p} variant="secondary" className="text-xs">
                        {PLATFORM_LABELS[p]}
                      </Badge>
                    ))}
                    {g.minPlayers && g.maxPlayers && (
                      <span className="text-xs text-muted-foreground">
                        {g.minPlayers}–{g.maxPlayers} players
                      </span>
                    )}
                    {g.genres && g.genres.length > 0 && (
                      <span className="text-xs text-muted-foreground">{g.genres.join(", ")}</span>
                    )}
                    {g.playtimeMinutes != null && g.playtimeMinutes > 0 && (sort === "most_played" || sort === "recently_played") && (
                      <span className="text-xs text-muted-foreground">{formatPlaytime(g.playtimeMinutes)}</span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => setGameHidden.mutate({ gameId: g.id, hidden: !g.hidden })}
                  disabled={setGameHidden.isPending && setGameHidden.variables?.gameId === g.id}
                >
                  {g.hidden ? "Unhide" : "Hide"}
                </Button>
              </li>
            ))}
          </ul>

          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <button
                className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      </>
      )}
    </div>
  );
}

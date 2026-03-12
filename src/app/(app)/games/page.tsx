"use client";

import { useState, useRef } from "react";
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

  const toggleOwnership = api.games.toggleOwnership.useMutation({
    onSuccess: () => {
      setOpen(false);
      reset();
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GamesPage() {
  const [filterPlatform, setFilterPlatform] = useState<Platform | undefined>();
  const [showHidden, setShowHidden] = useState(false);

  const utils = api.useUtils();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    api.games.myGames.useInfiniteQuery(
      { platform: filterPlatform, showHidden, limit: 50 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const setGameHidden = api.games.setGameHidden.useMutation({
    onSuccess: () => void utils.games.myGames.invalidate(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Games</h1>
          <p className="text-muted-foreground">
            {isLoading
              ? "Loading…"
              : total === 0
              ? showHidden ? "No hidden games." : "No games yet."
              : `${total} game${total === 1 ? "" : "s"}${showHidden ? " hidden" : ""}`}
          </p>
        </div>
        <AddGameDialog onAdded={() => void utils.games.myGames.invalidate()} />
      </div>

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
      ) : (
        <>
          <ul className="space-y-2">
            {allItems.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <Link href={`/games/${g.id}`} className="font-medium hover:underline truncate block">{g.title}</Link>
                  <div className="flex items-center gap-2 flex-wrap">
                    {g.platforms.map((p) => (
                      <Badge key={p} variant="secondary" className="text-xs">
                        {PLATFORM_LABELS[p as Platform] ?? p}
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
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground shrink-0 ml-2"
                  onClick={() => setGameHidden.mutate({ gameId: g.id, hidden: !g.hidden })}
                  disabled={setGameHidden.isPending}
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
    </div>
  );
}

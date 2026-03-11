"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

type IgdbResult = inferRouterOutputs<AppRouter>["games"]["igdbSearch"][number];

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
  const { data: myGames = [], refetch } = api.games.myGames.useQuery({
    platform: filterPlatform,
  });

  const toggleOwnership = api.games.toggleOwnership.useMutation({
    onSuccess: () => void refetch(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Games</h1>
          <p className="text-muted-foreground">
            {myGames.length === 0 ? "No games yet." : `${myGames.length} game${myGames.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <AddGameDialog onAdded={() => void refetch()} />
      </div>

      {/* Platform filter */}
      <div className="flex flex-wrap gap-2">
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
      </div>

      {myGames.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Add games you own so friends can see what you can play together.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {myGames.map((g) => (
            <li key={`${g.id}-${g.platform}`} className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-1">
                <Link href={`/games/${g.id}`} className="font-medium hover:underline">{g.title}</Link>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {PLATFORM_LABELS[g.platform as Platform]}
                  </Badge>
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
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  toggleOwnership.mutate({ gameId: g.id, platform: g.platform as Platform })
                }
                disabled={toggleOwnership.isPending}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

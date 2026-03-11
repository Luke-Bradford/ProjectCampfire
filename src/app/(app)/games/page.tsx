"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
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

// ── Add game dialog ───────────────────────────────────────────────────────────

function AddGameDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [minPlayers, setMinPlayers] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("");
  const [platform, setPlatform] = useState<Platform>("pc");
  const [error, setError] = useState("");

  const create = api.games.create.useMutation();
  const toggleOwnership = api.games.toggleOwnership.useMutation({
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setMinPlayers("");
      setMaxPlayers("");
      onAdded();
    },
    onError: (err) => setError(err.message),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { id } = await create.mutateAsync({
      title,
      minPlayers: minPlayers ? parseInt(minPlayers) : undefined,
      maxPlayers: maxPlayers ? parseInt(maxPlayers) : undefined,
    });
    toggleOwnership.mutate({ gameId: id, platform });
  }

  const isPending = create.isPending || toggleOwnership.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add game</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a game to your library</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="game-title">Title</Label>
            <Input
              id="game-title"
              placeholder="e.g. Elden Ring"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
                value={minPlayers}
                onChange={(e) => setMinPlayers(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-players">Max players</Label>
              <Input
                id="max-players"
                type="number"
                min={1}
                placeholder="4"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Platform</Label>
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
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isPending}>
              {isPending ? "Adding…" : "Add to library"}
            </Button>
          </div>
        </form>
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

"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const PLATFORM_LABELS: Record<string, string> = {
  pc: "PC",
  playstation: "PlayStation",
  xbox: "Xbox",
  nintendo: "Nintendo",
  other: "Other",
};

const EVENT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

// ── Group ownership section ───────────────────────────────────────────────────

function GroupOwnershipSection({
  gameId,
  groupId,
  myUserId,
}: {
  gameId: string;
  groupId: string;
  myUserId: string;
}) {
  const { data: owners = [], isLoading } = api.games.ownershipOverlap.useQuery(
    { gameId, groupId },
    { staleTime: 60_000 }
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const myEntries = owners.filter((o) => o.user.id === myUserId);
  const otherEntries = owners.filter((o) => o.user.id !== myUserId);
  const nobodyOwns = owners.length === 0;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Who owns this</p>
      {nobodyOwns && (
        <p className="text-sm text-muted-foreground">No group members own this yet.</p>
      )}
      {myEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {myEntries.map((o) => (
            <Badge key={o.platform} variant="default" className="text-xs">
              You · {PLATFORM_LABELS[o.platform] ?? o.platform}
            </Badge>
          ))}
        </div>
      )}
      {otherEntries.length > 0 && (
        <ul className="space-y-1">
          {otherEntries.map((o) => (
            <li key={`${o.user.id}-${o.platform}`} className="flex items-center gap-2 text-sm">
              <span>{o.user.name}</span>
              <Badge variant="secondary" className="text-xs">
                {PLATFORM_LABELS[o.platform] ?? o.platform}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {myEntries.length > 0 && otherEntries.length === 0 && (
        <p className="text-xs text-muted-foreground">No other group members own this.</p>
      )}
    </div>
  );
}

// ── Poll history section ───────────────────────────────────────────────────────

function PollHistorySection({ gameId, groupId }: { gameId: string; groupId: string }) {
  const { data: history = [], isLoading } = api.games.pollHistory.useQuery(
    { gameId, groupId },
    { staleTime: 60_000 }
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">No polls include this game yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {history.map((poll) => {
        const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);
        return (
          <li key={poll.id} className="rounded-lg border p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{poll.question}</p>
                {poll.event && (
                  <Link
                    href={`/events/${poll.event.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {poll.event.title} ·{" "}
                    {EVENT_STATUS_LABEL[poll.event.status] ?? poll.event.status}
                  </Link>
                )}
              </div>
              <Badge
                variant={poll.status === "open" ? "default" : "secondary"}
                className="text-xs shrink-0"
              >
                {poll.status === "open" ? "Open" : "Closed"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {totalVotes} vote{totalVotes === 1 ? "" : "s"} · by {poll.createdBy.name} ·{" "}
              {format(new Date(poll.createdAt), "d MMM yyyy")}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: me } = api.user.me.useQuery();
  const { data: game, isLoading } = api.games.get.useQuery({ id });
  const { data: groups = [] } = api.groups.list.useQuery();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const activeGroupId = selectedGroupId ?? groups[0]?.id ?? null;
  const myUserId = me?.id ?? "";

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!game) return <p className="text-sm text-muted-foreground">Game not found.</p>;

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>

      {/* Header */}
      <div className="flex gap-4">
        {game.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.coverUrl}
            alt={game.title}
            className="h-28 w-20 rounded-lg object-cover shrink-0"
          />
        )}
        <div className="space-y-1.5 min-w-0">
          <h1 className="text-2xl font-bold">{game.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {game.minPlayers && game.maxPlayers && (
              <span className="text-sm text-muted-foreground">
                {game.minPlayers}–{game.maxPlayers} players
              </span>
            )}
            {game.genres && game.genres.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {game.genres.map((g) => (
                  <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                ))}
              </div>
            )}
          </div>
          {game.description && (
            <p className="text-sm text-muted-foreground">{game.description}</p>
          )}
          {game.priceDataJson && (
            <div className="flex items-center gap-2 pt-0.5">
              {game.priceDataJson.discountPercent > 0 ? (
                <>
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                    -{game.priceDataJson.discountPercent}%
                  </Badge>
                  <span className="text-sm line-through text-muted-foreground">
                    {game.priceDataJson.initialFormatted}
                  </span>
                  <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                    {game.priceDataJson.finalFormatted}
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {game.priceDataJson.finalFormatted}
                </span>
              )}
              {game.priceSnapshotAt && (
                <span className="text-xs text-muted-foreground">
                  · as of {format(new Date(game.priceSnapshotAt), "MMM d")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Group-scoped sections */}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Join or create a group to see ownership and poll history.
        </p>
      ) : (
        <>
          {/* Group selector — only shown when the user is in multiple groups */}
          {groups.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Group</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                      activeGroupId === g.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeGroupId && (
            <div className="space-y-6">
              <GroupOwnershipSection
                gameId={id}
                groupId={activeGroupId}
                myUserId={myUserId}
              />

              <div className="space-y-2">
                <p className="text-sm font-medium">Poll history</p>
                <PollHistorySection gameId={id} groupId={activeGroupId} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

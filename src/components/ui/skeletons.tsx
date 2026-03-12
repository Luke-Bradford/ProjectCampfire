/**
 * Page-level skeleton loading states.
 * Each component mirrors the real page's layout dimensions to prevent
 * layout shift when data loads.
 */
import { Skeleton } from "@/components/ui/skeleton";

// ── Feed ──────────────────────────────────────────────────────────────────────

function PostCardSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-4 pt-1">
        <Skeleton className="h-3.5 w-12" />
        <Skeleton className="h-3.5 w-16" />
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {Array.from({ length: 4 }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Games list ────────────────────────────────────────────────────────────────

function GameRowSkeleton() {
  return (
    <li className="flex items-center justify-between rounded-lg border p-3">
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-8 w-16 rounded-md" />
    </li>
  );
}

export function GamesListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <GameRowSkeleton key={i} />
      ))}
    </ul>
  );
}

// ── Groups ────────────────────────────────────────────────────────────────────

function GroupRowSkeleton() {
  return (
    <li className="rounded-lg border p-4 space-y-1">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-3 w-20" />
    </li>
  );
}

export function GroupsListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <GroupRowSkeleton key={i} />
      ))}
    </ul>
  );
}

// ── Friends ───────────────────────────────────────────────────────────────────

function FriendRowSkeleton() {
  return (
    <li className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-8 w-16 rounded-md" />
    </li>
  );
}

export function FriendsListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <FriendRowSkeleton key={i} />
      ))}
    </ul>
  );
}

// ── Events ────────────────────────────────────────────────────────────────────

function EventRowSkeleton() {
  return (
    <li className="flex items-center justify-between rounded-lg border p-3">
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </li>
  );
}

export function EventsListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <EventRowSkeleton key={i} />
      ))}
    </ul>
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────

function NotifRowSkeleton() {
  return (
    <li className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-24" />
      </div>
    </li>
  );
}

export function NotificationsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <NotifRowSkeleton key={i} />
      ))}
    </ul>
  );
}

// ── Game detail ───────────────────────────────────────────────────────────────

export function GameDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-12" />
      <div className="flex gap-4">
        <Skeleton className="h-28 w-20 rounded-lg shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

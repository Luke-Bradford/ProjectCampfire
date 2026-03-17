"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { api } from "@/trpc/react";
import { PostComposer } from "@/components/feed/post-composer";
import { PostCard } from "@/components/feed/post-card";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedSkeleton } from "@/components/ui/skeletons";
import { Button } from "@/components/ui/button";

// Maximum groups shown in the dropdown before "More…" overflow
const GROUP_TAB_LIMIT = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Tab bar
// ─────────────────────────────────────────────────────────────────────────────

function FeedTabs({ filter, onFilter }: { filter: string; onFilter: (f: string) => void }) {
  const { data: myGroups = [] } = api.groups.list.useQuery();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback((returnFocus = true) => {
    setDropdownOpen(false);
    if (returnFocus) toggleBtnRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Move focus into menu when it opens
  useEffect(() => {
    if (dropdownOpen) {
      const first = menuRef.current?.querySelector<HTMLElement>("button, a");
      first?.focus();
    }
  }, [dropdownOpen]);

  // Keyboard handling on the open menu
  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const focusable = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("button, a") ?? []
    );
    const idx = focusable.indexOf(document.activeElement as HTMLElement);

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeDropdown(true);
        break;
      case "ArrowDown":
        e.preventDefault();
        // When idx is -1 (focus on container), ArrowDown → first item
        focusable[(idx + 1) % focusable.length]?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        // When idx is -1 (focus on container), guard to last item explicitly
        focusable[idx === -1 ? focusable.length - 1 : (idx - 1 + focusable.length) % focusable.length]?.focus();
        break;
      case "Tab":
        // Close and let tab move naturally
        closeDropdown(false);
        break;
    }
  }

  const activeGroupId = filter.startsWith("group:") ? filter.slice(6) : null;
  const activeGroup = myGroups.find((g) => g.id === activeGroupId);
  const visibleGroups = myGroups.slice(0, GROUP_TAB_LIMIT);
  const hasMore = myGroups.length > GROUP_TAB_LIMIT;

  function tabClass(active: boolean) {
    return `px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
      active
        ? "bg-accent text-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
    }`;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button type="button" onClick={() => onFilter("all")} className={tabClass(filter === "all")}>
        All
      </button>
      <button type="button" onClick={() => onFilter("friends")} className={tabClass(filter === "friends")}>
        Friends
      </button>

      {/* Groups dropdown */}
      {myGroups.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          {/* Native <button> fires onClick on Enter/Space, so keyboard open is implicit */}
          <button
            ref={toggleBtnRef}
            type="button"
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen((o) => !o)}
            className={tabClass(!!activeGroupId)}
          >
            <span className="flex items-center gap-1">
              {activeGroup ? activeGroup.name : "Groups"}
              <ChevronDown size={11} className="opacity-60" />
            </span>
          </button>

          {dropdownOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-label="Select a group"
              onKeyDown={handleMenuKeyDown}
              className="absolute left-0 top-full mt-1 z-20 min-w-[160px] rounded-lg border bg-popover shadow-md py-1"
            >
              {visibleGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => { onFilter(`group:${g.id}`); closeDropdown(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors truncate ${
                    activeGroupId === g.id
                      ? "bg-accent text-foreground font-medium"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  {g.name}
                </button>
              ))}
              {hasMore && (
                <Link
                  href="/groups"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => closeDropdown(false)}
                  className="block px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  More groups →
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed list — keyed by filter+sort so each tab/sort combo has its own query
// ─────────────────────────────────────────────────────────────────────────────

function FeedList({
  filter,
  sort,
  currentUserId,
}: {
  filter: string;
  sort: "new" | "hot";
  currentUserId: string;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } =
    api.feed.list.useInfiniteQuery(
      { limit: 20, filter, sort },
      // Hot sort never paginates — always returns top 50 with no cursor.
      { getNextPageParam: (lastPage) => sort === "new" ? lastPage.nextCursor : undefined }
    );

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];
  const isEmpty = !isLoading && allItems.length === 0;

  function refresh() { void refetch(); }

  return (
    <>
      {isLoading && <FeedSkeleton />}

      {isEmpty && (
        <EmptyState
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
          heading="Nothing here yet"
          description={
            filter === "friends"
              ? "Posts from your friends will appear here."
              : filter.startsWith("group:")
                ? "No posts in this group yet."
                : "Add friends or join a group to see what's happening."
          }
          action={
            filter === "all" ? (
              <Button asChild size="sm">
                <Link href="/people">Find people</Link>
              </Button>
            ) : undefined
          }
          secondaryAction={
            filter === "all" ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/groups">Browse groups</Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {allItems.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          onRefresh={refresh}
        />
      ))}

      {sort === "new" && hasNextPage && (
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page shell — reads/writes ?tab= URL param
// ─────────────────────────────────────────────────────────────────────────────

function FeedPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: me, isError: meError } = api.user.me.useQuery();
  const utils = api.useUtils();

  const [filter, setFilter] = useState<string>(() => searchParams.get("tab") ?? "all");
  const [sort, setSort] = useState<"new" | "hot">(() => {
    const s = searchParams.get("sort");
    return s === "hot" ? "hot" : "new";
  });

  // Sync filter/sort if URL changes after mount (back/forward navigation)
  useEffect(() => {
    const tab = searchParams.get("tab") ?? "all";
    setFilter(tab);
    const s = searchParams.get("sort");
    setSort(s === "hot" ? "hot" : "new");
  }, [searchParams]);

  function handleFilter(f: string) {
    setFilter(f);
    const params = new URLSearchParams(searchParams.toString());
    if (f === "all") {
      params.delete("tab");
    } else {
      params.set("tab", f);
    }
    const qs = params.toString();
    router.replace(qs ? `/feed?${qs}` : "/feed", { scroll: false });
  }

  function handleSort(s: "new" | "hot") {
    setSort(s);
    const params = new URLSearchParams(searchParams.toString());
    if (s === "new") {
      params.delete("sort");
    } else {
      params.set("sort", s);
    }
    const qs = params.toString();
    router.replace(qs ? `/feed?${qs}` : "/feed", { scroll: false });
  }

  function sortTabClass(active: boolean) {
    return `px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
      active
        ? "bg-accent text-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
    }`;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Invalidate all feed.list cache entries so the active tab refetches after a new post. */}
      <PostComposer onPosted={() => void utils.feed.list.invalidate()} />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <FeedTabs filter={filter} onFilter={handleFilter} />
        {/* Sort toggle — New (chronological) vs Hot (engagement-weighted) */}
        <div className="flex items-center gap-0.5 rounded-lg border bg-card px-1 py-1">
          <button type="button" onClick={() => handleSort("new")} className={sortTabClass(sort === "new")}>
            New
          </button>
          <button type="button" onClick={() => handleSort("hot")} className={sortTabClass(sort === "hot")}>
            Hot
          </button>
        </div>
      </div>

      {/* Key by filter+sort so each combination has its own query + cursor. */}
      {me && (
        <FeedList key={`${filter}:${sort}`} filter={filter} sort={sort} currentUserId={me.id} />
      )}
      {!me && !meError && <FeedSkeleton />}
      {meError && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Failed to load your feed. Please refresh the page.
        </p>
      )}
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense>
      <FeedPageInner />
    </Suspense>
  );
}

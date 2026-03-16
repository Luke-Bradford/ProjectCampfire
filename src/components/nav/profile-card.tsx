"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Camera, ChevronDown, LogOut, Settings } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/nav/theme-toggle";

type UserStatus = "online" | "busy" | "offline";

const STATUS_CONFIG: Record<UserStatus, { label: string; colour: string }> = {
  online:  { label: "Online",  colour: "bg-green-500" },
  busy:    { label: "Busy",    colour: "bg-amber-500" },
  offline: { label: "Offline", colour: "bg-muted-foreground" },
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ProfileCard({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  const router = useRouter();
  const utils = api.useUtils();

  const { data: me } = api.user.me.useQuery();
  const { data: stats } = api.user.profileStats.useQuery();
  const { data: notifData } = api.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const unreadCount = notifData?.count ?? 0;
  const setStatus = api.user.setStatus.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
    onError: () => void utils.user.me.invalidate(),
  });

  const displayName = me?.name ?? name;
  const displayImage = me?.image ?? image;
  const username = me?.username;
  // Safe cast: guard against unknown values (e.g. new enum values not yet
  // reflected in this component, or an unexpected API shape change).
  const rawStatus = me?.status;
  const status: UserStatus = rawStatus && rawStatus in STATUS_CONFIG
    ? (rawStatus as UserStatus)
    : "online";
  const statusConfig = STATUS_CONFIG[status];

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } catch {
      // sign-out failure is non-fatal; redirect regardless
    }
    router.push("/login");
    router.refresh();
  }

  const profileHref = username ? `/u/${username}` : "/profile";

  return (
    <div className="flex flex-col gap-3">
      {/* Bounded profile card */}
      <div className="rounded-xl border bg-card shadow-sm p-4 flex flex-col gap-4">
        {/* Avatar + name row */}
        <div className="flex items-center gap-3">
          <Link href={profileHref} className="relative group shrink-0">
            {me ? (
              <>
                <Avatar className="h-12 w-12">
                  <AvatarImage src={displayImage ?? undefined} />
                  <AvatarFallback className="text-base font-semibold">
                    {initials(displayName)}
                  </AvatarFallback>
                </Avatar>
                {/* Camera overlay on hover */}
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera size={14} className="text-white" />
                </div>
              </>
            ) : (
              <Skeleton className="h-12 w-12 rounded-full" />
            )}
          </Link>

          <div className="flex flex-col min-w-0 flex-1">
            {me ? (
              <>
                <Link
                  href={profileHref}
                  className="text-sm font-semibold leading-tight truncate hover:text-primary transition-colors"
                >
                  {displayName}
                </Link>
                {username && (
                  <span className="text-xs text-muted-foreground truncate">
                    @{username}
                  </span>
                )}
              </>
            ) : (
              <>
                <Skeleton className="h-3.5 w-24 mb-1.5" />
                <Skeleton className="h-3 w-16" />
              </>
            )}
          </div>
        </div>

        {/* Status dropdown */}
        {me ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full group"
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${statusConfig.colour}`}
                />
                <span className="font-medium">{statusConfig.label}</span>
                <ChevronDown
                  size={12}
                  className="ml-auto opacity-50 group-hover:opacity-100 transition-opacity"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              {(Object.entries(STATUS_CONFIG) as [UserStatus, { label: string; colour: string }][]).map(
                ([value, { label, colour }]) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => setStatus.mutate({ status: value })}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${colour}`} />
                    {label}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Skeleton className="h-4 w-20" />
        )}

        {/* Stat counts — navigation links */}
        <div className="flex flex-col gap-1">
          {stats ? (
            <>
              <StatRow href="/friends" label="Friends" count={stats.friendCount} />
              <StatRow href="/groups"  label="Groups"  count={stats.groupCount} />
              <StatRow href="/games"   label="Games"   count={stats.gameCount} />
            </>
          ) : (
            <>
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-full rounded-md" />
            </>
          )}
        </div>
      </div>

      {/* Below-card controls */}
      <div className="flex flex-col gap-0.5 px-1">
        <Link
          href="/notifications"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <span className="relative shrink-0">
            <Bell size={13} />
            {unreadCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </span>
          <span className="flex-1">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-destructive font-semibold tabular-nums">{unreadCount > 9 ? "9+" : unreadCount}</span>
          )}
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Settings size={13} />
          Settings
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full text-left"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>

      {/* Theme toggle */}
      <div className="px-1">
        <ThemeToggle />
      </div>
    </div>
  );
}

function StatRow({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors group"
    >
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-1 tabular-nums">
        {count}
        <span className="opacity-0 group-hover:opacity-60 transition-opacity text-[10px]">→</span>
      </span>
    </Link>
  );
}

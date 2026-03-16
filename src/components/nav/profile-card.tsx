"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Calendar,
  Camera,
  ChevronDown,
  Clock,
  LogOut,
  Newspaper,
  Settings,
  UserSearch,
} from "lucide-react";
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
  onNavigate,
}: {
  name: string;
  image?: string | null;
  /** Called when a nav link is clicked — used by the mobile drawer to close itself. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
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

  // An href is "active" if the current pathname starts with it.
  // Feed is exact-match only to avoid it lighting up on every page.
  function isActive(href: string) {
    if (href === "/feed") return pathname === "/feed";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Bounded profile card */}
      <div className="rounded-xl border bg-card shadow-sm p-4 flex flex-col gap-4">
        {/* Avatar + name row */}
        <div className="flex items-center gap-3">
          <Link href={profileHref} onClick={onNavigate} className="relative group shrink-0">
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
                  onClick={onNavigate}
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
        <div className="flex flex-col gap-1" onClick={onNavigate}>
          {stats ? (
            <>
              <StatRow href="/friends" label="Friends" count={stats.friendCount} active={isActive("/friends")} />
              <StatRow href="/groups"  label="Groups"  count={stats.groupCount}  active={isActive("/groups")} />
              <StatRow href="/games"   label="Games"   count={stats.gameCount}   active={isActive("/games")} />
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

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5 px-1" onClick={onNavigate}>
        <NavLink href="/feed"         icon={<Newspaper size={13} />}   label="Feed"         active={isActive("/feed")} />
        <NavLink href="/events"       icon={<Calendar size={13} />}    label="Events"       active={isActive("/events")} />
        <NavLink href="/availability" icon={<Clock size={13} />}       label="Availability" active={isActive("/availability")} />
        <NavLink href="/people"       icon={<UserSearch size={13} />}  label="Find people"  active={isActive("/people")} />
      </nav>

      {/* Divider */}
      <div className="px-1">
        <div className="border-t border-border/50" />
      </div>

      {/* Utility links */}
      <div className="flex flex-col gap-0.5 px-1" onClick={onNavigate}>
        <NavLink
          href="/notifications"
          icon={
            <span className="relative shrink-0">
              <Bell size={13} />
              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
          }
          label="Notifications"
          active={isActive("/notifications")}
          badge={unreadCount > 0 ? (unreadCount > 9 ? "9+" : String(unreadCount)) : undefined}
        />
        <NavLink href="/settings" icon={<Settings size={13} />} label="Settings" active={isActive("/settings")} />
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full text-left"
        >
          <LogOut size={13} className="shrink-0" />
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
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors group ${
        active
          ? "bg-accent text-foreground font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
    >
      <span className={active ? "font-semibold" : "font-medium"}>{label}</span>
      <span className="flex items-center gap-1 tabular-nums">
        {count}
        <span className={`transition-opacity text-[10px] ${active ? "opacity-60" : "opacity-0 group-hover:opacity-60"}`}>→</span>
      </span>
    </Link>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
        active
          ? "bg-accent text-foreground font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="text-destructive font-semibold tabular-nums">{badge}</span>
      )}
    </Link>
  );
}

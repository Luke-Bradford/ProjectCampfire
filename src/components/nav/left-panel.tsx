"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Home,
  Users,
  UserPlus,
  CalendarDays,
  Bell,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { CampfireLogo } from "@/components/nav/campfire-logo";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const NAV_LINKS = [
  { href: "/feed",          label: "Feed",          Icon: Home },
  { href: "/groups",        label: "Groups",         Icon: Users },
  { href: "/friends",       label: "Friends",        Icon: UserPlus },
  { href: "/events",        label: "Events",         Icon: CalendarDays },
  { href: "/notifications", label: "Notifications",  Icon: Bell },
];

export function LeftPanel({ name, image }: { name: string; image?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const { data: me } = api.user.me.useQuery();
  const { data: notifData } = api.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const unreadCount = notifData?.count ?? 0;

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } catch {
      // sign-out failure is non-fatal; redirect to login regardless
    }
    router.push("/login");
    router.refresh();
  }

  // Use richer profile data from `me` once loaded, fall back to session values
  const displayName = me?.name ?? name;
  const displayImage = me?.image ?? image;
  const username = me?.username;

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r bg-card sticky top-0 h-screen">
      {/* Wordmark */}
      <div className="flex items-center h-14 px-5 border-b shrink-0">
        <CampfireLogo />
      </div>

      {/* Identity block */}
      <div className="px-4 py-4 border-b shrink-0">
        {me ? (
          <Link
            href={username ? `/u/${username}` : "/settings"}
            className="flex items-center gap-3 group"
          >
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={displayImage ?? undefined} />
              <AvatarFallback className="text-sm">{initials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold leading-tight truncate group-hover:text-primary transition-colors">
                {displayName}
              </span>
              {username && (
                <span className="text-xs text-muted-foreground truncate">@{username}</span>
              )}
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        <div className="flex flex-col gap-0.5">
          {NAV_LINKS.map(({ href, label, Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            const isNotifications = href === "/notifications";
            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <span className="relative shrink-0">
                  <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                  {isNotifications && unreadCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
                <span className="truncate flex-1">{label}</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer: My Profile, Settings, Sign out */}
      <div className="border-t px-3 py-3 flex flex-col gap-0.5 shrink-0">
        <Link
          href={username ? `/u/${username}` : "/settings"}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <User size={16} />
          <span className="truncate">My Profile</span>
        </Link>
        <Link
          href="/settings"
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            pathname === "/settings" || pathname.startsWith("/settings/")
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Settings size={16} />
          <span className="truncate">Settings</span>
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-full text-left"
        >
          <LogOut size={16} />
          <span className="truncate">Sign out</span>
        </button>
      </div>
    </aside>
  );
}

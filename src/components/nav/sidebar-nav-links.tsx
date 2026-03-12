"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/trpc/react";
import {
  Home,
  Users,
  UserPlus,
  Gamepad2,
  Calendar,
  CalendarDays,
  Bell,
} from "lucide-react";

const LINKS = [
  { href: "/feed",         label: "Feed",        Icon: Home },
  { href: "/groups",       label: "Groups",      Icon: Users },
  { href: "/friends",      label: "Friends",     Icon: UserPlus },
  { href: "/games",        label: "Games",       Icon: Gamepad2 },
  { href: "/availability", label: "Availability",Icon: Calendar },
  { href: "/events",       label: "Events",      Icon: CalendarDays },
  { href: "/notifications",label: "Notifications",Icon: Bell },
  { href: "/people",       label: "Find people", Icon: UserPlus },
];

export function SidebarNavLinks() {
  const pathname = usePathname();
  const { data } = api.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const unreadCount = data?.count ?? 0;

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {LINKS.map(({ href, label, Icon }) => {
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
            <span className="truncate">{label}</span>
            {isActive && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

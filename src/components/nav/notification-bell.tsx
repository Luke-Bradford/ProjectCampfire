"use client";

import Link from "next/link";
import { api } from "@/trpc/react";

export function NotificationBell() {
  const { data } = api.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000, // poll every 30s
  });

  const count = data?.count ?? 0;

  return (
    <Link href="/notifications" className="relative flex items-center text-muted-foreground hover:text-foreground">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

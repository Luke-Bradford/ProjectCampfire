"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusDot } from "@/components/ui/status-dot";
import type { RouterOutputs } from "@/trpc/react";

type OnlineFriend = RouterOutputs["friends"]["onlineFriends"][number];

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function OnlineFriendsWidget({ friends }: { friends: OnlineFriend[] }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Users size={14} className="text-muted-foreground" />
        Online now
      </h2>

      {friends.length === 0 ? (
        <p className="text-xs text-muted-foreground">No friends online right now.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {friends.map((f) => (
            <li key={f.id}>
              <Link
                href={f.username ? `/u/${f.username}` : "#"}
                className="flex items-center gap-2.5 group"
              >
                <div className="relative shrink-0">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={f.image ?? undefined} />
                    <AvatarFallback className="text-[10px]">{initials(f.name)}</AvatarFallback>
                  </Avatar>
                  <StatusDot
                    status={f.status}
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-tight truncate group-hover:text-primary transition-colors">
                    {f.name}
                  </p>
                  {f.currentGameName ? (
                    <p className="text-[10px] text-primary/80 leading-tight truncate">
                      🎮 {f.currentGameName}
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {f.status === "busy" ? "Busy" : "Online"}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/friends"
        className="mt-3 block text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        View all friends →
      </Link>
    </div>
  );
}

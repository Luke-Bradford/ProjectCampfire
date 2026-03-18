import Link from "next/link";
import { Pencil, Users, Gamepad2, Shield } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusDot } from "@/components/ui/status-dot";

function initials(name: string) {
  const result = name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]!)
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return result || "?";
}

type ProfileHeaderProps = {
  name: string;
  username: string | null;
  image: string | null;
  bio: string | null;
  status: "online" | "busy" | "offline" | null;
  currentGameName: string | null;
  isOwnProfile: boolean;
  isPrivate: boolean;
  stats: { friendCount: number; groupCount: number; gameCount: number } | null;
};

export function ProfileHeader({
  name,
  username,
  image,
  bio,
  status,
  currentGameName,
  isOwnProfile,
  isPrivate,
  stats,
}: ProfileHeaderProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Banner gradient */}
      <div className="h-20 bg-gradient-to-br from-primary/20 via-primary/10 to-muted/30" />

      {/* Avatar + identity row */}
      <div className="px-5 pb-4">
        {/* Avatar overlaps banner */}
        <div className="flex items-end justify-between -mt-10 mb-3">
          <Avatar className="h-20 w-20 ring-4 ring-card">
            {image && <AvatarImage src={image} />}
            <AvatarFallback className="text-xl bg-primary/10 text-primary font-semibold">
              {initials(name)}
            </AvatarFallback>
          </Avatar>

          {isOwnProfile && (
            <Link
              href="/settings/profile"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border rounded-md px-2.5 py-1.5 bg-background hover:bg-muted"
            >
              <Pencil size={11} />
              Edit profile
            </Link>
          )}
        </div>

        {/* Name + username */}
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold leading-tight">{name}</h1>
          {username && (
            <p className="text-sm text-muted-foreground">@{username}</p>
          )}
        </div>

        {/* Status + now playing */}
        {!isPrivate && (
          <div className="mt-2 flex flex-col gap-1">
            <StatusDot status={status} showLabel />
            {currentGameName && (
              <p className="text-sm text-primary font-medium flex items-center gap-1.5">
                <Gamepad2 size={13} className="shrink-0" />
                {currentGameName}
              </p>
            )}
          </div>
        )}

        {isPrivate && (
          <p className="mt-2 text-sm text-muted-foreground flex items-center gap-1.5">
            <Shield size={13} className="shrink-0" />
            This profile is private.
          </p>
        )}

        {/* Bio */}
        {!isPrivate && bio && (
          <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {bio}
          </p>
        )}
        {!isPrivate && !bio && isOwnProfile && (
          <Link
            href="/settings/profile"
            className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <Pencil size={13} className="shrink-0" />
            <span className="group-hover:underline">Add a bio</span>
          </Link>
        )}

        {/* Stats bar */}
        {!isPrivate && stats && (
          <div className="mt-4 flex items-center gap-5 pt-4 border-t">
            <div className="flex items-center gap-1.5">
              <Users size={13} className="text-muted-foreground" />
              <span className="text-sm font-semibold tabular-nums">{stats.friendCount}</span>
              <span className="text-xs text-muted-foreground">friends</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield size={13} className="text-muted-foreground" />
              <span className="text-sm font-semibold tabular-nums">{stats.groupCount}</span>
              <span className="text-xs text-muted-foreground">groups</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Gamepad2 size={13} className="text-muted-foreground" />
              <span className="text-sm font-semibold tabular-nums">{stats.gameCount}</span>
              <span className="text-xs text-muted-foreground">games</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

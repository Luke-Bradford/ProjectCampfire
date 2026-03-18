import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { Gamepad2 } from "lucide-react";
import { trpc } from "@/trpc/server";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddFriendButton } from "./add-friend-button";
import { StatusDot } from "@/components/ui/status-dot";
import { ProfileGroups } from "./profile-groups";
import { ProfilePosts } from "./profile-posts";
import { GamingActivityCard } from "@/components/profile/gaming-activity-card";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  let profile;
  try {
    profile = await trpc.friends.getProfile({ username });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const isPrivate = profile.profileVisibility === "private";

  // Fetch game library, current user, gaming stats, and now-playing in parallel.
  // nowPlaying triggers the on-demand Steam refresh (Redis-cached, 60 s TTL).
  const [me, profileGames, gamingStats, nowPlaying] = await Promise.all([
    trpc.user.me().catch(() => null),
    isPrivate
      ? Promise.resolve({ items: [], total: 0 })
      : trpc.friends.getProfileGames({ userId: profile.id }).catch(() => ({ items: [], total: 0 })),
    isPrivate
      ? Promise.resolve(null)
      : trpc.games.publicGamingStats({ userId: profile.id }).catch(() => null),
    isPrivate
      ? Promise.resolve({ currentGameId: null, currentGameName: null })
      : trpc.user.nowPlaying({ userId: profile.id }).catch(() => ({ currentGameId: null, currentGameName: null })),
  ]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-5">
        <Avatar className="h-20 w-20">
          {profile.image && <AvatarImage src={profile.image} />}
          <AvatarFallback className="text-xl">{initials(profile.name)}</AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{profile.name}</h1>
          {profile.username && (
            <p className="text-muted-foreground">@{profile.username}</p>
          )}
          {!isPrivate && (
            <StatusDot status={"status" in profile ? profile.status : null} showLabel />
          )}
          {nowPlaying.currentGameName && (
            <p className="text-sm text-primary">🎮 {nowPlaying.currentGameName}</p>
          )}
          {isPrivate && (
            <p className="text-sm text-muted-foreground">This profile is private.</p>
          )}
        </div>
      </div>

      {!isPrivate && (
        <>
          {profile.bio && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{profile.bio}</p>
          )}

          {/* Game library */}
          {profileGames.total > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Gamepad2 size={14} className="text-muted-foreground" />
                  {profileGames.total} game{profileGames.total === 1 ? "" : "s"}
                </p>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {profileGames.items.map((g) => (
                  <div
                    key={g.id}
                    title={g.title}
                    className="aspect-[3/4] rounded-md overflow-hidden bg-muted border"
                  >
                    {g.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.coverUrl}
                        alt={g.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Gamepad2 size={16} className="text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {gamingStats && <GamingActivityCard stats={gamingStats} />}
          <ProfileGroups userId={profile.id} />
          {me && <ProfilePosts userId={profile.id} currentUserId={me.id} />}
          <AddFriendButton targetId={profile.id} />
        </>
      )}
    </div>
  );
}

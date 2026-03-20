import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { Gamepad2 } from "lucide-react";
import { trpc } from "@/trpc/server";
import { AddFriendButton } from "./add-friend-button";
import { ProfileGroups } from "./profile-groups";
import { ProfilePosts } from "./profile-posts";
import { GamingActivityCard } from "@/components/profile/gaming-activity-card";
import { ProfileHeader } from "@/components/profile/profile-header";
import { AvailabilitySummary } from "@/components/availability/availability-summary";

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

  // Fetch game library, current user, gaming stats, now-playing, profile stat counts, and availability in parallel.
  const [me, profileGames, gamingStats, nowPlaying, publicStats, availabilitySchedule] = await Promise.all([
    trpc.user.me().catch(() => null),
    isPrivate
      ? Promise.resolve({ items: [], total: 0 })
      : trpc.friends.getProfileGames({ userId: profile.id }).catch(() => ({ items: [], total: 0 })),
    isPrivate
      ? Promise.resolve(null)
      : trpc.games.publicGamingStats({ userId: profile.id }).catch(() => null),
    // Always fetch — nowPlaying enforces its own authz (friend/shared-group).
    trpc.user.nowPlaying({ userId: profile.id }).catch(() => ({ currentGameId: null, currentGameName: null })),
    isPrivate
      ? Promise.resolve(null)
      : trpc.friends.publicProfileStats({ userId: profile.id }).catch(() => null),
    // Fetch availability schedule — returns null if not friends or no schedule set.
    isPrivate
      ? Promise.resolve(null)
      : trpc.availability.getUserSchedule({ userId: profile.id }).catch(() => null),
  ]);

  const isOwnProfile = me?.id === profile.id;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <ProfileHeader
        name={profile.name}
        username={profile.username ?? null}
        image={profile.image ?? null}
        bio={"bio" in profile ? (profile.bio ?? null) : null}
        status={"status" in profile ? (profile.status ?? null) : null}
        currentGameName={nowPlaying.currentGameName}
        isOwnProfile={isOwnProfile}
        isPrivate={isPrivate}
        stats={publicStats}
      />

      {!isPrivate && (
        <>
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

          <GamingActivityCard
            stats={gamingStats ?? { steamLinked: false, libraryPublic: false, totalMinutes: 0, last2WeeksMinutes: 0, mostPlayed: [], recentlyPlayed: [] }}
            campfireGameCount={publicStats?.gameCount}
            isOwn={isOwnProfile}
          />

          {/* Availability — shown when viewer is a friend (or own profile) */}
          {availabilitySchedule !== null ? (
            <AvailabilitySummary slots={availabilitySchedule.slots} isOwn={isOwnProfile} />
          ) : isOwnProfile ? (
            <AvailabilitySummary slots={{}} isOwn />
          ) : (
            <div className="rounded-xl border bg-card shadow-sm p-4 text-sm text-muted-foreground text-center">
              No availability shared
            </div>
          )}

          <ProfileGroups userId={profile.id} />
          {me && <ProfilePosts userId={profile.id} currentUserId={me.id} isOwnProfile={isOwnProfile} />}
          <AddFriendButton targetId={profile.id} />
        </>
      )}
    </div>
  );
}

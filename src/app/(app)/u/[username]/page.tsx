import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { trpc } from "@/trpc/server";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddFriendButton } from "./add-friend-button";

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
          <AddFriendButton targetId={profile.id} />
        </>
      )}
    </div>
  );
}

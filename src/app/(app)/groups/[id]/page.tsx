"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function InviteSection({ groupId }: { groupId: string }) {
  const [copied, setCopied] = useState(false);
  const { data } = api.groups.getInviteToken.useQuery({ id: groupId });

  const inviteUrl = data?.inviteToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${data.inviteToken}`
    : "";

  function handleCopy() {
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Invite link</p>
      <div className="flex gap-2">
        <Input readOnly value={inviteUrl} className="text-xs" />
        <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function GroupSettings({ groupId }: { groupId: string }) {
  const { data: group, refetch } = api.groups.get.useQuery({ id: groupId });
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [discordUrl, setDiscordUrl] = useState<string | null>(null);

  const update = api.groups.update.useMutation({
    onSuccess: () => {
      setName(null);
      setDescription(null);
      setDiscordUrl(null);
      void refetch();
    },
  });

  if (!group) return null;

  const currentName = name ?? group.name;
  const currentDescription = description ?? (group.description ?? "");
  const currentDiscordUrl = discordUrl ?? (group.discordInviteUrl ?? "");

  const isDirty =
    currentName !== group.name ||
    currentDescription !== (group.description ?? "") ||
    currentDiscordUrl !== (group.discordInviteUrl ?? "");

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="font-semibold">Group settings</h2>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <Input
            value={currentName}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <Input
            value={currentDescription}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="Optional"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Discord invite URL</label>
          <Input
            value={currentDiscordUrl}
            onChange={(e) => setDiscordUrl(e.target.value)}
            placeholder="https://discord.gg/..."
            type="url"
          />
        </div>
      </div>
      {isDirty && (
        <Button
          size="sm"
          disabled={update.isPending || !currentName.trim()}
          onClick={() =>
            update.mutate({
              id: groupId,
              name: currentName.trim(),
              description: currentDescription,
              discordInviteUrl: currentDiscordUrl,
            })
          }
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      )}
    </section>
  );
}

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: group, isLoading } = api.groups.get.useQuery({ id });

  const leave = api.groups.leave.useMutation({
    onSuccess: () => router.push("/groups"),
    onError: (err) => alert(err.message),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!group) return <p className="text-muted-foreground">Group not found.</p>;

  const isAdmin = group.myRole === "owner" || group.myRole === "admin";

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{group.name}</h1>
          {group.description && (
            <p className="mt-1 text-muted-foreground">{group.description}</p>
          )}
          {group.discordInviteUrl && (
            <a
              href={group.discordInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-indigo-500 hover:underline"
            >
              Join Discord
            </a>
          )}
        </div>
        {group.myRole !== "owner" && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => leave.mutate({ id })}
            disabled={leave.isPending}
          >
            Leave group
          </Button>
        )}
      </div>

      <InviteSection groupId={id} />

      {isAdmin && <GroupSettings groupId={id} />}

      <section className="space-y-3">
        <h2 className="font-semibold">
          Members ({group.memberships.length})
        </h2>
        <ul className="space-y-2">
          {group.memberships.map((m) => (
            <li key={m.userId} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={m.user.image ?? undefined} />
                  <AvatarFallback>{initials(m.user.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{m.user.name}</p>
                  {m.user.username && (
                    <p className="text-xs text-muted-foreground">@{m.user.username}</p>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

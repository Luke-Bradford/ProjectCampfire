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

type GroupData = {
  id: string;
  name: string;
  description: string | null;
  discordInviteUrl: string | null;
};

function GroupSettings({ group, onSaved }: { group: GroupData; onSaved: () => void }) {
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [discordUrl, setDiscordUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = api.groups.update.useMutation({
    onSuccess: () => {
      setName(null);
      setDescription(null);
      setDiscordUrl(null);
      setError(null);
      onSaved();
    },
    onError: (err) => setError(err.message),
  });

  const currentName = name ?? group.name;
  const currentDescription = description ?? (group.description ?? "");
  const currentDiscordUrl = discordUrl ?? (group.discordInviteUrl ?? "");

  // Only send fields that actually changed to prevent overwriting concurrent edits
  const dirtyFields: Partial<{ name: string; description: string; discordInviteUrl: string }> = {};
  if (currentName !== group.name) dirtyFields.name = currentName.trim();
  if (currentDescription !== (group.description ?? "")) dirtyFields.description = currentDescription;
  if (currentDiscordUrl !== (group.discordInviteUrl ?? "")) dirtyFields.discordInviteUrl = currentDiscordUrl;

  const isDirty = Object.keys(dirtyFields).length > 0;

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="font-semibold">Group settings</h2>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <Input
            value={currentName}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => setName(e.target.value.trim())}
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
          <p className="text-xs text-muted-foreground">Must be a discord.gg or discord.com/invite link</p>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {isDirty && (
        <Button
          size="sm"
          disabled={update.isPending || !currentName.trim()}
          onClick={() => update.mutate({ id: group.id, ...dirtyFields })}
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
  const { data: group, isLoading, refetch } = api.groups.get.useQuery({ id });

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

      {isAdmin && (
        <GroupSettings
          group={{ id: group.id, name: group.name, description: group.description, discordInviteUrl: group.discordInviteUrl }}
          onSaved={() => void refetch()}
        />
      )}

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

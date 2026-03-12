"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NotificationPrefs } from "@/server/db/schema";

// ── Connected accounts section ───────────────────────────────────────────────

function ConnectedAccountsSection() {
  const utils = api.useUtils();
  const { data: me } = api.user.me.useQuery();
  const unlink = api.user.steamUnlink.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });
  const syncLibrary = api.user.steamSyncLibrary.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });
  const setLibraryPublic = api.user.steamSetLibraryPublic.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });

  // Surface steam_linked / steam_error query params set by the callback route
  const [flash, setFlash] = useState<{ type: "success" | "error"; message: string } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("steam_linked") === "1") {
      setFlash({ type: "success", message: "Steam account linked!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (sp.get("steam_error")) {
      // Error codes are a fixed set from the server — map to human messages
      // rather than rendering the raw param to avoid attacker-crafted strings.
      const STEAM_ERROR_MESSAGES: Record<string, string> = {
        invalid_return_to: "Steam link failed: invalid return URL",
        verification_request_failed: "Steam verification failed — please try again",
        verification_failed: "Steam verification failed — please try again",
        invalid_steam_id: "Could not extract Steam ID",
        already_linked: "This Steam account is already linked to another user",
      };
      const code = sp.get("steam_error")!;
      const message = STEAM_ERROR_MESSAGES[code] ?? "Steam link failed — please try again";
      setFlash({ type: "error", message });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold border-b pb-2">Connected accounts</h2>

      {flash && (
        <p className={`text-sm ${flash.type === "success" ? "text-green-600" : "text-destructive"}`}>
          {flash.message}
        </p>
      )}

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current shrink-0" aria-hidden="true">
            <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.718L.22 15.996C1.555 20.781 6.318 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.497 1.009 2.455-.397.957-1.497 1.41-2.455 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.662 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z" />
          </svg>
          <div>
            <p className="text-sm font-medium">Steam</p>
            {me?.steamId ? (
              <p className="text-xs text-muted-foreground">
                ID: {me.steamId}
                {me.steamProfileUrl && (
                  <>
                    {" · "}
                    <a
                      href={me.steamProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      View profile
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Not connected</p>
            )}
          </div>
        </div>

        {me?.steamId ? (
          <Button
            variant="outline"
            size="sm"
            disabled={unlink.isPending}
            onClick={() => {
              if (window.confirm("Disconnect your Steam account?")) {
                unlink.mutate();
              }
            }}
          >
            {unlink.isPending ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <a href="/api/steam/connect">Connect Steam</a>
          </Button>
        )}
      </div>

      {/* Steam library sync — only shown when Steam is linked */}
      {me?.steamId && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Steam library</p>
              <p className="text-xs text-muted-foreground">
                {me.steamLibrarySyncedAt
                  ? `Last synced ${new Date(me.steamLibrarySyncedAt).toLocaleDateString()}`
                  : "Never synced"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={syncLibrary.isPending}
              onClick={() => syncLibrary.mutate()}
            >
              {syncLibrary.isPending ? "Syncing…" : "Sync now"}
            </Button>
          </div>
          {syncLibrary.isSuccess && (
            <p className="text-xs text-green-600">Sync queued — your library will update shortly.</p>
          )}
          {syncLibrary.isError && (
            <p className="text-xs text-destructive">{syncLibrary.error.message}</p>
          )}
          <div className="flex items-center justify-between pt-1 border-t">
            <div>
              <p className="text-sm">Visible to group members</p>
              <p className="text-xs text-muted-foreground">
                When on, group members can see which games you own for poll suggestions.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={me.steamLibraryPublic}
              disabled={setLibraryPublic.isPending}
              onClick={() => setLibraryPublic.mutate({ public: !me.steamLibraryPublic })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50 ${
                me.steamLibraryPublic ? "bg-primary" : "bg-input"
              }`}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform ${
                  me.steamLibraryPublic ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Blocked users section ─────────────────────────────────────────────────────

function BlockedUsersSection() {
  const { data: blocked, refetch } = api.friends.listBlocked.useQuery();
  const unblock = api.friends.unblock.useMutation({ onSuccess: () => void refetch() });

  if (!blocked?.length) {
    return (
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">Blocked users</h2>
        <p className="text-sm text-muted-foreground">You haven&apos;t blocked anyone.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold border-b pb-2">Blocked users</h2>
      <ul className="space-y-2">
        {blocked.map((u) => (
          <li key={u.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarImage src={u.image ?? undefined} />
                <AvatarFallback>{initials(u.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{u.name}</p>
                {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={unblock.isPending}
              onClick={() => unblock.mutate({ targetId: u.id })}
            >
              Unblock
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-input"
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const PREF_DEFAULTS: Required<NotificationPrefs> = {
  friendRequestReceived: true,
  friendRequestAccepted: true,
  groupInviteReceived: true,
  emailFriendRequest: false,
  emailEventConfirmed: true,
  emailEventCancelled: true,
  emailEventRsvpReminder: true,
  emailPollOpened: true,
  emailPollClosed: false,
  emailGroupInvite: true,
};

function mergePrefs(saved: NotificationPrefs | undefined): Required<NotificationPrefs> {
  return { ...PREF_DEFAULTS, ...(saved ?? {}) };
}

// ── Invite section ────────────────────────────────────────────────────────────

function InviteSection() {
  const { data, refetch } = api.user.getInviteToken.useQuery();
  const regenerate = api.user.regenerateInviteToken.useMutation({
    onSuccess: () => void refetch(),
  });
  const [copied, setCopied] = useState(false);

  const inviteUrl = typeof window !== "undefined" && data?.token
    ? `${window.location.origin}/invite/${data.token}`
    : "";

  function handleCopy() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold border-b pb-2">Invite a friend</h2>
      <p className="text-sm text-muted-foreground">
        Share your personal invite link. Anyone who visits it can send you a friend request.
        Regenerating the link invalidates the old one.
      </p>
      {data?.token ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input readOnly value={inviteUrl} className="font-mono text-xs" />
            <Button variant="outline" onClick={handleCopy} className="shrink-0">
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            disabled={regenerate.isPending}
            onClick={() => {
              if (window.confirm("Regenerate your invite link? The old link will stop working.")) {
                regenerate.mutate();
              }
            }}
          >
            {regenerate.isPending ? "Regenerating…" : "Regenerate link"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Generating link…</p>
      )}
    </section>
  );
}

// ── Danger zone ───────────────────────────────────────────────────────────────

function DangerZoneSection() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  const deleteAccount = api.user.deleteAccount.useMutation({
    onSuccess: () => {
      // Wipe the React Query cache synchronously before redirecting.
      // Using clear() (not invalidate()) avoids firing refetches against
      // the now-revoked session which would produce 401 errors.
      queryClient.clear();
      router.replace("/login");
    },
    onError: (e) => setError(e.message),
  });

  function handleDelete() {
    // Runtime guard: reject if confirmation isn't exactly "DELETE".
    // The button is already disabled client-side, but this defends against
    // programmatic calls and removes the need for an unsafe type cast.
    if (confirmation !== "DELETE") return;
    setError("");
    deleteAccount.mutate({ confirmation });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold border-b border-destructive/40 pb-2 text-destructive">
        Danger zone
      </h2>
      <p className="text-sm text-muted-foreground">
        Deleting your account is permanent. Your profile, posts, and group memberships will be
        removed. This cannot be undone.
      </p>
      <div className="space-y-2">
        <Label htmlFor="delete-confirm">
          Type <span className="font-mono font-bold">DELETE</span> to confirm
        </Label>
        <div className="flex gap-2">
          <Input
            id="delete-confirm"
            value={confirmation}
            onChange={(e) => { setConfirmation(e.target.value); setError(""); }}
            placeholder="DELETE"
            className="max-w-48"
          />
          <Button
            variant="destructive"
            disabled={confirmation !== "DELETE" || deleteAccount.isPending}
            onClick={handleDelete}
          >
            {deleteAccount.isPending ? "Deleting…" : "Delete account"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </section>
  );
}

// ── Settings page ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: me } = api.user.me.useQuery();

  // ── Profile ──────────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [username, setUsername] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [usernameSaved, setUsernameSaved] = useState(false);

  const updateProfile = api.user.updateProfile.useMutation({
    onSuccess: () => { setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2500); },
  });

  const setUsernameMutation = api.user.setUsername.useMutation({
    onSuccess: () => { setUsernameSaved(true); setTimeout(() => setUsernameSaved(false), 2500); },
    onError: (e) => setUsernameError(e.message),
  });

  useEffect(() => {
    if (me) {
      setDisplayName(me.name ?? "");
      setBio(me.bio ?? "");
      setUsername(me.username ?? "");
    }
  }, [me]);

  // ── Notification prefs ────────────────────────────────────────────────────
  const [prefs, setPrefs] = useState<Required<NotificationPrefs>>(PREF_DEFAULTS);
  const [prefsSaved, setPrefsSaved] = useState(false);

  useEffect(() => {
    if (me) setPrefs(mergePrefs(me.notificationPrefs as NotificationPrefs | undefined));
  }, [me]);

  const updatePrefs = api.user.updateNotificationPrefs.useMutation({
    onSuccess: () => { setPrefsSaved(true); setTimeout(() => setPrefsSaved(false), 2500); },
  });

  function setPref(key: keyof NotificationPrefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    updatePrefs.mutate({ [key]: value });
  }

  return (
    <div className="space-y-8 max-w-xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* ── Profile ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold">Profile</h2>
          {profileSaved && <span className="text-xs text-green-600">Saved</span>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short bio…"
            maxLength={300}
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground text-right">{bio.length}/300</p>
        </div>

        <Button
          onClick={() => updateProfile.mutate({ name: displayName.trim(), bio: bio.trim() || undefined })}
          disabled={!displayName.trim() || updateProfile.isPending}
        >
          {updateProfile.isPending ? "Saving…" : "Save profile"}
        </Button>

        <div className="space-y-2 pt-2 border-t">
          <Label htmlFor="username">Username</Label>
          <div className="flex gap-2">
            <Input
              id="username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setUsernameError(""); setUsernameSaved(false); }}
              placeholder="your_handle"
            />
            <Button
              onClick={() => { setUsernameError(""); setUsernameMutation.mutate({ username }); }}
              disabled={!username.trim() || setUsernameMutation.isPending}
            >
              {setUsernameMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
          {usernameSaved && <p className="text-xs text-green-600">Username saved!</p>}
          <p className="text-xs text-muted-foreground">3–20 chars, lowercase letters, numbers and underscores only.</p>
        </div>

        <div className="space-y-1 pt-2 border-t">
          <Label>Email</Label>
          <p className="text-sm text-muted-foreground">{me?.email ?? "—"}</p>
        </div>
      </section>

      {/* ── Invite a friend ──────────────────────────────────────────────────── */}
      <InviteSection />

      {/* ── Notifications ────────────────────────────────────────────────────── */}
      <section className="space-y-1">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-base font-semibold">Notifications</h2>
          {prefsSaved && <span className="text-xs text-green-600">Saved</span>}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-3 pb-1">
            In-app alerts
          </p>
          <div className="divide-y">
            <ToggleRow
              label="Friend request received"
              checked={prefs.friendRequestReceived}
              onChange={(v) => setPref("friendRequestReceived", v)}
              disabled={updatePrefs.isPending}
            />
            <ToggleRow
              label="Friend request accepted"
              checked={prefs.friendRequestAccepted}
              onChange={(v) => setPref("friendRequestAccepted", v)}
              disabled={updatePrefs.isPending}
            />
            <ToggleRow
              label="Group invite received"
              checked={prefs.groupInviteReceived}
              onChange={(v) => setPref("groupInviteReceived", v)}
              disabled={updatePrefs.isPending}
            />
          </div>

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-1">
            Email — Events
          </p>
          <div className="divide-y">
            <ToggleRow
              label="Event confirmed"
              description="When an event you RSVP'd to is confirmed with a time."
              checked={prefs.emailEventConfirmed}
              onChange={(v) => setPref("emailEventConfirmed", v)}
              disabled={updatePrefs.isPending}
            />
            <ToggleRow
              label="Event cancelled"
              description="When an event you RSVP'd to is cancelled."
              checked={prefs.emailEventCancelled}
              onChange={(v) => setPref("emailEventCancelled", v)}
              disabled={updatePrefs.isPending}
            />
            <ToggleRow
              label="RSVP reminder"
              description="A reminder before an event if you haven't RSVP'd yet."
              checked={prefs.emailEventRsvpReminder}
              onChange={(v) => setPref("emailEventRsvpReminder", v)}
              disabled={updatePrefs.isPending}
            />
          </div>

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-1">
            Email — Polls
          </p>
          <div className="divide-y">
            <ToggleRow
              label="Poll opened"
              description="When a new poll is opened in a group you're in."
              checked={prefs.emailPollOpened}
              onChange={(v) => setPref("emailPollOpened", v)}
              disabled={updatePrefs.isPending}
            />
            <ToggleRow
              label="Poll closed"
              description="When a poll you voted on is closed."
              checked={prefs.emailPollClosed}
              onChange={(v) => setPref("emailPollClosed", v)}
              disabled={updatePrefs.isPending}
            />
          </div>

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-1">
            Email — Social
          </p>
          <div className="divide-y">
            <ToggleRow
              label="Group invite"
              description="When someone invites you to a group."
              checked={prefs.emailGroupInvite}
              onChange={(v) => setPref("emailGroupInvite", v)}
              disabled={updatePrefs.isPending}
            />
            <ToggleRow
              label="Friend request"
              description="When someone sends you a friend request."
              checked={prefs.emailFriendRequest}
              onChange={(v) => setPref("emailFriendRequest", v)}
              disabled={updatePrefs.isPending}
            />
          </div>
        </div>
      </section>

      {/* ── Connected accounts ────────────────────────────────────────────────── */}
      <ConnectedAccountsSection />

      {/* ── Blocked users ─────────────────────────────────────────────────────── */}
      <BlockedUsersSection />

      {/* ── Danger zone ───────────────────────────────────────────────────────── */}
      <DangerZoneSection />
    </div>
  );
}

"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import type { NotificationPrefs } from "@/server/db/schema";
import { ThemeToggle } from "@/components/nav/theme-toggle";
import {
  Bell,
  Link2,
  Palette,
  Shield,
  Gamepad2,
  User,
  Trash2,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SectionId =
  | "appearance"
  | "profile"
  | "invite"
  | "notifications"
  | "connected"
  | "privacy"
  | "danger";

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: "appearance",    label: "Appearance",         icon: <Palette size={14} /> },
  { id: "profile",       label: "Profile",             icon: <User size={14} /> },
  { id: "invite",        label: "Invite a friend",     icon: <Link2 size={14} /> },
  { id: "notifications", label: "Notifications",       icon: <Bell size={14} /> },
  { id: "connected",     label: "Connected accounts",  icon: <Gamepad2 size={14} /> },
  { id: "privacy",       label: "Privacy & Safety",    icon: <Shield size={14} /> },
  { id: "danger",        label: "Danger zone",         icon: <Trash2 size={14} /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// Toggle row
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Section: Appearance
// ─────────────────────────────────────────────────────────────────────────────

function AppearanceSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Choose how Campfire looks for you.</p>
      </div>
      <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Theme</p>
          <p className="text-xs text-muted-foreground mt-0.5">System follows your OS preference.</p>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Profile
// ─────────────────────────────────────────────────────────────────────────────

function ProfileSection() {
  const { data: me } = api.user.me.useQuery();
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

  const isDirty = me ? (displayName !== (me.name ?? "") || bio !== (me.bio ?? "")) : false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Your public identity on Campfire.</p>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-5">
        {/* Avatar preview */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarFallback className="text-lg font-semibold">
              {displayName.split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{displayName || <span className="text-muted-foreground italic">No name set</span>}</p>
            {me?.username && <p className="text-xs text-muted-foreground">@{me.username}</p>}
          </div>
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

        <div className="flex items-center gap-3 pt-1">
          <Button
            onClick={() => updateProfile.mutate({ name: displayName.trim(), bio: bio.trim() || undefined })}
            disabled={!displayName.trim() || !isDirty || updateProfile.isPending}
          >
            {updateProfile.isPending ? "Saving…" : "Save changes"}
          </Button>
          {profileSaved && <span className="text-xs text-green-600">Saved</span>}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Username</h3>
          <p className="text-xs text-muted-foreground mt-0.5">3–20 chars, lowercase letters, numbers and underscores only.</p>
        </div>
        <div className="flex gap-2">
          <Input
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
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-1">
        <h3 className="text-sm font-semibold">Email</h3>
        <p className="text-sm text-muted-foreground">{me?.email ?? "—"}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Invite
// ─────────────────────────────────────────────────────────────────────────────

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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Invite a friend</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Share your personal invite link. Anyone who visits it can send you a friend request.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Regenerating the link invalidates the old one.
        </p>
        {data?.token ? (
          <>
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
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Generating link…</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Push notification opt-in
// ─────────────────────────────────────────────────────────────────────────────

function PushOptIn() {
  const utils = api.useUtils();
  const { data: vapidData } = api.notifications.vapidPublicKey.useQuery();
  const { data: subData } = api.notifications.hasPushSubscription.useQuery();
  const subscribe = api.notifications.subscribePush.useMutation({
    onSuccess: () => void utils.notifications.hasPushSubscription.invalidate(),
  });
  const unsubscribe = api.notifications.unsubscribePush.useMutation({
    onSuccess: () => void utils.notifications.hasPushSubscription.invalidate(),
  });

  const [status, setStatus] = useState<"idle" | "requesting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  // swSupported is resolved after mount to avoid SSR/hydration mismatch
  const [swSupported, setSwSupported] = useState(false);
  useEffect(() => {
    setSwSupported("serviceWorker" in navigator);
  }, []);

  const vapidKey = vapidData?.key ?? null;
  const isSubscribed = subData?.subscribed ?? false;

  // Push not available: VAPID not configured or browser lacks service worker support
  if (!vapidKey || !swSupported) return null;

  async function handleEnable() {
    if (!vapidKey) return;
    setStatus("requesting");
    setErrorMsg("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("idle");
        setErrorMsg("Permission denied. Allow notifications in your browser settings.");
        return;
      }
      // Convert base64 VAPID key to Uint8Array
      const key = vapidKey.replace(/-/g, "+").replace(/_/g, "/");
      const raw = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: raw,
      });
      const json = pushSub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Browser returned an incomplete push subscription. Try again.");
      }
      await subscribe.mutateAsync({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to enable push notifications.");
    }
  }

  async function handleDisable() {
    setStatus("requesting");
    setErrorMsg("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (reg) {
        const pushSub = await reg.pushManager.getSubscription();
        if (pushSub) {
          await unsubscribe.mutateAsync({ endpoint: pushSub.endpoint });
          await pushSub.unsubscribe();
        }
      }
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to disable push notifications.");
    }
  }

  const busy = status === "requesting" || subscribe.isPending || unsubscribe.isPending;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Browser push notifications</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get notified even when Campfire isn&apos;t open.
          </p>
        </div>
        {isSubscribed ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleDisable()}>
            {busy ? "Working…" : "Disable"}
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void handleEnable()}>
            {busy ? "Working…" : "Enable"}
          </Button>
        )}
      </div>
      {isSubscribed && (
        <p className="text-xs text-green-600">Push notifications are enabled on this device.</p>
      )}
      {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Notifications
// ─────────────────────────────────────────────────────────────────────────────

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
  emailFeedDigest: "off",
};

function mergePrefs(saved: NotificationPrefs | undefined): Required<NotificationPrefs> {
  return { ...PREF_DEFAULTS, ...(saved ?? {}) };
}

function NotifSubHeading({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2 pb-1">
      {label}
    </p>
  );
}

function NotificationsSection() {
  const { data: me } = api.user.me.useQuery();
  const [prefs, setPrefs] = useState<Required<NotificationPrefs>>(PREF_DEFAULTS);
  const [prefsSaved, setPrefsSaved] = useState(false);

  useEffect(() => {
    if (me) setPrefs(mergePrefs(me.notificationPrefs as NotificationPrefs | undefined));
  }, [me]);

  const updatePrefs = api.user.updateNotificationPrefs.useMutation({
    onSuccess: () => { setPrefsSaved(true); setTimeout(() => setPrefsSaved(false), 2500); },
  });

  function setPref(key: keyof NotificationPrefs, value: boolean | "daily" | "weekly" | "off") {
    setPrefs((p) => ({ ...p, [key]: value }));
    updatePrefs.mutate({ [key]: value });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Control what alerts you receive.</p>
        </div>
        {prefsSaved && <span className="text-xs text-green-600">Saved</span>}
      </div>

      <PushOptIn />

      <div className="rounded-xl border bg-card p-5 space-y-1">
        <NotifSubHeading label="In-app alerts" />
        <div className="divide-y">
          <ToggleRow label="Friend request received" checked={prefs.friendRequestReceived} onChange={(v) => setPref("friendRequestReceived", v)} disabled={updatePrefs.isPending} />
          <ToggleRow label="Friend request accepted" checked={prefs.friendRequestAccepted} onChange={(v) => setPref("friendRequestAccepted", v)} disabled={updatePrefs.isPending} />
          <ToggleRow label="Group invite received"   checked={prefs.groupInviteReceived}   onChange={(v) => setPref("groupInviteReceived", v)}   disabled={updatePrefs.isPending} />
        </div>

        <NotifSubHeading label="Email — Events" />
        <div className="divide-y">
          <ToggleRow label="Event confirmed"  description="When an event you RSVP'd to is confirmed with a time." checked={prefs.emailEventConfirmed}     onChange={(v) => setPref("emailEventConfirmed", v)}     disabled={updatePrefs.isPending} />
          <ToggleRow label="Event cancelled"  description="When an event you RSVP'd to is cancelled."            checked={prefs.emailEventCancelled}     onChange={(v) => setPref("emailEventCancelled", v)}     disabled={updatePrefs.isPending} />
          <ToggleRow label="RSVP reminder"    description="A reminder before an event if you haven't RSVP'd yet." checked={prefs.emailEventRsvpReminder} onChange={(v) => setPref("emailEventRsvpReminder", v)} disabled={updatePrefs.isPending} />
        </div>

        <NotifSubHeading label="Email — Polls" />
        <div className="divide-y">
          <ToggleRow label="Poll opened" description="When a new poll is opened in a group you're in." checked={prefs.emailPollOpened} onChange={(v) => setPref("emailPollOpened", v)} disabled={updatePrefs.isPending} />
          <ToggleRow label="Poll closed" description="When a poll you voted on is closed."             checked={prefs.emailPollClosed} onChange={(v) => setPref("emailPollClosed", v)} disabled={updatePrefs.isPending} />
        </div>

        <NotifSubHeading label="Email — Social" />
        <div className="divide-y">
          <ToggleRow label="Group invite"   description="When someone invites you to a group."           checked={prefs.emailGroupInvite}  onChange={(v) => setPref("emailGroupInvite", v)}  disabled={updatePrefs.isPending} />
          <ToggleRow label="Friend request" description="When someone sends you a friend request."       checked={prefs.emailFriendRequest} onChange={(v) => setPref("emailFriendRequest", v)} disabled={updatePrefs.isPending} />
        </div>

        <NotifSubHeading label="Email — Feed digest" />
        <div className="py-3">
          <p className="text-sm font-medium mb-1">Digest frequency</p>
          <p className="text-xs text-muted-foreground mb-3">A summary of posts from your friends and groups.</p>
          <div className="flex gap-2">
            {(["off", "daily", "weekly"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={updatePrefs.isPending}
                onClick={() => setPref("emailFeedDigest", opt)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  prefs.emailFeedDigest === opt
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground border-border hover:bg-accent"
                }`}
              >
                {opt === "off" ? "Off" : opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Connected accounts
// ─────────────────────────────────────────────────────────────────────────────

function ConnectedSection() {
  const utils = api.useUtils();
  const { data: me } = api.user.me.useQuery();
  const unlink = api.user.steamUnlink.useMutation({ onSuccess: () => void utils.user.me.invalidate() });
  const syncLibrary = api.user.steamSyncLibrary.useMutation({ onSuccess: () => void utils.user.me.invalidate() });
  const setLibraryPublic = api.user.steamSetLibraryPublic.useMutation({ onSuccess: () => void utils.user.me.invalidate() });

  const [flash, setFlash] = useState<{ type: "success" | "error"; message: string } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("steam_linked") === "1") {
      setFlash({ type: "success", message: "Steam account linked!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (sp.get("steam_error")) {
      const MSGS: Record<string, string> = {
        invalid_return_to: "Steam link failed: invalid return URL",
        verification_request_failed: "Steam verification failed — please try again",
        verification_failed: "Steam verification failed — please try again",
        invalid_steam_id: "Could not extract Steam ID",
        already_linked: "This Steam account is already linked to another user",
      };
      const code = sp.get("steam_error")!;
      setFlash({ type: "error", message: MSGS[code] ?? "Steam link failed — please try again" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Connected accounts</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Link external accounts to enrich your profile.</p>
      </div>

      {flash && (
        <p className={`text-sm rounded-lg px-3 py-2 border ${flash.type === "success" ? "text-green-600 border-green-500/30 bg-green-500/10" : "text-destructive border-destructive/30 bg-destructive/10"}`}>
          {flash.message}
        </p>
      )}

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
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
                    <> · <a href={me.steamProfileUrl} target="_blank" rel="noopener noreferrer" className="underline">View profile</a></>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Not connected</p>
              )}
            </div>
          </div>
          {me?.steamId ? (
            <Button variant="outline" size="sm" disabled={unlink.isPending}
              onClick={() => { if (window.confirm("Disconnect your Steam account?")) unlink.mutate(); }}>
              {unlink.isPending ? "Disconnecting…" : "Disconnect"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <a href="/api/steam/connect">Connect Steam</a>
            </Button>
          )}
        </div>

        {me?.steamId && (
          <div className="pt-3 border-t space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Steam library</p>
                <p className="text-xs text-muted-foreground">
                  {me.steamLibrarySyncedAt
                    ? `Last synced ${new Date(me.steamLibrarySyncedAt).toLocaleDateString()}`
                    : "Never synced"}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={syncLibrary.isPending} onClick={() => syncLibrary.mutate()}>
                {syncLibrary.isPending ? "Syncing…" : "Sync now"}
              </Button>
            </div>
            {syncLibrary.isSuccess && <p className="text-xs text-green-600">Sync queued — your library will update shortly.</p>}
            {syncLibrary.isError && <p className="text-xs text-destructive">{syncLibrary.error.message}</p>}
            <div className="flex items-center justify-between pt-2 border-t">
              <div>
                <p className="text-sm">Visible to group members</p>
                <p className="text-xs text-muted-foreground">Group members can see which games you own for poll suggestions.</p>
              </div>
              <Switch
                checked={me.steamLibraryPublic}
                onCheckedChange={(v) => setLibraryPublic.mutate({ public: v })}
                disabled={setLibraryPublic.isPending}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Privacy & Safety
// ─────────────────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function PrivacySection() {
  const { data: blocked, refetch } = api.friends.listBlocked.useQuery();
  const unblock = api.friends.unblock.useMutation({ onSuccess: () => void refetch() });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Privacy & Safety</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Manage who can see you and who you&apos;ve blocked.</p>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Blocked users</h3>
        {!blocked?.length ? (
          <p className="text-sm text-muted-foreground">You haven&apos;t blocked anyone.</p>
        ) : (
          <ul className="space-y-2">
            {blocked.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                    {initials(u.name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.name}</p>
                    {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={unblock.isPending}
                  onClick={() => unblock.mutate({ targetId: u.id })}>
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Danger zone
// ─────────────────────────────────────────────────────────────────────────────

function DangerSection() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  const deleteAccount = api.user.deleteAccount.useMutation({
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    },
    onError: (e) => setError(e.message),
  });

  function handleDelete() {
    if (confirmation !== "DELETE") return;
    setError("");
    deleteAccount.mutate({ confirmation });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Irreversible actions — proceed with care.</p>
      </div>

      <div className="rounded-xl border border-destructive/40 bg-card p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">Delete account</p>
          <p className="text-sm text-muted-foreground mt-1">
            Permanently removes your profile, posts, and group memberships. This cannot be undone.
          </p>
        </div>
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
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings page shell
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_COMPONENTS: Record<SectionId, React.ComponentType> = {
  appearance:    AppearanceSection,
  profile:       ProfileSection,
  invite:        InviteSection,
  notifications: NotificationsSection,
  connected:     ConnectedSection,
  privacy:       PrivacySection,
  danger:        DangerSection,
};

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const [active, setActive] = useState<SectionId>(() => {
    const s = searchParams.get("section") as SectionId | null;
    return s && NAV_ITEMS.some((n) => n.id === s) ? s : "appearance";
  });

  // Sync active section when ?section= param changes after mount
  useEffect(() => {
    const s = searchParams.get("section") as SectionId | null;
    if (s && NAV_ITEMS.some((n) => n.id === s)) setActive(s);
  }, [searchParams]);

  const ActiveSection = SECTION_COMPONENTS[active];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Mobile: horizontal tab strip (above the content) */}
      <div className="sm:hidden flex gap-1 overflow-x-auto pb-2 -mx-4 px-4">
        {NAV_ITEMS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border ${
              active === id
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-border hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-8 min-h-0">
        {/* Category nav — sticky on desktop */}
        <nav className="hidden sm:flex flex-col gap-0.5 w-44 shrink-0 sticky top-6 self-start pt-1">
          {NAV_ITEMS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                active === id
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              } ${id === "danger" ? "mt-4 text-destructive hover:text-destructive" : ""}`}
            >
              <span className="shrink-0">{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {/* Section content */}
        <div className="flex-1 min-w-0">
          <ActiveSection />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}

"use client";

import { useState, useEffect } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NotificationPrefs } from "@/server/db/schema";

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

// ── Settings page ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: me } = api.user.me.useQuery();

  // ── Profile ──────────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");

  const setUsernameMutation = api.user.setUsername.useMutation({
    onSuccess: () => { setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2500); },
    onError: (e) => setProfileError(e.message),
  });

  useEffect(() => {
    if (me) {
      setDisplayName(me.name ?? "");
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
        <h2 className="text-base font-semibold border-b pb-2">Profile</h2>

        <div className="space-y-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          <p className="text-xs text-muted-foreground">
            Changing your display name isn&apos;t saved yet — full profile editing coming soon.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <div className="flex gap-2">
            <Input
              id="username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setProfileError(""); setProfileSaved(false); }}
              placeholder="your_handle"
            />
            <Button
              onClick={() => { setProfileError(""); setUsernameMutation.mutate({ username }); }}
              disabled={!username.trim() || setUsernameMutation.isPending}
            >
              {setUsernameMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          {profileError && <p className="text-xs text-destructive">{profileError}</p>}
          {profileSaved && <p className="text-xs text-green-600">Username saved!</p>}
          <p className="text-xs text-muted-foreground">3–20 chars, lowercase letters, numbers and underscores only.</p>
        </div>

        <div className="space-y-1">
          <Label>Email</Label>
          <p className="text-sm text-muted-foreground">{me?.email ?? "—"}</p>
        </div>
      </section>

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
    </div>
  );
}

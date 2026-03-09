"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ── Step 1: Pick a username ───────────────────────────────────────────────────

function StepUsername({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  const setUsernameMutation = api.user.setUsername.useMutation({
    onSuccess: onDone,
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setUsernameMutation.mutate({ username });
  }

  const isValid = /^[a-z0-9_]{3,20}$/.test(username);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Choose your username</CardTitle>
        <CardDescription>
          This is your unique handle on Campfire. You can change it once every 30 days.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">@</span>
              <Input
                id="username"
                type="text"
                placeholder="yourname"
                autoComplete="off"
                spellCheck={false}
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              3–20 characters. Letters, numbers, underscores only.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            className="w-full"
            disabled={!isValid || setUsernameMutation.isPending}
          >
            {setUsernameMutation.isPending ? "Saving…" : "Continue"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// ── Step 2: Display name + avatar ─────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function StepProfile({
  initialName,
  onDone,
}: {
  initialName: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarData, setAvatarData] = useState<{
    data: string;
    mimeType: (typeof ALLOWED_IMAGE_TYPES)[number];
  } | null>(null);
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const updateProfile = api.user.updateProfile.useMutation();
  const uploadAvatar = api.upload.avatar.useMutation();

  const isPending = updateProfile.isPending || uploadAvatar.isPending;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError("");
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      setFileError("Unsupported file type. Use JPEG, PNG, GIF, or WebP.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError("Image must be under 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setFileError("Failed to read the file. Please try again.");
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (!result || typeof result !== "string") {
        setFileError("Failed to read the file. Please try again.");
        return;
      }
      // result is a data URL: "data:<mime>;base64,<data>"
      const base64 = result.split(",")[1] ?? "";
      if (!base64) {
        setFileError("Failed to read the file. Please try again.");
        return;
      }
      setAvatarPreview(result);
      setAvatarData({
        data: base64,
        mimeType: file.type as (typeof ALLOWED_IMAGE_TYPES)[number],
      });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      await updateProfile.mutateAsync({ name: name.trim() });
      if (avatarData) {
        await uploadAvatar.mutateAsync(avatarData);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const nameValid = name.trim().length >= 1 && name.trim().length <= 50;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>Set your display name and optionally add a photo.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-5">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Avatar picker */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-primary/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Upload avatar"
            >
              {avatarPreview ? (
                <Image
                  src={avatarPreview}
                  alt="Avatar preview"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Add photo
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            <p className="text-xs text-muted-foreground">JPEG, PNG, GIF, or WebP · max 5 MB</p>
          </div>

          {/* Display name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder="Your name"
            />
            <p className="text-xs text-muted-foreground">Up to 50 characters.</p>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={onDone}
            disabled={isPending}
          >
            Skip
          </Button>
          <Button type="submit" className="flex-1" disabled={!nameValid || isPending}>
            {isPending ? "Saving…" : "Continue"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// ── Step 3: Invite friends ────────────────────────────────────────────────────

function StepInvite({ onDone }: { onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  // Track each in-flight request by ID so multiple adds can be pending simultaneously
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const { data: tokenData } = api.user.getInviteToken.useQuery();
  const inviteUrl =
    tokenData?.token && typeof window !== "undefined"
      ? `${window.location.origin}/invite/${tokenData.token}`
      : "";

  const searchResults = api.friends.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.trim().length >= 2 },
  );

  function removePending(id: string) {
    setPendingIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  }

  const sendRequest = api.friends.sendRequest.useMutation({
    onSuccess: (_, vars) => {
      setSentTo((prev) => new Set(prev).add(vars.addresseeId));
      removePending(vars.addresseeId);
    },
    onError: (_, vars) => removePending(vars.addresseeId),
  });

  function handleCopy() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard denied — don't flash "Copied!" */ });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Invite your friends</CardTitle>
        <CardDescription>
          Share your invite link or find people already on Campfire.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Invite link */}
        <div className="space-y-2">
          <Label>Your invite link</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={inviteUrl}
              className="text-xs"
              placeholder={!inviteUrl ? "Loading…" : undefined}
            />
            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={!inviteUrl}
              className="shrink-0"
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>

        {/* Friend search */}
        <div className="space-y-2">
          <Label htmlFor="friendSearch">Find friends</Label>
          <Input
            id="friendSearch"
            type="search"
            placeholder="Search by name or @username"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery.trim().length >= 2 && (
            <div className="space-y-1 rounded-md border bg-card p-1">
              {searchResults.isLoading && (
                <p className="px-2 py-1 text-xs text-muted-foreground">Searching…</p>
              )}
              {!searchResults.isFetching && searchResults.data?.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">No results found.</p>
              )}
              {searchResults.data?.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    {u.username && (
                      <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={sentTo.has(u.id) ? "secondary" : "default"}
                    disabled={sentTo.has(u.id) || pendingIds.has(u.id)}
                    onClick={() => {
                      setPendingIds((prev) => new Set(prev).add(u.id));
                      sendRequest.mutate({ addresseeId: u.id });
                    }}
                    className="shrink-0"
                  >
                    {sentTo.has(u.id) ? "Sent" : pendingIds.has(u.id) ? "Sending…" : "Add"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={onDone}>
          Go to feed
        </Button>
      </CardFooter>
    </Card>
  );
}

// ── Onboarding shell ──────────────────────────────────────────────────────────

const STEPS = ["username", "profile", "invite"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  username: "Username",
  profile: "Profile",
  invite: "Invite",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("username");

  // Fetch current user to pre-fill the display name in step 2
  const { data: me } = api.user.me.useQuery();

  const stepIndex = STEPS.indexOf(step);

  function next() {
    const nextStep = STEPS[stepIndex + 1];
    if (nextStep) {
      setStep(nextStep);
    } else {
      router.push("/feed");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                i < stepIndex
                  ? "bg-primary text-primary-foreground"
                  : i === stepIndex
                    ? "border-2 border-primary text-primary"
                    : "border border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-sm ${i === stepIndex ? "font-medium" : "text-muted-foreground"}`}
            >
              {STEP_LABELS[s]}
            </span>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-muted-foreground/20" />}
          </div>
        ))}
      </div>

      {step === "username" && <StepUsername onDone={next} />}
      {step === "profile" && me && (
        <StepProfile initialName={me.name ?? ""} onDone={next} />
      )}
      {step === "profile" && !me && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {step === "invite" && <StepInvite onDone={next} />}
    </div>
  );
}

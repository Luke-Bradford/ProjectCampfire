"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
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

// ── Step 2: Display name (already set at register, just confirm / skip) ───────

function StepProfile({ onDone }: { onDone: () => void }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>
          You can update your display name and add an avatar in your profile settings later.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button className="w-full" onClick={onDone}>
          Continue
        </Button>
      </CardFooter>
    </Card>
  );
}

// ── Step 3: Invite friends ────────────────────────────────────────────────────

function StepInvite({ onDone }: { onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite` // placeholder until invite tokens are built
      : "";

  function handleCopy() {
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Invite your friends</CardTitle>
        <CardDescription>
          Campfire is invite-only. Share your link to get your group started.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input readOnly value={inviteUrl} className="text-xs" />
          <Button variant="outline" onClick={handleCopy} className="shrink-0">
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Invite links will be personalised once the feature is fully set up.
        </p>
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
            {i < STEPS.length - 1 && (
              <div className="h-px w-6 bg-muted-foreground/20" />
            )}
          </div>
        ))}
      </div>

      {step === "username" && <StepUsername onDone={next} />}
      {step === "profile" && <StepProfile onDone={next} />}
      {step === "invite" && <StepInvite onDone={next} />}
    </div>
  );
}

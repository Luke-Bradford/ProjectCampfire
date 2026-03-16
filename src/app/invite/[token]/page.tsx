"use client";

import { use } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

// A token is a single-use invite (64-char hex) if it matches that pattern;
// otherwise it's a permanent personal invite token (CUID2, ~24 chars).
function isSingleUseToken(token: string): boolean {
  return token.length === 64 && /^[0-9a-f]+$/.test(token);
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const singleUse = isSingleUseToken(token);

  // ── Permanent invite token path ──────────────────────────────────────────────
  const permanentQuery = api.friends.resolveInviteToken.useQuery(
    { token },
    { enabled: !singleUse }
  );

  // ── Single-use invite link path ──────────────────────────────────────────────
  const singleUseQuery = api.friends.resolveInviteLink.useQuery(
    { token },
    { enabled: singleUse }
  );

  const accept = api.friends.acceptInviteLink.useMutation();

  // ── Permanent token: use existing sendRequestViaToken ────────────────────────
  const sendRequestViaToken = api.friends.sendRequestViaToken.useMutation();

  // Check if the current visitor is logged in
  const { data: me, isPending: loadingMe } = api.user.me.useQuery();

  const isLoading = singleUse
    ? singleUseQuery.isPending || loadingMe
    : permanentQuery.isPending || loadingMe;

  const error = singleUse ? singleUseQuery.error : permanentQuery.error;

  const inviter = singleUse ? singleUseQuery.data?.inviter : permanentQuery.data;
  const expiresAt = singleUse ? singleUseQuery.data?.expiresAt : null;

  const alreadySent = singleUse ? accept.isSuccess : sendRequestViaToken.isSuccess;
  const isSelf = me && inviter && me.id === inviter.id;
  const alreadyFriends = singleUse
    ? accept.error?.data?.code === "CONFLICT"
    : sendRequestViaToken.error?.data?.code === "CONFLICT";

  const mutationError = singleUse ? accept.error : sendRequestViaToken.error;
  const mutationPending = singleUse ? accept.isPending : sendRequestViaToken.isPending;

  function handleAccept() {
    if (singleUse) {
      accept.mutate({ token });
    } else {
      sendRequestViaToken.mutate({ token });
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Minimal header */}
      <header className="border-b px-4">
        <div className="mx-auto flex h-14 max-w-md items-center">
          <Link href="/feed" className="text-lg font-semibold tracking-tight">
            Campfire
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6 text-center">

          {isLoading && (
            <p className="text-muted-foreground">Loading…</p>
          )}

          {!isLoading && error && (
            <div className="space-y-3">
              <p className="text-lg font-semibold">Link not found</p>
              <p className="text-sm text-muted-foreground">
                {singleUse
                  ? "This invite link may have expired, already been used, or doesn't exist."
                  : "This invite link may have been regenerated or doesn't exist."}
              </p>
              <Button asChild variant="outline">
                <Link href="/">Go to Campfire</Link>
              </Button>
            </div>
          )}

          {!isLoading && inviter && (
            <div className="space-y-5">
              {/* Inviter avatar + name */}
              <div className="flex flex-col items-center gap-3">
                {inviter.image ? (
                  <Image
                    src={inviter.image}
                    alt={inviter.name}
                    width={72}
                    height={72}
                    className="rounded-full border"
                  />
                ) : (
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border bg-muted text-2xl font-bold text-muted-foreground">
                    {inviter.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-xl font-semibold">{inviter.name}</p>
                  {inviter.username && (
                    <p className="text-sm text-muted-foreground">@{inviter.username}</p>
                  )}
                </div>
              </div>

              <p className="text-muted-foreground text-sm">
                {inviter.name} invited you to connect on Campfire — a place to plan gaming sessions with friends.
              </p>

              {expiresAt && (
                <p className="text-xs text-muted-foreground">
                  This link expires {new Date(expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
                </p>
              )}

              {/* Action area */}
              {isSelf ? (
                <p className="text-sm text-muted-foreground italic">This is your own invite link.</p>
              ) : me ? (
                // Logged-in: show friend request button
                <div className="space-y-2">
                  {alreadySent || alreadyFriends ? (
                    <p className="text-sm text-green-600 font-medium">
                      {alreadyFriends ? "You're already connected!" : "Friend request sent!"}
                    </p>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={handleAccept}
                      disabled={mutationPending}
                    >
                      {mutationPending ? "Sending…" : `Add ${inviter.name} as a friend`}
                    </Button>
                  )}
                  {mutationError && !alreadyFriends && (
                    <p className="text-xs text-destructive">{mutationError.message}</p>
                  )}
                  <Button asChild variant="ghost" size="sm" className="w-full">
                    <Link href="/feed">Go to my feed</Link>
                  </Button>
                </div>
              ) : (
                // Not logged in: prompt to sign up or sign in
                <div className="space-y-3">
                  <Button asChild className="w-full">
                    <Link href={`/register?callbackUrl=/invite/${token}`}>
                      Create a Campfire account
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/login?callbackUrl=/invite/${token}`}>
                      Sign in
                    </Link>
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Already have an account? Sign in to accept the invite.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * /rsvp?token=<signed-token>
 *
 * One-click RSVP landing page — no login required.
 *
 * The server component validates the token (read-only — no DB write on GET)
 * and renders the event title + intended RSVP status. The user confirms by
 * clicking a button, which POSTs to /api/rsvp. This prevents link-preview
 * bots and SafeLinks scanners from silently triggering the write.
 */

import Link from "next/link";
import { verifyRsvpToken } from "@/server/rsvp-token";
import { RsvpConfirmButton } from "./rsvp-confirm-button";

const STATUS_LABEL: Record<string, string> = {
  yes: "Going",
  no: "Not going",
  maybe: "Maybe",
};

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function RsvpPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return <RsvpError message="Missing RSVP token." />;
  }

  // Decode token server-side (no DB read — purely cryptographic validation).
  // The actual authorisation checks (event not cancelled, still a member) happen
  // inside POST /api/rsvp when the user clicks Confirm.
  const payload = verifyRsvpToken(token);
  if (!payload) {
    return <RsvpError message="This RSVP link is invalid or has expired." />;
  }

  const { status } = payload;
  const statusLabel = STATUS_LABEL[status] ?? status;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full rounded-xl border bg-card p-8 text-center shadow-sm space-y-5">
        <div>
          <p className="text-lg font-semibold">Confirm your RSVP</p>
          <p className="text-muted-foreground text-sm mt-1">
            You are about to RSVP as{" "}
            <strong>{statusLabel}</strong>.
          </p>
        </div>
        <RsvpConfirmButton token={token} statusLabel={statusLabel} />
        <p className="text-xs text-muted-foreground">
          Changed your mind?{" "}
          <Link href="/" className="text-primary hover:underline">
            Go to Campfire
          </Link>{" "}
          and update your RSVP from the event page.
        </p>
      </div>
    </div>
  );
}

function RsvpError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full rounded-xl border bg-card p-8 text-center shadow-sm space-y-3">
        <p className="text-lg font-semibold text-destructive">RSVP failed</p>
        <p className="text-muted-foreground text-sm">{message}</p>
        <Link
          href="/"
          className="inline-block mt-2 text-sm text-primary hover:underline"
        >
          Go to Campfire
        </Link>
      </div>
    </div>
  );
}

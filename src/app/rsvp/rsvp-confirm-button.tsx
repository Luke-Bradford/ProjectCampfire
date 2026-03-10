"use client";

import { useState } from "react";
import Link from "next/link";

type State =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "success"; eventId: string; statusLabel: string }
  | { phase: "error"; message: string };

export function RsvpConfirmButton({
  token,
  statusLabel,
}: {
  token: string;
  statusLabel: string;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function handleConfirm() {
    setState({ phase: "pending" });
    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as
        | { ok: true; eventId: string; status: string }
        | { error: string };

      if (!res.ok || !("ok" in data)) {
        setState({ phase: "error", message: ("error" in data ? data.error : null) ?? "Something went wrong." });
        return;
      }

      setState({ phase: "success", eventId: data.eventId, statusLabel });
    } catch {
      setState({ phase: "error", message: "Network error — please try again." });
    }
  }

  if (state.phase === "success") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          ✓ RSVP recorded as <strong>{state.statusLabel}</strong>.
        </p>
        <Link
          href={`/events/${state.eventId}`}
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          View event
        </Link>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{state.message}</p>
        <button
          onClick={() => setState({ phase: "idle" })}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConfirm}
      disabled={state.phase === "pending"}
      className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {state.phase === "pending" ? "Confirming…" : `Confirm — ${statusLabel}`}
    </button>
  );
}

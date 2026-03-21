"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { RouterOutputs } from "@/trpc/react";
import { pollHref } from "@/lib/poll-href";

type ClosedPoll = RouterOutputs["polls"]["forSidebar"]["recentlyClosed"][number];

export function RecentPollsWidget({ polls }: { polls: ClosedPoll[] }) {
  if (polls.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-muted-foreground" />
        Recently closed
      </h2>

      <ul className="flex flex-col gap-2">
        {polls.map((poll) => (
          <li key={poll.id}>
            <Link
              href={pollHref(poll)}
              className="flex flex-col gap-0.5 rounded-lg hover:bg-muted/50 px-2 py-1.5 -mx-2 transition-colors"
            >
              <span className="text-xs text-muted-foreground leading-snug line-clamp-2">
                {poll.question}
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                {poll.groupName ?? "Group"}
                {poll.winnerLabel ? ` · ${poll.winnerLabel}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

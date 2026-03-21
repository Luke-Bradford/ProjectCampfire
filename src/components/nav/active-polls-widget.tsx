"use client";

import Link from "next/link";
import { Vote } from "lucide-react";
import type { RouterOutputs } from "@/trpc/react";

type SidebarData = RouterOutputs["polls"]["forSidebar"];
type ActivePoll = SidebarData["active"][number];

function pollHref(poll: Pick<ActivePoll, "groupId" | "eventId">) {
  if (poll.eventId) return `/events/${poll.eventId}`;
  if (poll.groupId) return `/groups/${poll.groupId}`;
  return "/";
}

export function ActivePollsWidget({ polls }: { polls: ActivePoll[] }) {
  if (polls.length === 0) return null;

  const needsVote = polls.filter((p) => !p.iVoted);
  const alreadyVoted = polls.filter((p) => p.iVoted);

  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Vote size={14} className="text-muted-foreground" />
        Active polls
      </h2>

      <ul className="flex flex-col gap-2">
        {needsVote.map((poll) => (
          <li key={poll.id}>
            <Link
              href={pollHref(poll)}
              className="flex flex-col gap-0.5 group rounded-lg hover:bg-muted/50 px-2 py-1.5 -mx-2 transition-colors"
            >
              <span className="text-xs font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2">
                {poll.question}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {poll.groupName ?? "Group"} · Vote now →
              </span>
            </Link>
          </li>
        ))}

        {alreadyVoted.length > 0 && (
          <>
            {needsVote.length > 0 && <li className="border-t my-0.5" />}
            {alreadyVoted.map((poll) => (
              <li key={poll.id}>
                <Link
                  href={pollHref(poll)}
                  className="flex flex-col gap-0.5 rounded-lg hover:bg-muted/50 px-2 py-1.5 -mx-2 transition-colors"
                >
                  <span className="text-xs text-muted-foreground leading-snug line-clamp-2">
                    {poll.question}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">
                    {poll.groupName ?? "Group"} · Voted
                  </span>
                </Link>
              </li>
            ))}
          </>
        )}
      </ul>
    </div>
  );
}

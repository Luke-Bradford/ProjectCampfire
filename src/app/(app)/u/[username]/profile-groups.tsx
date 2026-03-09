"use client";

import { api } from "@/trpc/react";

export function ProfileGroups({ userId }: { userId: string }) {
  const { data: groups } = api.friends.getProfileGroups.useQuery({ userId });

  if (!groups || groups.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Groups</h2>
      <ul className="space-y-1">
        {groups.map((g) => (
          <li key={g.id} className="text-sm">
            {g.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

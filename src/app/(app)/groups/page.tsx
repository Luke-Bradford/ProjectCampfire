"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { GroupsListSkeleton } from "@/components/ui/skeletons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format } from "date-fns";

// Deterministic colour strip per group — consistent per name, never random per render.
const STRIP_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-rose-500",
];

function groupColor(name: string): string {
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return STRIP_COLORS[hash % STRIP_COLORS.length]!;
}

function CreateGroupDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const create = api.groups.create.useMutation({
    onSuccess: () => {
      setOpen(false);
      setName("");
      setDescription("");
      onCreated();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    create.mutate({ name, description });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create group</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a group</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              placeholder="Friday Night Squad"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-desc">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="group-desc"
              placeholder="What's this group about?"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GroupsPage() {
  const { data: myGroups = [], isLoading, refetch } = api.groups.list.useQuery();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="text-muted-foreground">
            {myGroups.length === 0
              ? "You're not in any groups yet."
              : `${myGroups.length} group${myGroups.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <CreateGroupDialog onCreated={() => void refetch()} />
      </div>

      {isLoading ? (
        <GroupsListSkeleton />
      ) : myGroups.length === 0 ? (
        <EmptyState
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          heading="No groups yet"
          description="Groups are where you plan sessions, vote on games, and track who's available."
          action={<CreateGroupDialog onCreated={() => void refetch()} />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {myGroups.map((g) => (
            <Link
              key={g.id}
              href={`/groups/${g.id}`}
              className="group rounded-xl border bg-card shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Deterministic colour strip */}
              <div className={`h-1.5 w-full ${groupColor(g.name)}`} />

              <div className="p-4 space-y-3">
                {/* Name + role badge */}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-tight group-hover:text-primary transition-colors">
                    {g.name}
                  </p>
                  <Badge variant="secondary" className="capitalize shrink-0 text-xs">
                    {g.role}
                  </Badge>
                </div>

                {/* Description */}
                {g.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{g.description}</p>
                )}

                {/* Footer: member count + next event pill */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                  </span>
                  {g.nextEvent?.confirmedStartsAt ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {format(new Date(g.nextEvent.confirmedStartsAt), "d MMM")}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

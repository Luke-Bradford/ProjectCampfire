"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  addDays,
  startOfWeek,
  format,
  parseISO,
  isSameDay,
  formatISO,
} from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDatetimeValue(d: Date) {
  // Returns a string suitable for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeValue(s: string): string {
  // Convert local datetime-local value to ISO string (with timezone offset)
  return new Date(s).toISOString();
}

function formatTimeRange(start: Date | string, end: Date | string) {
  const s = typeof start === "string" ? parseISO(start) : start;
  const e = typeof end === "string" ? parseISO(end) : end;
  return `${format(s, "HH:mm")} – ${format(e, "HH:mm")}`;
}

const VISIBILITIES = ["friends", "group", "private"] as const;
type Visibility = (typeof VISIBILITIES)[number];

const VIS_LABELS: Record<Visibility, string> = {
  friends: "Friends",
  group: "Group only",
  private: "Private",
};

// ── Add / Edit block dialog ───────────────────────────────────────────────────

type Block = {
  id: string;
  startsAt: Date | string;
  endsAt: Date | string;
  label: string | null;
  visibility: string;
  groupId: string | null;
};

function BlockDialog({
  trigger,
  initial,
  onDone,
}: {
  trigger: React.ReactNode;
  initial?: Block;
  onDone: () => void;
}) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState(
    initial ? toLocalDatetimeValue(new Date(initial.startsAt)) : toLocalDatetimeValue(now)
  );
  const [endsAt, setEndsAt] = useState(
    initial
      ? toLocalDatetimeValue(new Date(initial.endsAt))
      : toLocalDatetimeValue(addDays(now, 0))
  );
  const [label, setLabel] = useState(initial?.label ?? "");
  const [visibility, setVisibility] = useState<Visibility>(
    (initial?.visibility as Visibility) ?? "friends"
  );
  const [error, setError] = useState("");

  const create = api.availability.create.useMutation({
    onSuccess: () => { setOpen(false); onDone(); },
    onError: (e) => setError(e.message),
  });
  const update = api.availability.update.useMutation({
    onSuccess: () => { setOpen(false); onDone(); },
    onError: (e) => setError(e.message),
  });

  const isPending = create.isPending || update.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const payload = {
      startsAt: fromLocalDatetimeValue(startsAt),
      endsAt: fromLocalDatetimeValue(endsAt),
      label: label.trim() || undefined,
      visibility,
    };
    if (initial) {
      update.mutate({ id: initial.id, ...payload });
    } else {
      create.mutate(payload);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit availability" : "Add availability block"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="avail-start">Start</Label>
              <Input
                id="avail-start"
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avail-end">End</Label>
              <Input
                id="avail-end"
                type="datetime-local"
                required
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="avail-label">Label (optional)</Label>
            <Input
              id="avail-label"
              placeholder="e.g. Friday evening"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="flex flex-wrap gap-2">
              {VISIBILITIES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                    visibility === v
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {VIS_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : initial ? "Save changes" : "Add block"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Week navigator ────────────────────────────────────────────────────────────

function WeekNav({
  weekStart,
  onChange,
}: {
  weekStart: Date;
  onChange: (d: Date) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={() => onChange(addDays(weekStart, -7))}>
        ‹
      </Button>
      <span className="text-sm font-medium">
        {format(weekStart, "d MMM")} – {format(addDays(weekStart, 6), "d MMM yyyy")}
      </span>
      <Button variant="outline" size="sm" onClick={() => onChange(addDays(weekStart, 7))}>
        ›
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const weekEnd = addDays(weekStart, 7);

  const { data: myBlocks = [], refetch } = api.availability.myBlocks.useQuery({
    from: formatISO(weekStart),
    to: formatISO(weekEnd),
  });

  const deleteBlock = api.availability.delete.useMutation({
    onSuccess: () => void refetch(),
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Availability</h1>
          <p className="text-muted-foreground text-sm">
            Let friends and groups know when you&apos;re free to play.
          </p>
        </div>
        <BlockDialog
          trigger={<Button>Add block</Button>}
          onDone={() => void refetch()}
        />
      </div>

      <WeekNav weekStart={weekStart} onChange={setWeekStart} />

      <div className="space-y-3">
        {days.map((day) => {
          const dayBlocks = myBlocks.filter((b) =>
            isSameDay(new Date(b.startsAt), day)
          );
          return (
            <div key={day.toISOString()} className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">{format(day, "EEEE d MMM")}</span>
                <BlockDialog
                  trigger={
                    <button className="text-xs text-muted-foreground hover:text-foreground">
                      + Add
                    </button>
                  }
                  onDone={() => void refetch()}
                />
              </div>
              {dayBlocks.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">No blocks</p>
              ) : (
                <ul className="divide-y">
                  {dayBlocks.map((b) => (
                    <li key={b.id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {formatTimeRange(b.startsAt, b.endsAt)}
                        </span>
                        {b.label && (
                          <span className="text-sm text-muted-foreground">{b.label}</span>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {VIS_LABELS[b.visibility as Visibility]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <BlockDialog
                          trigger={
                            <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">
                              Edit
                            </button>
                          }
                          initial={b}
                          onDone={() => void refetch()}
                        />
                        <button
                          onClick={() => deleteBlock.mutate({ id: b.id })}
                          disabled={deleteBlock.isPending}
                          className="text-xs text-muted-foreground hover:text-destructive px-2 py-1"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

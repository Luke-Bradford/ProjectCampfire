"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TimeSlot } from "@/server/db/schema/availability";

type OverrideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string; // YYYY-MM-DD
  existingSlots?: TimeSlot[];
  existingLabel?: string;
  onSaved: () => void;
};

export function OverrideDialog({
  open,
  onOpenChange,
  date,
  existingSlots,
  existingLabel,
  onSaved,
}: OverrideDialogProps) {
  const [unavailableAllDay, setUnavailableAllDay] = useState(
    existingSlots !== undefined && existingSlots.length === 0
  );
  const [slots, setSlots] = useState<TimeSlot[]>(
    existingSlots && existingSlots.length > 0 ? existingSlots : [{ start: "19:00", end: "23:00" }]
  );
  const [label, setLabel] = useState(existingLabel ?? "");
  const [error, setError] = useState("");

  const setOverride = api.availability.setOverride.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => setError(e.message),
  });

  const deleteOverride = api.availability.deleteOverride.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
  });

  function addSlot() {
    setSlots([...slots, { start: "19:00", end: "23:00" }]);
  }

  function removeSlot(idx: number) {
    setSlots(slots.filter((_, i) => i !== idx));
  }

  function updateSlot(idx: number, field: "start" | "end", value: string) {
    setSlots(slots.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOverride.mutate({
      date,
      slots: unavailableAllDay ? [] : slots,
      label: label.trim() || undefined,
    });
  }

  const displayDate = new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override — {displayDate}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Switch
              id="unavailable"
              checked={unavailableAllDay}
              onCheckedChange={setUnavailableAllDay}
            />
            <Label htmlFor="unavailable">Unavailable all day</Label>
          </div>

          {!unavailableAllDay && (
            <div className="space-y-3">
              <Label>Available times</Label>
              {slots.map((slot, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={slot.start}
                    onChange={(e) => updateSlot(idx, "start", e.target.value)}
                    className="w-[120px]"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={slot.end}
                    onChange={(e) => updateSlot(idx, "end", e.target.value)}
                    className="w-[120px]"
                  />
                  {slots.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSlot(idx)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addSlot}>
                + Add time slot
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="override-label">Label (optional)</Label>
            <Input
              id="override-label"
              placeholder="e.g. Holiday, Extra free time"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="flex justify-between">
            <div>
              {existingSlots !== undefined && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteOverride.mutate({ date })}
                  disabled={deleteOverride.isPending}
                >
                  Remove override
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={setOverride.isPending}>
                {setOverride.isPending ? "Saving..." : "Save override"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const ALL_TIMEZONES: string[] = (() => {
  try { return Intl.supportedValuesOf("timeZone"); }
  catch { return ["UTC", "Europe/London", "America/New_York", "America/Los_Angeles"]; }
})();

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type TemplateFormState = {
  title: string;
  description: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  leadDays: number;
  autoPoll: boolean;
  generatedEventStatus: "draft" | "open";
};

const DEFAULT_FORM: TemplateFormState = {
  title: "",
  description: "",
  dayOfWeek: 5, // Friday
  startTime: "19:00",
  endTime: "22:00",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  leadDays: 7,
  autoPoll: false,
  generatedEventStatus: "draft",
};

function TemplateForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial: TemplateFormState;
  onSubmit: (f: TemplateFormState) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<TemplateFormState>(initial);

  function set<K extends keyof TemplateFormState>(k: K, v: TemplateFormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rt-title">Title</Label>
        <Input
          id="rt-title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Friday Night Gaming"
          maxLength={200}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Day of week</Label>
          <Select
            value={String(form.dayOfWeek)}
            onValueChange={(v) => set("dayOfWeek", Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_NAMES.map((d, i) => (
                <SelectItem key={d} value={String(i)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Generate events</Label>
          <Select
            value={String(form.leadDays)}
            onValueChange={(v) => set("leadDays", Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 5, 7, 14].map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} day{d !== 1 ? "s" : ""} ahead
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="rt-start">Start time</Label>
          <Input
            id="rt-start"
            type="time"
            value={form.startTime}
            onChange={(e) => set("startTime", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rt-end">End time</Label>
          <Input
            id="rt-end"
            type="time"
            value={form.endTime}
            onChange={(e) => set("endTime", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rt-tz">Timezone</Label>
        <input
          id="rt-tz"
          list="rt-tz-list"
          value={form.timezone}
          onChange={(e) => set("timezone", e.target.value)}
          placeholder="Europe/London"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <datalist id="rt-tz-list">
          {ALL_TIMEZONES.map((tz) => <option key={tz} value={tz} />)}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Generated event status</Label>
          <Select
            value={form.generatedEventStatus}
            onValueChange={(v) => set("generatedEventStatus", v as "draft" | "open")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="open">Open</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 pt-6">
          <Switch
            id="rt-autopoll"
            checked={form.autoPoll}
            onCheckedChange={(v) => set("autoPoll", v)}
          />
          <Label htmlFor="rt-autopoll">Auto game poll</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={loading || !form.title.trim()}
          onClick={() => onSubmit(form)}
        >
          {loading ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function RecurringTemplatesSection({
  groupId,
  isAdmin,
}: {
  groupId: string;
  isAdmin: boolean;
}) {
  const utils = api.useUtils();
  const { data: templates, isLoading } = api.recurring.list.useQuery({ groupId });

  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const create = api.recurring.create.useMutation({
    onSuccess: () => {
      void utils.recurring.list.invalidate({ groupId });
      setCreateOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const update = api.recurring.update.useMutation({
    onSuccess: () => {
      void utils.recurring.list.invalidate({ groupId });
      setEditId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const del = api.recurring.delete.useMutation({
    onSuccess: () => void utils.recurring.list.invalidate({ groupId }),
    onError: (err) => toast.error(err.message),
  });

  const toggleActive = (id: string, active: boolean) => {
    update.mutate({ id, active });
  };

  if (isLoading) return null;

  const editingTemplate = templates?.find((t) => t.id === editId);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Recurring sessions</h2>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Add template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>New recurring session</DialogTitle>
              </DialogHeader>
              <TemplateForm
                initial={DEFAULT_FORM}
                loading={create.isPending}
                onCancel={() => setCreateOpen(false)}
                onSubmit={(f) =>
                  create.mutate({
                    groupId,
                    title: f.title,
                    description: f.description || undefined,
                    dayOfWeek: f.dayOfWeek,
                    startTime: f.startTime,
                    endTime: f.endTime,
                    timezone: f.timezone,
                    leadDays: f.leadDays,
                    autoPoll: f.autoPoll,
                    generatedEventStatus: f.generatedEventStatus,
                  })
                }
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!templates?.length && (
        <p className="text-sm text-muted-foreground">
          No recurring sessions set up.{" "}
          {isAdmin && "Add a template to automatically generate weekly events."}
        </p>
      )}

      <ul className="space-y-2">
        {templates?.map((t) => (
          <li key={t.id} className="rounded-lg border p-3">
            {editId === t.id && editingTemplate ? (
              <Dialog open onOpenChange={(open) => { if (!open) setEditId(null); }}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit recurring session</DialogTitle>
                  </DialogHeader>
                  <TemplateForm
                    initial={{
                      title: editingTemplate.title,
                      description: editingTemplate.description ?? "",
                      dayOfWeek: editingTemplate.dayOfWeek,
                      startTime: editingTemplate.startTime,
                      endTime: editingTemplate.endTime,
                      timezone: editingTemplate.timezone,
                      leadDays: editingTemplate.leadDays,
                      autoPoll: editingTemplate.autoPoll,
                      generatedEventStatus: editingTemplate.generatedEventStatus as "draft" | "open",
                    }}
                    loading={update.isPending}
                    onCancel={() => setEditId(null)}
                    onSubmit={(f) =>
                      update.mutate({
                        id: t.id,
                        title: f.title,
                        description: f.description || null,
                        dayOfWeek: f.dayOfWeek,
                        startTime: f.startTime,
                        endTime: f.endTime,
                        timezone: f.timezone,
                        leadDays: f.leadDays,
                        autoPoll: f.autoPoll,
                        generatedEventStatus: f.generatedEventStatus,
                      })
                    }
                  />
                </DialogContent>
              </Dialog>
            ) : null}

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t.title}</span>
                  {!t.active && (
                    <Badge variant="secondary" className="text-xs">
                      Paused
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {(DAY_NAMES[t.dayOfWeek] ?? "Unknown")}s · {t.startTime}–{t.endTime} {t.timezone}
                  {" · "}{t.leadDays}d ahead
                  {t.autoPoll ? " · auto poll" : ""}
                </p>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={t.active}
                    onCheckedChange={(v) => toggleActive(t.id, v)}
                    aria-label={t.active ? "Pause template" : "Resume template"}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditId(t.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${t.title}"? This will not delete already-generated events.`)) {
                        del.mutate({ id: t.id });
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

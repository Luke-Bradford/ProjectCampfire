"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const DAY_NAMES: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

export interface SlotEditState {
  eventId: string;
  anchorRect: DOMRect;
  day: number;
  startHHmm: string;
  endHHmm: string;
  endDayOffset: number;
  type: "available" | "busy";
  label: string;
}

interface Props {
  state: SlotEditState;
  onClose: () => void;
  onSave: (updates: Pick<SlotEditState, "startHHmm" | "endHHmm" | "endDayOffset" | "type" | "label">) => void;
  onDelete: () => void;
}

export function SlotEditPopover({ state, onClose, onSave, onDelete }: Props) {
  const [startHHmm, setStart] = useState(state.startHHmm);
  const [endHHmm, setEnd]     = useState(state.endHHmm);
  const [type, setType]       = useState<"available" | "busy">(state.type);
  const [label, setLabel]     = useState(state.label);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStart(state.startHHmm);
    setEnd(state.endHHmm);
    setType(state.type);
    setLabel(state.label);
  }, [state.eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = startHHmm !== state.startHHmm || endHHmm !== state.endHHmm ||
                  type !== state.type || label !== state.label;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (isDirty && !window.confirm("Discard unsaved changes?")) return;
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, isDirty]);

  // If end < start the slot wraps midnight — infer automatically, no toggle needed
  const isOvernight = endHHmm < startHHmm;
  const nextDayName = DAY_NAMES[(state.day + 1) % 7];

  const winW  = typeof window !== "undefined" ? window.innerWidth  : 1200;
  const winH  = typeof window !== "undefined" ? window.innerHeight : 800;
  const popW  = 268;
  const popH  = 420; // conservative estimate — popover flips above if it would clip

  const x = Math.min(state.anchorRect.right + 10, winW - popW - 4);
  // Prefer aligning to the top of the anchor; flip above if it would overflow the viewport
  const yBelow = state.anchorRect.top;
  const yAbove = state.anchorRect.bottom - popH;
  const y = yBelow + popH > winH ? Math.max(4, yAbove) : yBelow;

  function handleSave() {
    onSave({
      startHHmm,
      endHHmm,
      endDayOffset: isOvernight ? 1 : 0,
      type,
      label,
    });
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 w-64 rounded-lg border bg-popover p-4 shadow-xl text-sm"
      style={{ left: x, top: y }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-semibold">{DAY_NAMES[state.day]}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-base leading-none" aria-label="Close">×</button>
      </div>

      {/* Available / Busy */}
      <div className="mb-3 flex overflow-hidden rounded-md border text-xs font-medium">
        <button
          className={`flex-1 py-1.5 transition-colors ${type === "available" ? "bg-green-600 text-white" : "hover:bg-muted"}`}
          onClick={() => setType("available")}
        >Available</button>
        <button
          className={`flex-1 py-1.5 transition-colors ${type === "busy" ? "bg-red-600 text-white" : "hover:bg-muted"}`}
          onClick={() => setType("busy")}
        >Busy</button>
      </div>

      {/* Times */}
      <div className="mb-3 space-y-2">
        <div>
          <label className="text-xs text-muted-foreground">Start</label>
          <input
            type="time"
            value={startHHmm}
            onChange={e => setStart(e.target.value)}
            className="mt-1 block w-full rounded border border-input bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">End</label>
            {isOvernight && (
              <span className="text-xs text-amber-400">→ {nextDayName}</span>
            )}
          </div>
          <input
            type="time"
            value={endHHmm}
            onChange={e => setEnd(e.target.value)}
            className="mt-1 block w-full rounded border border-input bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground/60">
            Set end earlier than start to continue into {nextDayName}
          </p>
        </div>
      </div>

      {/* Note */}
      <div className="mb-4">
        <label className="text-xs text-muted-foreground">Note (optional)</label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Gaming session"
          className="mt-1 block w-full rounded border border-input bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <p className="mb-3 text-xs text-muted-foreground/40 italic">Group assignment coming soon</p>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={handleSave}>Save</Button>
        <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
      </div>
    </div>
  );
}

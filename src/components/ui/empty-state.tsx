import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: ReactNode;
  heading: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}

/**
 * Consistent empty state layout used across all pages.
 * Accepts a large muted icon, heading, description, and up to two action slots.
 */
export function EmptyState({
  icon,
  heading,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed px-8 py-12 text-center",
        className
      )}
    >
      <div className="text-muted-foreground/50">{icon}</div>
      <div className="space-y-1">
        <p className="font-medium">{heading}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {(action ?? secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

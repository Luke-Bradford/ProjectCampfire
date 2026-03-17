import { cn } from "@/lib/utils";

type UserStatus = "online" | "busy" | "offline";

const STATUS_CONFIG: Record<UserStatus, { label: string; colour: string }> = {
  online:  { label: "Online",  colour: "bg-green-500" },
  busy:    { label: "Busy",    colour: "bg-amber-500" },
  offline: { label: "Offline", colour: "bg-muted-foreground" },
};

function coerceStatus(s: string | null | undefined): UserStatus {
  return s && s in STATUS_CONFIG ? (s as UserStatus) : "offline";
}

/**
 * Small coloured dot indicating a user's presence status.
 * Typically rendered absolutely on top of an avatar (size="sm")
 * or inline beside a name (size="md" with optional label).
 */
export function StatusDot({
  status,
  showLabel = false,
  className,
}: {
  status: string | null | undefined;
  showLabel?: boolean;
  className?: string;
}) {
  const s = coerceStatus(status);
  const { label, colour } = STATUS_CONFIG[s];

  if (showLabel) {
    return (
      <span className={cn("flex items-center gap-1.5", className)}>
        <span className={cn("h-2 w-2 rounded-full shrink-0", colour)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </span>
    );
  }

  return (
    <span
      className={cn("block h-2.5 w-2.5 rounded-full border-2 border-background", colour, className)}
      title={label}
      aria-label={label}
    />
  );
}

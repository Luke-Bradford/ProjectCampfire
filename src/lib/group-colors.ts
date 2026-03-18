/**
 * Fixed group colour palette. Keys are stored in the DB; values map to
 * static Tailwind classes. Using a lookup map avoids dynamic class
 * concatenation (e.g. `bg-${color}-500`) which Tailwind purges at build time.
 *
 * Add new colours here — never construct class names dynamically.
 */

export const GROUP_COLOR_KEYS = [
  "blue",
  "violet",
  "emerald",
  "orange",
  "pink",
  "cyan",
  "amber",
  "rose",
] as const;

export type GroupColorKey = (typeof GROUP_COLOR_KEYS)[number];

/** Full Tailwind bg class for the colour strip / solid use */
export const GROUP_COLOR_BG: Record<GroupColorKey, string> = {
  blue:    "bg-blue-500",
  violet:  "bg-violet-500",
  emerald: "bg-emerald-500",
  orange:  "bg-orange-500",
  pink:    "bg-pink-500",
  cyan:    "bg-cyan-500",
  amber:   "bg-amber-500",
  rose:    "bg-rose-500",
};

/** Subtle tinted background for inline badges / tinted panels */
export const GROUP_COLOR_SUBTLE: Record<GroupColorKey, string> = {
  blue:    "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  violet:  "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  orange:  "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  pink:    "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  cyan:    "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  amber:   "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  rose:    "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

/** Small dot / indicator colour — same classes as GROUP_COLOR_BG */
export const GROUP_COLOR_DOT = GROUP_COLOR_BG;

/** Hex values for the swatch picker UI */
export const GROUP_COLOR_HEX: Record<GroupColorKey, string> = {
  blue:    "#3b82f6",
  violet:  "#8b5cf6",
  emerald: "#10b981",
  orange:  "#f97316",
  pink:    "#ec4899",
  cyan:    "#06b6d4",
  amber:   "#f59e0b",
  rose:    "#f43f5e",
};

/**
 * Resolve a group's display colour key. Falls back to a deterministic
 * hash of the group name when no colour has been set by an admin.
 */
export function resolveGroupColor(color: string | null | undefined, name: string): GroupColorKey {
  if (color && GROUP_COLOR_KEYS.includes(color as GroupColorKey)) {
    return color as GroupColorKey;
  }
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return GROUP_COLOR_KEYS[hash % GROUP_COLOR_KEYS.length]!;
}

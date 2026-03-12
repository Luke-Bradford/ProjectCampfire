"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/nav/theme-toggle";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function SidebarUserSection({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="border-t px-3 py-3 space-y-3">
      {/* Theme toggle */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground font-medium">Theme</span>
        <ThemeToggle />
      </div>

      {/* User row */}
      <div className="flex items-center gap-2.5">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={image ?? undefined} />
          <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
        </Avatar>
        <Link
          href="/settings"
          className="flex-1 truncate text-sm font-medium hover:text-primary transition-colors"
        >
          {name}
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Settings"
          >
            <Settings size={14} />
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

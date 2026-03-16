"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CampfireLogo } from "@/components/nav/campfire-logo";
import { ProfileCard } from "@/components/nav/profile-card";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function MobileHeader({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Top bar */}
      <header className="flex md:hidden h-12 items-center justify-between border-b px-4">
        <CampfireLogo size={18} />
        <button
          type="button"
          aria-label="Open profile menu"
          onClick={() => setOpen(true)}
          className="rounded-full ring-offset-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={image ?? undefined} />
            <AvatarFallback className="text-xs font-semibold">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-up drawer — always rendered so the CSS transition plays on close.
          aria-hidden when closed so screen readers skip it while off-screen. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 md:hidden rounded-t-2xl border-t bg-background shadow-xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "85dvh", overflowY: "auto" }}
        role="dialog"
        aria-modal="true"
        aria-label="Profile menu"
        aria-hidden={!open}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <ProfileCard name={name} image={image} onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </>
  );
}

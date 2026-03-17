"use client";

import { CampfireLogo } from "@/components/nav/campfire-logo";
import { ProfileCard } from "@/components/nav/profile-card";

export function LeftPanel({ name, image }: { name: string; image?: string | null }) {
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 sticky top-0 h-screen overflow-y-auto py-4 px-3 gap-3">
      {/* Wordmark */}
      <div className="px-1 py-1">
        <CampfireLogo />
      </div>

      {/* Profile island + nav island */}
      <ProfileCard name={name} image={image} />
    </aside>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { LeftPanel } from "@/components/nav/left-panel";
import { RightPanel } from "@/components/nav/right-panel";
import { MobileHeader } from "@/components/nav/mobile-header";
import { MobileNav } from "@/components/nav/mobile-nav";

export const metadata: Metadata = {
  title: { template: "%s — Campfire", default: "Campfire" },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    redirect("/login");
  }

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — identity + nav (desktop only) */}
      <LeftPanel
        name={session.user.name}
        image={session.user.image}
      />

      {/* Centre — mobile header + page content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile-only top bar with profile drawer */}
        <MobileHeader name={session.user.name} image={session.user.image} />

        <main className="flex-1 w-full max-w-2xl px-4 pt-6 pb-20 md:pb-6 md:px-6">
          {children}
        </main>
      </div>

      {/* Right panel — upcoming events (large desktop only) */}
      <RightPanel />

      <MobileNav />
    </div>
  );
}

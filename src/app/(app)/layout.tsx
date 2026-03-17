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
    <div className="min-h-screen">
      {/* Three-column shell — centred max-width container so columns cluster together */}
      <div className="flex min-h-screen w-full max-w-5xl mx-auto">
        {/* Left panel — profile + nav islands (desktop only) */}
        <LeftPanel
          name={session.user.name}
          image={session.user.image}
        />

        {/* Centre — mobile header + page content */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Mobile-only top bar with profile drawer */}
          <MobileHeader name={session.user.name} image={session.user.image} />

          <main className="flex-1 px-4 pt-6 pb-20 md:pb-6 md:px-5">
            {children}
          </main>
        </div>

        {/* Right panel — upcoming events island (large desktop only) */}
        <RightPanel />
      </div>

      <MobileNav />
    </div>
  );
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { LeftPanel } from "@/components/nav/left-panel";
import { RightPanel } from "@/components/nav/right-panel";
import { CampfireLogo } from "@/components/nav/campfire-logo";
import { MobileNav } from "@/components/nav/mobile-nav";

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
        {/* Mobile-only top bar */}
        <header className="flex md:hidden h-12 items-center border-b px-4">
          <CampfireLogo size={18} />
        </header>

        <main className="flex-1 px-4 pt-6 pb-20 md:pb-6 md:px-6">
          {children}
        </main>
      </div>

      {/* Right panel — upcoming events (large desktop only) */}
      <RightPanel />

      <MobileNav />
    </div>
  );
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { AppSidebar } from "@/components/nav/app-sidebar";
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
      {/* Sidebar — desktop only */}
      <AppSidebar
        name={session.user.name}
        image={session.user.image}
      />

      {/* Right side: mobile header + page content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile-only top bar — just the wordmark, bottom nav handles navigation */}
        <header className="flex md:hidden h-12 items-center border-b px-4">
          <Link href="/feed" className="flex items-center gap-1.5 select-none">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                d="M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-5-5-11-5-11z"
                fill="hsl(25, 95%, 52%)"
                opacity="0.9"
              />
              <path
                d="M12 8c0 0-2.5 3.5-2.5 6a2.5 2.5 0 0 0 5 0c0-2.5-2.5-6-2.5-6z"
                fill="hsl(40, 100%, 70%)"
                opacity="0.8"
              />
            </svg>
            <span className="text-base font-bold tracking-tight">Campfire</span>
          </Link>
        </header>

        {/* Page content — pb-16 on mobile clears bottom nav */}
        <main className="flex-1 px-4 pt-6 pb-20 md:pb-6 md:px-6">
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

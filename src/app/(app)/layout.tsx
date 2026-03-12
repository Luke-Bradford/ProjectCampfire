import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { UserMenu } from "@/components/nav/user-menu";
import { NotificationBell } from "@/components/nav/notification-bell";
import { NavLinks } from "@/components/nav/nav-links";
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
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/feed" className="flex items-center gap-1.5 select-none">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <path
                  d="M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-5-5-11-5-11z"
                  fill="hsl(25 95% 52%)"
                  opacity="0.9"
                />
                <path
                  d="M12 8c0 0-2.5 3.5-2.5 6a2.5 2.5 0 0 0 5 0c0-2.5-2.5-6-2.5-6z"
                  fill="hsl(40 100% 70%)"
                  opacity="0.8"
                />
              </svg>
              <span className="text-lg font-bold tracking-tight">Campfire</span>
            </Link>
            {/* Desktop nav — hidden on mobile, bottom bar takes over */}
            <div className="hidden md:flex">
              <NavLinks />
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Notification bell in header only on desktop; mobile uses bottom bar */}
            <div className="hidden md:flex">
              <NotificationBell />
            </div>
            <UserMenu name={session.user.name} />
          </div>
        </div>
      </header>
      {/* pb-16 on mobile so content clears the fixed bottom nav bar */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-6 pb-20 md:pb-6">{children}</main>
      <MobileNav />
    </div>
  );
}

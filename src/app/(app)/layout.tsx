import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { UserMenu } from "@/components/nav/user-menu";
import { NotificationBell } from "@/components/nav/notification-bell";

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
            <Link href="/feed" className="text-lg font-semibold tracking-tight">
              Campfire
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/feed" className="hover:text-foreground">Feed</Link>
              <Link href="/groups" className="hover:text-foreground">Groups</Link>
              <Link href="/friends" className="hover:text-foreground">Friends</Link>
              <Link href="/games" className="hover:text-foreground">Games</Link>
              <Link href="/availability" className="hover:text-foreground">Availability</Link>
              <Link href="/events" className="hover:text-foreground">Events</Link>
              <Link href="/people" className="hover:text-foreground">Find people</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <UserMenu name={session.user.name} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

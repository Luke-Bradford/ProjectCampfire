import Link from "next/link";
import { SidebarNavLinks } from "@/components/nav/sidebar-nav-links";
import { SidebarUserSection } from "@/components/nav/sidebar-user-section";

export function AppSidebar({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r bg-card min-h-screen sticky top-0 h-screen">
      {/* Wordmark */}
      <div className="flex items-center h-14 px-6 border-b shrink-0">
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
              fill="hsl(25, 95%, 52%)"
              opacity="0.9"
            />
            <path
              d="M12 8c0 0-2.5 3.5-2.5 6a2.5 2.5 0 0 0 5 0c0-2.5-2.5-6-2.5-6z"
              fill="hsl(40, 100%, 70%)"
              opacity="0.8"
            />
          </svg>
          <span className="text-lg font-bold tracking-tight">Campfire</span>
        </Link>
      </div>

      {/* Nav links — scrollable if content overflows */}
      <div className="flex-1 overflow-y-auto py-3">
        <SidebarNavLinks />
      </div>

      {/* User section pinned to bottom */}
      <SidebarUserSection name={name} image={image} />
    </aside>
  );
}

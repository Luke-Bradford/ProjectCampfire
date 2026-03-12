import { CampfireLogo } from "@/components/nav/campfire-logo";
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
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r bg-card sticky top-0 h-screen">
      {/* Wordmark */}
      <div className="flex items-center h-14 px-6 border-b shrink-0">
        <CampfireLogo />
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

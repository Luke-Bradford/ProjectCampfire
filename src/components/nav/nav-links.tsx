"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/feed", label: "Feed" },
  { href: "/groups", label: "Groups" },
  { href: "/friends", label: "Friends" },
  { href: "/games", label: "Games" },
  { href: "/availability", label: "Availability" },
  { href: "/events", label: "Events" },
  { href: "/people", label: "Find people" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-4 text-sm text-muted-foreground">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={pathname === href || pathname.startsWith(href + "/")
            ? "text-foreground font-medium"
            : "hover:text-foreground"}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

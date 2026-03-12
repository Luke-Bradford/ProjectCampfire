import Link from "next/link";

export function CampfireLogo({ size = 20 }: { size?: number }) {
  return (
    <Link href="/feed" className="flex items-center gap-1.5 select-none">
      <svg
        width={size}
        height={size}
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
      <span
        className="font-bold tracking-tight"
        style={{ fontSize: size < 20 ? "1rem" : "1.125rem" }}
      >
        Campfire
      </span>
    </Link>
  );
}

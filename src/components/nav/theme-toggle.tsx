"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

const OPTIONS = [
  { value: "light", Icon: Sun, label: "Light" },
  { value: "system", Icon: Monitor, label: "System" },
  { value: "dark", Icon: Moon, label: "Dark" },
] as const;

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  return (
    <div className="flex items-center rounded-md border p-0.5 gap-0.5" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, Icon, label }) => {
        const isActive = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={`flex items-center justify-center rounded p-1.5 transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "AI Settings" },
  { href: "/settings/job-search", label: "Job Search Preferences" },
];

/** Section switcher shown at the top of every settings page. */
export function SettingsTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Settings sections" className="border-border mb-6 flex gap-1 border-b">
      {TABS.map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-primary text-primary" : "text-muted border-transparent hover:text-slate-900",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Master Profile" },
  { href: "/import", label: "Import Resume" },
  { href: "/jobs", label: "Job Descriptions" },
  { href: "/generate", label: "Generate" },
  { href: "/resumes", label: "Resume History" },
  { href: "/settings", label: "AI Settings" },
];

export function AppShell({
  email,
  logoutAction,
  children,
}: {
  email: string;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium",
              active ? "text-primary bg-blue-50" : "text-slate-700 hover:bg-slate-100",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-border bg-surface flex items-center justify-between border-b px-4 py-3 lg:hidden">
        <Link href="/dashboard" className="text-lg font-semibold">
          Cverixa
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
          className="border-border rounded-md border px-3 py-1.5 text-sm"
        >
          Menu
        </button>
      </header>
      {open ? (
        <div id="mobile-nav" className="border-border bg-surface border-b p-3 lg:hidden">
          {nav}
        </div>
      ) : null}
      <aside className="border-border bg-surface hidden w-60 shrink-0 flex-col border-r p-4 lg:flex">
        <Link href="/dashboard" className="mb-6 px-3 text-lg font-semibold">
          Cverixa
        </Link>
        {nav}
        <div className="border-border text-muted mt-auto border-t pt-4 text-xs">
          <p className="truncate" title={email}>
            {email}
          </p>
          <form action={logoutAction} className="mt-2">
            <button type="submit" className="text-sm font-medium text-slate-700 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
        <div className="mt-8 lg:hidden">
          <form action={logoutAction}>
            <button type="submit" className="text-muted text-sm hover:underline">
              Sign out ({email})
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

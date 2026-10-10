"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Categories" },
  { href: "/office", label: "Office" },
  { href: "/leads", label: "Leads" },
  { href: "/bots", label: "Bots" },
  { href: "/workflow", label: "Workflow" },
];

export default function TopNav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-edge bg-black/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center border border-white/30 font-mono text-[11px] font-bold text-white">
            A
          </span>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-white">
            Agency OS
          </span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  active ? "bg-white text-black" : "text-white/55 hover:bg-white/10 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "Home", glyph: "▤" },
  { href: "/yappers", label: "Yappers", glyph: "◆" },
  { href: "/battle", label: "Battle", glyph: "VS" },
  { href: "/submit", label: "+Yap", glyph: "+" },
];

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-ink bg-paper md:hidden">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-col items-center gap-1 border-r border-ink py-2 last:border-r-0",
              active ? "bg-ink text-paper" : "text-muted",
              tab.label === "+Yap" && !active ? "bg-acid text-ink" : "",
            )}
          >
            <span className="font-mono text-[14px] font-bold leading-none">{tab.glyph}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em]">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

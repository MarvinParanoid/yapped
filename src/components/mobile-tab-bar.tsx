"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useD } from "@/lib/i18n/client";

const TABS = [
  { href: "/", key: "home", glyph: "▤" },
  { href: "/yappers", key: "yappers", glyph: "◆" },
  { href: "/battle", key: "battle", glyph: "VS" },
  { href: "/submit", key: "submitShort", glyph: "+" },
] as const;

export function MobileTabBar() {
  const pathname = usePathname();
  const d = useD();
  return (
    <nav className="on-paper fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-ink bg-paper md:hidden">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-col items-center gap-1 border-r border-ink py-2 last:border-r-0",
              active ? "bg-ink text-paper" : "text-muted",
              tab.key === "submitShort" && !active ? "bg-acid text-ink" : "",
            )}
          >
            <span className="font-mono text-[14px] font-bold leading-none">{tab.glyph}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em]">
              {d.nav[tab.key]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

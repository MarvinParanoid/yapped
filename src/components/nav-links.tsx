"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { useD } from "@/lib/i18n/client";

/** `key` indexes the dictionary; the label itself lives there. */
const LINKS = [
  { href: "/?sort=trending", key: "trending", match: (p: string, s: string) => p === "/" && s !== "fresh" && s !== "top" },
  { href: "/?sort=fresh", key: "fresh", match: (p: string, s: string) => p === "/" && s === "fresh" },
  { href: "/?sort=top", key: "top", match: (p: string, s: string) => p === "/" && s === "top" },
  { href: "/yappers", key: "yappers", match: (p: string) => p.startsWith("/yapper") },
  { href: "/cases", key: "cases", match: (p: string) => p.startsWith("/case") },
  { href: "/battle", key: "battle", match: (p: string) => p.startsWith("/battle") },
  { href: "/random", key: "random", match: (p: string) => p.startsWith("/random") },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  const sort = useSearchParams().get("sort") ?? "trending";
  const d = useD();

  return (
    <nav className="-mx-4 flex gap-0 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
      {LINKS.map((link) => {
        const active = link.match(pathname, sort);
        return (
          <Link
            key={link.key}
            href={link.href}
            className={cn(
              "shrink-0 border-r border-ink px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-100 first:pl-0 first:border-l-0 last:border-r-0 hover:text-ink",
              active ? "font-bold text-ink" : "text-muted",
            )}
          >
            {/* Always rendered so switching sections cannot reflow the row. */}
            <span aria-hidden className={cn("text-acid-deep", !active && "opacity-0")}>
              ▸{" "}
            </span>
            {d.nav[link.key]}
          </Link>
        );
      })}
    </nav>
  );
}

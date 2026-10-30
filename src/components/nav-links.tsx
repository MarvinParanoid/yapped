"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useD } from "@/lib/i18n/client";

/** `key` indexes the dictionary; the label itself lives there. */
const LINKS = [
  { href: "/?sort=trending", key: "trending", match: (p: string, s: string) => p === "/" && s !== "fresh" && s !== "top" },
  { href: "/?sort=fresh", key: "fresh", match: (p: string, s: string) => p === "/" && s === "fresh" },
  { href: "/?sort=top", key: "top", match: (p: string, s: string) => p === "/" && s === "top" },
  { href: "/yappers", key: "yappers", match: (p: string) => p.startsWith("/yapper") },
  { href: "/battle", key: "battle", match: (p: string) => p.startsWith("/battle") },
  { href: "/random", key: "random", match: (p: string) => p.startsWith("/random") },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  const sort = useSearchParams().get("sort") ?? "trending";
  const d = useD();

  const scroller = useRef<HTMLElement>(null);
  const activeItem = useRef<HTMLAnchorElement>(null);
  // Which directions still have something in them. Both false on a desktop
  // row that fits, which is how the markers stay off screens that do not
  // need them.
  const [more, setMore] = useState({ before: false, after: false });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const slack = el.scrollWidth - el.clientWidth;
      setMore({
        before: el.scrollLeft > 1,
        after: slack > 1 && el.scrollLeft < slack - 1,
      });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      watch.disconnect();
    };
  }, []);

  // Landing on /battle should not leave you looking at a row that starts at
  // "trending" with no sign of where you are.
  useEffect(() => {
    activeItem.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [pathname, sort]);

  return (
    <div className="relative -mx-4 min-w-0 flex-1 sm:mx-0">
      <nav ref={scroller} className="flex gap-0 overflow-x-auto px-4 sm:px-0 [scrollbar-width:none]">
        {LINKS.map((link) => {
          const active = link.match(pathname, sort);
          return (
            <Link
              key={link.key}
              ref={active ? activeItem : undefined}
              href={link.href}
              aria-current={active ? "page" : undefined}
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

      {/* A hard-edged marker rather than a fade: this interface has no
          gradients in it, and a soft edge would be the only one. It sits on
          solid paper so the row reads as continuing underneath, and it is
          decoration — the row is reachable by swipe, wheel and Tab without it. */}
      {(["before", "after"] as const).map((side) =>
        more[side] ? (
          <span
            key={side}
            aria-hidden
            className={cn(
              "on-paper pointer-events-none absolute inset-y-0 flex items-center bg-paper px-1 font-mono text-[11px] text-muted",
              side === "before" ? "left-0 border-r border-ink/20" : "right-0 border-l border-ink/20",
            )}
          >
            {side === "before" ? "‹" : "›"}
          </span>
        ) : null,
      )}
    </div>
  );
}

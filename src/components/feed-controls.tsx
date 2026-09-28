"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { useD } from "@/lib/i18n/client";
import type { RangeKey, SortKey } from "@/lib/types";

/**
 * The top navigation says which section you are in; this only refines the
 * current one. The two never offer the same choice twice.
 *
 * Neither Trending nor Fresh takes a window. Trending already reaches back two
 * months and ranks by decay — at this archive's volume a 24-hour window would
 * usually be empty — and Fresh is simply ordered by arrival.
 */
const WINDOWS: Record<
  SortKey,
  Array<{ key: RangeKey; dict: "today" | "thisWeek" | "thisMonth" | "allTime" }>
> = {
  trending: [],
  top: [
    { key: "today", dict: "today" },
    { key: "week", dict: "thisWeek" },
    { key: "month", dict: "thisMonth" },
    { key: "all", dict: "allTime" },
  ],
  fresh: [],
};

export function FeedControls({ sort, range }: { sort: SortKey; range: RangeKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const d = useD();

  const windows = WINDOWS[sort];
  if (windows.length === 0) return null;

  function apply(next: RangeKey) {
    const search = new URLSearchParams(params.toString());
    search.set("range", next);
    startTransition(() => router.push(`${pathname}?${search.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex items-center gap-3 border-b border-ink py-2">
      <span className="label shrink-0">{d.sections.window}</span>
      <div
        role="group"
        aria-label={d.sections.feedWindow}
        className={cn("flex", pending && "opacity-60")}
      >
        {windows.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => apply(item.key)}
            aria-pressed={range === item.key}
            className={cn(
              "-ml-px border border-ink px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-100 first:ml-0",
              range === item.key
                ? "bg-ink text-paper"
                : "text-muted hover:bg-paper-3 hover:text-ink",
            )}
          >
            {d.feed[item.dict]}
          </button>
        ))}
      </div>
    </div>
  );
}

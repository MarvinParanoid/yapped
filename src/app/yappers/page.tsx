import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCount } from "@/lib/format";
import { formatAura } from "@/lib/ranking/aura";
import { requireViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { getLeaderboard } from "@/lib/services/yappers";
import type { RangeKey } from "@/lib/types";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Top yappers" };

const TABS: Array<{ key: RangeKey; dict: "allTime" | "thisMonth" | "thisWeek" }> = [
  { key: "all", dict: "allTime" },
  { key: "month", dict: "thisMonth" },
  { key: "week", dict: "thisWeek" },
];

export default async function YappersPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const range: RangeKey = TABS.some((tab) => tab.key === rangeParam)
    ? (rangeParam as RangeKey)
    : "all";
  const { team } = await requireViewer("/yappers");
  const d = await getDictionary();
  const entries = await getLeaderboard(team.id, range, 50);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="quote text-[clamp(2.2rem,6vw,4.2rem)]">{d.feed.topYappers}</h1>
        <p className="label max-w-[28ch] leading-[1.6]">
          {d.feed.rankedByAura}
        </p>
      </div>

      <div className="mt-6 flex">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "/yappers" : `/yappers?range=${tab.key}`}
            className={cn(
              "border border-ink px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-100",
              "-ml-px first:ml-0",
              range === tab.key ? "bg-acid font-bold" : "text-muted hover:bg-paper-3 hover:text-ink",
            )}
          >
            {d.feed[tab.dict]}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={d.sections.noKnownYappers}
            hint={
              range === "all"
                ? "nobody is on the record yet"
                : "nobody said anything in this window"
            }
          />
        </div>
      ) : (
        <div className="mt-8 border border-ink">
          <div className="hidden grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)_70px_80px_110px] items-center gap-4 border-b border-ink bg-paper-2 px-4 py-2 md:grid">
            <span className="label">#</span>
            <span className="label">{d.sections.yapper}</span>
            <span className="label">{d.sections.bestYap}</span>
            <span className="label text-right">{d.sections.yaps}</span>
            <span className="label text-right">{d.profile.certified}</span>
            <span className="label text-right">{d.profile.aura}</span>
          </div>

          <ol>
            {entries.map((entry) => (
              <li key={entry.yapper.id} className="border-b border-ink last:border-b-0">
                <Link
                  href={`/yapper/${entry.yapper.id}`}
                  className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors duration-100 hover:bg-paper-2 md:grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)_70px_80px_110px] md:gap-4"
                >
                  <span
                    className={cn(
                      "mono tabnums text-[13px] font-bold",
                      entry.rank === 1 && "text-ink",
                      entry.rank === 3 && "text-red",
                      entry.rank > 3 && "text-muted",
                    )}
                  >
                    {entry.rank === 1 ? "♔" : `#${entry.rank}`}
                  </span>

                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={entry.yapper.displayName} src={entry.yapper.avatarUrl} size={34} />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold leading-tight">
                        {entry.yapper.displayName}
                      </span>
                      {entry.yapper.title ? (
                        <span className="label block truncate">{entry.yapper.title}</span>
                      ) : null}
                    </span>
                  </span>

                  <span className="hidden min-w-0 md:block">
                    {entry.bestYap ? (
                      <span className="block truncate text-[13px] text-muted">
                        “{entry.bestYap.text}”
                      </span>
                    ) : (
                      <span className="label">—</span>
                    )}
                  </span>

                  <span className="mono tabnums hidden text-right text-[13px] md:block">
                    {formatCount(entry.yapCount)}
                  </span>

                  <span className="mono tabnums hidden text-right text-[13px] md:block">
                    {entry.certifiedCount > 0 ? (
                      <span className="font-bold">{entry.certifiedCount}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </span>

                  <span className="mono tabnums text-right text-[14px] font-bold">
                    {formatAura(entry.totalAura)}
                    <span className="label ml-2 md:hidden">· {entry.yapCount} yaps</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

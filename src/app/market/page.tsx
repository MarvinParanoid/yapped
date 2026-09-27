import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { formatAura } from "@/lib/ranking/aura";
import { MOMENTUM_META } from "@/lib/ranking/momentum";
import { requireViewer } from "@/lib/auth/team";
import { getMarket, type MarketRow } from "@/lib/services/aura-history";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Aura market" };

/**
 * Generous windows on purpose: a handful of statements a week means a 24-hour
 * column would be empty most days.
 */
const WINDOWS = [
  { hours: 24 * 7, label: "7d" },
  { hours: 24 * 30, label: "30d" },
  { hours: 24 * 90, label: "90d" },
];

function percent(value: number | null): string {
  if (value === null) return "from 0";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function Table({ title, rows, empty }: { title: string; rows: MarketRow[]; empty: string }) {
  return (
    <section className="border border-ink">
      <header className="flex items-center justify-between gap-3 border-b border-ink px-3 py-2">
        <span className="label-strong">{title}</span>
        <span className="label">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="label px-3 py-4">{empty}</p>
      ) : (
        <ol>
          {rows.map((row) => (
            <li key={row.id} className="border-b border-ink last:border-b-0">
              <Link
                href={`/yap/${row.id}`}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors duration-100 hover:bg-paper-2"
              >
                <span
                  className={cn(
                    "mono w-[16px] shrink-0 text-[13px]",
                    row.state === "DORMANT" ? "text-muted" : "text-acid-deep",
                  )}
                >
                  {MOMENTUM_META[row.state].mark}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">“{row.text}”</span>
                  <span className="label">
                    {row.author.displayName} · {row.code}
                  </span>
                </span>
                <span className="mono tabnums hidden w-[86px] shrink-0 text-right text-[12px] text-muted sm:block">
                  {row.delta > 0 ? `+${formatCount(row.delta)}` : "—"}
                </span>
                <span className="mono tabnums w-[74px] shrink-0 text-right text-[14px] font-bold">
                  {row.state === "NEW" ? "NEW" : percent(row.percent)}
                </span>
                <span className="mono tabnums hidden w-[74px] shrink-0 text-right text-[14px] sm:block">
                  {formatAura(row.now)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const { window: windowParam } = await searchParams;
  const selected =
    WINDOWS.find((entry) => String(entry.hours) === windowParam) ?? WINDOWS[1];
  const { team } = await requireViewer("/market");
  const market = await getMarket(team.id, selected.hours);

  const up = market.indexPercent !== null && market.indexPercent > 0;

  return (
    <article>
      <div className="on-ink grid-ghost border-b border-ink">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <span className="label">Aura market · entirely meaningless</span>
          <h1 className="quote mt-4 text-[clamp(2.2rem,7vw,4.6rem)] text-paper">Yap index</h1>

          <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <span
                className={cn(
                  "mono tabnums block text-[clamp(2rem,5vw,3.4rem)] font-bold leading-none",
                  up ? "text-acid" : "text-paper",
                )}
              >
                {/* Nothing to compare against yet: report the total rather than
                    a percentage of zero. */}
                {market.indexPercent === null
                  ? formatAura(market.indexNow)
                  : percent(market.indexPercent)}
              </span>
              <span className="label mt-2 block">
                {market.indexPercent === null
                  ? "the whole record so far"
                  : `over ${selected.label}`}
              </span>
            </div>
            <div>
              <span className="mono tabnums block text-[22px] font-bold leading-none text-paper">
                {market.indexPercent === null
                  ? formatCount(market.tracked)
                  : formatAura(market.indexNow)}
              </span>
              <span className="label mt-2 block">
                {market.indexPercent === null
                  ? `${market.tracked === 1 ? "record" : "records"} listed`
                  : `from ${formatAura(market.indexThen)} · ${formatCount(market.tracked)} listed`}
              </span>
            </div>
          </div>

          <div className="mt-6 flex">
            {WINDOWS.map((entry) => (
              <Link
                key={entry.hours}
                href={`/market?window=${entry.hours}`}
                className={cn(
                  "-ml-px border border-paper/30 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-100 first:ml-0",
                  entry.hours === selected.hours
                    ? "bg-acid text-ink"
                    : "text-muted-dark hover:bg-paper hover:text-ink",
                )}
              >
                {entry.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
        {market.tracked === 0 ? (
          <EmptyState title="NO LISTINGS." hint="the archive has nothing to trade" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <Table
                title={`Movers — ${selected.label}`}
                rows={market.movers}
                empty="nothing moved in this window"
              />
            </div>
            <Table
              title="New listings"
              rows={market.newcomers}
              empty="no records filed in this window"
            />
            <Table
              title="Dormant"
              rows={market.dormant}
              empty="everything got at least one reaction"
            />
          </div>
        )}

        <p className="label mt-8 text-center leading-[1.6]">
          aura is reconstructed from reaction timestamps · a record can only gain, so there is
          no crash to report · yap responsibly
        </p>
      </div>
    </article>
  );
}

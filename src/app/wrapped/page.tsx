import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/lib/auth/team";
import { listPeriods, periodLabel, periodSlug } from "@/lib/services/wrapped";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Wrapped" };

export default async function WrappedIndexPage() {
  const { team } = await requireViewer("/wrapped");
  const periods = await listPeriods(team.id);
  const years = periods.filter((period) => period.month === null);
  const months = periods.filter((period) => period.month !== null);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">Periodic self-assessment</span>
          <h1 className="quote mt-2 text-[clamp(2rem,6vw,4rem)]">Wrapped</h1>
        </div>
        <p className="label max-w-[34ch] leading-[1.6]">
          what the organization said, quantified after the fact.
        </p>
      </div>

      {periods.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="NOTHING TO WRAP UP." hint="the record is still empty" />
        </div>
      ) : (
        <>
          {years.length > 0 ? (
            <section className="mt-8">
              <h2 className="label-strong border-b border-ink pb-2">By year</h2>
              <div className="mt-4 grid gap-px bg-ink sm:grid-cols-2 lg:grid-cols-3">
                {years.map((period) => (
                  <Link
                    key={period.year}
                    href={periodSlug(period)}
                    className="on-ink grid-ghost px-5 py-8 transition-opacity duration-100 hover:opacity-85"
                  >
                    <span className="quote block text-[clamp(1.8rem,4vw,2.8rem)] text-paper">
                      {period.year}
                    </span>
                    <span className="label mt-2 block">the whole year →</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="label-strong border-b border-ink pb-2">By month</h2>
            <ol className="mt-4 border border-ink">
              {months.map((period, index) => (
                <li key={`${period.year}-${period.month}`}>
                  <Link
                    href={periodSlug(period)}
                    className={cn(
                      "flex items-center justify-between gap-4 border-b border-ink px-4 py-3 transition-colors duration-100 hover:bg-paper-2",
                      index === months.length - 1 && "border-b-0",
                    )}
                  >
                    <span className="text-[16px] font-bold">{periodLabel(period)}</span>
                    <span className="label">open →</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { listPeriods, periodLabel, periodSlug } from "@/lib/services/wrapped";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDictionary();
  return { title: d.pageTitles.wrapped };
}

export default async function WrappedIndexPage() {
  const { team } = await requireViewer("/wrapped");
  const d = await getDictionary();
  const periods = await listPeriods(team.id, team.timezone);
  const years = periods.filter((period) => period.month === null);
  const months = periods.filter((period) => period.month !== null);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">{d.wrapped.selfAssessment}</span>
          <h1 className="quote mt-2 text-[clamp(2rem,6vw,4rem)]">{d.wrapped.heading}</h1>
        </div>
        <p className="label max-w-[34ch] leading-[1.6]">
          {d.wrapped.quantified}
        </p>
      </div>

      {periods.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={d.empty.nothingToWrap} hint={d.empty.nothingToWrapHint} />
        </div>
      ) : (
        <>
          {years.length > 0 ? (
            <section className="mt-8">
              <h2 className="label-strong border-b border-ink pb-2">{d.wrapped.byYear}</h2>
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
                    <span className="label mt-2 block">{d.wrapped.wholeYear} →</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="label-strong border-b border-ink pb-2">{d.wrapped.byMonth}</h2>
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
                    <span className="label">{d.wrapped.open} →</span>
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

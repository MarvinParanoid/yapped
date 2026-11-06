import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatCount, formatLocalDate } from "@/lib/format";
import { fill, plural } from "@/lib/i18n/locale";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import type { IncidentReport } from "@/lib/services/incidents";
import type { QuietSpell } from "@/lib/services/incidents";

/**
 * The department's status line, above the feed.
 *
 * Two cells, one border, no hero: the current reading of the situation and a
 * pointer at last week's file. The full yapper-of-the-week block used to live
 * here and now lives inside the report, so the homepage names the winner and
 * stops — a feed that opens with five cards is a dashboard, and this is an
 * archive.
 */
export async function OversightStrip({
  quiet,
  report,
  timeZone,
}: {
  quiet: QuietSpell | null;
  report: IncidentReport | null;
  timeZone: string;
}) {
  const [d, locale] = await Promise.all([getDictionary(), getLocale()]);
  const months = d.profile.months.split(" ");
  const reportHref = report
    ? `/reports/weekly/${report.week.isoYear}/${String(report.week.isoWeek).padStart(2, "0")}`
    : "/reports/weekly";

  return (
    <section className="grid border border-ink sm:grid-cols-2">
      {/* The counter. */}
      <div className="min-w-0 border-b border-ink px-3 py-3 sm:border-b-0 sm:border-r">
        <span className="label-strong">{d.incidents.daysWithout}</span>
        {quiet ? (
          <>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={cn(
                  "mono tabnums text-[32px] font-bold leading-none",
                  quiet.days === 0 ? "text-red" : "text-acid-deep",
                )}
              >
                {formatCount(quiet.days)}
              </span>
              <span className="label-strong min-w-0 break-words">
                {d.incidents[quiet.situation]}
              </span>
            </div>
            <p className="label mt-2">
              {fill(d.incidents.lastIncident, {
                date: formatLocalDate(quiet.lastIncident, timeZone, months),
              })}
            </p>
          </>
        ) : (
          <>
            <p className="quote mt-2 text-[clamp(1rem,3vw,1.3rem)]">{d.incidents.neverAny}</p>
            <p className="label mt-2">{d.incidents.neverAnyNote}</p>
          </>
        )}
      </div>

      {/* Last week's file. */}
      <Link
        href={reportHref}
        className="group flex min-w-0 flex-col justify-between gap-2 px-3 py-3 transition-colors duration-100 hover:bg-paper-2"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="label-strong">{d.report.title}</span>
          {report ? (
            <span className="label tabnums">
              {fill(d.report.weekOf, { week: report.week.isoWeek, year: report.week.isoYear })}
            </span>
          ) : null}
        </span>

        {report ? (
          <span className="label mt-1 block min-w-0 break-words">
            {fill(
              plural(locale, report.registered, [
                d.sections.recordCountOne,
                d.sections.recordCountFew,
                d.sections.recordCountMany,
              ]),
              { n: report.registered },
            )}
            {report.ruling?.winner ? ` · ${report.ruling.winner.displayName}` : ""}
          </span>
        ) : (
          <span className="label mt-1 block">{d.report.notOnFileNote}</span>
        )}

        <span className="label-strong mt-1 block text-acid-deep">{d.report.open} →</span>
      </Link>
    </section>
  );
}

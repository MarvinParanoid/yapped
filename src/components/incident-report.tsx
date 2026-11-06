import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Panel } from "@/components/ui/panel";
import { YapperOfTheWeek } from "@/components/yapper-of-the-week";
import { cn } from "@/lib/cn";
import { formatCount, formatLocalDate } from "@/lib/format";
import { fill, plural } from "@/lib/i18n/locale";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { formatAura } from "@/lib/ranking/aura";
import type { IncidentReport } from "@/lib/services/incidents";

/**
 * WEEKLY INCIDENT REPORT — a department's own paperwork about a week.
 *
 * Deliberately a form, not a dashboard: a header block of figures, four
 * captioned sections and a signature line. No medals, no confetti and no
 * second accent colour — the joke is entirely in the register of the words,
 * and furniture that winks would ruin it.
 */
export async function IncidentReportView({ report }: { report: IncidentReport }) {
  const [d, locale] = await Promise.all([getDictionary(), getLocale()]);
  const zone = report.timeZone;
  const months = d.profile.months.split(" ");
  const since = formatLocalDate(report.from, zone, months);
  // The last instant of the period rather than its exclusive end, so the label
  // reads Sunday and not the Monday the week is over on.
  const until = formatLocalDate(new Date(report.to.getTime() - 1), zone, months);

  const weekHref = (week: { isoYear: number; isoWeek: number }) =>
    `/reports/weekly/${week.isoYear}/${String(week.isoWeek).padStart(2, "0")}`;

  const movement = report.movement;
  const figures = [
    {
      value: formatCount(report.registered),
      label: d.report.registered,
      note: d.report.byEntry,
    },
    { value: formatCount(report.speakers), label: d.report.speakers, note: null },
    { value: formatCount(report.reactions), label: d.report.reactions, note: null },
    {
      // No percentage against an empty week: "infinitely more than nothing" is
      // not a figure, so the absolute change is printed instead.
      value: movement.baseless
        ? "—"
        : movement.percent === null
          ? `${movement.delta >= 0 ? "+" : ""}${formatCount(movement.delta)}`
          : `${movement.percent > 0 ? "+" : ""}${movement.percent.toFixed(0)}%`,
      label: d.report.versusPrevious,
      note: movement.baseless
        ? d.report.noBaseline
        : movement.direction === "FLAT"
          ? d.report.flat
          : fill(
              plural(locale, Math.abs(movement.delta), [
                d.sections.recordCountOne,
                d.sections.recordCountFew,
                d.sections.recordCountMany,
              ]),
              { n: `${movement.delta >= 0 ? "+" : "−"}${Math.abs(movement.delta)}` },
            ),
    },
  ];

  return (
    <article>
      {/* A. The reporting period. */}
      <div className="on-ink grid-ghost border-b border-ink">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <span className="label">{d.report.department}</span>
          <h1 className="quote mt-3 text-[clamp(2rem,6vw,3.6rem)] text-paper">{d.report.title}</h1>

          <p className="label mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="label-strong">
              {fill(d.report.weekOf, { week: report.week.isoWeek, year: report.week.isoYear })}
            </span>
            <span className="tabnums">
              {since} — {until}
            </span>
            <span
              className={cn(
                "border px-1.5 py-0.5",
                report.status === "FINAL" ? "border-muted-dark" : "border-acid text-acid",
              )}
            >
              {d.report[report.status]}
            </span>
          </p>

          {report.status === "PROVISIONAL" ? (
            <p className="label mt-3 max-w-[52ch] leading-[1.6] text-acid">
              {fill(d.report.provisionalNote, {
                date: formatLocalDate(report.closesAt, zone, months),
              })}
            </p>
          ) : null}

          {/* B. The figures. */}
          <dl className="mt-8 grid grid-cols-2 border-l border-t border-paper/20 lg:grid-cols-4">
            {figures.map((cell) => (
              <div
                key={cell.label}
                className="min-w-0 border-b border-r border-paper/20 px-3 py-4 sm:px-4"
              >
                <dd className="mono tabnums text-[24px] font-bold leading-none text-acid sm:text-[28px]">
                  {cell.value}
                </dd>
                <dt className="label mt-2 break-words">{cell.label}</dt>
                {cell.note ? <p className="label mt-1 break-words normal-case">{cell.note}</p> : null}
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-8 pb-20 sm:px-6 lg:px-8">
        {/* C. The title, and D. the loudest thing on the intake. */}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            {report.ruling ? (
              <YapperOfTheWeek ruling={report.ruling} />
            ) : (
              <Panel label={d.weekly.title}>
                <p className="quote text-[clamp(1rem,3.4vw,1.4rem)]">{d.weekly.noSubject}</p>
                <p className="label mt-2 leading-[1.5]">{d.weekly.committee}</p>
              </Panel>
            )}
          </div>

          <div className="min-w-0">
            <Panel label={d.report.loudest}>
              {report.loudest ? (
                <>
                  <Link href={`/yap/${report.loudest.id}`} className="block hover:opacity-80">
                    {/* Original wording, always. The archive's materials are not
                        translated — see AGENTS.md. */}
                    <p className="quote text-[clamp(1.1rem,2.4vw,1.6rem)]">
                      “{report.loudest.text}”
                    </p>
                  </Link>
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <Link
                      href={`/yapper/${report.loudest.author.id}`}
                      className="flex min-w-0 items-center gap-2 hover:opacity-80"
                    >
                      <Avatar
                        name={report.loudest.author.displayName}
                        src={report.loudest.author.avatarUrl}
                        size={22}
                      />
                      <span className="truncate text-[13px] font-semibold">
                        {report.loudest.author.displayName}
                      </span>
                    </Link>
                    <span className="mono text-[12px] font-bold">
                      {formatAura(report.loudest.aura)} · {report.loudest.code}
                    </span>
                  </div>
                  <p className="label mt-3 leading-[1.5]">
                    {report.loudest.measuredAt === "DEADLINE"
                      ? d.report.loudestAtClose
                      : d.report.loudestNow}
                  </p>
                </>
              ) : (
                <>
                  <p className="quote text-[clamp(1rem,3.4vw,1.4rem)]">
                    {d.report.nothingRegistered}
                  </p>
                  <p className="label mt-2 leading-[1.5]">{d.report.nothingRegisteredNote}</p>
                </>
              )}
            </Panel>
          </div>
        </div>

        {/* E. The findings. */}
        <Panel label={d.report.conclusion}>
          <p className="text-[clamp(1rem,2.2vw,1.35rem)] leading-[1.5]">
            {d.report[report.verdict]}
          </p>
          <p className="label mt-4 leading-[1.6]">{d.report.computedNote}</p>
        </Panel>

        <nav className="flex items-center justify-between gap-3 border border-ink px-3 py-2">
          {report.earlier ? (
            <Link href={weekHref(report.earlier)} className="label-strong hover:text-acid-deep">
              ← {d.report.earlier}
            </Link>
          ) : (
            <span />
          )}
          {report.later ? (
            <Link href={weekHref(report.later)} className="label-strong hover:text-acid-deep">
              {d.report.later} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </article>
  );
}

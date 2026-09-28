import type { Metadata } from "next";
import Link from "next/link";
import { YapCard } from "@/components/yap-card";
import { requireViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { formatDate } from "@/lib/format";
import { formatAura } from "@/lib/ranking/aura";
import { getOnThisDay } from "@/lib/services/on-this-day";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "On this day" };

/** `?date=YYYY-MM-DD` walks the calendar; the default is today. */
function parseDate(raw: string | undefined): Date {
  if (!raw) return new Date();
  const parsed = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function shiftDays(date: Date, days: number): string {
  const next = new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

export default async function OnThisDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const { user, team } = await requireViewer("/on-this-day");
  const d = await getDictionary();
  const report = await getOnThisDay(team.id, parseDate(dateParam), user.id);
  const today = report.date;

  return (
    <article>
      <div className="on-ink grid-ghost border-b border-ink">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <span className="label">{d.feed.onThisDay}</span>
          <h1 className="quote mt-4 text-[clamp(2.4rem,8vw,5rem)] text-paper">
            {today.getUTCDate()} {d.profile.months.split(" ")[today.getUTCMonth()]}
          </h1>
          <p className="label mt-3">
            {report.anniversaries.length > 0
              ? `what was said around this time in ${report.anniversaries
                  .map((entry) => entry.year)
                  .join(", ")}`
              : "this time of year, in earlier years"}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href={`/on-this-day?date=${shiftDays(today, -1)}`} className="btn">
              ← Day before
            </Link>
            <Link href={`/on-this-day?date=${shiftDays(today, 1)}`} className="btn">
              Day after →
            </Link>
            {dateParam ? (
              <Link href="/on-this-day" className="btn">
                Today
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
        {report.anniversaries.length === 0 ? (
          <div className="border border-ink bg-paper-2 px-6 py-16 text-center">
            <p className="quote text-[clamp(1.4rem,3.6vw,2.4rem)]">
              The archive is too young.
            </p>
            <p className="label mt-4 leading-[1.6]">
              {report.archiveStart
                ? `the record begins ${formatDate(report.archiveStart)}. nothing was said within a week of this date in any earlier year — this page fills itself in as the archive ages.`
                : "nothing has been said yet."}
            </p>
            {report.firstAnniversary ? (
              <p className="label mt-2">
                first anniversary: {formatDate(report.firstAnniversary)}
              </p>
            ) : null}
            <div className="mt-8 flex justify-center">
              <Link href="/" className="btn">
                Back to the archive
              </Link>
            </div>
          </div>
        ) : (
          report.anniversaries.map((entry) => (
            <section key={entry.year} className="mb-12 last:mb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink pb-2">
                <h2 className="quote text-[clamp(1.4rem,3vw,2rem)]">
                  {entry.exact
                    ? `${entry.yearsAgo} ${entry.yearsAgo === 1 ? "year" : "years"} ago`
                    : d.sections.aroundThisTime}
                </h2>
                <span className="label">
                  {entry.year} · {entry.records.length}{" "}
                  {entry.records.length === 1 ? "record" : "records"}
                </span>
              </div>

              <div className="mt-6">
                {entry.records.map((record) => (
                  <div key={record.id}>
                    <YapCard yap={record} viewerId={user?.id} emphasis="standard" />
                    {/* Aura is reconstructed from reaction timestamps, so the
                        archive can show what a statement was worth back then. */}
                    <div className="-mt-px flex flex-wrap items-center gap-x-6 gap-y-1 border border-ink bg-paper-2 px-4 py-2">
                      <span className="label">
                        <span className="mono font-bold text-ink">{record.daysAgo}</span> days ago
                        {record.offsetDays === 0 ? " · to the day" : ""}
                      </span>
                      <span className="label">
                        aura that day{" "}
                        <span className="mono ml-1 font-bold text-ink">
                          {formatAura(record.auraThen)}
                        </span>
                      </span>
                      <span className="label">
                        today{" "}
                        <span className="mono ml-1 font-bold text-ink">
                          {formatAura(record.aura)}
                        </span>
                      </span>
                      <span className="label">
                        witnesses since{" "}
                        <span className="mono ml-1 font-bold text-ink">
                          {record.witnessCount}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </article>
  );
}

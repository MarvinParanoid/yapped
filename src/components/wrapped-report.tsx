import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { Dictionary } from "@/lib/i18n/en";
import { fill, plural } from "@/lib/i18n/locale";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { formatCount } from "@/lib/format";
import { formatAura } from "@/lib/ranking/aura";
import { periodSlug, type WrappedPeriod, type WrappedReport } from "@/lib/services/wrapped";

/** A dry remark sized to how little happened. */
function quietRemark(count: number, d: Dictionary): string {
  if (count === 1) return d.wrapped.oneStatement;
  if (count <= 3) return d.wrapped.professionalStretch;
  if (count <= 6) return d.wrapped.professionalMonth;
  return d.wrapped.restraint;
}

function Slab({
  value,
  label,
  tone = "paper",
  size = "lg",
  className,
  href,
}: {
  value: string;
  label: string;
  tone?: "paper" | "acid" | "ink";
  size?: "lg" | "sm";
  className?: string;
  href?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "mono tabnums block font-bold leading-[0.9]",
          size === "lg"
            ? "text-[clamp(2.2rem,6vw,4.2rem)]"
            : "text-[clamp(1.5rem,3.4vw,2.1rem)]",
        )}
      >
        {value}
      </span>
      <span className={cn("label block", size === "lg" ? "mt-3" : "mt-2")}>{label}</span>
    </>
  );
  // The slab grids use a 1px ink gap, so every slab needs its own background —
  // without one the gap colour shows through and the figure disappears.
  const classes = cn(
    "block border border-ink transition-colors duration-100",
    size === "lg" ? "px-5 py-6" : "px-4 py-5",
    tone === "paper" && "bg-paper",
    tone === "acid" && "bg-acid",
    tone === "ink" && "on-ink",
    href && "hover:bg-paper-2",
    className,
  );
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export async function WrappedReportView({
  report,
  previous,
  next,
}: {
  report: WrappedReport;
  previous: WrappedPeriod | null;
  next: WrappedPeriod | null;
}) {
  const [d, locale] = await Promise.all([getDictionary(), getLocale()]);
  const empty = report.yapCount === 0;
  const peakLoad = Math.max(...report.hours, 1);

  return (
    <article>
      <div className="on-ink grid-ghost border-b border-ink">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <span className="label">{d.wrapped.kicker}</span>
            <Link href="/wrapped" className="label hover:text-acid">
              {d.wrapped.allPeriods} →
            </Link>
          </div>

          <h1 className="quote mt-4 text-[clamp(2.4rem,9vw,6rem)] text-paper">{report.label}</h1>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {previous ? (
              <Link href={periodSlug(previous)} className="btn">
                ← {d.wrapped.earlier}
              </Link>
            ) : null}
            {next ? (
              <Link href={periodSlug(next)} className="btn">
                Later →
              </Link>
            ) : null}
            {report.period.month !== null ? (
              <Link href={`/wrapped/${report.period.year}`} className="btn">
                The whole of {report.period.year}
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
        {empty ? (
          <div className="border border-ink bg-paper-2 px-6 py-16 text-center">
            <p className="quote text-[clamp(1.4rem,3.4vw,2.2rem)]">{d.wrapped.noStatements}</p>
            <p className="label mt-4 leading-[1.6]">
              {d.wrapped.sparseBody}
            </p>
          </div>
        ) : report.sparse ? (
          /* A quiet period gets a short, dry entry rather than a dashboard of
             single digits. */
          <div className="border border-ink">
            <div className="grid gap-px bg-ink sm:grid-cols-2">
              <Slab value={formatCount(report.yapCount)} label={d.wrapped.yapsRecorded} />
              <Slab value={formatAura(report.totalAura)} label={d.wrapped.auraGenerated} tone="acid" />
            </div>
            <div className="border-t border-ink px-5 py-8 text-center">
              <p className="label">{d.wrapped.insufficient}</p>
              <p className="quote mt-3 text-[clamp(1.2rem,2.8vw,1.9rem)]">
                {quietRemark(report.yapCount, d)}
              </p>
            </div>
            {report.yapOfThePeriod ? (
              <Link
                href={`/yap/${report.yapOfThePeriod.id}`}
                className="block border-t border-ink px-5 py-6 hover:bg-paper-2"
              >
                <span className="label">{d.wrapped.onlyOne}</span>
                <p className="quote mt-3 text-[clamp(1.2rem,3vw,2rem)]">
                  “{report.yapOfThePeriod.text}”
                </p>
                <p className="label mt-3">
                  {report.yapOfThePeriod.author} · {formatAura(report.yapOfThePeriod.aura)} aura
                </p>
              </Link>
            ) : null}
            <p className="label border-t border-ink px-5 py-3 text-center">
              {formatCount(report.activeYappers)}{" "}
              {fill(plural(locale, report.activeYappers, [d.wrapped.peopleOne, d.wrapped.peopleFew, d.wrapped.peopleMany]), { n: formatCount(report.activeYappers) })} contributed ·{" "}
              {formatCount(report.witnessCount)} witnesses · full reports need{" "}
              {10} records
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-px bg-ink sm:grid-cols-2">
              <Slab value={formatCount(report.yapCount)} label={d.wrapped.yapsRecorded} />
              <Slab value={formatAura(report.totalAura)} label={d.wrapped.auraGenerated} tone="acid" />
            </div>

            {report.yapOfThePeriod ? (
              <Link
                href={`/yap/${report.yapOfThePeriod.id}`}
                className="on-ink grid-ghost mt-6 block border border-ink px-5 py-8 sm:px-8 sm:py-12"
              >
                <span className="label">{d.wrapped.yapOfPeriod}</span>
                <p className="quote mt-4 text-[clamp(1.6rem,5vw,3.4rem)] text-paper">
                  “{report.yapOfThePeriod.text}”
                </p>
                <p className="mt-5 flex flex-wrap items-baseline gap-4">
                  <span className="text-[17px] font-bold text-paper">
                    — {report.yapOfThePeriod.author}
                  </span>
                  <span className="mono text-[17px] font-bold text-acid">
                    {formatAura(report.yapOfThePeriod.aura)} aura
                  </span>
                  <span className="label">{report.yapOfThePeriod.code}</span>
                </p>
              </Link>
            ) : null}

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {report.topYapper ? (
                <Link
                  href={`/yapper/${report.topYapper.yapper.id}`}
                  className="flex items-center gap-5 border border-ink px-5 py-6 transition-colors duration-100 hover:bg-paper-2"
                >
                  <Avatar
                    name={report.topYapper.yapper.displayName}
                    src={report.topYapper.yapper.avatarUrl}
                    size={64}
                  />
                  <div className="min-w-0">
                    <span className="label">{d.wrapped.topYapper}</span>
                    <p className="quote mt-1.5 text-[clamp(1.5rem,3.4vw,2.4rem)]">
                      {report.topYapper.yapper.displayName}
                    </p>
                    <p className="label mt-1.5">
                      {formatAura(report.topYapper.aura)} aura from{" "}
                      {formatCount(report.topYapper.yapCount)}{" "}
                      {fill(plural(locale, report.topYapper.yapCount, [d.wrapped.statementsOne, d.wrapped.statementsFew, d.wrapped.statementsMany]), { n: formatCount(report.topYapper.yapCount) })}
                    </p>
                  </div>
                </Link>
              ) : null}

            </div>

            {/* When the yapping actually happens. */}
            <section className="mt-6 border border-ink">
              <header className="flex items-center justify-between gap-3 border-b border-ink px-3 py-2">
                <span className="label-strong">{d.wrapped.peakHour}</span>
                <span className="mono text-[13px] font-bold">
                  {report.peakHour === null
                    ? "—"
                    : `${String(report.peakHour).padStart(2, "0")}:00 — ${String(
                        (report.peakHour + 1) % 24,
                      ).padStart(2, "0")}:00`}
                </span>
              </header>
              <div className="px-4 py-5">
                <div className="flex h-[92px] items-end gap-[2px]">
                  {report.hours.map((count, hour) => (
                    <div
                      key={hour}
                      title={`${String(hour).padStart(2, "0")}:00 — ${count}`}
                      className={cn(
                        "flex-1 border border-ink",
                        count === 0
                          ? "bg-transparent"
                          : hour === report.peakHour
                            ? "bg-acid"
                            : "bg-ink",
                      )}
                      style={{ height: `${Math.max(4, (count / peakLoad) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between">
                  {["00:00", "06:00", "12:00", "18:00", "23:59"].map((mark) => (
                    <span key={mark} className="label">
                      {mark}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <div className="mt-6 grid grid-cols-2 gap-px bg-ink sm:grid-cols-3 lg:grid-cols-6">
              <Slab size="sm" value={formatCount(report.certifiedCount)} label={d.wrapped.certified} />
              <Slab
                size="sm"
                value={formatCount(report.disputedCount)}
                label={d.wrapped.disputed}
                className={cn(report.disputedCount > 0 && "text-red")}
              />
              <Slab size="sm" value={formatCount(report.witnessCount)} label={d.wrapped.witnesses} />
              <Slab size="sm" value={formatCount(report.battleCount)} label={d.wrapped.battles} />
              <Slab size="sm" value={formatCount(report.evidenceCount)} label={d.wrapped.evidence} />
              <Slab size="sm" value={formatCount(report.newYappers)} label={d.wrapped.newYappers} />
            </div>

            <p className="label mt-8 text-center">
              {fill(d.wrapped.contributors, { n: formatCount(report.activeYappers) })} ·{" "}
              {fill(d.wrapped.loreCarries, { n: formatCount(report.loreCount) })} ·{" "}
              {d.feed.motto}
            </p>
          </>
        )}
      </div>
    </article>
  );
}

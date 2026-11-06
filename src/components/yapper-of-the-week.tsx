import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { FormerMark } from "@/components/ui/former-mark";
import { fill, plural } from "@/lib/i18n/locale";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { formatAura } from "@/lib/ranking/aura";
import type { WeeklyRulingView } from "@/lib/services/weekly";

/**
 * Section C of the weekly report: the one decision in it that is on file.
 *
 * The caption carries the distinction the whole report turns on — this block
 * counts by when things were *said*, while everything above it counts by when
 * they were *entered*. A reader who does not know that will read the two
 * figures as a contradiction.
 *
 * A week with nobody in it keeps the same frame rather than disappearing: the
 * committee sat either way, and saying so is the joke.
 */
export async function YapperOfTheWeek({ ruling }: { ruling: WeeklyRulingView }) {
  const [d, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { winner } = ruling;

  return (
    <section className="border border-ink">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-ink px-3 py-2">
        <span className="label-strong">{d.weekly.title}</span>
        <span className="label">{d.report.bySpeech}</span>
      </header>

      {winner ? (
        <>
          <Link
            href={`/yapper/${winner.id}`}
            className="flex items-center gap-3 px-3 py-3 transition-colors duration-100 hover:bg-paper-2"
          >
            <Avatar name={winner.displayName} src={winner.avatarUrl} size={40} />
            {/* `min-w-0`: without it a long name keeps its min-content width
                and pushes the whole strip past the edge of a phone. */}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-[16px] font-bold leading-tight">
                  {winner.displayName}
                </span>
                {ruling.winnerFormer ? <FormerMark label={d.employment.former} /> : null}
              </span>
              <span className="label mt-1 block">
                {fill(
                  plural(locale, ruling.recordCount, [
                    d.weekly.groundsOne,
                    d.weekly.groundsFew,
                    d.weekly.groundsMany,
                  ]),
                  { n: ruling.recordCount },
                )}{" "}
                · {formatAura(ruling.aura)} {d.profile.aura.toLowerCase()}
              </span>
            </span>
            <span className="label hidden shrink-0 text-ink sm:block">
              {d.weekly.openFile} →
            </span>
          </Link>
          <p className="label border-t border-ink px-3 py-2 leading-[1.5]">{d.weekly.subtitle}</p>
        </>
      ) : (
        <div className="px-3 py-4">
          <p className="quote text-[clamp(1rem,3.4vw,1.4rem)]">{d.weekly.noSubject}</p>
          <p className="label mt-2 leading-[1.5]">{d.weekly.committee}</p>
        </div>
      )}
    </section>
  );
}

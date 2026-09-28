import type { Metadata } from "next";
import Link from "next/link";
import { BattleArena } from "@/components/battle-arena";
import { requireViewer } from "@/lib/auth/team";
import { fill } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/server";
import { formatCount } from "@/lib/format";
import {
  MIN_ARENA_RECORDS,
  distinctPairs,
  getArenaState,
  getBattleCount,
} from "@/lib/services/battles";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDictionary();
  return { title: d.pageTitles.battle };
}

export default async function BattlePage({
  searchParams,
}: {
  searchParams: Promise<{ not?: string }>;
}) {
  const { not } = await searchParams;
  const exclude = (not ?? "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  const { user, team } = await requireViewer("/battle");
  const d = await getDictionary();
  const [arena, battles] = await Promise.all([
    getArenaState(team.id, user.id, exclude),
    getBattleCount(team.id),
  ]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">Yap battle · {formatCount(battles)} votes cast</span>
          <h1 className="quote mt-2 text-[clamp(2rem,5.5vw,3.6rem)]">{d.feed.battlePrompt}</h1>
        </div>
        <Link href="/battle/hall" className="btn">
          Hall of Yap →
        </Link>
      </div>

      <div className="mt-8">
        {arena.open ? (
          <BattleArena
            left={arena.pair[0]}
            right={arena.pair[1]}
            signedIn={Boolean(user)}
            rounds={Math.min(10, distinctPairs(MIN_ARENA_RECORDS + 2))}
          />
        ) : (
          /* Two ways the arena stays shut, and they are different problems: too
             few records to ask anything, or this person has answered every
             question there is. */
          <div className="border border-ink bg-paper-2 px-6 py-16 text-center">
            <p className="quote text-[clamp(1.4rem,3.6vw,2.4rem)]">
              {arena.reason === "thin" ? d.sections.fieldTooThin : d.sections.allJudged}
            </p>
            <p className="label mx-auto mt-4 max-w-[52ch] leading-[1.6]">
              {arena.reason === "thin"
                ? fill(d.sections.fieldTooThinBody, {
                    min: MIN_ARENA_RECORDS,
                    n: formatCount(arena.records),
                    needed: formatCount(arena.needed),
                  })
                : fill(d.sections.allJudgedBody, { n: formatCount(arena.records) })}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/submit" className="btn btn-acid">
                {d.sections.fileAYap} →
              </Link>
              <Link href="/" className="btn">
                {d.sections.backToArchive}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BattleArena } from "@/components/battle-arena";
import { requireViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { formatCount } from "@/lib/format";
import {
  MIN_ARENA_RECORDS,
  distinctPairs,
  getArenaState,
  getBattleCount,
} from "@/lib/services/battles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Yap battle" };

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
          /* One possible pair is not a tournament: every vote would re-ask the
             same question and the ratings would just oscillate. */
          <div className="border border-ink bg-paper-2 px-6 py-16 text-center">
            <p className="quote text-[clamp(1.4rem,3.6vw,2.4rem)]">{d.sections.fieldTooThin}</p>
            <p className="label mx-auto mt-4 max-w-[52ch] leading-[1.6]">
              the arena needs at least {MIN_ARENA_RECORDS} records to ask a question worth
              answering. there {arena.records === 1 ? "is" : "are"} {formatCount(arena.records)}
              {arena.records === 1 ? " record" : " records"} on file —{" "}
              {formatCount(arena.needed)} more and it opens.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/submit" className="btn btn-acid">
                File a yap →
              </Link>
              <Link href="/" className="btn">
                Back to the archive
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { getHallOfYap } from "@/lib/services/battles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hall of Yap" };

export default async function HallOfYapPage() {
  const { team } = await requireViewer("/battle/hall");
  const d = await getDictionary();
  const entries = await getHallOfYap(team.id, 25);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">{d.sections.rankedByElo}</span>
          <h1 className="quote mt-2 text-[clamp(2rem,6vw,4rem)]">{d.profile.hallOfYap}</h1>
        </div>
        <Link href="/battle" className="btn btn-acid">
          {d.feed.enterArena} →
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={d.empty.noBattles} hint={d.sections.startBattle} />
        </div>
      ) : (
        <ol className="mt-8 border border-ink">
          {entries.map((entry) => (
            <li key={entry.id} className="border-b border-ink last:border-b-0">
              <Link
                href={`/yap/${entry.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors duration-100 hover:bg-paper-2"
              >
                <span
                  className={cn(
                    "mono tabnums w-8 shrink-0 text-[13px] font-bold",
                    entry.rank > 3 ? "text-muted" : "text-ink",
                  )}
                >
                  {entry.rank === 1 ? "♔" : `#${entry.rank}`}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold sm:text-[17px]">
                    “{entry.text}”
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <Avatar name={entry.author.displayName} src={entry.author.avatarUrl} size={16} />
                    <span className="label">{entry.author.displayName}</span>
                    <span className="label">· {entry.code}</span>
                  </span>
                </span>
                <span className="hidden shrink-0 text-right sm:block">
                  <span className="label block">
                    {entry.wins}w / {entry.losses}l
                  </span>
                  <span className="label block">
                    {entry.winRate === null ? "—" : `${Math.round(entry.winRate * 100)}% win rate`}
                  </span>
                </span>
                <span className="mono tabnums w-[64px] shrink-0 text-right text-[16px] font-bold">
                  {entry.rating}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

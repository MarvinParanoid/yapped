import type { Metadata } from "next";
import Link from "next/link";
import { GetYappedAgain } from "@/components/get-yapped-again";
import { QuoteText } from "@/components/quote-text";
import { ReactionBar } from "@/components/reaction-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { requireViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { formatCount, formatDate } from "@/lib/format";
import { formatAura } from "@/lib/ranking/aura";
import { getArchiveStats, getRandomYap } from "@/lib/services/yaps";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDictionary();
  return { title: d.pageTitles.randomYap };
}

export default async function RandomPage({
  searchParams,
}: {
  searchParams: Promise<{ not?: string }>;
}) {
  const { not } = await searchParams;
  const exclude = Number(not);
  const { user, team } = await requireViewer("/random");
  const d = await getDictionary();
  const months = d.profile.months.split(" ");
  const [yap, stats] = await Promise.all([
    getRandomYap(team.id, user.id, Number.isInteger(exclude) ? exclude : undefined),
    getArchiveStats(team.id),
  ]);

  if (!yap) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6 lg:px-8">
        <EmptyState
          title="NOTHING TO YAP."
          hint="the archive is empty"
          action={
            <Link href="/submit" className="btn btn-acid">
              {d.sections.fileFirstYap} →
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="on-ink grid-ghost flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <span className="label">Random yap · {yap.code}</span>
          <Link href={`/yap/${yap.id}`} className="label hover:text-acid">
            {d.feed.openRecord} →
          </Link>
        </div>

        {/* Optically off-centre: the quote sits above the middle, not on it. */}
        <div className="flex flex-1 flex-col justify-center py-10 sm:py-14">
          <div className="max-w-[18ch] sm:max-w-none">
            <Link href={`/yap/${yap.id}`}>
              <QuoteText text={yap.text} scale="detail" className="text-paper" />
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <Link
              href={`/yapper/${yap.author.id}`}
              className="text-[19px] font-bold hover:text-acid sm:text-[22px]"
            >
              — {yap.author.displayName}
            </Link>
            <span className="mono text-[13px] text-muted-dark">{formatDate(yap.saidAt, months)}</span>
            <span className="mono tabnums text-[19px] font-bold text-acid">
              {formatAura(yap.aura)} <span className="label">{d.record.auraUnit}</span>
            </span>
          </div>

          <div className="mt-8">
            <ReactionBar
              isAuthor={yap.author.id === user.id}
              yapId={yap.id}
              counts={yap.counts}
              viewerReactions={yap.viewerReactions}
              aura={yap.aura}
              size="lg"
              showAura={false}
              signedIn={Boolean(user)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-paper/20 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <GetYappedAgain currentId={yap.id} />
          <div className="flex items-center gap-4">
            <span className="label">
              1 / {formatCount(stats.yapCount)} · {d.feed.pressSpace}
            </span>
            <span className="label">{d.feed.motto}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

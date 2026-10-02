import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Stamp } from "@/components/ui/stamp";
import { VerificationBadge } from "@/components/ui/verification-badge";
import { QuoteText } from "@/components/quote-text";
import { ReactionBar } from "@/components/reaction-bar";
import { YapMenu } from "@/components/yap-menu";
import { archivalNote, isDisputed, type Emphasis } from "@/lib/archival";
import { fill, plural } from "@/lib/i18n/locale";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { MOMENTUM_META } from "@/lib/ranking/momentum";
import type { Momentum } from "@/lib/services/aura-history";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { YapView } from "@/lib/types";

/**
 * One record, three weights. Emphasis comes from the data (lib/archival.ts):
 * the loudest entries get room and a stamp, the quiet ones collapse into a
 * ledger row, so the feed reads as an archive rather than a table.
 */
export async function YapCard({
  yap,
  viewerId,
  viewerModerates = false,
  emphasis = "standard",
  momentum,
}: {
  yap: YapView;
  viewerId?: string | null;
  /** Moderators may correct and redact anything here, same as the service says. */
  viewerModerates?: boolean;
  emphasis?: Emphasis;
  /** Only passed on Trending, and only rendered when it says something. */
  momentum?: Momentum;
}) {
  const evidence = yap.evidence[0];
  const note = archivalNote(yap);
  const [d, locale] = await Promise.all([getDictionary(), getLocale()]);
  const months = d.profile.months.split(" ");
  // The menu used to offer these to the submitter only, while editYap and
  // softDeleteYap have always accepted a moderator too — the interface was
  // quietly stricter than the rule it was drawn from.
  const canManage = yap.submittedBy?.id === viewerId || viewerModerates;
  // Steady and dormant records say nothing — an indicator on every card is
  // noise, not information.
  const moving =
    momentum && (momentum.state === "NEW" || momentum.state === "RISING" || momentum.state === "REEMERGING")
      ? momentum
      : null;

  if (emphasis === "compact") {
    return (
      <article className="group relative -mt-px border border-ink bg-paper px-4 py-3 transition-colors duration-100 hover:bg-paper-2">
        <div className="flex items-baseline gap-3">
          <span className="mono shrink-0 text-[11px] tracking-[0.1em] text-muted">{yap.code}</span>
          <Link href={`/yap/${yap.id}`} className="min-w-0 flex-1">
            <QuoteText text={yap.text} scale="compact" />
          </Link>
          <div className="shrink-0">
            <YapMenu yapId={yap.id} code={yap.code} canEdit={canManage} canDelete={canManage} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href={`/yapper/${yap.author.id}`}
            className="text-[12px] font-semibold hover:underline"
          >
            — {yap.author.displayName}
          </Link>
          <span className="label">{formatDate(yap.saidAt, months)}</span>
          <div className="ml-auto">
            <ReactionBar
              yapId={yap.id}
              counts={yap.counts}
              viewerReactions={yap.viewerReactions}
              aura={yap.aura}
              size="compact"
              signedIn={Boolean(viewerId)}
              isAuthor={yap.author.id === viewerId}
            />
          </div>
        </div>
      </article>
    );
  }

  const feature = emphasis === "feature";

  return (
    <article
      className={cn(
        // No overflow clipping here: the "+N AURA" float has to be able to rise
        // past the card edge. The evidence column clips itself.
        "group relative -mt-px border border-ink bg-paper transition-colors duration-100 hover:bg-paper-2",
        // A thick rail is the ledger's way of flagging an entry.
        feature && "border-l-[5px]",
      )}
    >
      <div className="flex">
        <div className="min-w-0 flex-1 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex items-center gap-3">
            <Link
              href={`/yap/${yap.id}`}
              className="mono text-[11px] tracking-[0.1em] text-muted hover:text-ink"
            >
              {yap.code}
            </Link>
            {feature ? null : (
              <VerificationBadge
                verification={yap.verification}
                witnesses={yap.witnessCount}
              />
            )}
            {note ? (
              <span className={cn("label", isDisputed(note) && "text-red")}>
                {d.note[note]}
              </span>
            ) : null}
            {moving ? (
              <span className="label" title={fill(d.feed.auraOverWindow, { n: moving.delta })}>
                {MOMENTUM_META[moving.state].mark}{" "}
                {moving.state === "NEW"
                  ? d.feed.momentumNew
                  : moving.percent === null
                    ? `+${moving.delta}`
                    : `${Math.round(moving.percent)}%`}
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-3">
              {feature && yap.verification === "CERTIFIED" ? (
                <Stamp>
                  {`${d.record.certifiedStamp} · ${fill(
                    plural(locale, yap.witnessCount, [
                      d.note.witnessOne,
                      d.note.witnessFew,
                      d.note.witnessMany,
                    ]),
                    { n: yap.witnessCount },
                  )}`}
                </Stamp>
              ) : null}
              <YapMenu yapId={yap.id} code={yap.code} canEdit={canManage} canDelete={canManage} />
            </div>
          </div>

          <Link href={`/yap/${yap.id}`} className={cn("block", feature ? "mt-4" : "mt-3")}>
            <QuoteText text={yap.text} scale={feature ? "feature" : "feed"} />
          </Link>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={`/yapper/${yap.author.id}`}
              className={cn(
                "flex items-center gap-2 font-semibold hover:underline",
                feature ? "text-[15px]" : "text-[13px]",
              )}
            >
              <Avatar
                name={yap.author.displayName}
                src={yap.author.avatarUrl}
                size={feature ? 24 : 20}
              />
              — {yap.author.displayName}
            </Link>
            <span className="label">{formatDate(yap.saidAt, months)}</span>
          </div>

          {/* A line of lore changes the card's rhythm without unfolding it. */}
          {yap.lore ? (
            <Link
              href={`/yap/${yap.id}`}
              className="mt-3 flex items-baseline gap-2 border-l-2 border-ink/25 pl-3 transition-colors duration-100 hover:border-ink"
            >
              <span className="line-clamp-1 max-w-[58ch] text-[13px] italic leading-[1.5] text-muted">
                {yap.lore}
              </span>
              <span className="label shrink-0">{d.record.viewLore} ↓</span>
            </Link>
          ) : null}

          <div className={cn(feature ? "mt-5" : "mt-4")}>
            <ReactionBar
              yapId={yap.id}
              counts={yap.counts}
              viewerReactions={yap.viewerReactions}
              aura={yap.aura}
              size={feature ? "feature" : "sm"}
              signedIn={Boolean(viewerId)}
              isAuthor={yap.author.id === viewerId}
            />
          </div>
        </div>

        {evidence ? (
          <Link
            href={`/yap/${yap.id}`}
            className={cn(
              "relative hidden shrink-0 overflow-hidden border-l border-ink sm:block",
              feature ? "w-[180px] lg:w-[230px]" : "w-[150px] lg:w-[190px]",
            )}
            aria-label={d.record.evidence}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={evidence.url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-left-top"
              loading="lazy"
            />
            <span className="absolute bottom-0 left-0 right-0 border-t border-ink bg-ink px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-paper">
              Evidence #01
            </span>
          </Link>
        ) : null}
      </div>
    </article>
  );
}

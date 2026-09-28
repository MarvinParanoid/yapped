import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordAura } from "@/components/record-aura";
import { fill, plural } from "@/lib/i18n/locale";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { EvidencePanel } from "@/components/evidence-panel";
import { DisputePanel } from "@/components/dispute-panel";
import { LorePanel } from "@/components/lore-panel";
import { WitnessPanel } from "@/components/witness-panel";
import { QuoteText } from "@/components/quote-text";
import { ReactionBar } from "@/components/reaction-bar";
import { TagList } from "@/components/tag-list";
import { YapCard } from "@/components/yap-card";
import { YapMenu } from "@/components/yap-menu";
import { YappedConfirmation } from "@/components/yapped-confirmation";
import { Avatar } from "@/components/ui/avatar";
import { Stamp } from "@/components/ui/stamp";
import { VerificationBadge } from "@/components/ui/verification-badge";
import { getViewer, requireViewer } from "@/lib/auth/team";
import { formatCount, formatDate, formatStamp } from "@/lib/format";
import { getYapBattleRecord } from "@/lib/services/battles";
import {
  getRelatedYaps,
  getYap,
  getYapSummary,
  listWitnesses,
  recordView,
} from "@/lib/services/yaps";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  // Metadata renders before the page redirects an outsider, so it resolves the
  // viewer softly and says nothing about a team it cannot see.
  const viewer = await getViewer();
  if (!viewer) return { title: "Yapped." };
  const yap = await getYapSummary(Number(id), viewer.team.id);
  // Raised here as well as in the page so the response carries a real 404.
  if (!yap) notFound();
  const d = await getDictionary();
  return {
    title: `“${yap.text}” — ${yap.author}`,
    description: yap.lore ?? d.pageTitles.onRecordShort,
    openGraph: {
      title: `“${yap.text}”`,
      description: `— ${yap.author}`,
    },
  };
}

export default async function YapDetailPage({ params, searchParams }: Params) {
  const { id } = await params;
  const yapId = Number(id);
  if (!Number.isInteger(yapId)) notFound();

  const { user, team } = await requireViewer(`/yap/${id}`);
  const [d, locale] = await Promise.all([getDictionary(), getLocale()]);
  const yap = await getYap(yapId, team.id, user.id);
  if (!yap) notFound();

  const [related, battleRecord, witnesses, query] = await Promise.all([
    getRelatedYaps(team.id, yap.author.id, yap.id, 3, user.id),
    getYapBattleRecord(yap.id, team.id),
    listWitnesses(yap.id, team.id),
    searchParams,
  ]);
  const isAuthor = yap.author.id === user.id;
  // Runs once the response is sent, instead of a floating promise that can
  // outlive the render and hold a connection open.
  after(() => recordView(yap.id, team.id));

  const evidence = yap.evidence[0];

  return (
    <article>
      {/* Hero inverts to ink: the detail page is the archive's dark room. */}
      <div className="on-ink grid-ghost border-b border-ink">
        <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="label hover:text-acid">
              ← {d.record.back}
            </Link>
            <span className="mono text-[11px] tracking-[0.1em] text-muted-dark">{yap.code}</span>
            {/* The record's own page is where certification gets the stamp. */}
            {yap.verification === "CERTIFIED" ? (
              <Stamp className="ml-1">
                {`${d.record.certifiedStamp} · ${fill(
                  plural(locale, yap.witnessCount, [
                    d.note.witnessOne,
                    d.note.witnessFew,
                    d.note.witnessMany,
                  ]),
                  { n: yap.witnessCount },
                )}`}
              </Stamp>
            ) : (
              <VerificationBadge
                verification={yap.verification}
                witnesses={yap.witnessCount}
                context="record"
                className="text-muted-dark"
              />
            )}
            <div className="ml-auto">
              <YapMenu yapId={yap.id} code={yap.code} canDelete={yap.submittedBy?.id === user?.id} />
            </div>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
            <div>
              <h1>
                <QuoteText text={yap.text} scale="detail" />
              </h1>
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link
                  href={`/yapper/${yap.author.id}`}
                  className="flex items-center gap-2.5 text-[17px] font-bold hover:text-acid"
                >
                  <Avatar name={yap.author.displayName} src={yap.author.avatarUrl} size={28} />
                  — {yap.author.displayName}
                </Link>
                <span className="mono text-[12px] text-muted-dark">
                  {formatDate(yap.saidAt, d.profile.months.split(" "))}
                </span>
                {yap.disputedAt ? (
                  <span className="label-strong text-red">
                    ✕ {fill(d.verification.deniedBy, { name: yap.author.displayName })}
                  </span>
                ) : yap.acknowledgedAt ? (
                  <span className="label-strong text-acid">
                    ✓ {fill(d.verification.acknowledgedBy, { name: yap.author.displayName })}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="border-t border-paper/20 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <RecordAura yapId={yap.id} initial={yap.aura} />
            </div>
          </div>

          <div className="mt-8">
            <ReactionBar
              isAuthor={isAuthor}
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
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        {query.yapped ? <YappedConfirmation /> : null}

        <div
          className={
            evidence
              ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
              : "grid items-start gap-6"
          }
        >
          <div className="flex flex-col gap-6">
            {yap.lore ? <LorePanel lore={yap.lore} defaultOpen /> : null}
            <DisputePanel
              yapId={yap.id}
              authorName={yap.author.displayName}
              isAuthor={isAuthor}
              disputed={Boolean(yap.disputedAt)}
              statement={yap.disputeStatement}
              witnessCount={yap.witnessCount}
            />
            <WitnessPanel
              yapId={yap.id}
              authorName={yap.author.displayName}
              authorHasAccount={yap.author.hasAccount}
              isAuthor={isAuthor}
              acknowledged={Boolean(yap.acknowledgedAt)}
              disputed={Boolean(yap.disputedAt)}
              verification={yap.verification}
              witnessCount={yap.witnessCount}
              denialCount={yap.denialCount}
              stance={yap.viewerStance}
              witnesses={witnesses.map((entry) => ({
                user: entry.user,
                stance: entry.stance,
              }))}
              signedIn={Boolean(user)}
            />
          </div>
          {evidence ? <EvidencePanel evidence={evidence} /> : null}
        </div>

        {yap.tags.length > 0 ? (
          <div className="mt-6 flex flex-wrap items-center gap-3 border border-ink px-3 py-3">
            <span className="label">{d.record.tags}</span>
            {yap.tags.map((tag) => (
              <Link
                key={tag.slug}
                href={`/?tag=${encodeURIComponent(tag.slug)}`}
                className="border border-ink px-2 py-1 font-mono text-[11px] transition-colors duration-100 hover:bg-ink hover:text-paper"
              >
                #{tag.label}
              </Link>
            ))}
          </div>
        ) : null}

        {/* Pseudo-archival metadata. Understated on purpose. */}
        <dl className="mt-6 grid grid-cols-2 border-l border-t border-ink sm:grid-cols-3 lg:grid-cols-5">
          <div className="border-b border-r border-ink px-3 py-3">
            <dt className="label">{d.record.submittedBy}</dt>
            <dd className="mt-1.5 text-[13px] font-semibold">
              {yap.submittedBy ? (
                <Link href={`/yapper/${yap.submittedBy.id}`} className="underline underline-offset-2">
                  {yap.submittedBy.displayName}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="border-b border-r border-ink px-3 py-3">
            <dt className="label">{d.record.archivedAt}</dt>
            <dd className="mono mt-1.5 text-[13px]">{formatStamp(yap.createdAt)}</dd>
          </div>
          <div className="border-b border-r border-ink px-3 py-3">
            <dt className="label">{d.record.classification}</dt>
            <dd className="mono mt-1.5 text-[13px] underline decoration-dotted underline-offset-4">
              {d.sections[yap.classification]}
            </dd>
          </div>
          <div className="border-b border-r border-ink px-3 py-3">
            <dt className="label">{d.record.verification}</dt>
            <dd className="mono mt-1.5 text-[13px]">{d.verification[yap.verification]}</dd>
          </div>
          <div className="border-b border-r border-ink px-3 py-3">
            <dt className="label">{d.record.views}</dt>
            <dd className="mono tabnums mt-1.5 text-[13px]">{formatCount(yap.viewCount)}</dd>
          </div>
        </dl>

        {/* Battle history, so the arena and the Hall stop being an island. */}
        <section className="mt-6 border border-ink">
          <header className="flex items-center justify-between gap-3 border-b border-ink px-3 py-2">
            <span className="label-strong">{d.sections.battleRecord}</span>
            <Link href="/battle/hall" className="label hover:text-ink">
              {d.profile.hallOfYap} →
            </Link>
          </header>
          <div className="grid gap-px bg-ink sm:grid-cols-4">
            <div className="bg-paper px-3 py-3">
              <span className="label">
                {d.sections.wins} / {d.sections.losses}
              </span>
              <p className="mono tabnums mt-1.5 text-[19px] font-bold leading-none">
                {battleRecord.wins} <span className="text-muted">/</span>{" "}
                {battleRecord.losses}
              </p>
            </div>
            <div className="bg-paper px-3 py-3">
              <span className="label">{d.sections.elo}</span>
              <p className="mono tabnums mt-1.5 text-[19px] font-bold leading-none">
                {battleRecord.rating}
              </p>
            </div>
            <div className="bg-paper px-3 py-3">
              <span className="label">{d.sections.peak}</span>
              <p className="mono tabnums mt-1.5 text-[19px] font-bold leading-none">
                {battleRecord.peak}
              </p>
            </div>
            <div className="bg-paper px-3 py-3">
              <span className="label">{d.sections.lastBattle}</span>
              {battleRecord.last ? (
                <p className="mt-1.5 text-[12px] leading-[1.4]">
                  <span className={battleRecord.last.won ? "font-bold" : "font-bold text-red"}>
                    {battleRecord.last.won ? d.sections.won : d.sections.lost}
                  </span>{" "}
                  <span className="mono">
                    {battleRecord.last.delta > 0 ? "+" : ""}
                    {battleRecord.last.delta} elo
                  </span>
                  <br />
                  <Link
                    href={`/yap/${battleRecord.last.opponentId}`}
                    className="text-muted hover:text-ink"
                  >
                    vs “{battleRecord.last.opponentText.slice(0, 28)}
                    {battleRecord.last.opponentText.length > 28 ? "…" : ""}”
                  </Link>
                </p>
              ) : (
                <p className="label mt-1.5">{d.sections.neverFought}</p>
              )}
            </div>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/yap/${yap.id}/share`} className="btn">
            {d.sections.shareCardShort} ↗
          </Link>
          <Link href="/random" className="btn">
            {d.sections.randomYap} →
          </Link>
        </div>

        {related.length > 0 ? (
          <section className="mt-12">
            <h2 className="label-strong border-b border-ink pb-2">
              More from the same mouth — {yap.author.displayName}
            </h2>
            <div className="mt-6">
              {related.map((item) => (
                <YapCard key={item.id} yap={item} viewerId={user?.id} emphasis="standard" />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { YapCard } from "@/components/yap-card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { assignEmphasis } from "@/lib/archival";
import { getViewer, requireViewer } from "@/lib/auth/team";
import { cn } from "@/lib/cn";
import { formatCount, formatDate } from "@/lib/format";
import { formatAura } from "@/lib/ranking/aura";
import { listYaps } from "@/lib/services/yaps";
import { getYapperName, getYapperProfile } from "@/lib/services/yappers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) return { title: "Yapped." };
  const name = await getYapperName(id, viewer.team.id);
  if (!name) notFound();
  return { title: name };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export default async function YapperPage({ params }: Params) {
  const { id } = await params;
  const { user, team } = await requireViewer(`/yapper/${id}`);
  const profile = await getYapperProfile(id, team.id);
  if (!profile) notFound();

  const yaps = await listYaps({
    teamId: team.id,
    authorId: id,
    sort: "fresh",
    take: 50,
    viewerId: user.id,
  });
  const emphasis = assignEmphasis(yaps);

  const since = profile.yappingSince;
  // Six figures, because "said it" and "filed it" are different jobs and the
  // archive should be able to tell you who is really the team's archivist.
  const headline = [
    { value: formatCount(profile.stats.yapCount), label: "Yaps said", zero: profile.stats.yapCount === 0 },
    {
      value: formatCount(profile.stats.filedCount),
      label: "Records filed",
      zero: profile.stats.filedCount === 0,
    },
    { value: formatAura(profile.stats.totalAura), label: "Aura", zero: profile.stats.totalAura === 0 },
    {
      value: formatCount(profile.stats.certifiedCount),
      label: "Certified",
      zero: profile.stats.certifiedCount === 0,
    },
    {
      value: formatCount(profile.stats.acknowledgedCount),
      label: "Acknowledged",
      zero: profile.stats.acknowledgedCount === 0,
    },
    {
      value: formatCount(profile.stats.disputedCount),
      label: "Disputed",
      alert: profile.stats.disputedCount > 0,
      zero: profile.stats.disputedCount === 0,
    },
  ];

  return (
    <div>
      {/* Dossier header. */}
      <div className="on-ink grid-ghost border-b border-ink">
        <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-5">
              <Avatar
                name={profile.yapper.displayName}
                src={profile.yapper.avatarUrl}
                size={84}
                className="border-paper/30"
              />
              <div className="min-w-0">
                <span className="label-strong text-acid">
                  {profile.title.label}
                  {profile.rank ? ` · #${profile.rank}` : ""}
                </span>
                <h1 className="quote mt-2 text-[clamp(2rem,5.5vw,3.6rem)] text-paper">
                  {profile.yapper.displayName}
                </h1>
                <p className="label mt-2">
                  {profile.yapper.handle ? `@${profile.yapper.handle} · ` : ""}
                  {since
                    ? `yapping since ${MONTHS[since.getUTCMonth()]} ${since.getUTCFullYear()}`
                    : "no statements on record"}
                </p>
              </div>
            </div>

            <p className="label max-w-[34ch] leading-[1.6] lg:text-right">
              {profile.title.blurb}
            </p>
          </div>

          {/* The four numbers that matter, in the archive's own voice. */}
          <dl className="mt-8 grid grid-cols-2 border-l border-t border-paper/20 sm:grid-cols-3 lg:grid-cols-6">
            {headline.map((cell) => (
              <div key={cell.label} className="border-b border-r border-paper/20 px-4 py-4">
                <dd
                  className={cn(
                    "mono tabnums text-[24px] font-bold leading-none sm:text-[28px]",
                    cell.zero ? "text-muted-dark" : cell.alert ? "text-red" : "text-acid",
                  )}
                >
                  {cell.value}
                </dd>
                <dt className="label mt-2">{cell.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <Panel label="Peak yap">
            {profile.bestYap ? (
              <Link href={`/yap/${profile.bestYap.id}`} className="block hover:opacity-80">
                <p className="quote text-[clamp(1.1rem,2.2vw,1.5rem)]">
                  “{profile.bestYap.text}”
                </p>
                <p className="mono mt-3 text-[12px] font-bold">
                  {formatAura(profile.bestYap.aura)} aura · {profile.bestYap.code}
                </p>
              </Link>
            ) : (
              <p className="label">nothing on record yet</p>
            )}
          </Panel>

          <Panel label="Battle record">
            <div className="flex items-baseline gap-4">
              <span className="mono tabnums text-[30px] font-bold leading-none">
                {profile.stats.battleWins}
                <span className="text-muted">W</span> / {profile.stats.battleLosses}
                <span className="text-muted">L</span>
              </span>
            </div>
            <dl className="mt-4 space-y-1.5">
              <div className="flex justify-between">
                <dt className="label">Peak elo</dt>
                <dd className="mono tabnums text-[13px] font-bold">{profile.stats.peakElo || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label">Hall of Yap</dt>
                <dd className="mono tabnums text-[13px] font-bold">
                  {profile.stats.hallRank ? (
                    <Link href="/battle/hall" className="hover:underline">
                      #{profile.stats.hallRank}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="label">Witnesses gathered</dt>
                <dd className="mono tabnums text-[13px]">{profile.stats.witnessedCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label">Testimony given</dt>
                <dd className="mono tabnums text-[13px]">{profile.stats.testimonyGiven}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label">Average aura / yap</dt>
                <dd className="mono tabnums text-[13px]">{formatAura(profile.stats.averageAura)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel label="Known associates" bodyClassName="p-0">
            {profile.associates.length === 0 ? (
              <p className="label px-3 py-4">no corroborating witnesses on file</p>
            ) : (
              <ul>
                {profile.associates.map((entry) => (
                  <li key={entry.user.id}>
                    <Link
                      href={`/yapper/${entry.user.id}`}
                      className="flex items-center gap-2.5 border-b border-ink px-3 py-2 last:border-b-0 hover:bg-paper-2"
                    >
                      <Avatar name={entry.user.displayName} src={entry.user.avatarUrl} size={22} />
                      <span className="flex-1 truncate text-[13px] font-semibold">
                        {entry.user.displayName}
                      </span>
                      <span className="label">
                        {entry.count} {entry.count === 1 ? "room" : "rooms"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        {/* These arrive as the person earns them rather than announcing that
            they have not. */}
        {profile.topTags.length > 0 || profile.badges.length > 0 ? (
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
            {profile.topTags.length > 0 ? (
              <Panel
                label="Frequent vocabulary"
                className="lg:col-span-2"
                bodyClassName="px-3 py-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                  {profile.topTags.map((tag, index) => (
                    <Link
                      key={tag.slug}
                      href={`/?tag=${encodeURIComponent(tag.slug)}`}
                      className={cn(
                        "font-mono transition-colors duration-100 hover:text-acid-deep",
                        index === 0
                          ? "text-[18px] font-bold"
                          : index < 3
                            ? "text-[14px] font-bold"
                            : "text-[12px] text-muted",
                      )}
                    >
                      #{tag.label}
                      <span className="ml-1 text-[10px] opacity-50">{tag.count}</span>
                    </Link>
                  ))}
                </div>
              </Panel>
            ) : null}

            {profile.badges.length > 0 ? (
              <Panel label="Achievements" bodyClassName="p-0">
                <ul>
                  {profile.badges.map((badge) => (
                    <li
                      key={badge.key}
                      className="border-b border-ink px-3 py-2 last:border-b-0"
                    >
                      <span className="label-strong">{badge.label}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        ) : null}

        <section className="mt-12">
          <h2 className="label-strong border-b border-ink pb-2">
            From the same mouth — {formatCount(yaps.length)} statements
            {profile.stats.filedCount > profile.stats.yapCount ? (
              <span className="label ml-3 normal-case tracking-normal">
                (files more than they say — the team&apos;s archivist)
              </span>
            ) : null}
          </h2>
          <div className="mt-6">
            {yaps.length === 0 ? (
              <EmptyState
                title="NOTHING ON RECORD."
                hint="this one has said nothing quotable. yet."
              />
            ) : (
              yaps.map((yap) => (
                <YapCard
                  key={yap.id}
                  yap={yap}
                  viewerId={user.id}
                  emphasis={emphasis.get(yap.id)}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

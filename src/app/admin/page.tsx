import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentTable, RedactedTable } from "@/components/admin/content-table";
import { InviteManager } from "@/components/admin/invite-manager";
import { MemberTable } from "@/components/admin/member-table";
import { RenameTeam, TeamTimezone } from "@/components/admin/team-settings";
import { Panel } from "@/components/ui/panel";
import { requireTeamAdmin } from "@/lib/auth/team";
import { fill } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/server";
import { formatCount, formatDate } from "@/lib/format";
import { listInvites } from "@/lib/services/invites";
import { getTeamOverview, listMembers } from "@/lib/services/teams";
import { listRedacted, listYaps } from "@/lib/services/yaps";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDictionary();
  return { title: d.pageTitles.administration };
}

export default async function AdminPage() {
  const viewer = await requireTeamAdmin("/admin");
  const teamId = viewer.team.id;
  // Ownership is the line for changing who else is in the room; the instance
  // operator crosses it too, because someone has to be able to fix a team that
  // locked itself out.
  const canManage = viewer.team.role === "OWNER" || viewer.user.isAdmin;
  const d = await getDictionary();
  const months = d.profile.months.split(" ");

  const [overview, members, invites, recent, redacted] = await Promise.all([
    getTeamOverview(teamId),
    listMembers(teamId),
    listInvites(teamId),
    listYaps({ teamId, sort: "fresh", take: 30 }),
    listRedacted(teamId, 25),
  ]);
  if (!overview) notFound();

  const live = invites.filter((invite) => invite.deadReason === null).length;
  const figures = [
    { value: formatCount(overview.memberCount), label: d.admin.members },
    { value: formatCount(overview.accountCount), label: d.admin.withAccounts },
    { value: formatCount(overview.yapCount), label: d.admin.records },
    { value: formatCount(live), label: d.admin.liveInvites },
  ];

  return (
    <div>
      <div className="on-ink grid-ghost border-b border-ink">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <span className="label">
            {d.admin.administration} · {d.admin[viewer.team.role].toLowerCase()}
            {viewer.user.isAdmin ? (
              <>
                {" · "}
                <Link href="/admin/instance" className="hover:text-acid">
                  {d.admin.everyArchive}
                </Link>
              </>
            ) : null}
          </span>
          <h1 className="quote mt-3 text-[clamp(2rem,6vw,3.6rem)] text-paper">{overview.name}</h1>
          <p className="label mt-3">
            {fill(d.admin.openedOn, { date: formatDate(overview.createdAt, months) })} · /{overview.slug}
          </p>

          <dl className="mt-8 grid grid-cols-2 border-l border-t border-paper/20 sm:grid-cols-4">
            {figures.map((cell) => (
              <div key={cell.label} className="border-b border-r border-paper/20 px-4 py-4">
                <dd className="mono tabnums text-[24px] font-bold leading-none text-acid sm:text-[28px]">
                  {cell.value}
                </dd>
                <dt className="label mt-2">{cell.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-8 pb-20 sm:px-6 lg:px-8">
        <Panel label={d.admin.inviteLinks} bodyClassName="p-0">
          <InviteManager invites={invites} showAuthor />
        </Panel>

        <Panel label={fill(d.admin.membersCount, { n: formatCount(members.length) })} bodyClassName="p-0">
          <MemberTable members={members} canManage={canManage} viewerId={viewer.user.id} />
        </Panel>

        <Panel label={d.admin.recentRecords} bodyClassName="p-0">
          <ContentTable
            rows={recent.map((yap) => ({
              id: yap.id,
              code: yap.code,
              text: yap.text,
              lore: yap.lore,
              author: yap.author.displayName,
              saidAt: yap.saidAt,
            }))}
          />
        </Panel>

        <Panel label={d.admin.redacted} bodyClassName="p-0">
          <RedactedTable rows={redacted} />
        </Panel>

        <Panel label={d.admin.thisTeam}>
          <RenameTeam name={overview.name} />
          <div className="mt-5 border-t border-ink pt-5">
            <TeamTimezone timezone={viewer.team.timezone} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

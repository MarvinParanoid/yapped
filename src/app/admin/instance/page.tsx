import type { Metadata } from "next";
import Link from "next/link";
import { EnterTeam } from "@/components/admin/enter-team";
import { CreateTeam } from "@/components/admin/team-settings";
import { Panel } from "@/components/ui/panel";
import { requireOperator } from "@/lib/auth/team";
import { formatCount, formatDate } from "@/lib/format";
import { listOwners, listTeamOverviews } from "@/lib/services/teams";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Instance" };

/**
 * The operator's view: every archive on this box, who owns it, and a way in.
 *
 * "A way in" is the whole point — entering a team points the team cookie at it,
 * and from there every ordinary page works, including that team's /admin. It is
 * deliberately not a second, parallel set of screens.
 */
export default async function InstancePage() {
  const viewer = await requireOperator("/admin/instance");
  const teams = await listTeamOverviews();
  const owners = await listOwners(teams.map((team) => team.id));

  const mine = new Set(viewer.teams.map((team) => team.id));
  const totals = teams.reduce(
    (sum, team) => ({
      yaps: sum.yaps + team.yapCount,
      members: sum.members + team.memberCount,
    }),
    { yaps: 0, members: 0 },
  );

  const figures = [
    { value: formatCount(teams.length), label: "Archives" },
    { value: formatCount(totals.members), label: "Memberships" },
    { value: formatCount(totals.yaps), label: "Records" },
  ];

  return (
    <div>
      <div className="on-ink grid-ghost border-b border-ink">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <span className="label">Instance operator</span>
          <h1 className="quote mt-3 text-[clamp(2rem,6vw,3.6rem)] text-paper">Every archive</h1>
          <p className="label mt-3 max-w-[54ch] leading-[1.6]">
            you are seeing this because your account carries the instance role. it is the only
            view that crosses between teams — everything else is walled.
          </p>

          <dl className="mt-8 grid grid-cols-3 border-l border-t border-paper/20">
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

      <div className="mx-auto max-w-[1200px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
        <Panel label={`Archives — ${formatCount(teams.length)}`} bodyClassName="p-0">
          <ul>
            {teams.map((team) => {
              const heads = owners.get(team.id) ?? [];
              const active = team.id === viewer.team.id;
              return (
                <li
                  key={team.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink px-3 py-3 last:border-b-0"
                >
                  <span className="min-w-[12rem] text-[14px] font-semibold">{team.name}</span>
                  <span className="label">/{team.slug}</span>
                  <span className="label tabnums">
                    {team.yapCount} records · {team.memberCount} members · {team.accountCount}{" "}
                    accounts
                  </span>
                  <span className="label">
                    {heads.length > 0 ? `owner: ${heads.join(", ")}` : "no owner"}
                  </span>
                  <span className="label tabnums">opened {formatDate(team.createdAt)}</span>
                  {mine.has(team.id) ? <span className="label text-acid-deep">you are in</span> : null}

                  <span className="ml-auto flex h-7 items-center gap-4">
                    {active ? (
                      <>
                        <span className="label">current</span>
                        <Link href="/admin" className="label hover:text-ink">
                          administer →
                        </Link>
                      </>
                    ) : (
                      <EnterTeam slug={team.slug} name={team.name} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="mt-6">
          <Panel label="Open another archive">
            <CreateTeam />
            <p className="label mt-3 max-w-[70ch] leading-[1.5]">
              a separate team on this instance, with its own records, tags, leaderboard and
              battles. nothing crosses between them. you become its owner.
            </p>
          </Panel>
        </div>

        <p className="label mt-4 max-w-[70ch] leading-[1.6]">
          entering an archive you are not a member of is logged nowhere and hidden nowhere: the
          header reads OPERATOR instead of a role for as long as you are in it. deleting an
          archive is not offered here — it would take every record in it with it, and that is a
          psql decision, not a button.
        </p>
      </div>
    </div>
  );
}

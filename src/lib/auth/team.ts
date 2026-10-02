import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { knownZone } from "@/lib/zoned";
import { getSessionUser, type SessionUser } from "./session";

export const TEAM_COOKIE = "yapped_team";

export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";

/**
 * What the viewer is to the team they are currently looking at. `OPERATOR` is
 * not a membership: it is the instance operator (`User.role = ADMIN`) looking
 * into a team they do not belong to.
 */
export type ViewerRole = TeamRole | "OPERATOR";

export type ActiveTeam = {
  id: string;
  name: string;
  slug: string;
  role: ViewerRole;
  /** The clock this archive keeps. Every date the interface prints uses it. */
  timezone: string;
};

export type Viewer = {
  user: SessionUser;
  team: ActiveTeam;
  teams: Array<{ id: string; name: string; slug: string; role: TeamRole; timezone: string }>;
};

/** Every team on the instance — only the operator has any business seeing this. */
export async function listAllTeams() {
  const rows = await prisma.team.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: "OPERATOR" as const,
  }));
}

export async function listMemberships(userId: string) {
  const rows = await prisma.membership.findMany({
    where: { userId },
    include: { team: true },
    orderBy: { joinedAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.team.id,
    name: row.team.name,
    slug: row.team.slug,
    role: row.role as TeamRole,
    timezone: knownZone(row.team.timezone),
  }));
}

/**
 * The archive is invite-only, so there is no anonymous view of it: every page
 * resolves a signed-in member and the team they are currently looking at.
 *
 * The team id this returns is the ONLY one services accept — and they take it
 * as a required argument, so a forgotten filter is a compile error rather than
 * one team quietly reading another's records.
 */
export const getViewer = cache(async function getViewer(): Promise<Viewer | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const teams = await listMemberships(user.id);

  const jar = await cookies();
  const wanted = jar.get(TEAM_COOKIE)?.value;
  const mine = teams.find((entry) => entry.slug === wanted);
  if (mine) return { user, team: mine, teams };

  // The one documented hole in the wall: the instance operator may point the
  // team cookie at any archive, including one they are not a member of. It is
  // never silent — the role reads OPERATOR and the header says so — and it is
  // the only way to fix a team that has locked itself out.
  if (user.isAdmin && wanted) {
    const foreign = await prisma.team.findUnique({ where: { slug: wanted } });
    if (foreign) {
      return {
        user,
        team: {
          id: foreign.id,
          name: foreign.name,
          slug: foreign.slug,
          role: "OPERATOR",
          timezone: knownZone(foreign.timezone),
        },
        teams,
      };
    }
  }

  if (teams.length > 0) return { user, team: teams[0], teams };
  return null;
});

/** Every archive page starts here. */
export async function requireViewer(next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return viewer;
}

export async function requireTeamAdmin(next?: string): Promise<Viewer> {
  const viewer = await requireViewer(next);
  if (!canModerate(viewer)) redirect("/");
  return viewer;
}

/** Only the operator gets the instance-wide pages. */
export async function requireOperator(next?: string): Promise<Viewer> {
  const viewer = await requireViewer(next);
  if (!viewer.user.isAdmin) redirect("/");
  return viewer;
}

export function canModerate(viewer: Viewer): boolean {
  return viewer.user.isAdmin || viewer.team.role !== "MEMBER";
}

/** Looking at a team they are not in. Worth saying out loud wherever it is true. */
export function isForeignTeam(viewer: Viewer): boolean {
  return viewer.team.role === "OPERATOR";
}

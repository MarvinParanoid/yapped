import { prisma } from "@/lib/db";
import type { Failure } from "@/lib/errors";
import { validateName } from "@/lib/names";
import type { TeamRole } from "@/lib/auth/team";

export type MemberRow = {
  userId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  role: TeamRole;
  joinedAt: Date;
  /** An account with no password is a person the archive quotes, not a user. */
  hasAccount: boolean;
  yapCount: number;
  filedCount: number;
};

export type TeamOverview = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  memberCount: number;
  accountCount: number;
  yapCount: number;
};

/** Slugs are the cookie value, so they have to survive a round trip through a header. */
export function slugifyTeam(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function listMembers(teamId: string): Promise<MemberRow[]> {
  const rows = await prisma.membership.findMany({
    where: { teamId },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.userId);
  // Two group-bys instead of a count per member: "said it" and "filed it" are
  // separate jobs here, and the admin table shows both.
  const [said, filed] = await Promise.all([
    prisma.yap.groupBy({
      by: ["authorId"],
      where: { teamId, deletedAt: null, authorId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.yap.groupBy({
      by: ["submittedById"],
      where: { teamId, deletedAt: null, submittedById: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  const saidBy = new Map(said.map((row) => [row.authorId, row._count._all]));
  const filedBy = new Map(
    filed.filter((row) => row.submittedById).map((row) => [row.submittedById!, row._count._all]),
  );

  const members: MemberRow[] = rows.map((row) => ({
    userId: row.userId,
    displayName: row.user.displayName,
    handle: row.user.handle,
    avatarUrl: row.user.avatarUrl,
    role: row.role as TeamRole,
    joinedAt: row.joinedAt,
    hasAccount: Boolean(row.user.passwordHash),
    yapCount: saidBy.get(row.userId) ?? 0,
    filedCount: filedBy.get(row.userId) ?? 0,
  }));

  // Join order is useless here: most rows are people the archive quotes who
  // have never signed in, and they would bury the handful an admin can act on.
  // Accounts first, then anyone who has actually said or filed something.
  const RANK: Record<TeamRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
  return members.sort((a, b) => {
    if (a.hasAccount !== b.hasAccount) return a.hasAccount ? -1 : 1;
    if (a.hasAccount && RANK[a.role] !== RANK[b.role]) return RANK[a.role] - RANK[b.role];
    const activity = b.yapCount + b.filedCount - (a.yapCount + a.filedCount);
    if (activity !== 0) return activity;
    return a.displayName.localeCompare(b.displayName);
  });
}

export async function getTeamOverview(teamId: string): Promise<TeamOverview | null> {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return null;

  const [memberCount, accountCount, yapCount] = await Promise.all([
    prisma.membership.count({ where: { teamId } }),
    prisma.membership.count({ where: { teamId, user: { passwordHash: { not: null } } } }),
    prisma.yap.count({ where: { teamId, deletedAt: null } }),
  ]);

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    createdAt: team.createdAt,
    memberCount,
    accountCount,
    yapCount,
  };
}

/** The instance, team by team. Operator-only — see requireOperator. */
export async function listTeamOverviews(): Promise<TeamOverview[]> {
  const teams = await prisma.team.findMany({ orderBy: { createdAt: "asc" } });
  if (teams.length === 0) return [];

  const ids = teams.map((team) => team.id);
  const [members, accounts, yaps] = await Promise.all([
    prisma.membership.groupBy({ by: ["teamId"], where: { teamId: { in: ids } }, _count: { _all: true } }),
    prisma.membership.groupBy({
      by: ["teamId"],
      where: { teamId: { in: ids }, user: { passwordHash: { not: null } } },
      _count: { _all: true },
    }),
    prisma.yap.groupBy({
      by: ["teamId"],
      where: { teamId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const count = (rows: Array<{ teamId: string; _count: { _all: number } }>) =>
    new Map(rows.map((row) => [row.teamId, row._count._all]));
  const memberBy = count(members);
  const accountBy = count(accounts);
  const yapBy = count(yaps);

  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    slug: team.slug,
    createdAt: team.createdAt,
    memberCount: memberBy.get(team.id) ?? 0,
    accountCount: accountBy.get(team.id) ?? 0,
    yapCount: yapBy.get(team.id) ?? 0,
  }));
}

/** Who holds the keys to each archive — the operator's first question. */
export async function listOwners(teamIds: string[]): Promise<Map<string, string[]>> {
  const rows = await prisma.membership.findMany({
    where: { teamId: { in: teamIds }, role: "OWNER" },
    include: { user: { select: { displayName: true } } },
  });
  const byTeam = new Map<string, string[]>();
  for (const row of rows) {
    byTeam.set(row.teamId, [...(byTeam.get(row.teamId) ?? []), row.user.displayName]);
  }
  return byTeam;
}

export type RoleChange = { ok: true } | ({ ok: false } & Failure);

/**
 * Roles move, but a team always keeps one owner — losing the last one would
 * leave an archive nobody can administer and nobody can delete.
 */
export async function setMemberRole(
  teamId: string,
  userId: string,
  role: TeamRole,
): Promise<RoleChange> {
  const membership = await prisma.membership.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!membership) return { ok: false, code: "NOT_A_MEMBER" };
  if (membership.role === role) return { ok: true };

  if (membership.role === "OWNER") {
    const owners = await prisma.membership.count({ where: { teamId, role: "OWNER" } });
    if (owners <= 1) return { ok: false, code: "NEEDS_AN_OWNER" };
  }

  await prisma.membership.update({
    where: { teamId_userId: { teamId, userId } },
    data: { role },
  });
  return { ok: true };
}

/**
 * Removing a member revokes their access. It deliberately leaves their
 * statements in place: the archive is a record of what was said, and editing
 * out a person would make it a record of who is currently around.
 */
export async function removeMember(teamId: string, userId: string): Promise<RoleChange> {
  const membership = await prisma.membership.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!membership) return { ok: false, code: "NOT_A_MEMBER" };
  if (membership.role === "OWNER") {
    const owners = await prisma.membership.count({ where: { teamId, role: "OWNER" } });
    if (owners <= 1) return { ok: false, code: "LAST_OWNER" };
  }

  await prisma.membership.delete({ where: { teamId_userId: { teamId, userId } } });
  await prisma.session.deleteMany({ where: { userId } });
  return { ok: true };
}

export async function renameTeam(teamId: string, name: string): Promise<RoleChange> {
  const named = validateName(name);
  if (!named.ok) return { ok: false, code: named.problem.code, vars: { ...named.problem } };
  await prisma.team.update({ where: { id: teamId }, data: { name: named.name } });
  return { ok: true };
}

export type TeamCreation = { ok: true; teamId: string; slug: string } | ({ ok: false } & Failure);

/** Creating a team makes the creator its owner; there is no other way in. */
export async function createTeam(name: string, ownerId: string): Promise<TeamCreation> {
  const named = validateName(name);
  if (!named.ok) return { ok: false, code: named.problem.code, vars: { ...named.problem } };
  const trimmed = named.name;

  const base = slugifyTeam(trimmed) || "team";
  let slug = base;
  for (let attempt = 2; await prisma.team.findUnique({ where: { slug } }); attempt += 1) {
    slug = `${base}-${attempt}`;
    if (attempt > 50) return { ok: false, code: "PICK_ANOTHER_NAME" };
  }

  const team = await prisma.team.create({
    data: {
      name: trimmed,
      slug,
      memberships: { create: { userId: ownerId, role: "OWNER" } },
    },
  });
  return { ok: true, teamId: team.id, slug: team.slug };
}

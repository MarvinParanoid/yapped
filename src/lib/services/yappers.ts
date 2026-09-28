import { prisma } from "@/lib/db";
import { yapCode } from "@/lib/format";
import { evaluateAchievements, type Achievement, type YapperStats } from "@/lib/achievements";
import { titleFor, type Title } from "@/lib/titles";
import { isContested } from "@/lib/verification";
import { validateName } from "@/lib/names";
import type { LeaderboardEntry, RangeKey, YapperRef } from "@/lib/types";

function toYapperRef(user: {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  title: string | null;
  username?: string | null;
}): YapperRef {
  return {
    id: user.id,
    displayName: user.displayName,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    title: user.title,
    hasAccount: Boolean(user.username),
  };
}

function sinceFor(range: RangeKey): Date | null {
  const now = Date.now();
  if (range === "week") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (range === "month") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (range === "today") return new Date(now - 24 * 60 * 60 * 1000);
  return null;
}

export async function getLeaderboard(
  teamId: string,
  range: RangeKey = "all",
  take = 50,
): Promise<LeaderboardEntry[]> {
  const since = sinceFor(range);
  const where = { teamId, deletedAt: null, ...(since ? { saidAt: { gte: since } } : {}) };

  const grouped = await prisma.yap.groupBy({
    by: ["authorId"],
    where,
    _sum: { aura: true, reactionCount: true },
    _count: { _all: true },
    orderBy: { _sum: { aura: "desc" } },
    take,
  });
  if (grouped.length === 0) return [];

  const authorIds = grouped.map((row) => row.authorId);

  const [users, certified, bestYaps] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: authorIds } } }),
    prisma.yap.groupBy({
      by: ["authorId"],
      where: { ...where, verification: "CERTIFIED" },
      _count: { _all: true },
    }),
    prisma.yap.findMany({
      where: { ...where, authorId: { in: authorIds } },
      distinct: ["authorId"],
      orderBy: [{ aura: "desc" }, { id: "asc" }],
      select: { id: true, text: true, aura: true, authorId: true },
    }),
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const certifiedByAuthor = new Map(certified.map((row) => [row.authorId, row._count._all]));
  const bestByAuthor = new Map(bestYaps.map((row) => [row.authorId, row]));

  return grouped
    .map((row, index) => {
      const user = userById.get(row.authorId);
      if (!user) return null;
      const best = bestByAuthor.get(row.authorId);
      return {
        yapper: toYapperRef(user),
        yapCount: row._count._all,
        totalAura: row._sum.aura ?? 0,
        reactionsReceived: row._sum.reactionCount ?? 0,
        certifiedCount: certifiedByAuthor.get(row.authorId) ?? 0,
        bestYap: best
          ? { id: best.id, code: yapCode(best.id), text: best.text, aura: best.aura }
          : null,
        rank: index + 1,
      } satisfies LeaderboardEntry;
    })
    .filter((entry): entry is LeaderboardEntry => entry !== null);
}

export type YapperProfile = {
  yapper: YapperRef;
  joinedAt: Date;
  /** When they first went on the record, which is the date that matters. */
  yappingSince: Date | null;
  stats: YapperStats & {
    averageAura: number;
    reactionsReceived: number;
    disputedCount: number;
    acknowledgedCount: number;
    witnessedCount: number;
    battleLosses: number;
    peakElo: number;
    /** Saying things and filing them are different jobs. */
    filedCount: number;
    /** Testimony this person has given about other people's statements. */
    testimonyGiven: number;
    hallRank: number | null;
  };
  title: Title;
  badges: Achievement[];
  topTags: Array<{ slug: string; label: string; count: number }>;
  bestYap: { id: number; code: string; text: string; aura: number } | null;
  /** Colleagues who keep turning up in the same rooms. */
  associates: Array<{ user: YapperRef; count: number }>;
  rank: number | null;
};

/** Just the name — metadata must not pay for the whole profile. */
export async function getYapperName(id: string, teamId: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { id, memberships: { some: { teamId } } },
    select: { displayName: true },
  });
  return user?.displayName ?? null;
}

/**
 * Four queries, not eight: the author's own yaps come back in one row set and
 * the derived stats are folded in memory. Cheap because a person's record is
 * small by nature — if someone ever crosses a few thousand yaps, this is the
 * call to paginate.
 */
export async function getYapperProfile(
  id: string,
  teamId: string,
): Promise<YapperProfile | null> {
  const user = await prisma.user.findFirst({
    where: { id, memberships: { some: { teamId } } },
  });
  if (!user) return null;

  const where = { teamId, authorId: id, deletedAt: null };

  const [yaps, tagLinks, ranking, corroborators, filedCount, testimonyGiven] = await Promise.all([
    prisma.yap.findMany({
      where,
      select: {
        id: true,
        text: true,
        aura: true,
        verification: true,
        lore: true,
        saidAt: true,
        acknowledgedAt: true,
        battleWins: true,
        battleLosses: true,
        eloRating: true,
        reactionCount: true,
        witnessCount: true,
        denialCount: true,
        disputedAt: true,
      },
    }),
    prisma.yapTag.findMany({ where: { yap: where }, include: { tag: true } }),
    prisma.yap.groupBy({
      by: ["authorId"],
      where: { teamId, deletedAt: null },
      _sum: { aura: true },
      orderBy: { _sum: { aura: "desc" } },
    }),
    // Who keeps confirming they were in the room when this person spoke.
    prisma.witness.groupBy({
      by: ["userId"],
      where: { stance: "PRESENT", yap: where, userId: { not: id } },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 5,
    }),
    // The archivist dimension: records this person put on the record, whoever
    // actually said them.
    prisma.yap.count({ where: { teamId, submittedById: id, deletedAt: null } }),
    prisma.witness.count({ where: { userId: id, stance: "PRESENT", yap: { teamId } } }),
  ]);

  const associateUsers = await prisma.user.findMany({
    where: { id: { in: corroborators.map((row) => row.userId) } },
  });
  const associateById = new Map(associateUsers.map((user) => [user.id, user]));
  const associates = corroborators
    .map((row) => {
      const user = associateById.get(row.userId);
      return user ? { user: toYapperRef(user), count: row._count._all } : null;
    })
    .filter((row): row is { user: YapperRef; count: number } => row !== null);

  const yapCount = yaps.length;
  let totalAura = 0;
  let reactionsReceived = 0;
  let battleWins = 0;
  let certifiedCount = 0;
  let loreCount = 0;
  let battleLosses = 0;
  let disputedCount = 0;
  let acknowledgedCount = 0;
  let witnessedCount = 0;
  let peakElo = 0;
  let oldest: Date | null = null;
  let best: { id: number; text: string; aura: number } | null = null;

  for (const yap of yaps) {
    totalAura += yap.aura;
    reactionsReceived += yap.reactionCount;
    battleWins += yap.battleWins;
    battleLosses += yap.battleLosses;
    witnessedCount += yap.witnessCount;
    if (yap.eloRating > peakElo) peakElo = yap.eloRating;
    if (yap.disputedAt || isContested(yap.witnessCount, yap.denialCount)) disputedCount += 1;
    if (yap.acknowledgedAt) acknowledgedCount += 1;
    if (yap.verification === "CERTIFIED") certifiedCount += 1;
    if (yap.lore) loreCount += 1;
    if (!oldest || yap.saidAt < oldest) oldest = yap.saidAt;
    if (!best || yap.aura > best.aura) best = { id: yap.id, text: yap.text, aura: yap.aura };
  }

  const tagCounts = new Map<string, { slug: string; label: string; count: number }>();
  for (const link of tagLinks) {
    const entry = tagCounts.get(link.tag.slug) ?? {
      slug: link.tag.slug,
      label: link.tag.label,
      count: 0,
    };
    entry.count += 1;
    tagCounts.set(link.tag.slug, entry);
  }
  const topTags = [...tagCounts.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  const stats: YapperStats = {
    yapCount,
    totalAura,
    certifiedCount,
    bestYapAura: best?.aura ?? 0,
    battleWins,
    hasLore: loreCount > 0,
    oldestYapAgeDays: oldest
      ? Math.floor((Date.now() - oldest.getTime()) / (24 * 60 * 60 * 1000))
      : 0,
    topTagCount: topTags[0]?.count ?? 0,
  };

  const rankIndex = ranking.findIndex((row) => row.authorId === id);

  // Best standing any of their statements holds in the Hall of Yap.
  const hallRank =
    peakElo > 0
      ? (await prisma.yap.count({
          where: {
            teamId,
            deletedAt: null,
            eloRating: { gt: peakElo },
            OR: [{ battleWins: { gt: 0 } }, { battleLosses: { gt: 0 } }],
          },
        })) + 1
      : null;

  return {
    yapper: toYapperRef(user),
    joinedAt: user.createdAt,
    yappingSince: oldest,
    stats: {
      ...stats,
      averageAura: yapCount > 0 ? Math.round(totalAura / yapCount) : 0,
      reactionsReceived,
      disputedCount,
      acknowledgedCount,
      witnessedCount,
      battleLosses,
      peakElo,
      filedCount,
      testimonyGiven,
      hallRank,
    },
    title: titleFor({
      yapCount,
      totalAura,
      certifiedCount,
      disputedCount,
      witnessedCount,
      battleWins,
      loreCount,
      topTagCount: topTags[0]?.count ?? 0,
    }),
    badges: evaluateAchievements(stats),
    topTags,
    bestYap: best ? { id: best.id, code: yapCode(best.id), text: best.text, aura: best.aura } : null,
    associates,
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
  };
}

/** Persist earned badges so the award date survives a formula change. */
export async function syncAchievements(userId: string, teamId: string): Promise<void> {
  const profile = await getYapperProfile(userId, teamId);
  if (!profile) return;
  await Promise.all(
    profile.badges.map((badge) =>
      prisma.userAchievement.upsert({
        where: { userId_key: { userId, key: badge.key } },
        update: {},
        create: { userId, key: badge.key },
      }),
    ),
  );
}

/** Actual yappers first — the people most likely to have said it again. */
export async function listYappers(teamId: string): Promise<YapperRef[]> {
  const users = await prisma.user.findMany({
    where: { memberships: { some: { teamId } } },
    include: { _count: { select: { yaps: true } } },
    orderBy: [{ yaps: { _count: "desc" } }, { displayName: "asc" }],
  });
  return users.map(toYapperRef);
}

/** The person who said it may not have an account yet. Make them one anyway. */
export async function findOrCreateYapper(displayName: string, teamId: string): Promise<string> {
  const named = validateName(displayName, "A yapper's name");
  if (!named.ok) throw new Error(named.error);
  const name = named.name;
  // Scoped to the team: two archives may each have their own Diana, and they
  // are not the same person.
  const existing = await prisma.user.findFirst({
    where: {
      displayName: { equals: name, mode: "insensitive" },
      memberships: { some: { teamId } },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: { displayName: name, memberships: { create: { teamId } } },
  });
  return created.id;
}

import { prisma } from "@/lib/db";
import { yapCode } from "@/lib/format";
import { DEFAULT_RATING, nextRatings, winRate } from "@/lib/ranking/elo";
import type { YapView } from "@/lib/types";
import { getYap } from "./yaps";

/**
 * The arena needs a real field. With two records there is exactly one possible
 * pair, so every vote re-asks the same question and the ratings just oscillate
 * — worse than being closed. Four records give six distinct match-ups, which is
 * enough for a short sitting.
 */
export const MIN_ARENA_RECORDS = 4;

export type ArenaState =
  | { open: true; pair: [YapView, YapView] }
  | { open: false; records: number; needed: number };

/** Two random contenders. Never the same yap, never the same mouth twice. */
export async function getBattlePair(
  teamId: string,
  viewerId?: string | null,
  excludeIds: number[] = [],
): Promise<[YapView, YapView] | null> {
  const total = await prisma.yap.count({ where: { teamId, deletedAt: null } });
  if (total < 2) return null;

  // Avoid handing back the pair just voted on, unless the archive is so small
  // that there is nothing else to offer.
  const avoid = total > excludeIds.length + 1 ? excludeIds : [];

  const pick = async (excludeIds: number[], excludeAuthorId?: string) => {
    const where = {
      teamId,
      deletedAt: null,
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      ...(excludeAuthorId ? { authorId: { not: excludeAuthorId } } : {}),
    };
    const count = await prisma.yap.count({ where });
    if (count === 0) return null;
    return prisma.yap.findFirst({
      where,
      select: { id: true, authorId: true },
      skip: Math.floor(Math.random() * count),
    });
  };

  const first = (await pick(avoid)) ?? (await pick([]));
  if (!first) return null;
  const second =
    (await pick([first.id, ...avoid], first.authorId)) ??
    (await pick([first.id], first.authorId)) ??
    (await pick([first.id]));
  if (!second) return null;

  const [a, b] = await Promise.all([
    getYap(first.id, teamId, viewerId),
    getYap(second.id, teamId, viewerId),
  ]);
  if (!a || !b) return null;
  return [a, b];
}

/**
 * Record a head-to-head result. Ratings come from lib/ranking/elo.ts and the
 * vote is journalled so the whole ladder can be replayed later.
 */
export type BattleOutcome = {
  delta: number;
  /** The underdog won by a wide margin — worth saying out loud. */
  upset: boolean;
  gap: number;
};

/** An upset is a win against a meaningfully higher-rated statement. */
export const UPSET_RATING_GAP = 60;

export async function recordBattle(
  winnerId: number,
  loserId: number,
  teamId: string,
  voterId?: string | null,
): Promise<BattleOutcome | null> {
  if (winnerId === loserId) return null;

  const [winner, loser] = await Promise.all([
    prisma.yap.findFirst({ where: { id: winnerId, teamId }, select: { eloRating: true } }),
    prisma.yap.findFirst({ where: { id: loserId, teamId }, select: { eloRating: true } }),
  ]);
  if (!winner || !loser) return null;

  const update = nextRatings(winner.eloRating, loser.eloRating);
  const gap = loser.eloRating - winner.eloRating;

  await prisma.$transaction([
    prisma.battle.create({
      data: {
        teamId,
        winnerId,
        loserId,
        voterId: voterId ?? null,
        winnerRatingBefore: winner.eloRating,
        loserRatingBefore: loser.eloRating,
        ratingDelta: update.delta,
      },
    }),
    prisma.yap.update({
      where: { id: winnerId },
      data: { eloRating: update.winnerRating, battleWins: { increment: 1 } },
    }),
    prisma.yap.update({
      where: { id: loserId },
      data: { eloRating: update.loserRating, battleLosses: { increment: 1 } },
    }),
  ]);

  return { delta: update.delta, upset: gap >= UPSET_RATING_GAP, gap };
}

export type YapBattleRecord = {
  wins: number;
  losses: number;
  rating: number;
  peak: number;
  total: number;
  winRate: number | null;
  last: {
    opponentId: number;
    opponentCode: string;
    opponentText: string;
    won: boolean;
    delta: number;
    at: Date;
  } | null;
};

/**
 * One statement's fight history, reconstructed from the battle journal — which
 * is why the journal stores the ratings that went into each result.
 */
export async function getYapBattleRecord(
  yapId: number,
  teamId: string,
): Promise<YapBattleRecord> {
  const [yap, battles] = await Promise.all([
    prisma.yap.findFirst({
      where: { id: yapId, teamId },
      select: { eloRating: true, battleWins: true, battleLosses: true },
    }),
    prisma.battle.findMany({
      where: { teamId, OR: [{ winnerId: yapId }, { loserId: yapId }] },
      orderBy: { createdAt: "asc" },
      include: {
        winner: { select: { id: true, text: true } },
        loser: { select: { id: true, text: true } },
      },
    }),
  ]);

  const wins = yap?.battleWins ?? 0;
  const losses = yap?.battleLosses ?? 0;

  let peak = DEFAULT_RATING;
  for (const battle of battles) {
    const won = battle.winnerId === yapId;
    const after = won
      ? battle.winnerRatingBefore + battle.ratingDelta
      : battle.loserRatingBefore - battle.ratingDelta;
    if (after > peak) peak = after;
  }

  const latest = battles.at(-1);
  const last = latest
    ? (() => {
        const won = latest.winnerId === yapId;
        const opponent = won ? latest.loser : latest.winner;
        return {
          opponentId: opponent.id,
          opponentCode: yapCode(opponent.id),
          opponentText: opponent.text,
          won,
          delta: won ? latest.ratingDelta : -latest.ratingDelta,
          at: latest.createdAt,
        };
      })()
    : null;

  return {
    wins,
    losses,
    rating: yap?.eloRating ?? DEFAULT_RATING,
    peak: Math.max(peak, yap?.eloRating ?? DEFAULT_RATING),
    total: wins + losses,
    winRate: winRate(wins, losses),
    last,
  };
}

export type HallEntry = {
  rank: number;
  id: number;
  code: string;
  text: string;
  rating: number;
  wins: number;
  losses: number;
  winRate: number | null;
  author: { id: string; displayName: string; avatarUrl: string | null };
};

export async function getHallOfYap(teamId: string, take = 25): Promise<HallEntry[]> {
  const rows = await prisma.yap.findMany({
    where: {
      teamId,
      deletedAt: null,
      OR: [{ battleWins: { gt: 0 } }, { battleLosses: { gt: 0 } }],
    },
    orderBy: [{ eloRating: "desc" }, { battleWins: "desc" }],
    take,
    include: { author: true },
  });

  return rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    code: yapCode(row.id),
    text: row.text,
    rating: row.eloRating,
    wins: row.battleWins,
    losses: row.battleLosses,
    winRate: winRate(row.battleWins, row.battleLosses),
    author: {
      id: row.author.id,
      displayName: row.author.displayName,
      avatarUrl: row.author.avatarUrl,
    },
  }));
}

export async function getBattleCount(teamId: string): Promise<number> {
  return prisma.battle.count({ where: { teamId } });
}

/** Whether the arena has enough of a field to be worth entering. */
export async function getArenaState(
  teamId: string,
  viewerId?: string | null,
  excludeIds: number[] = [],
): Promise<ArenaState> {
  const records = await prisma.yap.count({ where: { teamId, deletedAt: null } });
  if (records < MIN_ARENA_RECORDS) {
    return { open: false, records, needed: MIN_ARENA_RECORDS - records };
  }
  const pair = await getBattlePair(teamId, viewerId, excludeIds);
  if (!pair) return { open: false, records, needed: MIN_ARENA_RECORDS - records };
  return { open: true, pair };
}

/** How many distinct match-ups the archive can actually produce. */
export function distinctPairs(records: number): number {
  return records < 2 ? 0 : (records * (records - 1)) / 2;
}

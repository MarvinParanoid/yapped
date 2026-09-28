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
  /** Too few records to ask a question worth answering. */
  | { open: false; reason: "thin"; records: number; needed: number }
  /** Every pair has been judged by this person. The archive has to grow first. */
  | { open: false; reason: "exhausted"; records: number };

/** How many records the arena will enumerate every pair of before sampling. */
const PAIRWISE_LIMIT = 120;

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Two contenders the viewer has not already judged.
 *
 * It used to pick at random, avoiding only the pair just voted on — so with a
 * small archive the same match-ups came back within a handful of rounds. A
 * reader put it exactly: "я все 10 натыкала, а потом счётчик обновился и
 * заново". Voting on a question you have already answered is not a vote.
 *
 * Every vote is journalled with its voter, so what they have seen is already
 * known. Below PAIRWISE_LIMIT records every possible pair is enumerated and the
 * seen ones removed, which is exact; above it that is too many combinations, so
 * it samples and settles for "probably new".
 *
 * Returns null when the viewer has judged every pair there is — the caller
 * says so rather than starting the archive over.
 */
export async function getBattlePair(
  teamId: string,
  viewerId?: string | null,
  excludeIds: number[] = [],
): Promise<[YapView, YapView] | null> {
  const records = await prisma.yap.findMany({
    where: { teamId, deletedAt: null },
    select: { id: true, authorId: true },
  });
  if (records.length < 2) return null;

  const judged = viewerId
    ? await prisma.battle.findMany({
        where: { teamId, voterId: viewerId },
        select: { winnerId: true, loserId: true },
      })
    : [];
  const seen = new Set(judged.map((row) => pairKey(row.winnerId, row.loserId)));
  // The pair just voted on, so the next screen is never the previous one.
  if (excludeIds.length === 2) seen.add(pairKey(excludeIds[0]!, excludeIds[1]!));

  const chosen =
    records.length <= PAIRWISE_LIMIT
      ? pickExactly(records, seen)
      : pickBySampling(records, seen);
  if (!chosen) return null;

  const [a, b] = await Promise.all([
    getYap(chosen[0], teamId, viewerId),
    getYap(chosen[1], teamId, viewerId),
  ]);
  if (!a || !b) return null;
  return [a, b];
}

type Contender = { id: number; authorId: string };

/** Every unseen pair, with two different mouths preferred over one. */
function pickExactly(records: Contender[], seen: Set<string>): [number, number] | null {
  const fresh: Array<[number, number]> = [];
  const sameMouth: Array<[number, number]> = [];

  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const a = records[i]!;
      const b = records[j]!;
      if (seen.has(pairKey(a.id, b.id))) continue;
      (a.authorId === b.authorId ? sameMouth : fresh).push([a.id, b.id]);
    }
  }

  // Only pit someone against themselves when nothing else is left unseen.
  const pool = fresh.length > 0 ? fresh : sameMouth;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** Too many combinations to list: try a few at random and take the first unseen. */
function pickBySampling(records: Contender[], seen: Set<string>): [number, number] | null {
  const draw = () => records[Math.floor(Math.random() * records.length)]!;
  let fallback: [number, number] | null = null;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const a = draw();
    const b = draw();
    if (a.id === b.id) continue;
    if (!fallback) fallback = [a.id, b.id];
    if (a.authorId === b.authorId) continue;
    if (!seen.has(pairKey(a.id, b.id))) return [a.id, b.id];
  }
  return fallback;
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

  const pairLowId = Math.min(winnerId, loserId);
  const pairHighId = Math.max(winnerId, loserId);

  // Reading the ratings and then writing them has to be one decision: two
  // votes landing together would otherwise both read the same "before" and the
  // second would overwrite the first, silently losing a result.
  //
  // Changing your mind is allowed, so a second verdict on a pair REPLACES the
  // first rather than stacking: the old result is taken back out of the ladder
  // and the new one applied. Without that, "you may re-vote" is just a licence
  // to pump a rating by clicking the same button repeatedly.
  try {
    return await prisma.$transaction(
      async (tx) => {
        const [winner, loser] = await Promise.all([
          tx.yap.findFirst({ where: { id: winnerId, teamId }, select: { eloRating: true } }),
          tx.yap.findFirst({ where: { id: loserId, teamId }, select: { eloRating: true } }),
        ]);
        if (!winner || !loser) return null;

        let winnerRating = winner.eloRating;
        let loserRating = loser.eloRating;

        // An anonymous vote has no "same person" to compare against, so it is
        // always a new result.
        const previous = voterId
          ? await tx.battle.findUnique({
              where: {
                teamId_voterId_pairLowId_pairHighId: {
                  teamId,
                  voterId,
                  pairLowId,
                  pairHighId,
                },
              },
            })
          : null;

        if (previous) {
          // Undo exactly what that verdict did. Elo is path-dependent, so this
          // is a correction rather than a perfect rewind of history — but it
          // is the same arithmetic in reverse, and it keeps the ladder from
          // drifting every time somebody reconsiders.
          const sameWinner = previous.winnerId === winnerId;
          if (sameWinner) {
            winnerRating -= previous.ratingDelta;
            loserRating += previous.ratingDelta;
          } else {
            // The verdict is being flipped: the old winner is this loser.
            loserRating -= previous.ratingDelta;
            winnerRating += previous.ratingDelta;
          }
        }

        const update = nextRatings(winnerRating, loserRating);
        const gap = loserRating - winnerRating;

        const journal = {
          teamId,
          winnerId,
          loserId,
          voterId: voterId ?? null,
          pairLowId,
          pairHighId,
          winnerRatingBefore: winnerRating,
          loserRatingBefore: loserRating,
          ratingDelta: update.delta,
        };

        if (previous) {
          await tx.battle.update({ where: { id: previous.id }, data: journal });
        } else {
          await tx.battle.create({ data: journal });
        }

        // A replaced verdict already counted a win and a loss. Only the side
        // it fell on changes, and only when the vote was actually flipped.
        const flipped = previous !== null && previous.winnerId !== winnerId;

        await tx.yap.update({
          where: { id: winnerId },
          data: {
            eloRating: update.winnerRating,
            ...(previous === null
              ? { battleWins: { increment: 1 } }
              : flipped
                ? { battleWins: { increment: 1 }, battleLosses: { decrement: 1 } }
                : {}),
          },
        });
        await tx.yap.update({
          where: { id: loserId },
          data: {
            eloRating: update.loserRating,
            ...(previous === null
              ? { battleLosses: { increment: 1 } }
              : flipped
                ? { battleLosses: { increment: 1 }, battleWins: { decrement: 1 } }
                : {}),
          },
        });

        return { delta: update.delta, upset: gap >= UPSET_RATING_GAP, gap };
      },
      { isolationLevel: "Serializable" },
    );
  } catch {
    // Two votes raced and Postgres aborted the loser, or the unique index
    // caught a duplicate. Either way nothing landed.
    return null;
  }
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
    return { open: false, reason: "thin", records, needed: MIN_ARENA_RECORDS - records };
  }
  const pair = await getBattlePair(teamId, viewerId, excludeIds);
  if (!pair) return { open: false, reason: "exhausted", records };
  return { open: true, pair };
}

/** How many distinct match-ups the archive can actually produce. */
export function distinctPairs(records: number): number {
  return records < 2 ? 0 : (records * (records - 1)) / 2;
}

import { prisma } from "@/lib/db";
import {
  EMPTY_COUNTS,
  computeAura,
  type ReactionCounts,
  type ReactionKey,
} from "@/lib/ranking/aura";
import {
  NEW_HOURS,
  classifyMomentum,
  type MomentumState,
} from "@/lib/ranking/momentum";

/**
 * Aura over time.
 *
 * Reactions carry timestamps, so a record's aura at any past moment is just the
 * same weights applied to the reactions that existed by then. Nothing is
 * snapshotted — the history is a consequence of the data, not a second copy of
 * it.
 */
const MARKET_SELECT = {
  id: true,
  text: true,
  aura: true,
  createdAt: true,
  author: { select: { id: true, displayName: true } },
} as const;

type MarketRecord = {
  id: number;
  text: string;
  aura: number;
  createdAt: Date;
  author: { id: string; displayName: string };
};

/**
 * Aura as of a different moment for each record, in one query.
 *
 * "On this day" asks what each anniversary was worth at the end of its own day,
 * so every record has its own cutoff — which used to mean a query per record.
 * One read covers them all: fetch up to the latest cutoff and apply each
 * record's own in memory.
 */
export async function auraAsOfEach(cutoffs: Map<number, Date>): Promise<Map<number, number>> {
  const ids = [...cutoffs.keys()];
  const result = new Map<number, number>();
  if (ids.length === 0) return result;

  const latest = new Date(Math.max(...[...cutoffs.values()].map((date) => date.getTime())));
  const reactions = await prisma.reaction.findMany({
    where: { yapId: { in: ids }, createdAt: { lte: latest } },
    select: { yapId: true, type: true, createdAt: true },
  });

  const counts = new Map<number, ReactionCounts>();
  for (const reaction of reactions) {
    if (reaction.createdAt > cutoffs.get(reaction.yapId)!) continue;
    const bucket = counts.get(reaction.yapId) ?? { ...EMPTY_COUNTS };
    bucket[reaction.type as ReactionKey] += 1;
    counts.set(reaction.yapId, bucket);
  }
  for (const id of ids) result.set(id, computeAura(counts.get(id) ?? EMPTY_COUNTS));
  return result;
}

export async function auraAsOf(yapIds: number[], cutoff: Date): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (yapIds.length === 0) return result;

  const grouped = await prisma.reaction.groupBy({
    by: ["yapId", "type"],
    where: { yapId: { in: yapIds }, createdAt: { lte: cutoff } },
    _count: { _all: true },
  });

  const counts = new Map<number, ReactionCounts>();
  for (const row of grouped) {
    const bucket = counts.get(row.yapId) ?? { ...EMPTY_COUNTS };
    bucket[row.type as ReactionKey] = row._count._all;
    counts.set(row.yapId, bucket);
  }
  for (const id of yapIds) {
    result.set(id, computeAura(counts.get(id) ?? EMPTY_COUNTS));
  }
  return result;
}

export type Momentum = {
  yapId: number;
  now: number;
  then: number;
  delta: number;
  /** Growth over the window; null when the record had no aura to grow from. */
  percent: number | null;
  state: MomentumState;
  ageDays: number;
};

export async function getMomentum(
  yapIds: number[],
  windowHours: number,
): Promise<Map<number, Momentum>> {
  const result = new Map<number, Momentum>();
  if (yapIds.length === 0) return result;

  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const [rows, before] = await Promise.all([
    prisma.yap.findMany({
      where: { id: { in: yapIds } },
      select: { id: true, aura: true, createdAt: true },
    }),
    auraAsOf(yapIds, cutoff),
  ]);

  const newCutoff = new Date(Date.now() - NEW_HOURS * 60 * 60 * 1000);
  for (const row of rows) {
    const then = before.get(row.id) ?? 0;
    const ageDays = Math.floor((Date.now() - row.createdAt.getTime()) / (24 * 60 * 60 * 1000));
    const { delta, percent, state } = classifyMomentum({
      now: row.aura,
      then,
      ageDays,
      filedInLastDay: row.createdAt >= newCutoff,
    });
    result.set(row.id, { yapId: row.id, now: row.aura, then, delta, percent, state, ageDays });
  }

  return result;
}


export type MarketRow = Momentum & {
  id: number;
  code: string;
  text: string;
  author: { id: string; displayName: string };
};

export type MarketReport = {
  windowHours: number;
  indexNow: number;
  indexThen: number;
  indexPercent: number | null;
  movers: MarketRow[];
  newcomers: MarketRow[];
  dormant: MarketRow[];
  tracked: number;
};

/**
 * The whole archive as an index, because the numbers are meaningless anyway.
 *
 * It used to pull every record in the team into memory and then compute the
 * same history twice — `auraAsOf` ran once inside `getMomentum` and again
 * beside it, with identical arguments. Nothing here reads a row it does not
 * put on the screen any more:
 *
 *   The index is arithmetic, not a listing. `computeAura` is a weighted sum, so
 *   summing it per record equals computing it once over all the counts —
 *   two aggregates, no rows transferred, cost flat in the size of the archive.
 *
 *   The three lists are bounded by activity rather than by archive size. A
 *   record is DORMANT precisely when nothing reacted to it inside the window
 *   (delta === 0), so the movers and newcomers can only come from records filed
 *   or reacted to since the cutoff — and the dormant list wants the loudest few
 *   of the rest, which is a `take: 8`.
 */
export async function getMarket(teamId: string, windowHours = 24 * 7): Promise<MarketReport> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const newCutoff = new Date(Date.now() - NEW_HOURS * 60 * 60 * 1000);
  const live = { teamId, deletedAt: null };

  /** Filed inside the window, or reacted to inside it — everything else is dormant. */
  const stirred = {
    ...live,
    OR: [
      { createdAt: { gte: cutoff } },
      { reactions: { some: { createdAt: { gt: cutoff } } } },
    ],
  };

  const [totals, historic, active, quiet] = await Promise.all([
    prisma.yap.aggregate({ where: live, _sum: { aura: true }, _count: { _all: true } }),
    prisma.reaction.groupBy({
      by: ["type"],
      where: { yap: live, createdAt: { lte: cutoff } },
      _count: { _all: true },
    }),
    prisma.yap.findMany({
      where: stirred,
      select: MARKET_SELECT,
    }),
    prisma.yap.findMany({
      where: { ...live, NOT: stirred.OR.length ? { OR: stirred.OR } : undefined },
      select: MARKET_SELECT,
      orderBy: { aura: "desc" },
      take: 8,
    }),
  ]);

  const before = await auraAsOf(
    active.map((yap) => yap.id),
    cutoff,
  );

  const toRow = (yap: MarketRecord, then: number): MarketRow => {
    const ageDays = Math.floor((Date.now() - yap.createdAt.getTime()) / (24 * 60 * 60 * 1000));
    const { delta, percent, state } = classifyMomentum({
      now: yap.aura,
      then,
      ageDays,
      filedInLastDay: yap.createdAt >= newCutoff,
    });
    return {
      yapId: yap.id,
      id: yap.id,
      code: `#${String(yap.id).padStart(5, "0")}`,
      text: yap.text,
      author: yap.author,
      now: yap.aura,
      then,
      delta,
      percent,
      state,
      ageDays,
    };
  };

  const rows = active.map((yap) => toRow(yap, before.get(yap.id) ?? 0));
  // Untouched inside the window by construction, so `then` equals `now`.
  const dormant = quiet.map((yap) => toRow(yap, yap.aura));

  const indexNow = totals._sum.aura ?? 0;
  const indexThen = computeAura(
    Object.fromEntries(historic.map((row) => [row.type, row._count._all])) as ReactionCounts,
  );

  return {
    windowHours,
    indexNow,
    indexThen,
    indexPercent: indexThen > 0 ? ((indexNow - indexThen) / indexThen) * 100 : null,
    movers: rows
      .filter((row) => row.state === "RISING" || row.state === "REEMERGING")
      // Percentage first; records that grew from nothing have no percentage to
      // compare, so they fall back to absolute aura gained.
      .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0) || b.delta - a.delta)
      .slice(0, 12),
    newcomers: rows
      .filter((row) => row.state === "NEW")
      .sort((a, b) => b.now - a.now)
      .slice(0, 8),
    dormant: dormant.sort((a, b) => b.now - a.now).slice(0, 8),
    tracked: totals._count._all,
  };
}

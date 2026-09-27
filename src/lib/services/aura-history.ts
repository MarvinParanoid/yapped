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

/** The whole archive as an index, because the numbers are meaningless anyway. */
export async function getMarket(teamId: string, windowHours = 24 * 7): Promise<MarketReport> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const yaps = await prisma.yap.findMany({
    where: { teamId, deletedAt: null },
    select: {
      id: true,
      text: true,
      aura: true,
      createdAt: true,
      author: { select: { id: true, displayName: true } },
    },
  });

  const ids = yaps.map((yap) => yap.id);
  const [momentum, before] = await Promise.all([
    getMomentum(ids, windowHours),
    auraAsOf(ids, cutoff),
  ]);

  const rows: MarketRow[] = yaps.map((yap) => {
    const entry = momentum.get(yap.id)!;
    return {
      ...entry,
      id: yap.id,
      code: `#${String(yap.id).padStart(5, "0")}`,
      text: yap.text,
      author: yap.author,
    };
  });

  const indexNow = yaps.reduce((sum, yap) => sum + yap.aura, 0);
  const indexThen = ids.reduce((sum, id) => sum + (before.get(id) ?? 0), 0);

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
    dormant: rows
      .filter((row) => row.state === "DORMANT")
      .sort((a, b) => b.now - a.now)
      .slice(0, 8),
    tracked: rows.length,
  };
}

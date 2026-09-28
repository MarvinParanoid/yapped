import { prisma } from "@/lib/db";
import type { YapView } from "@/lib/types";
import { auraAsOfEach } from "./aura-history";
import { getYaps } from "./yaps";

/**
 * ON THIS DAY — this time of year, in earlier years.
 *
 * Exact-date matching is wrong for a low-volume archive: with a few statements
 * a week, the same calendar day in a previous year is empty almost always. So
 * each anniversary is a window of ±7 days, and the page says how far off the
 * match actually was ("around this time · 364 days ago") rather than pretending
 * it landed on the nose.
 */
export const ANNIVERSARY_WINDOW_DAYS = 7;
export type Anniversary = {
  yearsAgo: number;
  year: number;
  /** True when at least one record fell exactly on the date. */
  exact: boolean;
  records: Array<
    YapView & {
      /** Aura as it stood at the end of that day, not today's total. */
      auraThen: number;
      daysAgo: number;
      /** Days away from the exact anniversary; 0 means the same date. */
      offsetDays: number;
    }
  >;
};

export type OnThisDayReport = {
  date: Date;
  anniversaries: Anniversary[];
  /** When the archive first has something to say on this date. */
  firstAnniversary: Date | null;
  archiveStart: Date | null;
};

export async function getOnThisDay(
  teamId: string,
  reference: Date = new Date(),
  viewerId?: string | null,
): Promise<OnThisDayReport> {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const day = reference.getUTCDate();

  const bounds = await prisma.yap.aggregate({
    where: { teamId, deletedAt: null },
    _min: { saidAt: true },
  });
  const archiveStart = bounds._min.saidAt ?? null;

  const anniversaries: Anniversary[] = [];
  const firstAnniversary = archiveStart
    ? new Date(
        Date.UTC(
          archiveStart.getUTCFullYear() + 1,
          archiveStart.getUTCMonth(),
          archiveStart.getUTCDate(),
        ),
      )
    : null;

  if (archiveStart) {
    const spanMs = ANNIVERSARY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    for (let past = year - 1; past >= archiveStart.getUTCFullYear(); past -= 1) {
      const anniversary = Date.UTC(past, month, day);
      const rows = await prisma.yap.findMany({
        where: {
          teamId,
          deletedAt: null,
          saidAt: {
            gte: new Date(anniversary - spanMs),
            lte: new Date(anniversary + spanMs),
          },
        },
        select: { id: true, saidAt: true },
        orderBy: { saidAt: "asc" },
      });
      if (rows.length === 0) continue;

      const ids = rows.map((row) => row.id);
      // Aura as it stood at the end of the day each statement was made.
      const cutoffs = new Map(
        rows.map((row) => [
          row.id,
          new Date(
            Date.UTC(
              row.saidAt.getUTCFullYear(),
              row.saidAt.getUTCMonth(),
              row.saidAt.getUTCDate(),
              23,
              59,
              59,
            ),
          ),
        ]),
      );

      const [records, auraThen] = await Promise.all([
        getYaps(ids, teamId, viewerId),
        auraAsOfEach(cutoffs),
      ]);

      const saidAtById = new Map(rows.map((row) => [row.id, row.saidAt]));
      const hydrated = records
        .map((record: YapView) => {
          const saidAt = saidAtById.get(record.id)!;
          const offset = Math.round(
            (Date.UTC(saidAt.getUTCFullYear(), saidAt.getUTCMonth(), saidAt.getUTCDate()) -
              anniversary) /
              (24 * 60 * 60 * 1000),
          );
          return {
            ...record,
            auraThen: auraThen.get(record.id) ?? 0,
            daysAgo: Math.round(
              (Date.UTC(year, month, day) - saidAt.getTime()) / (24 * 60 * 60 * 1000),
            ),
            offsetDays: offset,
          };
        })
        .sort((a, b) => Math.abs(a.offsetDays) - Math.abs(b.offsetDays));

      anniversaries.push({
        yearsAgo: year - past,
        year: past,
        exact: hydrated.some((record) => record.offsetDays === 0),
        records: hydrated,
      });
    }
  }

  return { date: reference, anniversaries, firstAnniversary, archiveStart };
}

/** Cheap check for the feed sidebar: is there anything from around this time? */
export async function hasAnniversaryToday(
  teamId: string,
  reference: Date = new Date(),
): Promise<number> {
  const bounds = await prisma.yap.aggregate({
    where: { teamId, deletedAt: null },
    _min: { saidAt: true },
  });
  const start = bounds._min.saidAt;
  if (!start) return 0;

  const spanMs = ANNIVERSARY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const ranges: Array<{ gte: Date; lte: Date }> = [];
  for (let past = reference.getUTCFullYear() - 1; past >= start.getUTCFullYear(); past -= 1) {
    const anniversary = Date.UTC(past, reference.getUTCMonth(), reference.getUTCDate());
    ranges.push({ gte: new Date(anniversary - spanMs), lte: new Date(anniversary + spanMs) });
  }
  if (ranges.length === 0) return 0;

  return prisma.yap.count({
    where: { teamId, deletedAt: null, OR: ranges.map((range) => ({ saidAt: range })) },
  });
}

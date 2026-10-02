import { prisma } from "@/lib/db";
import { offsetMinutes, shift } from "@/lib/zoned";
import { yapCode } from "@/lib/format";
import type { YapperRef } from "@/lib/types";

/**
 * WRAPPED — the archive's periodic self-assessment.
 *
 * Everything here is derived from timestamps that already exist (saidAt on
 * records, createdAt on battles), so no new tables and no nightly job. A period
 * is the month the yapping happened in, not the month it was typed up — that is
 * what "September" means to a person.
 */
export type WrappedPeriod = { year: number; month: number | null };

/**
 * Below this, a full report is noise: a histogram of four records and a grid of
 * single digits reads as a failure rather than a joke. Quiet periods get a
 * shorter, drier treatment instead — the emptiness is part of the product.
 */
export const WRAPPED_MIN_RECORDS = 10;

export type WrappedReport = {
  period: WrappedPeriod;
  label: string;
  from: Date;
  to: Date;
  yapCount: number;
  totalAura: number;
  certifiedCount: number;
  disputedCount: number;
  witnessCount: number;
  battleCount: number;
  newYappers: number;
  evidenceCount: number;
  loreCount: number;
  topYapper: { yapper: YapperRef; aura: number; yapCount: number } | null;
  yapOfThePeriod: { id: number; code: string; text: string; aura: number; author: string } | null;
  longest: { id: number; code: string; text: string } | null;
  /** 24 buckets, index = UTC hour. */
  hours: number[];
  peakHour: number | null;
  activeYappers: number;
  /** Too little happened for the full treatment. */
  sparse: boolean;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "September" means September on the archive's clock, so the instants the
 * query compares against are the local month edges, pushed back by the zone's
 * offset. Without this, a team three hours east loses everything said before
 * 03:00 on the 1st to the previous month.
 */
export function periodBounds(
  period: WrappedPeriod,
  timeZone = "UTC",
): { from: Date; to: Date } {
  const localEdge = (year: number, month: number) => {
    const asUtc = new Date(Date.UTC(year, month, 1));
    return new Date(asUtc.getTime() - offsetMinutes(asUtc, timeZone) * 60000);
  };
  if (period.month === null) {
    return { from: localEdge(period.year, 0), to: localEdge(period.year + 1, 0) };
  }
  return {
    from: localEdge(period.year, period.month - 1),
    to: localEdge(period.year, period.month),
  };
}

export function periodLabel(period: WrappedPeriod): string {
  return period.month === null
    ? String(period.year)
    : `${MONTHS[period.month - 1]} ${period.year}`;
}

export function periodSlug(period: WrappedPeriod): string {
  return period.month === null
    ? `/wrapped/${period.year}`
    : `/wrapped/${period.year}/${String(period.month).padStart(2, "0")}`;
}

/** Every month the archive has anything to say about, newest first. */
export async function listPeriods(teamId: string, timeZone = "UTC"): Promise<WrappedPeriod[]> {
  const bounds = await prisma.yap.aggregate({
    where: { teamId, deletedAt: null },
    _min: { saidAt: true },
    _max: { saidAt: true },
  });
  const first = bounds._min.saidAt;
  const last = bounds._max.saidAt;
  if (!first || !last) return [];

  // Which month a record belongs to is a question about the archive's clock.
  const firstLocal = shift(first, timeZone);
  const lastLocal = shift(last, timeZone);

  const periods: WrappedPeriod[] = [];
  const cursor = new Date(Date.UTC(lastLocal.getUTCFullYear(), lastLocal.getUTCMonth(), 1));
  const stop = new Date(Date.UTC(firstLocal.getUTCFullYear(), firstLocal.getUTCMonth(), 1));

  while (cursor >= stop) {
    periods.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  const years = [...new Set(periods.map((p) => p.year))].sort((a, b) => b - a);
  return [...years.map((year) => ({ year, month: null })), ...periods];
}

export async function getWrapped(
  period: WrappedPeriod,
  teamId: string,
  timeZone = "UTC",
): Promise<WrappedReport> {
  const { from, to } = periodBounds(period, timeZone);
  const where = { teamId, deletedAt: null, saidAt: { gte: from, lt: to } };

  const [yaps, battleCount] = await Promise.all([
    prisma.yap.findMany({
      where,
      select: {
        id: true,
        text: true,
        aura: true,
        saidAt: true,
        verification: true,
        disputedAt: true,
        witnessCount: true,
        denialCount: true,
        lore: true,
        authorId: true,
        author: true,
        _count: { select: { evidence: true } },
      },
    }),
    prisma.battle.count({ where: { teamId, createdAt: { gte: from, lt: to } } }),
  ]);

  const hours = new Array(24).fill(0) as number[];
  const byAuthor = new Map<string, { aura: number; count: number }>();
  let totalAura = 0;
  let certifiedCount = 0;
  let disputedCount = 0;
  let witnessCount = 0;
  let evidenceCount = 0;
  let loreCount = 0;
  let best: (typeof yaps)[number] | null = null;
  let longest: (typeof yaps)[number] | null = null;

  for (const yap of yaps) {
    totalAura += yap.aura;
    witnessCount += yap.witnessCount;
    evidenceCount += yap._count.evidence;
    if (yap.lore) loreCount += 1;
    if (yap.verification === "CERTIFIED") certifiedCount += 1;
    if (yap.disputedAt || (yap.denialCount >= 2 && yap.denialCount * 2 >= yap.witnessCount)) {
      disputedCount += 1;
    }
    // The hour the office actually experienced, not the hour in UTC.
    hours[shift(yap.saidAt, timeZone).getUTCHours()] += 1;

    const tally = byAuthor.get(yap.authorId) ?? { aura: 0, count: 0 };
    tally.aura += yap.aura;
    tally.count += 1;
    byAuthor.set(yap.authorId, tally);

    if (!best || yap.aura > best.aura) best = yap;
    if (!longest || yap.text.length > longest.text.length) longest = yap;
  }

  const topAuthorId = [...byAuthor.entries()].sort((a, b) => b[1].aura - a[1].aura)[0];
  const topAuthor = topAuthorId
    ? yaps.find((yap) => yap.authorId === topAuthorId[0])?.author
    : undefined;

  // Someone whose very first statement lands in this period.
  const firstEver = await prisma.yap.groupBy({
    by: ["authorId"],
    where: { teamId, deletedAt: null },
    _min: { saidAt: true },
  });
  const newYappers = firstEver.filter(
    (row) => row._min.saidAt && row._min.saidAt >= from && row._min.saidAt < to,
  ).length;

  const peakCount = Math.max(...hours);
  const peakHour = peakCount > 0 ? hours.indexOf(peakCount) : null;

  return {
    period,
    label: periodLabel(period),
    from,
    to,
    yapCount: yaps.length,
    totalAura,
    certifiedCount,
    disputedCount,
    witnessCount,
    battleCount,
    newYappers,
    evidenceCount,
    loreCount,
    topYapper:
      topAuthor && topAuthorId
        ? {
            yapper: {
              id: topAuthor.id,
              displayName: topAuthor.displayName,
              handle: topAuthor.handle,
              avatarUrl: topAuthor.avatarUrl,
              title: topAuthor.title,
              hasAccount: Boolean(topAuthor.username),
            },
            aura: topAuthorId[1].aura,
            yapCount: topAuthorId[1].count,
          }
        : null,
    yapOfThePeriod: best
      ? {
          id: best.id,
          code: yapCode(best.id),
          text: best.text,
          aura: best.aura,
          author: best.author.displayName,
        }
      : null,
    longest: longest ? { id: longest.id, code: yapCode(longest.id), text: longest.text } : null,
    hours,
    peakHour,
    activeYappers: byAuthor.size,
    sparse: yaps.length < WRAPPED_MIN_RECORDS,
  };
}

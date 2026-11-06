import { prisma } from "@/lib/db";
import { yapCode } from "@/lib/format";
import {
  compareIsoWeeks,
  isoWeekAt,
  isoWeekBounds,
  nextIsoWeek,
  previousIsoWeek,
  type IsoWeek,
} from "@/lib/iso-week";
import { movementFor, situationFor, verdictFor, type Movement, type SituationKey, type VerdictKey } from "@/lib/oversight";
import { shift } from "@/lib/zoned";
import { auraAsOf } from "@/lib/services/aura-history";
import {
  getWeeklyRuling,
  latestReportableWeek,
  weekClosesAt,
  type WeeklyRulingView,
} from "@/lib/services/weekly";
import type { YapperRef } from "@/lib/types";

/**
 * THE DEPARTMENT OF VERBAL OVERSIGHT.
 *
 * Two readings of the same archive, and the difference between them is the
 * whole point:
 *
 *   An **incident** is a record being *entered*. Finding a two-year-old quote
 *   and filing it today is today's incident, because the archive gaining it is
 *   the event — so incidents are counted by `createdAt`.
 *
 *   A **title** is about who was talking, so the yapper of the week is counted
 *   by `saidAt`, in `services/weekly`.
 *
 * The two genuinely disagree on busy weeks, which is why the report prints
 * both and says which is which rather than quietly picking one.
 */
const DAY = 24 * 60 * 60 * 1000;

/** The local calendar day an instant fell on, as a day number. */
function localDay(instant: Date, timeZone: string): number {
  const local = shift(instant, timeZone);
  return Math.floor(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) / DAY,
  );
}

export type QuietSpell = {
  /** Complete local calendar days since the last record was entered. */
  days: number;
  lastIncident: Date;
  situation: SituationKey;
};

/**
 * DAYS WITHOUT A VERBAL INCIDENT.
 *
 * Counted in local calendar days rather than in elapsed milliseconds, which is
 * both what the sign on a factory wall means and the only version that
 * survives daylight saving: something entered at 23:50 yesterday is one day
 * ago at 00:10 today, and `(now - then) / 86400000` would call that zero
 * forever. Two subtractions of a calendar date, no durations.
 *
 * Null means nothing has ever been entered. That is a different state from
 * zero days, and the interface says so instead of inventing a date.
 */
export async function getQuietSpell(
  teamId: string,
  timeZone = "UTC",
  now: Date = new Date(),
): Promise<QuietSpell | null> {
  const latest = await prisma.yap.aggregate({
    where: { teamId, deletedAt: null },
    _max: { createdAt: true },
  });
  const last = latest._max.createdAt;
  if (!last) return null;

  // A record entered later than `now` only happens in tests and clock skew;
  // clamping keeps the counter from going negative in either case.
  const days = Math.max(0, localDay(now, timeZone) - localDay(last, timeZone));
  return { days, lastIncident: last, situation: situationFor(days) };
}

export type LoudestRecord = {
  id: number;
  code: string;
  text: string;
  author: YapperRef;
  aura: number;
  /**
   * DEADLINE — aura as it stood when the file closed, rebuilt from reaction
   * timestamps. NOW — the file is still open, so this is the current figure
   * and is labelled as such rather than dressed up as history.
   */
  measuredAt: "DEADLINE" | "NOW";
};

export type IncidentReport = {
  week: IsoWeek;
  /** The clock every date in this report is read on. */
  timeZone: string;
  from: Date;
  to: Date;
  closesAt: Date;
  /** FINAL once the week's file has closed. */
  status: "FINAL" | "PROVISIONAL";
  /** Records entered during the week — the incident count. */
  registered: number;
  /** Distinct people quoted among them. */
  speakers: number;
  /** Reactions cast during the week, on records this archive still holds. */
  reactions: number;
  previousRegistered: number | null;
  movement: Movement;
  verdict: VerdictKey;
  ruling: WeeklyRulingView | null;
  loudest: LoudestRecord | null;
  /** Whether the navigation has anywhere to go. */
  earlier: IsoWeek | null;
  later: IsoWeek | null;
};

/**
 * The first week the archive registered anything in, by `createdAt`.
 *
 * Redacted records count towards this bound, as they do in `firstSpokenWeek`:
 * it answers how far back the files go, not what is in them. A period whose
 * records have all since been redacted still has a report, and that report
 * honestly reads zero.
 */
export async function firstRegisteredWeek(
  teamId: string,
  timeZone: string,
): Promise<IsoWeek | null> {
  const opened = await prisma.yap.aggregate({
    where: { teamId },
    _min: { createdAt: true },
  });
  return opened._min.createdAt ? isoWeekAt(opened._min.createdAt, timeZone) : null;
}

/**
 * The report for one week.
 *
 * Deliberately computed rather than snapshotted, apart from the ruling at its
 * centre: the counts are a question about the archive as it stands, and a
 * redaction *should* remove a record from last month's figures. The page says
 * as much, because a report that silently recalculates while calling itself a
 * historical record is the dishonest version of this.
 *
 * Six queries, none of them over the whole archive: this week's records, last
 * week's count, this week's reactions, the ruling, the aura reconstruction and
 * the bounds of the navigation.
 */
export async function getIncidentReport(
  teamId: string,
  timeZone: string,
  week: IsoWeek,
  now: Date = new Date(),
): Promise<IncidentReport | null> {
  const latest = latestReportableWeek(timeZone, now);
  if (compareIsoWeeks(week, latest) > 0) return null;

  const firstWeek = await firstRegisteredWeek(teamId, timeZone);
  if (!firstWeek) return null;
  if (compareIsoWeeks(week, firstWeek) < 0) return null;

  const { from, to } = isoWeekBounds(week, timeZone);
  const before = isoWeekBounds(previousIsoWeek(week), timeZone);
  const closesAt = weekClosesAt(week, timeZone);
  const live = { teamId, deletedAt: null };

  const [entered, previousCount, reactions, ruling] = await Promise.all([
    prisma.yap.findMany({
      where: { ...live, createdAt: { gte: from, lt: to } },
      select: {
        id: true,
        text: true,
        aura: true,
        authorId: true,
        author: {
          select: {
            id: true,
            displayName: true,
            handle: true,
            avatarUrl: true,
            title: true,
            username: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    compareIsoWeeks(previousIsoWeek(week), firstWeek) < 0
      ? Promise.resolve(null)
      : prisma.yap.count({
          where: { ...live, createdAt: { gte: before.from, lt: before.to } },
        }),
    prisma.reaction.count({
      where: { yap: live, createdAt: { gte: from, lt: to } },
    }),
    getWeeklyRuling(teamId, timeZone, week, now),
  ]);

  const registered = entered.length;
  const speakers = new Set(entered.map((record) => record.authorId)).size;
  const status: "FINAL" | "PROVISIONAL" = closesAt <= now ? "FINAL" : "PROVISIONAL";

  // The loudest of the week's intake. Measured at the deadline once the file
  // has closed, so a historical report prints a historical number.
  const measuredAt = status === "FINAL" ? "DEADLINE" : "NOW";
  let loudest: LoudestRecord | null = null;
  if (entered.length > 0) {
    const auraThen = await auraAsOf(
      entered.map((record) => record.id),
      status === "FINAL" ? closesAt : now,
    );
    const ranked = entered
      .map((record) => ({ record, aura: auraThen.get(record.id) ?? 0 }))
      // Aura decides; the record number breaks a tie, so the same week always
      // names the same statement.
      .sort((a, b) => b.aura - a.aura || a.record.id - b.record.id);
    const top = ranked[0]!;
    loudest = {
      id: top.record.id,
      code: yapCode(top.record.id),
      text: top.record.text,
      author: {
        id: top.record.author.id,
        displayName: top.record.author.displayName,
        handle: top.record.author.handle,
        avatarUrl: top.record.author.avatarUrl,
        title: top.record.author.title,
        hasAccount: Boolean(top.record.author.username),
      },
      aura: top.aura,
      measuredAt,
    };
  }

  const earlier = compareIsoWeeks(previousIsoWeek(week), firstWeek) >= 0
    ? previousIsoWeek(week)
    : null;
  const later = compareIsoWeeks(week, latest) < 0 ? nextIsoWeek(week) : null;

  return {
    week,
    timeZone,
    from,
    to,
    closesAt,
    status,
    registered,
    speakers,
    reactions,
    previousRegistered: previousCount,
    movement: movementFor(registered, previousCount),
    verdict: verdictFor(registered, previousCount),
    ruling,
    loudest,
    earlier,
    later,
  };
}

/** The report the archive opens on: the last completed week. */
export async function getLatestIncidentReport(
  teamId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<IncidentReport | null> {
  return getIncidentReport(teamId, timeZone, latestReportableWeek(timeZone, now), now);
}

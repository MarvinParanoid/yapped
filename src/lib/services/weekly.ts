import { prisma } from "@/lib/db";
import {
  compareIsoWeeks,
  isoWeekAt,
  isoWeekBounds,
  isoWeekFollowedBy,
  isoWeeksBetween,
  previousIsoWeek,
  type IsoWeek,
} from "@/lib/iso-week";
import { auraAsOfEach } from "@/lib/services/aura-history";
import type { YapperRef } from "@/lib/types";

/**
 * YAPPER OF THE WEEK — the committee's standing agenda.
 *
 * A week belongs to whoever put the most on the record during it. Count first,
 * aura second: this is the same order the archivists' table already uses, and
 * for the same reason. Weighing a quote against a reaction would need an
 * exchange rate nobody can defend, so neither table invents one — one number
 * ranks, the other breaks the tie, and both are printed beside the name.
 *
 * The week is measured by `saidAt`, not by when a record was filed. Saying
 * things is what the title is for, and nothing else would survive somebody
 * spending an afternoon entering two years of backlog.
 *
 * ## The deadline, and why everything hangs off it
 *
 * A reporting period needs a moment at which the file closes, or the answer
 * depends on who opened the page first. Every input is therefore cut at the
 * same instant — **midday on the Monday after the week**, on the archive's own
 * clock — and none of them is read as "now":
 *
 *   which records count  — said inside the week AND filed by the deadline;
 *   whether they count   — not redacted as of the deadline;
 *   what they were worth — aura reconstructed from the reactions that existed
 *                          by then, which `auraAsOf` can do because reactions
 *                          carry timestamps.
 *
 * So the verdict is a function of the archive and the deadline, not of the
 * clock at the moment somebody looks. Opening the page at 12:01 on Monday and
 * again on Thursday gives the same answer, and the first reader no longer
 * decides anything. The result is then written down, after which it is read
 * rather than recomputed, and nothing reopens it.
 *
 * **The one thing that is not reproducible**, stated plainly: withdrawing a
 * reaction deletes its row (see `toggleReaction`), so a reaction cast before
 * the deadline and taken back afterwards cannot be reconstructed. History is
 * rebuilt from the reactions that still exist. This only matters in the window
 * between the deadline and the first time anyone asks — once the ruling is
 * stored, it is frozen like everything else.
 *
 * Before the deadline the same calculation runs with `now` as the cutoff and
 * the answer is labelled provisional. It is deliberately **not** written down.
 */
export const WEEK_CLOSES_AT_HOUR = 12;

/**
 * How many weeks one page load will catch up on.
 *
 * The backfill is bounded by the archive's own history, and a history is
 * bounded by whatever date somebody typed into the "when was this said" field.
 * One backdated quote from 1998 would otherwise turn the next page render into
 * fifteen hundred rulings. Two and a bit years per pass, newest first, and a
 * deep archive finishes catching up over the next few visits — the weeks that
 * matter are the recent ones, and asking for an old week adjudicates its own
 * run anyway.
 */
const MAX_WEEKS_PER_PASS = 120;

/** When the file on a week closes: midday the following Monday, locally. */
export function weekClosesAt(week: IsoWeek, timeZone: string): Date {
  return isoWeekFollowedBy(week, timeZone, WEEK_CLOSES_AT_HOUR);
}

/**
 * FINAL — the deadline has passed and the ruling is on file.
 * PROVISIONAL — the week has ended but the file is still open.
 */
export type RulingStatus = "FINAL" | "PROVISIONAL";

export type WeeklyRulingView = {
  week: IsoWeek;
  from: Date;
  to: Date;
  closesAt: Date;
  status: RulingStatus;
  /** Null when nothing was said that week. */
  winner: YapperRef | null;
  /**
   * Whether the winner has since left. A ruling is about a week that happened,
   * so somebody leaving afterwards does not vacate it.
   */
  winnerFormer: boolean;
  /** The grounds, as they stood at the deadline. */
  recordCount: number;
  aura: number;
};

export type WeekCandidate = { authorId: string; aura: number; saidAt: Date };
export type WeekVerdict = { winnerId: string | null; recordCount: number; aura: number };

/**
 * The rule itself, kept pure so it can be read and tested without a database.
 *
 * Ties run out of tiebreaks before they run out of people: records, then aura,
 * then whoever started first, then the identifier. The last one decides nothing
 * anybody cares about — it is there so the same week never produces two
 * different answers.
 */
export function decideWeek(records: readonly WeekCandidate[]): WeekVerdict {
  const tally = new Map<string, { count: number; aura: number; first: number }>();
  for (const record of records) {
    const row = tally.get(record.authorId) ?? { count: 0, aura: 0, first: Infinity };
    row.count += 1;
    row.aura += record.aura;
    row.first = Math.min(row.first, record.saidAt.getTime());
    tally.set(record.authorId, row);
  }

  const top = [...tally.entries()].sort(
    ([idA, a], [idB, b]) =>
      b.count - a.count || b.aura - a.aura || a.first - b.first || (idA < idB ? -1 : 1),
  )[0];

  return top
    ? { winnerId: top[0], recordCount: top[1].count, aura: top[1].aura }
    : { winnerId: null, recordCount: 0, aura: 0 };
}

const weekKey = (week: IsoWeek) => `${week.isoYear}-${week.isoWeek}`;

/**
 * Work out the verdict for a set of weeks, each against its own cutoff.
 *
 * One read and one aura reconstruction for the whole set, because the first
 * run on an existing archive has a year of weeks to catch up on and a query
 * per week is the obvious way to make that slow. Afterwards the set is one
 * week, or none at all.
 */
async function examineWeeks(
  teamId: string,
  timeZone: string,
  asked: ReadonlyArray<{ week: IsoWeek; cutoff: Date }>,
): Promise<Map<string, WeekVerdict>> {
  const verdicts = new Map<string, WeekVerdict>();
  if (asked.length === 0) return verdicts;

  const spans = asked.map((entry) => ({ ...entry, ...isoWeekBounds(entry.week, timeZone) }));
  const earliestCutoff = new Date(Math.min(...spans.map((s) => s.cutoff.getTime())));
  const latestCutoff = new Date(Math.max(...spans.map((s) => s.cutoff.getTime())));

  // The union of every span, narrowed as far as SQL can take it; each week's
  // own cutoff is applied in memory below, because they differ per week.
  const records = await prisma.yap.findMany({
    where: {
      teamId,
      saidAt: {
        gte: new Date(Math.min(...spans.map((s) => s.from.getTime()))),
        lt: new Date(Math.max(...spans.map((s) => s.to.getTime()))),
      },
      createdAt: { lte: latestCutoff },
      // On file at the earliest cutoff in the set, or still on file now. A
      // record redacted after a deadline was in front of the committee.
      OR: [{ deletedAt: null }, { deletedAt: { gt: earliestCutoff } }],
    },
    select: { id: true, authorId: true, saidAt: true, createdAt: true, deletedAt: true },
  });

  const forWeek = new Map<string, typeof records>();
  const cutoffs = new Map<number, Date>();
  for (const span of spans) {
    const mine = records.filter(
      (record) =>
        record.saidAt >= span.from &&
        record.saidAt < span.to &&
        record.createdAt <= span.cutoff &&
        (record.deletedAt === null || record.deletedAt > span.cutoff),
    );
    forWeek.set(weekKey(span.week), mine);
    // A record can only belong to one week, so one cutoff per record is enough.
    for (const record of mine) cutoffs.set(record.id, span.cutoff);
  }

  // Aura as it stood at each record's own deadline, rebuilt from reaction
  // timestamps rather than read off today's denormalized total.
  const auraThen = await auraAsOfEach(cutoffs);

  for (const span of spans) {
    const mine = forWeek.get(weekKey(span.week)) ?? [];
    verdicts.set(
      weekKey(span.week),
      decideWeek(
        mine.map((record) => ({
          authorId: record.authorId,
          saidAt: record.saidAt,
          aura: auraThen.get(record.id) ?? 0,
        })),
      ),
    );
  }
  return verdicts;
}

/**
 * Rule on every closed week that has not been ruled on yet.
 *
 * A week whose deadline has not passed is left alone: it has no final answer
 * to record, and writing a provisional one would be the first-reader problem
 * with extra steps.
 */
async function adjudicate(
  teamId: string,
  timeZone: string,
  first: IsoWeek,
  target: IsoWeek,
  now: Date,
): Promise<void> {
  // One row per week per archive, so this stays in the dozens for years.
  const settled = await prisma.weeklyRuling.findMany({
    where: { teamId },
    select: { isoYear: true, isoWeek: true },
  });
  const known = new Set(settled.map((row) => weekKey(row)));
  const missing = isoWeeksBetween(first, target)
    .filter((week) => !known.has(weekKey(week)))
    .map((week) => ({ week, cutoff: weekClosesAt(week, timeZone) }))
    .filter((entry) => entry.cutoff <= now)
    // Newest first: the week actually being asked about is the last one in the
    // range, so it is always inside the slice.
    .slice(-MAX_WEEKS_PER_PASS);
  if (missing.length === 0) return;

  const verdicts = await examineWeeks(teamId, timeZone, missing);

  await prisma.weeklyRuling.createMany({
    data: missing.map(({ week }) => {
      const bounds = isoWeekBounds(week, timeZone);
      return {
        teamId,
        isoYear: week.isoYear,
        isoWeek: week.isoWeek,
        periodFrom: bounds.from,
        periodTo: bounds.to,
        ...(verdicts.get(weekKey(week)) ?? { winnerId: null, recordCount: 0, aura: 0 }),
      };
    }),
    // Two people opening the archive at the same moment compute the same
    // verdict; the first one written stands and the second is dropped rather
    // than filed as a second opinion.
    skipDuplicates: true,
  });
}

function toYapperRef(user: {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  title: string | null;
  username: string | null;
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

const WINNER_SELECT = {
  id: true,
  displayName: true,
  handle: true,
  avatarUrl: true,
  title: true,
  username: true,
} as const;

/** The last week the archive can report on at all. */
export function latestReportableWeek(timeZone: string, now: Date = new Date()): IsoWeek {
  return previousIsoWeek(isoWeekAt(now, timeZone));
}

/**
 * The first week the archive has anything to say about, by `saidAt`.
 *
 * Redacted records count here, and only here. This is the question "how far
 * back does this archive go", and hiding a record does not move the archive's
 * beginning — a week whose only statement was later redacted is still a week
 * the committee sat on, and it has to stay reachable for its ruling to be
 * readable.
 */
export async function firstSpokenWeek(
  teamId: string,
  timeZone: string,
): Promise<IsoWeek | null> {
  const opened = await prisma.yap.aggregate({
    where: { teamId },
    _min: { saidAt: true },
  });
  return opened._min.saidAt ? isoWeekAt(opened._min.saidAt, timeZone) : null;
}

/**
 * The ruling for one week: read if it is on file, worked out if the deadline
 * has passed and nobody has asked yet, and worked out provisionally if it has
 * not.
 */
export async function getWeeklyRuling(
  teamId: string,
  timeZone: string,
  week: IsoWeek,
  now: Date = new Date(),
): Promise<WeeklyRulingView | null> {
  const first = await firstSpokenWeek(teamId, timeZone);
  if (!first) return null;
  if (compareIsoWeeks(week, first) < 0) return null;
  if (compareIsoWeeks(week, latestReportableWeek(timeZone, now)) > 0) return null;

  const bounds = isoWeekBounds(week, timeZone);
  const closesAt = weekClosesAt(week, timeZone);

  if (closesAt <= now) {
    await adjudicate(teamId, timeZone, first, week, now);
    const ruling = await prisma.weeklyRuling.findUnique({
      where: { teamId_isoYear_isoWeek: { teamId, isoYear: week.isoYear, isoWeek: week.isoWeek } },
      include: {
        // The personnel status lives on the membership for this archive, so it
        // comes back with the winner rather than as a second lookup.
        winner: {
          select: {
            ...WINNER_SELECT,
            memberships: { where: { teamId }, select: { employment: true } },
          },
        },
      },
    });
    if (!ruling) return null;
    return {
      week,
      from: ruling.periodFrom,
      to: ruling.periodTo,
      closesAt,
      status: "FINAL",
      winner: ruling.winner ? toYapperRef(ruling.winner) : null,
      winnerFormer: ruling.winner?.memberships[0]?.employment === "FORMER",
      recordCount: ruling.recordCount,
      aura: ruling.aura,
    };
  }

  // The week has ended but the file is still open. Same calculation, cut at
  // now instead of at the deadline, and deliberately not written down.
  const verdict = (await examineWeeks(teamId, timeZone, [{ week, cutoff: now }])).get(
    weekKey(week),
  );
  const winner = verdict?.winnerId
    ? await prisma.user.findUnique({
        where: { id: verdict.winnerId },
        select: {
          ...WINNER_SELECT,
          memberships: { where: { teamId }, select: { employment: true } },
        },
      })
    : null;

  return {
    week,
    from: bounds.from,
    to: bounds.to,
    closesAt,
    status: "PROVISIONAL",
    winner: winner ? toYapperRef(winner) : null,
    winnerFormer: winner?.memberships[0]?.employment === "FORMER",
    recordCount: verdict?.recordCount ?? 0,
    aura: verdict?.aura ?? 0,
  };
}


/** The last completed week, however far its file has got. */
export async function getYapperOfTheWeek(
  teamId: string,
  timeZone = "UTC",
  now: Date = new Date(),
): Promise<WeeklyRulingView | null> {
  return getWeeklyRuling(teamId, timeZone, latestReportableWeek(timeZone, now), now);
}

/**
 * How many weeks this person has been named in this archive.
 *
 * Counted from the rulings on file rather than awarded as a badge: the title is
 * not an achievement, carries no aura and moves no rating — it is a list of
 * weeks that happen to have the same name at the top. A week whose file is
 * still open is not counted, because it has not been decided.
 */
export async function countWeeklyTitles(userId: string, teamId: string): Promise<number> {
  return prisma.weeklyRuling.count({ where: { teamId, winnerId: userId } });
}

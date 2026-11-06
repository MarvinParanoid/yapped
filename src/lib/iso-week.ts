import { shift, unshift } from "@/lib/zoned";

/**
 * ISO weeks, on the archive's own clock.
 *
 * A reporting period has to mean the same thing to everyone reading it, and
 * "last week" is the one unit of time people actually use for this: Monday to
 * Sunday, the week the office had. ISO-8601 settles the two questions that
 * otherwise get answered differently every year — which day starts a week
 * (Monday) and which year a week belongs to (the one holding its Thursday,
 * which is why 1 January is frequently week 53 of the year before).
 *
 * Pure, like `lib/zoned`: the only thing it reaches for is that module's
 * reading of a zone offset.
 */
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

export type IsoWeek = { isoYear: number; isoWeek: number };

/** Monday = 0 … Sunday = 6, from a date read in its UTC parts. */
function isoDay(utc: Date): number {
  return (utc.getUTCDay() + 6) % 7;
}

/** Midnight starting week 1 of an ISO year, as a wall clock labelled UTC. */
function week1Monday(isoYear: number): number {
  // The whole of the ISO rule: week 1 is the week containing 4 January.
  const jan4 = Date.UTC(isoYear, 0, 4);
  return jan4 - isoDay(new Date(jan4)) * DAY;
}

/** 52, or 53 in a long year. Derived rather than tabulated. */
export function isoWeeksInYear(isoYear: number): number {
  return Math.round((week1Monday(isoYear + 1) - week1Monday(isoYear)) / WEEK);
}

/** Which week an instant fell in, for a reader keeping `timeZone`. */
export function isoWeekAt(instant: Date, timeZone: string): IsoWeek {
  const local = shift(instant, timeZone);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const thursday = midnight + (3 - isoDay(new Date(midnight))) * DAY;
  const isoYear = new Date(thursday).getUTCFullYear();
  // Thursday is always week1Monday plus a whole number of weeks plus three
  // days, so rounding lands on the week index and never between two.
  return { isoYear, isoWeek: Math.round((thursday - week1Monday(isoYear)) / WEEK) + 1 };
}

/** The instants a week covers: Monday 00:00 local, up to the next Monday. */
export function isoWeekBounds(week: IsoWeek, timeZone: string): { from: Date; to: Date } {
  const monday = week1Monday(week.isoYear) + (week.isoWeek - 1) * WEEK;
  return {
    from: unshift(new Date(monday), timeZone),
    to: unshift(new Date(monday + WEEK), timeZone),
  };
}

/**
 * A wall-clock hour on the Monday that follows the week, as a real instant.
 *
 * This is how a reporting period gets a deadline: the week itself ends at
 * midnight, but the file on it closes later, and the two are not the same
 * question.
 */
export function isoWeekFollowedBy(week: IsoWeek, timeZone: string, hour: number): Date {
  const nextMonday = week1Monday(week.isoYear) + week.isoWeek * WEEK;
  return unshift(new Date(nextMonday + hour * 60 * 60 * 1000), timeZone);
}

export function compareIsoWeeks(a: IsoWeek, b: IsoWeek): number {
  return a.isoYear - b.isoYear || a.isoWeek - b.isoWeek;
}

export function previousIsoWeek(week: IsoWeek): IsoWeek {
  if (week.isoWeek > 1) return { isoYear: week.isoYear, isoWeek: week.isoWeek - 1 };
  const before = week.isoYear - 1;
  return { isoYear: before, isoWeek: isoWeeksInYear(before) };
}

export function nextIsoWeek(week: IsoWeek): IsoWeek {
  if (week.isoWeek < isoWeeksInYear(week.isoYear)) {
    return { isoYear: week.isoYear, isoWeek: week.isoWeek + 1 };
  }
  return { isoYear: week.isoYear + 1, isoWeek: 1 };
}

/** Every week from `from` to `to`, inclusive; empty if `to` comes first. */
export function isoWeeksBetween(from: IsoWeek, to: IsoWeek): IsoWeek[] {
  const weeks: IsoWeek[] = [];
  for (let cursor = from; compareIsoWeeks(cursor, to) <= 0; cursor = nextIsoWeek(cursor)) {
    weeks.push(cursor);
  }
  return weeks;
}

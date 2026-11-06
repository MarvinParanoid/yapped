import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  compareIsoWeeks,
  isoWeekAt,
  isoWeekBounds,
  isoWeeksBetween,
  isoWeeksInYear,
  nextIsoWeek,
  previousIsoWeek,
} from "@/lib/iso-week";

/**
 * The reporting period, which is the one piece of arithmetic behind the weekly
 * ruling. Everything here is checked against dates a calendar can be held up
 * to — the year boundaries especially, because that is where a week stops
 * belonging to the year its dates are in.
 */
describe("ISO weeks", () => {
  test("a week runs Monday to Sunday", () => {
    // 2 November 2026 is a Monday.
    const monday = isoWeekAt(new Date("2026-11-02T00:00:00Z"), "UTC");
    const sunday = isoWeekAt(new Date("2026-11-08T23:59:59Z"), "UTC");
    assert.deepEqual(monday, { isoYear: 2026, isoWeek: 45 });
    assert.deepEqual(sunday, { isoYear: 2026, isoWeek: 45 });

    // One second later is a new week, not a new day of the same one.
    assert.deepEqual(isoWeekAt(new Date("2026-11-09T00:00:00Z"), "UTC"), {
      isoYear: 2026,
      isoWeek: 46,
    });
  });

  test("the year a week belongs to is decided by its Thursday", () => {
    // 1 January 2027 is a Friday, so that whole week is still 2026.
    assert.deepEqual(isoWeekAt(new Date("2027-01-01T12:00:00Z"), "UTC"), {
      isoYear: 2026,
      isoWeek: 53,
    });
    assert.deepEqual(isoWeekAt(new Date("2027-01-03T12:00:00Z"), "UTC"), {
      isoYear: 2026,
      isoWeek: 53,
    });
    assert.deepEqual(isoWeekAt(new Date("2027-01-04T12:00:00Z"), "UTC"), {
      isoYear: 2027,
      isoWeek: 1,
    });

    // And the other direction: 29 December 2025 is a Monday of week 1 of 2026.
    assert.deepEqual(isoWeekAt(new Date("2025-12-29T12:00:00Z"), "UTC"), {
      isoYear: 2026,
      isoWeek: 1,
    });
  });

  test("some years have fifty-three weeks", () => {
    assert.equal(isoWeeksInYear(2026), 53);
    assert.equal(isoWeeksInYear(2025), 52);
    assert.equal(isoWeeksInYear(2020), 53);
  });

  test("stepping across a year boundary lands on the right week", () => {
    assert.deepEqual(previousIsoWeek({ isoYear: 2027, isoWeek: 1 }), {
      isoYear: 2026,
      isoWeek: 53,
    });
    assert.deepEqual(nextIsoWeek({ isoYear: 2026, isoWeek: 53 }), { isoYear: 2027, isoWeek: 1 });
    assert.deepEqual(previousIsoWeek({ isoYear: 2026, isoWeek: 1 }), {
      isoYear: 2025,
      isoWeek: 52,
    });
  });

  test("bounds are the instants the office actually lived through", () => {
    const utc = isoWeekBounds({ isoYear: 2026, isoWeek: 45 }, "UTC");
    assert.equal(utc.from.toISOString(), "2026-11-02T00:00:00.000Z");
    assert.equal(utc.to.toISOString(), "2026-11-09T00:00:00.000Z");

    // Berlin is an hour ahead in November, so its Monday starts an hour early
    // in UTC terms.
    const berlin = isoWeekBounds({ isoYear: 2026, isoWeek: 45 }, "Europe/Berlin");
    assert.equal(berlin.from.toISOString(), "2026-11-01T23:00:00.000Z");
    assert.equal(berlin.to.toISOString(), "2026-11-08T23:00:00.000Z");
  });

  test("a week spanning a daylight-saving change is still seven local days", () => {
    // Berlin goes back to UTC+1 on Sunday 25 October 2026, inside week 43.
    const week = isoWeekBounds({ isoYear: 2026, isoWeek: 43 }, "Europe/Berlin");
    assert.equal(week.from.toISOString(), "2026-10-18T22:00:00.000Z", "starts at UTC+2");
    assert.equal(week.to.toISOString(), "2026-10-25T23:00:00.000Z", "ends at UTC+1");
    assert.equal(
      week.to.getTime() - week.from.getTime(),
      (7 * 24 + 1) * 60 * 60 * 1000,
      "the office got an extra hour that week, and the week has to contain it",
    );

    // And the hour that exists twice is still inside the week it belongs to.
    assert.deepEqual(isoWeekAt(new Date("2026-10-25T00:30:00Z"), "Europe/Berlin"), {
      isoYear: 2026,
      isoWeek: 43,
    });
  });

  test("which week an instant falls in is a question about the clock", () => {
    // 23:30 UTC on Sunday 8 November is already Monday in Moscow — a new week
    // there, the old one in London.
    const instant = new Date("2026-11-08T23:30:00Z");
    assert.deepEqual(isoWeekAt(instant, "UTC"), { isoYear: 2026, isoWeek: 45 });
    assert.deepEqual(isoWeekAt(instant, "Europe/Moscow"), { isoYear: 2026, isoWeek: 46 });
  });

  test("the span between two weeks is inclusive, and empty when reversed", () => {
    const span = isoWeeksBetween({ isoYear: 2026, isoWeek: 52 }, { isoYear: 2027, isoWeek: 1 });
    assert.deepEqual(span, [
      { isoYear: 2026, isoWeek: 52 },
      { isoYear: 2026, isoWeek: 53 },
      { isoYear: 2027, isoWeek: 1 },
    ]);
    assert.deepEqual(
      isoWeeksBetween({ isoYear: 2027, isoWeek: 1 }, { isoYear: 2026, isoWeek: 52 }),
      [],
    );
  });

  test("weeks order by year first", () => {
    assert.ok(compareIsoWeeks({ isoYear: 2026, isoWeek: 53 }, { isoYear: 2027, isoWeek: 1 }) < 0);
    assert.equal(compareIsoWeeks({ isoYear: 2026, isoWeek: 5 }, { isoYear: 2026, isoWeek: 5 }), 0);
  });
});

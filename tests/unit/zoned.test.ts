import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { knownZone, offsetMinutes, shift } from "@/lib/zoned";

describe("reading an instant in the archive's clock", () => {
  test("knows how far ahead a zone is", () => {
    const instant = new Date("2026-09-30T11:08:00Z");
    assert.equal(offsetMinutes(instant, "UTC"), 0);
    assert.equal(offsetMinutes(instant, "Europe/Moscow"), 180);
    assert.equal(offsetMinutes(instant, "Asia/Kolkata"), 330, "half-hour zones exist");
    assert.equal(offsetMinutes(instant, "America/New_York"), -240);
  });

  test("follows daylight saving rather than assuming a fixed offset", () => {
    const summer = new Date("2026-09-30T12:00:00Z");
    const winter = new Date("2026-01-15T12:00:00Z");
    assert.equal(offsetMinutes(summer, "Europe/Berlin"), 120);
    assert.equal(offsetMinutes(winter, "Europe/Berlin"), 60);
  });

  test("relabels the wall clock as UTC so getUTC* reads local parts", () => {
    // 23:30 UTC is already the next day in Moscow, which is the whole point:
    // a quote said just before midnight must not be filed under yesterday.
    const lateNight = new Date("2026-09-30T23:30:00Z");
    const moscow = shift(lateNight, "Europe/Moscow");
    assert.equal(moscow.getUTCDate(), 1);
    assert.equal(moscow.getUTCMonth(), 9, "October");
    assert.equal(moscow.getUTCHours(), 2);

    // And the other way: early UTC is still the previous evening in New York.
    const earlyMorning = new Date("2026-10-01T02:00:00Z");
    const newYork = shift(earlyMorning, "America/New_York");
    assert.equal(newYork.getUTCDate(), 30);
    assert.equal(newYork.getUTCHours(), 22);
  });

  test("UTC is a no-op, so an archive that never picks a zone is unchanged", () => {
    const instant = new Date("2026-09-30T11:08:00Z");
    assert.equal(shift(instant, "UTC").getTime(), instant.getTime());
  });

  test("an unknown zone falls back to UTC rather than throwing mid-render", () => {
    assert.equal(knownZone("Mars/Olympus"), "UTC");
    assert.equal(knownZone(""), "UTC");
    assert.equal(knownZone(null), "UTC");
    assert.equal(knownZone(undefined), "UTC");
    assert.equal(knownZone("Europe/Moscow"), "Europe/Moscow");
  });
});

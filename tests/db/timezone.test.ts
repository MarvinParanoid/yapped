import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { DEFAULT_TEAM_ID as TEAM, makeUser, makeYap, prisma, resetDatabase } from "./setup";
import { getWrapped, listPeriods } from "@/lib/services/wrapped";
import { setTeamTimezone } from "@/lib/services/teams";

/**
 * An archive keeps one clock, and it is not necessarily UTC.
 *
 * Everything is stored as an instant and used to be read back with getUTC*, so
 * a team three hours east saw its own "most dangerous hour" named three hours
 * early, and anything said just after local midnight on the 1st fell into the
 * previous month's Wrapped.
 */
describe("the archive's clock", () => {
  before(async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    // 23:30 UTC on the last day of September is 02:30 on 1 October in Moscow.
    await makeYap({ authorId: author.id, saidAt: new Date("2026-09-30T23:30:00Z") });
    // 11:00 UTC is 14:00 there.
    await makeYap({ authorId: author.id, saidAt: new Date("2026-10-05T11:00:00Z") });
  });

  test("UTC is the default, so an archive that never chose one is unchanged", async () => {
    const september = await getWrapped({ year: 2026, month: 9 }, TEAM);
    assert.equal(september.yapCount, 1, "23:30 UTC on the 30th is still September in UTC");
    assert.equal(september.hours[23], 1);
  });

  test("a record crossing local midnight belongs to the day the office had", async () => {
    assert.equal((await setTeamTimezone(TEAM, "Europe/Moscow")).ok, true);

    const september = await getWrapped({ year: 2026, month: 9 }, TEAM, "Europe/Moscow");
    assert.equal(september.yapCount, 0, "it was already October where these people were");

    const october = await getWrapped({ year: 2026, month: 10 }, TEAM, "Europe/Moscow");
    assert.equal(october.yapCount, 2);
  });

  test("the dangerous hour is the hour the room experienced", async () => {
    const october = await getWrapped({ year: 2026, month: 10 }, TEAM, "Europe/Moscow");
    assert.equal(october.hours[2], 1, "23:30 UTC was 02:30 local");
    assert.equal(october.hours[14], 1, "11:00 UTC was 14:00 local");
    assert.equal(october.hours[23], 0, "and nothing happened at 23:00 local");
  });

  test("which months exist is also a question about that clock", async () => {
    const utc = await listPeriods(TEAM);
    const moscow = await listPeriods(TEAM, "Europe/Moscow");
    assert.ok(utc.some((p) => p.month === 9), "September exists in UTC");
    assert.equal(moscow.some((p) => p.month === 9), false, "but not on the archive's clock");
  });

  test("a zone the server does not know is refused, not quietly turned into UTC", async () => {
    const bad = await setTeamTimezone(TEAM, "Mars/Olympus");
    assert.equal(bad.ok, false);
    assert.equal(
      (await prisma.team.findUniqueOrThrow({ where: { id: TEAM } })).timezone,
      "Europe/Moscow",
      "the archive keeps the clock it had",
    );
  });
});

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  DEFAULT_TEAM_ID as TEAM,
  makeTeam,
  makeUser,
  makeYap,
  prisma,
  react,
  resetDatabase,
} from "./setup";
import { getIncidentReport, getLatestIncidentReport, getQuietSpell } from "@/lib/services/incidents";

/**
 * The Department of Verbal Oversight, against a real archive.
 *
 * Two readings of the same rows, and the tests exist mostly to hold them
 * apart: an **incident** is a record being entered (`createdAt`), a **title**
 * is about who was talking (`saidAt`). They disagree whenever somebody files a
 * backlog, which is exactly when a reader would otherwise think one of the two
 * figures is wrong.
 *
 * Week 45 of 2026 is Monday 2 to Sunday 8 November; its file closes at midday
 * on Monday 9 November.
 */
const W45 = { isoYear: 2026, isoWeek: 45 };
const W44 = { isoYear: 2026, isoWeek: 44 };
const AFTER_W45 = new Date("2026-11-12T09:00:00Z");

const at = (day: number, hour = 9, month = 10) => new Date(Date.UTC(2026, month, day, hour));

describe("days without a verbal incident", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test("an archive that has never registered anything is its own state", async () => {
    assert.equal(await getQuietSpell(TEAM, "UTC", at(6)), null);
  });

  test("something entered today means the situation is ongoing", async () => {
    const author = await makeUser("Author");
    await makeYap({ authorId: author.id, createdAt: at(6, 2) });

    const spell = await getQuietSpell(TEAM, "UTC", at(6, 23));
    assert.equal(spell?.days, 0);
    assert.equal(spell?.situation, "ONGOING");
  });

  test("the last one yesterday is one day, however few hours ago it was", async () => {
    const author = await makeUser("Author");
    // 23:50 yesterday to 00:10 today is twenty minutes and one calendar day.
    await makeYap({ authorId: author.id, createdAt: new Date("2026-11-05T23:50:00Z") });

    const spell = await getQuietSpell(TEAM, "UTC", new Date("2026-11-06T00:10:00Z"));
    assert.equal(spell?.days, 1, "elapsed milliseconds would have called this zero");
    assert.equal(spell?.situation, "STABILISED");
  });

  test("the bands follow the count", async () => {
    const author = await makeUser("Author");
    await makeYap({ authorId: author.id, createdAt: at(1, 12) });

    assert.equal((await getQuietSpell(TEAM, "UTC", at(5, 12)))?.situation, "SUSPICIOUS");
    assert.equal((await getQuietSpell(TEAM, "UTC", at(12, 12)))?.situation, "NO_MATERIAL");
    assert.equal((await getQuietSpell(TEAM, "UTC", at(20, 12)))?.days, 19);
    assert.equal((await getQuietSpell(TEAM, "UTC", at(20, 12)))?.situation, "LOST_CONTROL");
  });

  test("a redacted record stops counting as an incident", async () => {
    const author = await makeUser("Author");
    await makeYap({ authorId: author.id, createdAt: at(1, 12) });
    const pulled = await makeYap({ authorId: author.id, createdAt: at(5, 12) });

    assert.equal((await getQuietSpell(TEAM, "UTC", at(6, 12)))?.days, 1);
    await prisma.yap.update({ where: { id: pulled.id }, data: { deletedAt: at(6, 13) } });
    assert.equal(
      (await getQuietSpell(TEAM, "UTC", at(6, 12)))?.days,
      5,
      "the counter falls back to the last record still on file",
    );
  });

  test("the day boundary is the archive's, not UTC's", async () => {
    const author = await makeUser("Author");
    // 23:30 UTC on the 5th is already 02:30 on the 6th in Moscow.
    await makeYap({ authorId: author.id, createdAt: new Date("2026-11-05T23:30:00Z") });
    // 18:00 UTC is 21:00 in Moscow — still the 6th there, and the 6th here.
    const now = new Date("2026-11-06T18:00:00Z");

    assert.equal((await getQuietSpell(TEAM, "UTC", now))?.days, 1);
    assert.equal(
      (await getQuietSpell(TEAM, "Europe/Moscow", now))?.days,
      0,
      "both instants fall on the 6th where these people are",
    );
  });

  test("the clocks going back does not hand out a free day", async () => {
    const author = await makeUser("Author");
    // Berlin leaves summer time during the night of 25 October 2026: that
    // local day is twenty-five hours long.
    await makeYap({ authorId: author.id, createdAt: new Date("2026-10-24T20:00:00Z") });

    assert.equal(
      (await getQuietSpell(TEAM, "Europe/Berlin", new Date("2026-10-25T20:00:00Z")))?.days,
      1,
      "one calendar day, even though more than 24 hours passed",
    );
    assert.equal(
      (await getQuietSpell(TEAM, "Europe/Berlin", new Date("2026-10-26T20:00:00Z")))?.days,
      2,
    );
  });

  test("another archive's intake is not this one's incident", async () => {
    const elsewhere = await makeTeam("elsewhere", "Elsewhere");
    const stranger = await makeUser("Stranger", elsewhere.id);
    const insider = await makeUser("Insider");
    await makeYap({ authorId: insider.id, createdAt: at(1, 12) });
    await makeYap({ authorId: stranger.id, teamId: elsewhere.id, createdAt: at(6, 12) });

    assert.equal((await getQuietSpell(TEAM, "UTC", at(6, 20)))?.days, 5);
  });
});

describe("the weekly incident report", () => {
  let anna: { id: string };
  let boris: { id: string };

  beforeEach(async () => {
    await resetDatabase();
    anna = await makeUser("Anna");
    boris = await makeUser("Boris");
  });

  test("counts what was entered, not what was said", async () => {
    // Said long ago, entered during week 45: one incident this week, and no
    // claim at all on the week's title.
    await makeYap({ authorId: anna.id, saidAt: at(3, 9, 3), createdAt: at(4, 10) });
    // Said and entered during week 45.
    await makeYap({ authorId: boris.id, saidAt: at(5, 9), createdAt: at(5, 10) });

    const report = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(report?.registered, 2);
    assert.equal(report?.speakers, 2);
    assert.equal(
      report?.ruling?.recordCount,
      1,
      "only one of the two was actually said that week",
    );
    assert.equal(report?.ruling?.winner?.id, boris.id);
  });

  test("the period is the ISO week, and the ISO year it belongs to", async () => {
    await makeYap({ authorId: anna.id, createdAt: new Date("2027-01-01T10:00:00Z") });

    const report = await getIncidentReport(
      TEAM,
      "UTC",
      { isoYear: 2026, isoWeek: 53 },
      new Date("2027-01-06T12:00:00Z"),
    );
    assert.equal(report?.registered, 1, "1 January 2027 is week 53 of 2026");
    assert.equal(report?.from.toISOString(), "2026-12-28T00:00:00.000Z");
    assert.equal(report?.to.toISOString(), "2027-01-04T00:00:00.000Z");
  });

  test("the previous week is the baseline, and an empty one is not a division", async () => {
    // Week 44: nothing. Week 45: two.
    await makeYap({ authorId: anna.id, createdAt: at(3, 10) });
    await makeYap({ authorId: anna.id, createdAt: at(4, 10) });
    // One in week 43, so week 44 exists as a period to compare against.
    await makeYap({ authorId: boris.id, createdAt: new Date("2026-10-20T10:00:00Z") });

    const report = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(report?.previousRegistered, 0);
    assert.equal(report?.movement.percent, null, "no percentage against nothing");
    assert.equal(report?.movement.delta, 2);
    assert.equal(report?.verdict, "UP");
  });

  test("the first period on file says so instead of comparing", async () => {
    await makeYap({ authorId: anna.id, createdAt: at(3, 10) });

    const report = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(report?.previousRegistered, null);
    assert.equal(report?.movement.baseless, true);
    assert.equal(report?.verdict, "FIRST_PERIOD");
    assert.equal(report?.earlier, null, "and the navigation has nowhere earlier to go");
  });

  test("a period with no intake is a report, not a missing page", async () => {
    await makeYap({ authorId: anna.id, createdAt: new Date("2026-10-27T10:00:00Z") });

    const report = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(report?.registered, 0);
    assert.equal(report?.speakers, 0);
    assert.equal(report?.loudest, null);
    assert.equal(report?.verdict, "WENT_SILENT");
  });

  test("the conclusion never contradicts the figures above it", async () => {
    await makeYap({ authorId: anna.id, createdAt: new Date("2026-10-27T10:00:00Z") });
    await makeYap({ authorId: anna.id, createdAt: new Date("2026-10-28T10:00:00Z") });
    await makeYap({ authorId: boris.id, createdAt: at(3, 10) });

    const report = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(report?.registered, 1);
    assert.equal(report?.previousRegistered, 2);
    assert.equal(report?.verdict, "DOWN");
    assert.equal(report?.movement.direction, "DOWN");

    // And the same question asked twice gives the same answer.
    const again = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(again?.verdict, report?.verdict);
  });

  test("reactions are counted by when they were cast", async () => {
    const record = await makeYap({ authorId: anna.id, saidAt: at(3), createdAt: at(3, 10) });
    await react(record.id, boris.id, "BASED", at(4, 12));
    await react(record.id, anna.id, "STONE", new Date("2026-11-20T12:00:00Z"));

    const report = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(report?.reactions, 1, "the second one landed a fortnight later");
  });

  test("the loudest statement is measured when the file closed", async () => {
    const quiet = await makeYap({ authorId: anna.id, saidAt: at(3), createdAt: at(3, 10) });
    const loud = await makeYap({ authorId: boris.id, saidAt: at(4), createdAt: at(4, 10) });

    // The loud one earned its aura inside the period; the other only after.
    await react(loud.id, anna.id, "BASED", at(5, 12));
    await react(quiet.id, boris.id, "STONE", new Date("2026-11-11T12:00:00Z"));
    await prisma.yap.update({ where: { id: quiet.id }, data: { aura: 9000 } });

    const report = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(report?.loudest?.id, loud.id);
    assert.equal(report?.loudest?.aura, 10);
    assert.equal(report?.loudest?.measuredAt, "DEADLINE");
  });

  test("while the file is open, the figures say so", async () => {
    await makeYap({ authorId: anna.id, saidAt: at(3), createdAt: at(3, 10) });

    const open = await getIncidentReport(TEAM, "UTC", W45, new Date("2026-11-09T10:00:00Z"));
    assert.equal(open?.status, "PROVISIONAL");
    assert.equal(open?.loudest?.measuredAt, "NOW");
    assert.equal(open?.ruling?.status, "PROVISIONAL");
    assert.equal(await prisma.weeklyRuling.count(), 0, "and nothing is written down");
  });

  test("navigation stops at both ends of what the archive holds", async () => {
    await makeYap({ authorId: anna.id, createdAt: new Date("2026-10-27T10:00:00Z") });
    await makeYap({ authorId: anna.id, createdAt: at(3, 10) });

    const latest = await getLatestIncidentReport(TEAM, "UTC", AFTER_W45);
    assert.deepEqual(latest?.week, W45);
    assert.deepEqual(latest?.earlier, W44);
    assert.equal(latest?.later, null, "there is no report on a week still running");

    const earlier = await getIncidentReport(TEAM, "UTC", W44, AFTER_W45);
    assert.equal(earlier?.earlier, null);
    assert.deepEqual(earlier?.later, W45);
  });

  test("a week the archive is too young for has no report", async () => {
    await makeYap({ authorId: anna.id, createdAt: at(3, 10) });
    assert.equal(await getIncidentReport(TEAM, "UTC", W44, AFTER_W45), null);
  });

  test("a week that has not finished has no report", async () => {
    await makeYap({ authorId: anna.id, createdAt: at(3, 10) });
    assert.equal(
      await getIncidentReport(TEAM, "UTC", { isoYear: 2026, isoWeek: 46 }, AFTER_W45),
      null,
      "the week AFTER_W45 falls in is still running",
    );
  });

  test("an empty archive has no report at all", async () => {
    assert.equal(await getLatestIncidentReport(TEAM, "UTC", AFTER_W45), null);
  });

  test("nothing crosses in from another archive", async () => {
    const elsewhere = await makeTeam("elsewhere", "Elsewhere");
    const stranger = await makeUser("Stranger", elsewhere.id);
    const theirs = await makeYap({
      authorId: stranger.id,
      teamId: elsewhere.id,
      saidAt: at(3),
      createdAt: at(3, 10),
    });
    await react(theirs.id, stranger.id, "BASED", at(4, 12));

    await makeYap({ authorId: anna.id, saidAt: at(5), createdAt: at(5, 10) });

    const report = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(report?.registered, 1);
    assert.equal(report?.speakers, 1);
    assert.equal(report?.reactions, 0);
    assert.equal(report?.loudest?.author.id, anna.id);
    assert.equal(report?.ruling?.winner?.id, anna.id);
  });

  test("a redacted record leaves the figures, and the page still renders", async () => {
    const pulled = await makeYap({ authorId: anna.id, saidAt: at(3), createdAt: at(3, 10) });
    await makeYap({ authorId: boris.id, saidAt: at(4), createdAt: at(4, 10) });

    await prisma.yap.update({ where: { id: pulled.id }, data: { deletedAt: at(20, 10) } });

    const report = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(report?.registered, 1, "the figures read the archive as it stands");
    assert.equal(report?.loudest?.id !== pulled.id, true);
  });

  test("deleting a person takes their ruling with them rather than leaking it", async () => {
    await makeYap({ authorId: anna.id, saidAt: at(3), createdAt: at(3, 10) });
    await makeYap({ authorId: boris.id, saidAt: at(4), createdAt: at(4, 10) });

    const before = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(before?.ruling?.winner?.id, anna.id);

    await prisma.user.delete({ where: { id: anna.id } });

    const after = await getIncidentReport(TEAM, "UTC", W45, AFTER_W45);
    assert.equal(after?.ruling?.winner?.id, boris.id, "the week is re-decided from what is left");
    assert.equal(after?.registered, 1);
    assert.equal(
      await prisma.weeklyRuling.count({ where: { winnerId: anna.id } }),
      0,
      "nothing of theirs is still named anywhere",
    );
  });
});

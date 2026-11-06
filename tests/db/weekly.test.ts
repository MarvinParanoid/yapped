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
import {
  countWeeklyTitles,
  getWeeklyRuling,
  getYapperOfTheWeek,
  weekClosesAt,
} from "@/lib/services/weekly";

/**
 * The weekly ruling, end to end.
 *
 * Three things pull against each other here. The verdict has to be the right
 * one — measured by when things were said, on the archive's clock, ignoring
 * what has been redacted. It has to be the *same* one whoever opens the page
 * and whenever they do it. And once published it has to stop moving.
 *
 * Week 45 of 2026 is Monday 2 November to Sunday 8 November; its file closes
 * at midday on Monday 9 November. Every instant below is written out rather
 * than derived, so a test that disagrees with the calendar says so.
 */
const CLOSES = new Date("2026-11-09T12:00:00Z");
const W45 = { isoYear: 2026, isoWeek: 45 };

/** Somewhere inside week 45, in UTC. */
const inWeek = (day: number, hour = 9) => new Date(Date.UTC(2026, 10, day, hour, 0, 0));
/** Filed the same day it was said, which is the ordinary case. */
const said = (authorId: string, day: number, hour = 9) =>
  makeYap({ authorId, saidAt: inWeek(day, hour), createdAt: inWeek(day, hour + 1) });

/** Redaction straight at the table: who may do it is another file's problem. */
const redact = (id: number, at: Date) =>
  prisma.yap.update({ where: { id }, data: { deletedAt: at } });

describe("when a week's file closes", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test("midday on the Monday after, on the archive's own clock", () => {
    assert.equal(weekClosesAt(W45, "UTC").toISOString(), "2026-11-09T12:00:00.000Z");
    assert.equal(
      weekClosesAt(W45, "Europe/Berlin").toISOString(),
      "2026-11-09T11:00:00.000Z",
      "midday in Berlin is 11:00 UTC in November",
    );
    assert.equal(
      weekClosesAt(W45, "Europe/Moscow").toISOString(),
      "2026-11-09T09:00:00.000Z",
    );
  });

  test("before the deadline the answer is offered but not filed", async () => {
    const author = await makeUser("Author");
    await said(author.id, 3);

    const early = await getWeeklyRuling(TEAM, "UTC", W45, new Date("2026-11-09T11:59:00Z"));
    assert.equal(early?.status, "PROVISIONAL");
    assert.equal(early?.winner?.id, author.id);
    assert.equal(await prisma.weeklyRuling.count(), 0, "nothing is written down yet");
  });

  test("after it, the answer is filed and reads the same", async () => {
    const author = await makeUser("Author");
    await said(author.id, 3);

    const late = await getWeeklyRuling(TEAM, "UTC", W45, CLOSES);
    assert.equal(late?.status, "FINAL");
    assert.equal(late?.winner?.id, author.id);
    assert.equal(await prisma.weeklyRuling.count(), 1);
  });

  test("the first viewer decides nothing: 12:01 on Monday and Thursday agree", async () => {
    const loud = await makeUser("Loud");
    const quiet = await makeUser("Quiet");
    await said(loud.id, 3);
    await said(loud.id, 4);
    await said(quiet.id, 5);

    // Two archives with identical histories, read at different moments.
    const other = await makeTeam("twin", "Twin Corp");
    for (const record of await prisma.yap.findMany({ where: { teamId: TEAM } })) {
      await prisma.yap.create({
        data: {
          teamId: other.id,
          text: record.text,
          authorId: record.authorId,
          saidAt: record.saidAt,
          createdAt: record.createdAt,
        },
      });
    }
    await prisma.membership.createMany({
      data: [
        { teamId: other.id, userId: loud.id },
        { teamId: other.id, userId: quiet.id },
      ],
    });

    const monday = await getWeeklyRuling(TEAM, "UTC", W45, new Date("2026-11-09T12:01:00Z"));
    const thursday = await getWeeklyRuling(other.id, "UTC", W45, new Date("2026-11-12T09:00:00Z"));

    assert.equal(monday?.winner?.id, loud.id);
    assert.equal(thursday?.winner?.id, loud.id);
    assert.equal(monday?.recordCount, thursday?.recordCount);
    assert.equal(monday?.aura, thursday?.aura);
  });

  test("a record filed after the deadline was not in front of the committee", async () => {
    const early = await makeUser("Early");
    const late = await makeUser("Late");
    await said(early.id, 3);
    // Said inside the week, entered two days after the file closed.
    await makeYap({
      authorId: late.id,
      saidAt: inWeek(4),
      createdAt: new Date("2026-11-11T09:00:00Z"),
    });
    await makeYap({
      authorId: late.id,
      saidAt: inWeek(5),
      createdAt: new Date("2026-11-11T09:00:00Z"),
    });

    const ruling = await getWeeklyRuling(TEAM, "UTC", W45, new Date("2026-11-12T09:00:00Z"));
    assert.equal(ruling?.winner?.id, early.id, "two late filings do not outrank one on time");
    assert.equal(ruling?.recordCount, 1);
  });

  test("a redaction after the deadline does not rewrite what was on file", async () => {
    const author = await makeUser("Author");
    const record = await said(author.id, 3);
    await redact(record.id, new Date("2026-11-10T09:00:00Z"));

    const ruling = await getWeeklyRuling(TEAM, "UTC", W45, new Date("2026-11-12T09:00:00Z"));
    assert.equal(ruling?.winner?.id, author.id, "it was on the record when the file closed");
  });

  test("a redaction before the deadline does", async () => {
    const author = await makeUser("Author");
    const record = await said(author.id, 3);
    await redact(record.id, new Date("2026-11-09T08:00:00Z"));

    const ruling = await getWeeklyRuling(TEAM, "UTC", W45, CLOSES);
    assert.equal(ruling?.winner, null);
  });
});

describe("who the week belongs to", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test("whoever said the most, with aura as it stood at the deadline", async () => {
    const loud = await makeUser("Loud");
    const quoted = await makeUser("Quoted");
    const reactor = await makeUser("Reactor");

    const a = await said(loud.id, 2);
    await said(loud.id, 4);
    await said(loud.id, 6);
    const b = await said(quoted.id, 3);

    await react(a.id, reactor.id, "BASED", inWeek(2, 12));
    await react(b.id, reactor.id, "STONE", inWeek(3, 12));

    const ruling = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(ruling?.winner?.id, loud.id, "three beats one whatever the office thought");
    assert.equal(ruling?.recordCount, 3);
    assert.equal(ruling?.aura, 10, "one BASED, reconstructed from the reaction's own timestamp");
  });

  test("aura is rebuilt from reactions, not read off the denormalized total", async () => {
    const a = await makeUser("A");
    const b = await makeUser("B");
    const reactor = await makeUser("Reactor");
    const first = await said(a.id, 2);
    const second = await said(b.id, 3);

    // B's record was reacted to before the deadline; A's only afterwards.
    await react(second.id, reactor.id, "BASED", inWeek(3, 12));
    await react(first.id, reactor.id, "STONE", new Date("2026-11-10T09:00:00Z"));
    // And the cached totals say the opposite, deliberately.
    await prisma.yap.update({ where: { id: first.id }, data: { aura: 9000 } });

    const ruling = await getWeeklyRuling(TEAM, "UTC", W45, new Date("2026-11-12T09:00:00Z"));
    assert.equal(ruling?.winner?.id, b.id, "one each; the tie goes on aura at the deadline");
    assert.equal(ruling?.aura, 10);
  });

  test("a week in which nobody said anything is a finding, not a gap", async () => {
    const someone = await makeUser("Someone");
    // Week 44, so the archive is old enough to have a completed week 45.
    await makeYap({
      authorId: someone.id,
      saidAt: new Date("2026-10-28T09:00:00Z"),
      createdAt: new Date("2026-10-28T10:00:00Z"),
    });

    const ruling = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.deepEqual(ruling?.week, W45);
    assert.equal(ruling?.winner, null);
    assert.equal(ruling?.recordCount, 0);

    const stored = await prisma.weeklyRuling.findMany({ where: { teamId: TEAM } });
    assert.equal(stored.length, 2, "week 44 and week 45 were both examined");
    assert.ok(
      stored.some((row) => row.isoWeek === 45 && row.winnerId === null),
      "the empty week is on file as an empty week",
    );
  });

  test("an archive with no completed week has nothing to report yet", async () => {
    const someone = await makeUser("Someone");
    await makeYap({ authorId: someone.id, saidAt: inWeek(10), createdAt: inWeek(10) });
    assert.equal(await getYapperOfTheWeek(TEAM, "UTC", new Date("2026-11-10T12:00:00Z")), null);
    assert.equal(await prisma.weeklyRuling.count(), 0);
  });

  test("an empty archive has nothing to report either", async () => {
    assert.equal(await getYapperOfTheWeek(TEAM, "UTC", CLOSES), null);
  });

  test("a dead heat is settled, and settled the same way twice", async () => {
    const early = await makeUser("Early");
    const late = await makeUser("Late");
    await said(late.id, 5);
    await said(late.id, 6);
    await said(early.id, 2);
    await said(early.id, 7);

    const first = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(first?.winner?.id, early.id, "same count, same aura, started first");
    const again = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(again?.winner?.id, early.id);
  });

  test("records are counted into the week they were said in, not filed in", async () => {
    const author = await makeUser("Author");
    // Said in week 45, typed up on the Sunday evening.
    await makeYap({
      authorId: author.id,
      saidAt: inWeek(3),
      createdAt: new Date("2026-11-08T22:00:00Z"),
    });

    const ruling = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(ruling?.winner?.id, author.id);
  });

  test("the boundaries are midnight Monday, to the second", async () => {
    const before = await makeUser("Before");
    const inside = await makeUser("Inside");
    const after = await makeUser("After");
    const filed = new Date("2026-11-09T06:00:00Z");
    // 23:59:59 on Sunday 1 November is still week 44.
    await makeYap({ authorId: before.id, saidAt: new Date("2026-11-01T23:59:59Z"), createdAt: filed });
    await makeYap({ authorId: inside.id, saidAt: new Date("2026-11-02T00:00:00Z"), createdAt: filed });
    // Midnight starting Monday 9 November is already week 46.
    await makeYap({ authorId: after.id, saidAt: new Date("2026-11-09T00:00:00Z"), createdAt: filed });

    const ruling = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(ruling?.winner?.id, inside.id);
    assert.equal(ruling?.recordCount, 1);
    assert.equal(ruling?.from.toISOString(), "2026-11-02T00:00:00.000Z");
    assert.equal(ruling?.to.toISOString(), "2026-11-09T00:00:00.000Z");
  });

  test("which week a record falls in is a question about the archive's clock", async () => {
    const author = await makeUser("Author");
    const earlier = await makeUser("Earlier");
    // 23:30 UTC on Sunday 8 November is already Monday 02:30 in Moscow.
    await makeYap({
      authorId: author.id,
      saidAt: new Date("2026-11-08T23:30:00Z"),
      createdAt: new Date("2026-11-08T23:40:00Z"),
    });
    await makeYap({
      authorId: earlier.id,
      saidAt: new Date("2026-10-28T09:00:00Z"),
      createdAt: new Date("2026-10-28T09:10:00Z"),
    });

    const utc = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(utc?.winner?.id, author.id, "the last thing said in week 45");

    await prisma.weeklyRuling.deleteMany({ where: { teamId: TEAM } });
    const moscow = await getYapperOfTheWeek(TEAM, "Europe/Moscow", CLOSES);
    assert.equal(moscow?.winner, null, "it was already next week where these people were");
  });

  test("a week containing a daylight-saving change is examined whole", async () => {
    const author = await makeUser("Author");
    // Berlin goes back to UTC+1 during the night of 25 October 2026, inside
    // week 43. Both of these are that week, local time.
    const filed = new Date("2026-10-25T23:00:00Z");
    await makeYap({ authorId: author.id, saidAt: new Date("2026-10-19T08:00:00Z"), createdAt: filed });
    await makeYap({ authorId: author.id, saidAt: new Date("2026-10-25T22:30:00Z"), createdAt: filed });

    // Week 43's file closes at midday Berlin on Monday 26 October.
    const ruling = await getWeeklyRuling(
      TEAM,
      "Europe/Berlin",
      { isoYear: 2026, isoWeek: 43 },
      new Date("2026-10-28T12:00:00Z"),
    );
    assert.deepEqual(ruling?.week, { isoYear: 2026, isoWeek: 43 });
    assert.equal(ruling?.status, "FINAL");
    assert.equal(ruling?.recordCount, 2, "23:30 local on the Sunday is still that Sunday");
    assert.equal(ruling?.closesAt.toISOString(), "2026-10-26T11:00:00.000Z");
  });

  test("a week that belongs to the year before is filed under that year", async () => {
    const author = await makeUser("Author");
    // 1 January 2027 is a Friday: week 53 of 2026.
    await makeYap({
      authorId: author.id,
      saidAt: new Date("2027-01-01T10:00:00Z"),
      createdAt: new Date("2027-01-01T11:00:00Z"),
    });

    const ruling = await getWeeklyRuling(
      TEAM,
      "UTC",
      { isoYear: 2026, isoWeek: 53 },
      new Date("2027-01-06T12:00:00Z"),
    );
    assert.deepEqual(ruling?.week, { isoYear: 2026, isoWeek: 53 });
    assert.equal(ruling?.winner?.id, author.id);

    const stored = await prisma.weeklyRuling.findFirstOrThrow({ where: { teamId: TEAM } });
    assert.equal(stored.isoYear, 2026, "the ISO year, not the year the dates are in");
    assert.equal(stored.isoWeek, 53);
  });

  test("another archive's records are not this archive's week", async () => {
    const elsewhere = await makeTeam("elsewhere", "Elsewhere");
    const stranger = await makeUser("Stranger", elsewhere.id);
    await makeYap({
      authorId: stranger.id,
      teamId: elsewhere.id,
      saidAt: inWeek(2),
      createdAt: inWeek(2, 10),
    });

    const insider = await makeUser("Insider");
    await said(insider.id, 3);

    const ruling = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(ruling?.winner?.id, insider.id);
    assert.equal(ruling?.recordCount, 1);
  });

  test("a title counts the weeks on file, in this archive only", async () => {
    const author = await makeUser("Author");
    await said(author.id, 2);
    // Week 44 as well, so two weeks carry the same name.
    await makeYap({
      authorId: author.id,
      saidAt: new Date("2026-10-28T09:00:00Z"),
      createdAt: new Date("2026-10-28T10:00:00Z"),
    });

    await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(await countWeeklyTitles(author.id, TEAM), 2);

    const elsewhere = await makeTeam("elsewhere", "Elsewhere");
    assert.equal(await countWeeklyTitles(author.id, elsewhere.id), 0);
  });
});

/**
 * Everything that arrives after the committee has sat.
 *
 * This is the half the storage exists for: the ruling records what the archive
 * looked like at the deadline, and nothing below reopens it.
 */
describe("a published ruling stops moving", () => {
  let winner: { id: string };
  let challenger: { id: string };

  beforeEach(async () => {
    await resetDatabase();
    winner = await makeUser("Winner");
    challenger = await makeUser("Challenger");
    await said(winner.id, 2);
    await said(challenger.id, 3);

    const first = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(first?.status, "FINAL");
    assert.equal(first?.winner?.id, winner.id, "the tie went to whoever started first");
  });

  test("a record filed late does not reopen it", async () => {
    await makeYap({ authorId: challenger.id, saidAt: inWeek(5), createdAt: inWeek(5, 10) });
    await makeYap({ authorId: challenger.id, saidAt: inWeek(6), createdAt: inWeek(6, 10) });

    const again = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(again?.winner?.id, winner.id);
    assert.equal(again?.recordCount, 1, "the grounds are the ones the committee saw");
  });

  test("reactions that arrive afterwards do not reopen it", async () => {
    const reactor = await makeUser("Reactor");
    for (const record of await prisma.yap.findMany({ where: { authorId: challenger.id } })) {
      await react(record.id, reactor.id, "STONE", new Date("2026-11-10T09:00:00Z"));
    }

    const again = await getYapperOfTheWeek(TEAM, "UTC", new Date("2026-11-12T09:00:00Z"));
    assert.equal(again?.winner?.id, winner.id);
    assert.equal(again?.aura, 0);
  });

  test("redacting the record it was won on does not reopen it", async () => {
    const theirs = await prisma.yap.findFirstOrThrow({ where: { authorId: winner.id } });
    await redact(theirs.id, new Date("2026-11-10T09:00:00Z"));

    const again = await getYapperOfTheWeek(TEAM, "UTC", new Date("2026-11-12T09:00:00Z"));
    assert.equal(again?.winner?.id, winner.id, "the week happened; the file about it stands");
    assert.equal(again?.recordCount, 1);
  });

  test("correcting a record's date does not reopen it", async () => {
    await prisma.yap.updateMany({
      where: { authorId: winner.id },
      data: { saidAt: new Date("2026-10-28T09:00:00Z") },
    });

    const again = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(again?.winner?.id, winner.id);
  });

  test("correcting who said it does not reopen it", async () => {
    await prisma.yap.updateMany({
      where: { authorId: winner.id },
      data: { authorId: challenger.id },
    });

    const again = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(again?.winner?.id, winner.id);
  });

  test("a backdated quote does not turn one page load into a thousand rulings", async () => {
    await resetDatabase();
    const author = await makeUser("Archaeologist");
    // Somebody types 1998 into "when was this said". The archive now claims a
    // history of nearly fifteen hundred weeks.
    await makeYap({
      authorId: author.id,
      saidAt: new Date("1998-03-04T10:00:00Z"),
      createdAt: new Date("2026-11-02T10:00:00Z"),
    });
    await said(author.id, 3);

    const ruling = await getYapperOfTheWeek(TEAM, "UTC", CLOSES);
    assert.equal(ruling?.winner?.id, author.id, "the week asked about is still decided");

    const filed = await prisma.weeklyRuling.count({ where: { teamId: TEAM } });
    assert.ok(filed <= 120, `one pass filed ${filed} rulings`);
    assert.ok(filed > 1, "and it did catch up on more than the one week asked about");
    assert.equal(
      await prisma.weeklyRuling.count({ where: { teamId: TEAM, isoYear: 2026, isoWeek: 45 } }),
      1,
    );
  });

  test("moving the archive's clock does not rewrite what is already on file", async () => {
    const before = await prisma.weeklyRuling.findFirstOrThrow({
      where: { teamId: TEAM, isoWeek: 45 },
    });

    // The owner switches the archive to Berlin afterwards. Week 45's boundaries
    // move by an hour, but a decision that has been published does not.
    const after = await getYapperOfTheWeek(TEAM, "Europe/Berlin", CLOSES);
    assert.equal(after?.winner?.id, winner.id);
    assert.equal(after?.from.toISOString(), before.periodFrom.toISOString());
    assert.equal(after?.to.toISOString(), before.periodTo.toISOString());
    assert.equal(
      await prisma.weeklyRuling.count({ where: { teamId: TEAM, isoWeek: 45 } }),
      1,
      "and no second ruling is filed for the same week under the new clock",
    );
  });

  test("the second reader does not file a second opinion", async () => {
    await Promise.all([
      getYapperOfTheWeek(TEAM, "UTC", CLOSES),
      getYapperOfTheWeek(TEAM, "UTC", CLOSES),
      getYapperOfTheWeek(TEAM, "UTC", CLOSES),
    ]);
    assert.equal(await prisma.weeklyRuling.count({ where: { teamId: TEAM, isoWeek: 45 } }), 1);
  });
});

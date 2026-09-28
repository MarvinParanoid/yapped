import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEAM_ID as TEAM, makeTeam, makeUser, makeYap, prisma, resetDatabase } from "./setup";
import { getOnThisDay, hasAnniversaryToday } from "@/lib/services/on-this-day";
import { refreshAura } from "@/lib/services/yaps";
import { REACTION_WEIGHTS } from "@/lib/ranking/aura";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

const day = 24 * 60 * 60 * 1000;

/** The same calendar day, a whole number of years back. */
function yearsAgo(reference: Date, years: number, offsetDays = 0): Date {
  const d = new Date(
    Date.UTC(reference.getUTCFullYear() - years, reference.getUTCMonth(), reference.getUTCDate(), 12),
  );
  return new Date(d.getTime() + offsetDays * day);
}

/**
 * This used to run three queries per record and another one for each record's
 * own aura cutoff — a dozen anniversaries meant dozens of round trips. The
 * batching is invisible from outside, which is what these hold in place.
 */
describe("on this day", () => {
  test("finds the same date in earlier years and says how far back", async () => {
    await resetDatabase();
    const today = new Date();
    const author = await makeUser("Author");

    const lastYear = await makeYap({ authorId: author.id, saidAt: yearsAgo(today, 1) });
    const twoYears = await makeYap({ authorId: author.id, saidAt: yearsAgo(today, 2) });
    await makeYap({ authorId: author.id, saidAt: new Date(today.getTime() - 120 * day) });

    const report = await getOnThisDay(TEAM, today);
    const found = report.anniversaries.flatMap((a) => a.records.map((r) => r.id));
    assert.ok(found.includes(lastYear.id));
    assert.ok(found.includes(twoYears.id));
    assert.equal(found.length, 2, "an unrelated date must not turn up");

    const years = report.anniversaries.map((a) => a.yearsAgo).sort();
    assert.deepEqual(years, [1, 2]);
  });

  test("reaches a week either side, because a small archive needs the slack", async () => {
    await resetDatabase();
    const today = new Date();
    const author = await makeUser("Author");
    const near = await makeYap({ authorId: author.id, saidAt: yearsAgo(today, 1, 5) });
    const far = await makeYap({ authorId: author.id, saidAt: yearsAgo(today, 1, 20) });

    const found = (await getOnThisDay(TEAM, today)).anniversaries.flatMap((a) =>
      a.records.map((r) => r.id),
    );
    assert.ok(found.includes(near.id), "five days out is close enough to count");
    assert.ok(!found.includes(far.id), "twenty is not");
  });

  test("aura is reported as it stood at the end of that day, not today", async () => {
    await resetDatabase();
    const today = new Date();
    const author = await makeUser("Author");
    const a = await makeUser("A");
    const b = await makeUser("B");
    const yap = await makeYap({ authorId: author.id, saidAt: yearsAgo(today, 1) });

    // One reaction on the day itself, one much later.
    await prisma.reaction.create({
      data: { yapId: yap.id, userId: a.id, type: "BASED", createdAt: yearsAgo(today, 1) },
    });
    await prisma.reaction.create({
      data: { yapId: yap.id, userId: b.id, type: "DEAD", createdAt: new Date() },
    });
    await refreshAura(yap.id);

    const record = (await getOnThisDay(TEAM, today)).anniversaries[0]!.records[0]!;
    assert.equal(record.aura, REACTION_WEIGHTS.BASED + REACTION_WEIGHTS.DEAD, "what it is worth now");
    assert.equal(record.auraThen, REACTION_WEIGHTS.BASED, "what it was worth that evening");
  });

  test("another team's anniversaries are not ours", async () => {
    await resetDatabase();
    const today = new Date();
    const other = await makeTeam("other", "Other Corp");
    const mine = await makeUser("Mine", TEAM);
    const theirs = await makeUser("Theirs", other.id);
    await makeYap({ authorId: mine.id, saidAt: yearsAgo(today, 1) });
    await makeYap({ authorId: theirs.id, saidAt: yearsAgo(today, 1), teamId: other.id });

    const ours = await getOnThisDay(TEAM, today);
    assert.equal(ours.anniversaries.flatMap((a) => a.records).length, 1);
    assert.equal(await hasAnniversaryToday(TEAM, today), 1);
  });

  test("a young archive has no anniversaries and does not pretend otherwise", async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    await makeYap({ authorId: author.id });

    const report = await getOnThisDay(TEAM, new Date());
    assert.deepEqual(report.anniversaries, []);
    assert.equal(await hasAnniversaryToday(TEAM, new Date()), 0);
  });
});

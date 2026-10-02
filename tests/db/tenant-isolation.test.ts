import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  DEFAULT_TEAM_ID as TEAM,
  makeTeam,
  makeUser,
  makeYap,
  prisma,
  resetDatabase,
} from "./setup";
import {acknowledgeYap,
  createYap,
  disputeYap,
  editYap,
  restoreYap,
  setWitnessStance,
  softDeleteYap,
  toggleReaction,
} from "@/lib/services/yaps";
import { recordBattle } from "@/lib/services/battles";
import { createInvite } from "@/lib/services/invites";
import { getYapperProfile, syncAchievements } from "@/lib/services/yappers";
import { joinTeam } from "@/lib/services/accounts";

/**
 * One wall, checked from every door.
 *
 * The repo's claim is that no read and no write crosses between teams. Reads
 * were already covered; this file is the write side, and it exists because a
 * real bug got through: a case could be opened in one archive around a record
 * from another. Cases are gone, but the class of mistake is not — every write
 * below takes an id from a form and a team from the session, and the two are
 * only ever joined by the service remembering to check.
 *
 * So each test hands a service a record id that is real, but belongs to
 * somebody else, and asserts the write does not land.
 */

let outsider: { teamId: string; userId: string; yapId: number };

async function foreign() {
  const other = await makeTeam(`other-${Math.random().toString(36).slice(2, 8)}`, "Other Corp");
  const stranger = await makeUser("Stranger", other.id);
  const theirYap = await makeYap({ authorId: stranger.id, teamId: other.id });
  return { teamId: other.id, userId: stranger.id, yapId: theirYap.id };
}

describe("writes do not cross between teams", () => {
  before(async () => {
    await resetDatabase();
    outsider = await foreign();
  });

  test("a record cannot be filed under an author from another archive", async () => {
    const insider = await makeUser("Insider");

    await assert.rejects(
      () =>
        createYap({
          teamId: TEAM,
          text: "Чужими словами.",
          authorId: outsider.userId,
          submittedById: insider.id,
          saidAt: new Date(),
        }),
      /NOT_A_MEMBER/,
      "the author field arrives from a form — it has to be checked against the team",
    );

    assert.equal(
      await prisma.yap.count({ where: { authorId: outsider.userId, teamId: TEAM } }),
      0,
    );
  });

  test("a record cannot be filed on behalf of a submitter from another archive", async () => {
    const insider = await makeUser("Insider 2");
    await assert.rejects(
      () =>
        createYap({
          teamId: TEAM,
          text: "Не мной подано.",
          authorId: insider.id,
          submittedById: outsider.userId,
          saidAt: new Date(),
        }),
      /NOT_A_MEMBER/,
    );
  });

  // Loud, not silent: reaching across the wall is a bug in the caller, and the
  // services say so rather than quietly returning "nothing happened".
  test("reacting to another archive's record is refused", async () => {
    const insider = await makeUser("Reactor");
    await assert.rejects(
      () => toggleReaction(outsider.yapId, TEAM, insider.id, "BASED"),
      /NOT_FOUND/,
    );
    assert.equal(await prisma.reaction.count({ where: { yapId: outsider.yapId } }), 0);
  });

  test("witnessing another archive's record is refused", async () => {
    const insider = await makeUser("Witness");
    await assert.rejects(
      () => setWitnessStance(outsider.yapId, TEAM, insider.id, "PRESENT"),
      /NOT_FOUND/,
    );
    assert.equal(await prisma.witness.count({ where: { yapId: outsider.yapId } }), 0);
  });

  test("acknowledging and disputing stop at the wall", async () => {
    const insider = await makeUser("Claimer");
    assert.equal((await acknowledgeYap(outsider.yapId, TEAM, insider.id)).ok, false);
    assert.equal((await disputeYap(outsider.yapId, TEAM, insider.id, "Не было.")).ok, false);

    const untouched = await prisma.yap.findUniqueOrThrow({ where: { id: outsider.yapId } });
    assert.equal(untouched.acknowledgedAt, null);
    assert.equal(untouched.disputedAt, null);
  });

  test("another archive's record cannot be edited, redacted or restored", async () => {
    const insider = await makeUser("Editor");
    await prisma.membership.updateMany({
      where: { teamId: TEAM, userId: insider.id },
      data: { role: "OWNER" },
    });

    assert.equal((await editYap(outsider.yapId, TEAM, insider.id, { text: "Подменено.", lore: null })).ok, false);
    assert.equal(await softDeleteYap(outsider.yapId, TEAM, insider.id), false);
    assert.equal(await restoreYap(outsider.yapId, TEAM, insider.id), false);

    const untouched = await prisma.yap.findUniqueOrThrow({ where: { id: outsider.yapId } });
    assert.notEqual(untouched.text, "Подменено.");
    assert.equal(untouched.deletedAt, null);
  });

  test("the arena will not pit a record against one from another archive", async () => {
    const insider = await makeUser("Judge");
    const ours = await makeYap({ authorId: insider.id });

    assert.equal(await recordBattle(ours.id, outsider.yapId, TEAM, insider.id), null);
    assert.equal(await recordBattle(outsider.yapId, ours.id, TEAM, insider.id), null);
    assert.equal(await prisma.battle.count(), 0, "no Elo may move across the wall");
  });

  test("an invite is minted for the team that asked, not the team named", async () => {
    const insider = await makeUser("Host");
    const token = await createInvite({ teamId: TEAM, createdById: insider.id });
    const invite = await prisma.invite.findUniqueOrThrow({ where: { token } });
    assert.equal(invite.teamId, TEAM);
  });
});

/**
 * The invite form's numbers. Blank means "no limit" on purpose; a number that
 * cannot be honoured used to mean the same thing by accident, which made a
 * typo in the uses box the most permissive setting available.
 */
describe("an invite limit is never widened by accident", () => {
  before(async () => {
    await resetDatabase();
  });

  test("blank stays unlimited", async () => {
    const host = await makeUser("Host");
    const token = await createInvite({ teamId: TEAM, createdById: host.id });
    const invite = await prisma.invite.findUniqueOrThrow({ where: { token } });
    assert.equal(invite.maxUses, null);
    assert.equal(invite.expiresAt, null);
  });

  test("zero, negative, fractional and absurd limits are refused, not ignored", async () => {
    const host = await makeUser("Host 2");
    const before = await prisma.invite.count();
    for (const maxUses of [0, -5, 1.5, Number.NaN, 101]) {
      await assert.rejects(
        () => createInvite({ teamId: TEAM, createdById: host.id, maxUses }),
        /INVITE_USES_INVALID/,
        `maxUses ${maxUses} must be refused rather than turned into "unlimited"`,
      );
    }
    for (const expiresInDays of [0, -1, 366, Number.NaN]) {
      await assert.rejects(
        () => createInvite({ teamId: TEAM, createdById: host.id, expiresInDays }),
        /INVITE_DAYS_INVALID/,
      );
    }
    assert.equal(await prisma.invite.count(), before, "not one of those became a link");
  });

  test("a real limit is kept exactly", async () => {
    const host = await makeUser("Host 3");
    const token = await createInvite({
      teamId: TEAM,
      createdById: host.id,
      maxUses: 3,
      expiresInDays: 7,
    });
    const invite = await prisma.invite.findUniqueOrThrow({ where: { token } });
    assert.equal(invite.maxUses, 3);
    assert.ok(invite.expiresAt !== null);
  });
});

/**
 * A badge is earned from one archive's records and belongs to that archive.
 *
 * It used to be keyed on (userId, key) alone, so one account in two teams would
 * carry "1000 AURA" from the first into the second. Nothing read the table, so
 * nothing leaked — but a table nobody reads is exactly the one that gets read
 * one day by somebody who assumes it is right.
 */
describe("badges belong to the archive that awarded them", () => {
  before(async () => {
    await resetDatabase();
  });

  test("the same person earns separately in each archive", async () => {
    const loud = await makeUser("Loud");
    const other = await makeTeam("elsewhere", "Elsewhere");
    await joinTeam(loud.id, other.id);

    // Plenty said here, nothing said there.
    for (let i = 0; i < 25; i += 1) {
      await makeYap({ authorId: loud.id, aura: 200 });
    }

    await syncAchievements(loud.id, TEAM);
    await syncAchievements(loud.id, other.id);

    const here = await prisma.userAchievement.count({ where: { teamId: TEAM, userId: loud.id } });
    const there = await prisma.userAchievement.count({
      where: { teamId: other.id, userId: loud.id },
    });

    assert.ok(here > 0, "earned where the records are");
    assert.equal(there, 0, "and not carried into an archive where they have said nothing");
  });

  test("the profile reports when a badge was awarded, from the archive's own row", async () => {
    const person = await makeUser("Decorated");
    for (let i = 0; i < 25; i += 1) await makeYap({ authorId: person.id, aura: 200 });

    const before = await getYapperProfile(person.id, TEAM);
    assert.ok(before);
    assert.ok(before.badges.length > 0);
    assert.equal(
      before.badges.every((badge) => badge.awardedAt === null),
      true,
      "nothing on file yet, so no date is invented",
    );

    await syncAchievements(person.id, TEAM);

    const after = await getYapperProfile(person.id, TEAM);
    assert.ok(after?.badges.every((badge) => badge.awardedAt !== null));
  });
});

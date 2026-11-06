import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  DEFAULT_TEAM_ID as TEAM,
  makeQuotedYapper,
  makeTeam,
  makeUser,
  makeYap,
  prisma,
  resetDatabase,
} from "./setup";
import { listMembers, setEmployment } from "@/lib/services/teams";
import { getArchivistLeaderboard, getLeaderboard, getYapperProfile } from "@/lib/services/yappers";
import { countWeeklyTitles, getYapperOfTheWeek } from "@/lib/services/weekly";

/**
 * Personnel status, and everything it is deliberately not.
 *
 * The whole point of the flag is that it changes one column and nothing else.
 * An archive is what was said; somebody leaving does not unsay it, does not
 * close their account, does not revoke their sessions and does not take their
 * aura with them. Most of this file is therefore a list of things that must
 * still be true afterwards.
 */
describe("marking somebody as a former colleague", () => {
  let person: { id: string };

  beforeEach(async () => {
    await resetDatabase();
    person = await makeUser("Departed");
  });

  const statusOf = async (userId: string, teamId = TEAM) =>
    (await prisma.membership.findUniqueOrThrow({ where: { teamId_userId: { teamId, userId } } }))
      .employment;

  test("defaults to current, which only means nothing has been recorded", async () => {
    assert.equal(await statusOf(person.id), "CURRENT");
  });

  test("the status is written, and survives being read back", async () => {
    assert.deepEqual(await setEmployment(TEAM, person.id, "FORMER"), { ok: true });
    assert.equal(await statusOf(person.id), "FORMER");
  });

  test("and can be taken back", async () => {
    await setEmployment(TEAM, person.id, "FORMER");
    assert.deepEqual(await setEmployment(TEAM, person.id, "CURRENT"), { ok: true });
    assert.equal(await statusOf(person.id), "CURRENT");
  });

  test("setting the status it already has changes nothing and adds nothing", async () => {
    await setEmployment(TEAM, person.id, "FORMER");
    const before = await prisma.membership.findUniqueOrThrow({
      where: { teamId_userId: { teamId: TEAM, userId: person.id } },
    });

    assert.deepEqual(await setEmployment(TEAM, person.id, "FORMER"), { ok: true });

    const after = await prisma.membership.findUniqueOrThrow({
      where: { teamId_userId: { teamId: TEAM, userId: person.id } },
    });
    assert.deepEqual(after, before, "a status is a fact, not a log of decisions");
    assert.equal(await prisma.membership.count({ where: { teamId: TEAM } }), 1);
  });

  test("somebody the archive only quotes can have left too", async () => {
    const quoted = await makeQuotedYapper("Quoted Only");
    assert.deepEqual(await setEmployment(TEAM, quoted.id, "FORMER"), { ok: true });
    assert.equal(await statusOf(quoted.id), "FORMER");
  });

  test("a person from another archive is not this archive's to annotate", async () => {
    const elsewhere = await makeTeam("elsewhere", "Elsewhere");
    const stranger = await makeUser("Stranger", elsewhere.id);

    assert.deepEqual(await setEmployment(TEAM, stranger.id, "FORMER"), {
      ok: false,
      code: "NOT_A_MEMBER",
    });
    assert.equal(await statusOf(stranger.id, elsewhere.id), "CURRENT");
  });

  test("the status belongs to one archive, not to the account", async () => {
    const elsewhere = await makeTeam("elsewhere", "Elsewhere");
    await prisma.membership.create({ data: { teamId: elsewhere.id, userId: person.id } });

    await setEmployment(TEAM, person.id, "FORMER");
    assert.equal(await statusOf(person.id, elsewhere.id), "CURRENT", "they still work there");
  });
});

describe("what a personnel change does not touch", () => {
  let person: { id: string; username: string | null; passwordHash: string | null };

  beforeEach(async () => {
    await resetDatabase();
    person = await makeUser("Departed");
  });

  test("the account: credentials, instance role and team role are untouched", async () => {
    await prisma.membership.update({
      where: { teamId_userId: { teamId: TEAM, userId: person.id } },
      data: { role: "ADMIN" },
    });

    await setEmployment(TEAM, person.id, "FORMER");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: person.id } });
    assert.equal(after.username, person.username);
    assert.equal(after.passwordHash, person.passwordHash);
    assert.equal(after.role, "USER");
    assert.equal(
      (await prisma.membership.findUniqueOrThrow({
        where: { teamId_userId: { teamId: TEAM, userId: person.id } },
      })).role,
      "ADMIN",
      "leaving the company is not a demotion",
    );
  });

  test("their sessions: they are not signed out", async () => {
    await prisma.session.create({
      data: {
        token: "still-signed-in",
        userId: person.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await setEmployment(TEAM, person.id, "FORMER");

    assert.equal(
      await prisma.session.count({ where: { userId: person.id } }),
      1,
      "issuing a reset link ends every session a person has; this deliberately ends none",
    );
  });

  test("the record: nothing is hidden, rescored or re-rated", async () => {
    const yap = await makeYap({ authorId: person.id, aura: 420 });
    await prisma.yap.update({
      where: { id: yap.id },
      data: { eloRating: 1620, battleWins: 4, verification: "CERTIFIED" },
    });

    await setEmployment(TEAM, person.id, "FORMER");

    const after = await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } });
    assert.equal(after.deletedAt, null);
    assert.equal(after.aura, 420);
    assert.equal(after.eloRating, 1620);
    assert.equal(after.battleWins, 4);
    assert.equal(after.verification, "CERTIFIED");
    assert.equal(after.authorId, person.id);
  });

  test("the rankings: they are still on every table they had earned", async () => {
    await makeYap({ authorId: person.id, submittedById: person.id, aura: 420 });
    await setEmployment(TEAM, person.id, "FORMER");

    const leaders = await getLeaderboard(TEAM);
    const archivists = await getArchivistLeaderboard(TEAM);
    assert.equal(leaders[0]?.yapper.id, person.id, "still ranked for what they said");
    assert.equal(archivists[0]?.yapper.id, person.id, "and for what they filed");
  });

  test("a title already won: the week happened whatever came after", async () => {
    const now = new Date("2026-11-10T12:00:00Z");
    await makeYap({ authorId: person.id, saidAt: new Date("2026-11-03T09:00:00Z") });
    const before = await getYapperOfTheWeek(TEAM, "UTC", now);
    assert.equal(before?.winner?.id, person.id);

    await setEmployment(TEAM, person.id, "FORMER");

    const after = await getYapperOfTheWeek(TEAM, "UTC", now);
    assert.equal(after?.winner?.id, person.id);
    assert.equal(after?.winnerFormer, true, "the file says what became of them, and keeps them");
    assert.equal(await countWeeklyTitles(person.id, TEAM), 1);
  });
});

describe("where the status is visible", () => {
  let person: { id: string };

  beforeEach(async () => {
    await resetDatabase();
    person = await makeUser("Departed");
    await makeYap({ authorId: person.id, submittedById: person.id, aura: 10 });
  });

  test("nothing says anything until something has been recorded", async () => {
    assert.equal((await getYapperProfile(person.id, TEAM))?.former, false);
    assert.equal((await getLeaderboard(TEAM))[0]?.former, false);
    assert.equal((await getArchivistLeaderboard(TEAM))[0]?.former, false);
    assert.equal((await listMembers(TEAM))[0]?.employment, "CURRENT");
  });

  test("and every surface that lists people says so once it has", async () => {
    await setEmployment(TEAM, person.id, "FORMER");

    assert.equal((await getYapperProfile(person.id, TEAM))?.former, true);
    assert.equal((await getLeaderboard(TEAM))[0]?.former, true);
    assert.equal((await getArchivistLeaderboard(TEAM))[0]?.former, true);
    assert.equal((await listMembers(TEAM))[0]?.employment, "FORMER");
  });

  test("one archive's annotation does not follow the person into another", async () => {
    const elsewhere = await makeTeam("elsewhere", "Elsewhere");
    await prisma.membership.create({ data: { teamId: elsewhere.id, userId: person.id } });
    await makeYap({ authorId: person.id, teamId: elsewhere.id, aura: 10 });

    await setEmployment(TEAM, person.id, "FORMER");

    assert.equal((await getYapperProfile(person.id, elsewhere.id))?.former, false);
    assert.equal((await getLeaderboard(elsewhere.id))[0]?.former, false);
  });
});

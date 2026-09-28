import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TEAM_ID as TEAM,
  makeTeam,
  makeUser,
  makeYap,
  prisma,
  resetDatabase,
} from "./setup";
import {
  countYaps,
  createYap,
  getYap,
  listTags,
  listYaps,
  restoreYap,
  softDeleteYap,
  toggleReaction,
} from "@/lib/services/yaps";
import { findOrCreateYapper, getLeaderboard, getYapperProfile } from "@/lib/services/yappers";
import { getArenaState } from "@/lib/services/battles";
import { joinTeam, previewClaim, registerAccount, validateRegistration } from "@/lib/services/accounts";
import {
  consumeInvite,
  createInvite,
  inspectInvite,
  listInvitesBy,
  releaseInvite,
  revokeInvite,
} from "@/lib/services/invites";
import {
  createTeam,
  listMembers,
  listOwners,
  listTeamOverviews,
  removeMember,
  setMemberRole,
} from "@/lib/services/teams";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

/** Two archives on one instance, with a namesake in each. */
async function twoTeams() {
  await resetDatabase();
  const other = await makeTeam("other", "Other Corp");

  const hereAnna = await makeUser("Anna", TEAM);
  const thereAnna = await makeUser("Anna", other.id);
  const here = await makeYap({ authorId: hereAnna.id, text: "Said here.", aura: 50 });
  const there = await makeYap({
    authorId: thereAnna.id,
    text: "Said there.",
    aura: 900,
    teamId: other.id,
  });

  return { other, hereAnna, thereAnna, here, there };
}

describe("one instance, separate archives", () => {
  test("the feed never reaches across the wall", async () => {
    const { other, here, there } = await twoTeams();

    const mine = await listYaps({ teamId: TEAM });
    assert.deepEqual(mine.map((yap) => yap.id), [here.id]);
    assert.equal(await countYaps({ teamId: TEAM }), 1);

    const theirs = await listYaps({ teamId: other.id });
    assert.deepEqual(theirs.map((yap) => yap.id), [there.id]);
  });

  test("a record cannot be read through the wrong team", async () => {
    const { other, here } = await twoTeams();
    assert.ok(await getYap(here.id, TEAM));
    assert.equal(
      await getYap(here.id, other.id),
      null,
      "knowing the id must not be enough to read it",
    );
  });

  test("a reaction from outside the team is refused", async () => {
    const { other, here } = await twoTeams();
    const outsider = await makeUser("Outsider", other.id);
    await assert.rejects(() => toggleReaction(here.id, other.id, outsider.id, "BASED"));
    const fresh = await prisma.yap.findUniqueOrThrow({ where: { id: here.id } });
    assert.equal(fresh.reactionCount, 0);
  });

  test("leaderboards and profiles count only their own archive", async () => {
    const { other, hereAnna, thereAnna } = await twoTeams();

    const board = await getLeaderboard(TEAM);
    assert.equal(board.length, 1);
    assert.equal(board[0].yapper.id, hereAnna.id);
    assert.equal(board[0].totalAura, 50, "the other Anna's 900 aura is not ours");

    const profile = await getYapperProfile(hereAnna.id, TEAM);
    assert.equal(profile?.stats.totalAura, 50);
    assert.equal(
      await getYapperProfile(thereAnna.id, TEAM),
      null,
      "a member of another team has no profile here",
    );
  });

  test("two archives may each have their own Diana", async () => {
    await resetDatabase();
    const other = await makeTeam("other", "Other Corp");

    const here = await findOrCreateYapper("Diana", TEAM);
    const there = await findOrCreateYapper("Diana", other.id);
    assert.notEqual(there, here, "a namesake elsewhere is a different person");

    const again = await findOrCreateYapper("diana", TEAM);
    assert.equal(again, here, "within one team the spelling still collapses");
  });

  test("registering cannot claim a namesake in another archive", async () => {
    await resetDatabase();
    const other = await makeTeam("other", "Other Corp");
    const theirDiana = await findOrCreateYapper("Diana", other.id);

    assert.equal(await previewClaim("Diana", TEAM), null);
    const result = await registerAccount("diana", "correct horse battery", "Diana", TEAM);
    assert.equal(result.ok, true);
    assert.notEqual(
      result.ok && result.userId,
      theirDiana,
      "their unclaimed Diana must stay unclaimed",
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: theirDiana } })).username,
      null,
    );
  });

  test("tags and the arena are per-team", async () => {
    await resetDatabase();
    const other = await makeTeam("other", "Other Corp");
    const mine = await makeUser("Mine", TEAM);
    const yours = await makeUser("Yours", other.id);

    await createYap({
      teamId: TEAM,
      text: "Тег только наш.",
      authorId: mine.id,
      submittedById: mine.id,
      saidAt: new Date(),
      tags: ["деплой"],
    });
    await createYap({
      teamId: other.id,
      text: "Tag is only theirs.",
      authorId: yours.id,
      submittedById: yours.id,
      saidAt: new Date(),
      tags: ["deploy"],
    });

    assert.deepEqual((await listTags(TEAM)).map((tag) => tag.slug), ["деплой"]);
    assert.deepEqual((await listTags(other.id)).map((tag) => tag.slug), ["deploy"]);

    // Four records here, one there: the arena opens on one side only.
    for (let i = 0; i < 4; i += 1) await makeYap({ authorId: mine.id });
    assert.equal((await getArenaState(TEAM)).open, true);
    assert.equal((await getArenaState(other.id)).open, false);
  });
});

describe("invites are the only door", () => {
  test("a fresh link admits exactly as many people as it says", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    const token = await createInvite({ teamId: TEAM, createdById: owner.id, maxUses: 2 });

    assert.equal((await inspectInvite(token)).ok, true);
    assert.equal((await consumeInvite(token)).ok, true);
    assert.equal((await consumeInvite(token)).ok, true);

    const third = await consumeInvite(token);
    assert.equal(third.ok, false);
    assert.equal(third.ok === false && third.reason, "EXHAUSTED");
  });

  test("an unlimited link keeps working", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    const token = await createInvite({ teamId: TEAM, createdById: owner.id, maxUses: null });
    for (let i = 0; i < 5; i += 1) assert.equal((await consumeInvite(token)).ok, true);
    assert.equal((await prisma.invite.findUniqueOrThrow({ where: { token } })).uses, 5);
  });

  test("revoking and expiry both close the door, and say which", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");

    const revoked = await createInvite({ teamId: TEAM, createdById: owner.id });
    assert.equal(await revokeInvite(revoked, TEAM), true);
    const dead = await inspectInvite(revoked);
    assert.equal(dead.ok === false && dead.reason, "REVOKED");

    const expired = await createInvite({ teamId: TEAM, createdById: owner.id });
    await prisma.invite.update({
      where: { token: expired },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const stale = await inspectInvite(expired);
    assert.equal(stale.ok === false && stale.reason, "EXPIRED");

    const unknown = await inspectInvite("nope");
    assert.equal(unknown.ok === false && unknown.reason, "UNKNOWN");
  });

  test("a member pulls back their own link and nobody else's", async () => {
    await resetDatabase();
    const mine = await makeUser("Mine");
    const theirs = await makeUser("Theirs");
    const myLink = await createInvite({ teamId: TEAM, createdById: mine.id });
    const theirLink = await createInvite({ teamId: TEAM, createdById: theirs.id });

    // Constrained to the author: what an ordinary member is allowed to do.
    assert.equal(await revokeInvite(theirLink, TEAM, mine.id), false);
    assert.equal((await inspectInvite(theirLink)).ok, true, "someone else's link survives");
    assert.equal(await revokeInvite(myLink, TEAM, mine.id), true);

    // Unconstrained: what an owner or admin is allowed to do.
    assert.equal(await revokeInvite(theirLink, TEAM), true);

    const mineOnly = await listInvitesBy(TEAM, mine.id);
    assert.deepEqual(mineOnly.map((row) => row.token), [myLink]);
  });

  test("a link cannot be revoked from another team", async () => {
    await resetDatabase();
    const other = await makeTeam("other", "Other Corp");
    const owner = await makeUser("Owner");
    const token = await createInvite({ teamId: TEAM, createdById: owner.id });

    assert.equal(await revokeInvite(token, other.id), false);
    assert.equal((await inspectInvite(token)).ok, true);
  });

  test("two people racing for the last seat: one gets in", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    const token = await createInvite({ teamId: TEAM, createdById: owner.id, maxUses: 1 });

    const results = await Promise.all([consumeInvite(token), consumeInvite(token)]);
    assert.equal(results.filter((result) => result.ok).length, 1, "the seat was sold twice");
    assert.equal((await prisma.invite.findUniqueOrThrow({ where: { token } })).uses, 1);
  });

  test("the last seat cannot be taken twice, even by registration", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    const token = await createInvite({ teamId: TEAM, createdById: owner.id, maxUses: 1 });

    // The order the action uses: validate, take the seat, then create.
    const attempt = async (username: string) => {
      const valid = await validateRegistration(username, "correct horse battery");
      if (!valid.ok) return false;
      const spent = await consumeInvite(token);
      if (!spent.ok) return false;
      const made = await registerAccount(username, "correct horse battery", username, TEAM);
      if (!made.ok) {
        await releaseInvite(token);
        return false;
      }
      return true;
    };

    const [first, second] = await Promise.all([attempt("racer1"), attempt("racer2")]);
    assert.equal([first, second].filter(Boolean).length, 1, "two people used one seat");

    // And the loser is not quietly a member anyway — that was the bug.
    const members = await prisma.membership.count({ where: { teamId: TEAM } });
    assert.equal(members, 2, "owner plus exactly one newcomer");
  });

  test("a failed registration hands the seat back", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    await registerAccount("taken", "correct horse battery", "Taken", TEAM);
    const token = await createInvite({ teamId: TEAM, createdById: owner.id, maxUses: 1 });

    const spent = await consumeInvite(token);
    assert.equal(spent.ok, true);
    const clash = await registerAccount("taken", "correct horse battery", "Someone", TEAM);
    assert.equal(clash.ok, false);
    await releaseInvite(token);

    assert.equal((await prisma.invite.findUniqueOrThrow({ where: { token } })).uses, 0);
    assert.equal((await inspectInvite(token)).ok, true, "the link still works");
  });

  test("registering through a link joins that team", async () => {
    await resetDatabase();
    const other = await makeTeam("other", "Other Corp");
    const result = await registerAccount("katya", "correct horse battery", "Katya", other.id);
    assert.equal(result.ok, true);

    const teams = await prisma.membership.findMany({
      where: { userId: result.ok ? result.userId : "" },
    });
    assert.deepEqual(teams.map((row) => row.teamId), [other.id]);
  });
});

describe("the instance operator", () => {
  test("moderation powers reach a team they never joined", async () => {
    const { other, there } = await twoTeams();
    const operator = await prisma.user.create({
      data: { displayName: "Operator", role: "ADMIN" },
    });
    const bystander = await makeUser("Bystander", TEAM);

    // No membership anywhere, yet the archive accepts the redaction — this is
    // the deliberate hole, and it is the only one.
    assert.equal(
      await prisma.membership.count({ where: { userId: operator.id } }),
      0,
      "the operator is in no team",
    );
    assert.equal(await softDeleteYap(there.id, other.id, operator.id), true);
    assert.equal(await countYaps({ teamId: other.id }), 0);

    assert.equal(await restoreYap(there.id, other.id, operator.id), true);
    assert.equal(await countYaps({ teamId: other.id }), 1);

    // An ordinary member of another team gets none of it.
    assert.equal(await softDeleteYap(there.id, other.id, bystander.id), false);
    assert.equal(await countYaps({ teamId: other.id }), 1);
  });

  test("the instance view counts every archive separately", async () => {
    const { other } = await twoTeams();
    const owner = await makeUser("Head", TEAM);
    await setMemberRole(TEAM, owner.id, "OWNER");

    const overviews = await listTeamOverviews();
    assert.equal(overviews.length, 2);

    const here = overviews.find((row) => row.id === TEAM)!;
    const theirs = overviews.find((row) => row.id === other.id)!;
    assert.equal(here.yapCount, 1);
    assert.equal(theirs.yapCount, 1);
    assert.equal(theirs.memberCount, 1, "their Anna, and nobody of ours");

    const owners = await listOwners([TEAM, other.id]);
    assert.deepEqual(owners.get(TEAM), ["Head"]);
    assert.equal(owners.get(other.id), undefined, "an archive can sit without an owner");
  });
});

describe("running a team", () => {
  test("a team always keeps an owner", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    const member = await makeUser("Member");
    await setMemberRole(TEAM, owner.id, "OWNER");

    const demoted = await setMemberRole(TEAM, owner.id, "MEMBER");
    assert.equal(demoted.ok, false, "the last owner must not be able to step down alone");
    assert.equal(await removeMemberFails(TEAM, owner.id), true);

    // With a second owner in place, the first may leave.
    assert.equal((await setMemberRole(TEAM, member.id, "OWNER")).ok, true);
    assert.equal((await setMemberRole(TEAM, owner.id, "MEMBER")).ok, true);
  });

  test("removing a member ends their sessions but keeps their words", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    const leaving = await makeUser("Leaving");
    await setMemberRole(TEAM, owner.id, "OWNER");
    const yap = await makeYap({ authorId: leaving.id, text: "Still on record." });
    await prisma.session.create({
      data: {
        token: "session-token",
        userId: leaving.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    assert.equal((await removeMember(TEAM, leaving.id)).ok, true);
    assert.equal(await prisma.session.count({ where: { userId: leaving.id } }), 0);
    assert.ok(await getYap(yap.id, TEAM), "the statement outlives the membership");
    assert.equal((await listMembers(TEAM)).length, 1);
  });

  test("leaving one archive does not sign you out of another", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    await setMemberRole(TEAM, owner.id, "OWNER");
    const other = await makeTeam("elsewhere", "Elsewhere");
    const dual = await makeUser("Dual");
    await joinTeam(dual.id, other.id);
    await prisma.session.create({
      data: {
        token: "dual-token",
        userId: dual.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    assert.equal((await removeMember(TEAM, dual.id)).ok, true);
    assert.equal(
      await prisma.session.count({ where: { userId: dual.id } }),
      1,
      "one team's decision must not end a session the other team still honours",
    );
    // The door here is shut all the same: access follows the membership.
    assert.equal(
      await prisma.membership.count({ where: { teamId: TEAM, userId: dual.id } }),
      0,
    );
  });

  test("the member table separates saying from filing", async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    const archivist = await makeUser("Archivist");
    await makeYap({ authorId: author.id, submittedById: archivist.id });
    await makeYap({ authorId: author.id, submittedById: archivist.id });

    const rows = await listMembers(TEAM);
    const said = rows.find((row) => row.userId === author.id)!;
    const filed = rows.find((row) => row.userId === archivist.id)!;
    assert.equal(said.yapCount, 2);
    assert.equal(said.filedCount, 0);
    assert.equal(filed.yapCount, 0);
    assert.equal(filed.filedCount, 2);
    assert.equal(said.hasAccount, false, "quoted, never signed in");
  });

  test("opening a second archive makes the opener its owner", async () => {
    await resetDatabase();
    const founder = await makeUser("Founder");
    const created = await createTeam("Подливычи 2", founder.id);
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.equal(created.slug, "подливычи-2", "the slug keeps Cyrillic rather than mangling it");
    const members = await listMembers(created.teamId);
    assert.deepEqual(
      members.map((row) => [row.userId, row.role]),
      [[founder.id, "OWNER"]],
    );

    // A second team by the same name gets its own slug, not a collision.
    const twin = await createTeam("Подливычи 2", founder.id);
    assert.equal(twin.ok && twin.slug, "подливычи-2-2");
  });
});

async function removeMemberFails(teamId: string, userId: string): Promise<boolean> {
  const result = await removeMember(teamId, userId);
  return result.ok === false;
}

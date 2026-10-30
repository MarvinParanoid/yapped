import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  DEFAULT_TEAM_ID as TEAM,
  makeQuotedYapper,
  makeTeam,
  makeUser,
  prisma,
  resetDatabase,
} from "./setup";
import { consumeReset, inspectReset, issueReset } from "@/lib/services/password-reset";
import { authenticate, joinTeam, registerAccount } from "@/lib/services/accounts";
import { setMemberRole } from "@/lib/services/teams";

/**
 * Getting back in without an email address.
 *
 * There is nowhere to send a link, so one is minted by an administrator and
 * handed over in the chat the team is already in. Everything below is about the
 * link being worth exactly one use.
 */
describe("a way back in", () => {
  let locked: string;
  let admin: string;

  before(async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    admin = owner.id;
    const account = await registerAccount("forgetful", "original-password", "Forgetful", TEAM);
    assert.ok(account.ok);
    locked = account.userId;
  });

  test("the link names who it is for, before anyone types a password", async () => {
    const issued = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin, issuerIsOperator: false });
    assert.ok(issued.ok);

    const subject = await inspectReset(issued.token);
    assert.ok(subject.ok);
    assert.equal(subject.displayName, "Forgetful");
    assert.equal(subject.username, "forgetful");
  });

  test("it sets the password and will not work twice", async () => {
    const issued = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin, issuerIsOperator: false });
    assert.ok(issued.ok);

    assert.equal((await consumeReset(issued.token, "a-brand-new-one")).ok, true);
    assert.equal((await authenticate("forgetful", "a-brand-new-one")).ok, true);
    assert.equal((await authenticate("forgetful", "original-password")).ok, false);

    const again = await consumeReset(issued.token, "third-password-attempt");
    assert.equal(again.ok, false);
    assert.equal(
      (await authenticate("forgetful", "a-brand-new-one")).ok,
      true,
      "a spent link changes nothing",
    );
  });

  test("issuing a new link spends the one before it", async () => {
    const first = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin, issuerIsOperator: false });
    assert.ok(first.ok);
    const second = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin, issuerIsOperator: false });
    assert.ok(second.ok);

    assert.equal((await inspectReset(first.token)).ok, false, "only one live link at a time");
    assert.equal((await inspectReset(second.token)).ok, true);
  });

  test("using it ends every session that account had", async () => {
    const issued = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin, issuerIsOperator: false });
    assert.ok(issued.ok);
    await prisma.session.create({
      data: { token: "stale", userId: locked, expiresAt: new Date(Date.now() + 86_400_000) },
    });

    assert.equal((await consumeReset(issued.token, "yet-another-one")).ok, true);
    assert.equal(
      await prisma.session.count({ where: { userId: locked } }),
      0,
      "whoever was signed in could not have been the person who needed this",
    );
  });

  test("an expired link is refused", async () => {
    const issued = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin, issuerIsOperator: false });
    assert.ok(issued.ok);
    await prisma.passwordReset.update({
      where: { token: issued.token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    assert.equal((await inspectReset(issued.token)).ok, false);
    assert.equal((await consumeReset(issued.token, "too-late-for-this")).ok, false);
  });

  test("a short password is refused before the link is spent", async () => {
    const issued = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin, issuerIsOperator: false });
    assert.ok(issued.ok);

    assert.equal((await consumeReset(issued.token, "short")).ok, false);
    assert.equal((await inspectReset(issued.token)).ok, true, "the link survives a bad attempt");
  });

  test("nobody can mint a link for another archive's member", async () => {
    const other = await makeTeam("elsewhere", "Elsewhere");
    const stranger = await makeUser("Stranger", other.id);

    const crossed = await issueReset({ teamId: TEAM, userId: stranger.id, issuedById: admin, issuerIsOperator: false });
    assert.equal(crossed.ok, false);
    assert.equal(await prisma.passwordReset.count({ where: { userId: stranger.id } }), 0);
  });

  test("someone who was only ever quoted has no password to reset", async () => {
    const quoted = await makeQuotedYapper("Quoted Only");
    const refused = await issueReset({ teamId: TEAM, userId: quoted.id, issuedById: admin, issuerIsOperator: false });
    assert.equal(refused.ok, false);
  });
});

/**
 * A password is one per account, not one per archive, so a reset reaches every
 * archive that account belongs to. That makes issuing one a team decision only
 * while the account is confined to that team.
 */
describe("a reset stops at the edge of what an owner decides", () => {
  test("it is refused for an account that belongs to another archive too", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    const account = await registerAccount("traveller", "first-password", "Traveller", TEAM);
    assert.ok(account.ok);

    const elsewhere = await makeTeam("elsewhere", "Elsewhere");
    await joinTeam(account.userId, elsewhere.id);

    const refused = await issueReset({
      teamId: TEAM,
      userId: account.userId,
      issuedById: owner.id,
      issuerIsOperator: false,
    });
    assert.equal(refused.ok, false, "one archive's owner cannot open a door into another");

    // The operator may, because they can already enter any archive openly.
    const allowed = await issueReset({
      teamId: TEAM,
      userId: account.userId,
      issuedById: owner.id,
      issuerIsOperator: true,
    });
    assert.equal(allowed.ok, true);
  });

  test("the person who runs the instance cannot be reset by a team owner", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    const account = await registerAccount("operator", "first-password", "Operator", TEAM);
    assert.ok(account.ok);
    await prisma.user.update({ where: { id: account.userId }, data: { role: "ADMIN" } });

    const refused = await issueReset({
      teamId: TEAM,
      userId: account.userId,
      issuedById: owner.id,
      issuerIsOperator: false,
    });
    assert.equal(refused.ok, false, "taking the instance is not a team decision");
  });
});

/**
 * An admin may help somebody back in, but not reach above themselves.
 */
describe("who may hand out a way back in", () => {
  test("an admin can reset an ordinary member", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    await setMemberRole(TEAM, owner.id, "OWNER");
    const admin = await makeUser("Admin");
    await setMemberRole(TEAM, admin.id, "ADMIN");
    const member = await makeUser("Member");

    const issued = await issueReset({
      teamId: TEAM,
      userId: member.id,
      issuedById: admin.id,
      issuerIsOperator: false,
    });
    assert.equal(issued.ok, true, "helping a colleague back in is not a roster change");
  });

  test("an admin cannot reset the owner", async () => {
    await resetDatabase();
    const owner = await makeUser("Owner");
    await setMemberRole(TEAM, owner.id, "OWNER");
    const admin = await makeUser("Admin");
    await setMemberRole(TEAM, admin.id, "ADMIN");

    const refused = await issueReset({
      teamId: TEAM,
      userId: owner.id,
      issuedById: admin.id,
      issuerIsOperator: false,
    });
    assert.equal(refused.ok, false, "otherwise moderating is a way to take the archive");

    // The owner may still reset another owner, and the operator anyone.
    const second = await makeUser("Second owner");
    await setMemberRole(TEAM, second.id, "OWNER");
    assert.equal(
      (await issueReset({ teamId: TEAM, userId: second.id, issuedById: owner.id, issuerIsOperator: false })).ok,
      true,
    );
    assert.equal(
      (await issueReset({ teamId: TEAM, userId: owner.id, issuedById: admin.id, issuerIsOperator: true })).ok,
      true,
    );
  });
});

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { DEFAULT_TEAM_ID as TEAM, makeTeam, makeUser, prisma, resetDatabase } from "./setup";
import { consumeReset, inspectReset, issueReset } from "@/lib/services/password-reset";
import { authenticate, registerAccount } from "@/lib/services/accounts";

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
    const issued = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin });
    assert.ok(issued.ok);

    const subject = await inspectReset(issued.token);
    assert.ok(subject.ok);
    assert.equal(subject.displayName, "Forgetful");
    assert.equal(subject.username, "forgetful");
  });

  test("it sets the password and will not work twice", async () => {
    const issued = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin });
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
    const first = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin });
    assert.ok(first.ok);
    const second = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin });
    assert.ok(second.ok);

    assert.equal((await inspectReset(first.token)).ok, false, "only one live link at a time");
    assert.equal((await inspectReset(second.token)).ok, true);
  });

  test("using it ends every session that account had", async () => {
    const issued = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin });
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
    const issued = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin });
    assert.ok(issued.ok);
    await prisma.passwordReset.update({
      where: { token: issued.token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    assert.equal((await inspectReset(issued.token)).ok, false);
    assert.equal((await consumeReset(issued.token, "too-late-for-this")).ok, false);
  });

  test("a short password is refused before the link is spent", async () => {
    const issued = await issueReset({ teamId: TEAM, userId: locked, issuedById: admin });
    assert.ok(issued.ok);

    assert.equal((await consumeReset(issued.token, "short")).ok, false);
    assert.equal((await inspectReset(issued.token)).ok, true, "the link survives a bad attempt");
  });

  test("nobody can mint a link for another archive's member", async () => {
    const other = await makeTeam("elsewhere", "Elsewhere");
    const stranger = await makeUser("Stranger", other.id);

    const crossed = await issueReset({ teamId: TEAM, userId: stranger.id, issuedById: admin });
    assert.equal(crossed.ok, false);
    assert.equal(await prisma.passwordReset.count({ where: { userId: stranger.id } }), 0);
  });

  test("someone who was only ever quoted has no password to reset", async () => {
    const quoted = await makeUser("Quoted Only");
    const refused = await issueReset({ teamId: TEAM, userId: quoted.id, issuedById: admin });
    assert.equal(refused.ok, false);
  });
});

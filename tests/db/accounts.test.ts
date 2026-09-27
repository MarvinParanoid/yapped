import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEAM_ID as TEAM, makeUser, makeYap, prisma, resetDatabase } from "./setup";
import { authenticate, previewClaim, registerAccount } from "@/lib/services/accounts";
import { findOrCreateYapper } from "@/lib/services/yappers";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

describe("who said it versus who has an account", () => {
  test("naming a new yapper creates a person with no credentials", async () => {
    const id = await findOrCreateYapper("Diana", TEAM);
    const person = await prisma.user.findUniqueOrThrow({ where: { id } });
    assert.equal(person.displayName, "Diana");
    assert.equal(person.username, null);
    assert.equal(person.passwordHash, null);
  });

  test("naming them again reuses the same person, whatever the casing", async () => {
    const first = await findOrCreateYapper("Diana", TEAM);
    const again = await findOrCreateYapper("diana", TEAM);
    assert.equal(again, first, "a second spelling must not split the person in two");
  });

  test("registering under that name claims the record", async () => {
    await resetDatabase();
    const filer = await makeUser("Lesha");
    const dianaId = await findOrCreateYapper("Diana", TEAM);
    await makeYap({ authorId: dianaId, submittedById: filer.id, aura: 12 });
    await makeYap({ authorId: dianaId, submittedById: filer.id, aura: 10 });

    const preview = await previewClaim("diana", TEAM);
    assert.deepEqual(preview, { displayName: "Diana", yapCount: 2, totalAura: 22 });

    const result = await registerAccount("diana", "correct horse battery", "Diana", TEAM);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.userId, dianaId, "she must take over the existing row");

    // Her statements came with her; nothing was copied or orphaned.
    const owned = await prisma.yap.count({ where: { authorId: dianaId } });
    assert.equal(owned, 2);
    assert.equal(await prisma.user.count(), 2, "claiming must not create a second person");
    assert.equal((await authenticate("diana", "correct horse battery")).ok, true);
  });

  test("a different spelling starts a separate person", async () => {
    await resetDatabase();
    const dianaId = await findOrCreateYapper("Diana", TEAM);
    await makeYap({ authorId: dianaId });

    assert.equal(await previewClaim("Диана", TEAM), null, "nothing to claim under another spelling");
    const result = await registerAccount("diana2", "correct horse battery", "Диана", TEAM);
    assert.equal(result.ok, true);
    assert.notEqual(result.ok && result.userId, dianaId);
    assert.equal(await prisma.user.count(), 2);
    assert.equal(
      await prisma.yap.count({ where: { authorId: dianaId } }),
      1,
      "the statements stay with the unclaimed person",
    );
  });

  test("an account that already has a password cannot be claimed", async () => {
    await resetDatabase();
    await registerAccount("taken", "correct horse battery", "Diana", TEAM);
    assert.equal(await previewClaim("Diana", TEAM), null);
    const second = await registerAccount("other", "correct horse battery", "Diana", TEAM);
    assert.equal(second.ok, true, "a namesake may still register");
    assert.equal(await prisma.user.count(), 2);
  });

  test("usernames are unique and passwords have a floor", async () => {
    await resetDatabase();
    await registerAccount("lesha", "correct horse battery", "Lesha", TEAM);
    assert.equal((await registerAccount("lesha", "another password", "Someone", TEAM)).ok, false);
    assert.equal((await registerAccount("shorty", "abc", "Shorty", TEAM)).ok, false);
    assert.equal((await authenticate("lesha", "wrong password")).ok, false);
  });
});

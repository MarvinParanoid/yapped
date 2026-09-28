import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { makeUser, prisma, resetDatabase } from "./setup";
import { pruneExpiredSessions } from "@/lib/auth/session";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

const day = 24 * 60 * 60 * 1000;

async function session(userId: string, token: string, expiresInDays: number) {
  return prisma.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + expiresInDays * day) },
  });
}

/**
 * An expired session was treated as invalid on the way in and then left in the
 * table forever. One row per sign-in with a thirty-day life is slow enough that
 * nobody would have noticed for a year — which is the kind of growth worth a
 * test rather than a memory.
 */
describe("expired sessions do not accumulate", () => {
  test("the sweep takes the dead and leaves the living", async () => {
    await resetDatabase();
    const user = await makeUser("Sleeper");
    await session(user.id, "live", 30);
    await session(user.id, "fresh", 1);
    await session(user.id, "stale", -1);
    await session(user.id, "ancient", -400);

    const removed = await pruneExpiredSessions();
    assert.equal(removed, 2);

    const left = await prisma.session.findMany({ orderBy: { token: "asc" } });
    assert.deepEqual(left.map((row) => row.token), ["fresh", "live"]);
  });

  test("a session expiring this very moment is already gone", async () => {
    await resetDatabase();
    const user = await makeUser("Edge");
    await prisma.session.create({
      data: { token: "just-now", userId: user.id, expiresAt: new Date(Date.now() - 1) },
    });
    assert.equal(await pruneExpiredSessions(), 1);
  });

  test("sweeping an already-clean table is free and harmless", async () => {
    await resetDatabase();
    const user = await makeUser("Tidy");
    await session(user.id, "live", 5);
    assert.equal(await pruneExpiredSessions(), 0);
    assert.equal(await pruneExpiredSessions(), 0);
    assert.equal(await prisma.session.count(), 1);
  });

  test("one person's expired session is not another's problem", async () => {
    await resetDatabase();
    const a = await makeUser("A");
    const b = await makeUser("B");
    await session(a.id, "a-stale", -2);
    await session(b.id, "b-live", 10);

    await pruneExpiredSessions();
    const left = await prisma.session.findMany();
    assert.deepEqual(left.map((row) => row.userId), [b.id]);
  });
});

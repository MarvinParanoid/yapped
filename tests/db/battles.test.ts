import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { DEFAULT_TEAM_ID as TEAM, makeUser, makeYap, prisma, resetDatabase } from "./setup";
import { recordBattle } from "@/lib/services/battles";

/**
 * Changing your mind is allowed; voting twice is not the same thing.
 *
 * The arena used to be unable to tell them apart — every vote appended a row
 * and moved Elo again — and this was not hypothetical: getBattlePair's sampling
 * fallback hands back an already-judged pair when it cannot find a fresh one,
 * so a real archive had 23 battles standing for 17 verdicts.
 */
describe("one verdict per person per pair", () => {
  let voter: string;
  let a: number;
  let b: number;

  before(async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    const judge = await makeUser("Judge");
    voter = judge.id;
    a = (await makeYap({ authorId: author.id, text: "Первое." })).id;
    b = (await makeYap({ authorId: author.id, text: "Второе." })).id;
  });

  test("voting the same way again does not move the ladder twice", async () => {
    const first = await recordBattle(a, b, TEAM, voter);
    assert.ok(first);

    const after = await prisma.yap.findUniqueOrThrow({ where: { id: a } });
    const rating = after.eloRating;
    assert.equal(after.battleWins, 1);

    // The same verdict, cast again.
    await recordBattle(a, b, TEAM, voter);

    const still = await prisma.yap.findUniqueOrThrow({ where: { id: a } });
    assert.equal(still.eloRating, rating, "a repeated verdict must not pump the rating");
    assert.equal(still.battleWins, 1, "nor the win column");
    assert.equal(
      await prisma.battle.count({ where: { voterId: voter } }),
      1,
      "and it stays one row in the journal",
    );
  });

  test("clicking forty times is worth exactly one verdict", async () => {
    for (let i = 0; i < 40; i += 1) await recordBattle(a, b, TEAM, voter);

    const winner = await prisma.yap.findUniqueOrThrow({ where: { id: a } });
    const loser = await prisma.yap.findUniqueOrThrow({ where: { id: b } });
    assert.equal(winner.battleWins, 1);
    assert.equal(loser.battleLosses, 1);
    assert.equal(await prisma.battle.count({ where: { voterId: voter } }), 1);
    assert.ok(winner.eloRating < 1520, `one vote is worth ~16 points, got ${winner.eloRating}`);
  });

  test("changing your mind flips the result instead of adding one", async () => {
    // Same pair, other way round.
    const flipped = await recordBattle(b, a, TEAM, voter);
    assert.ok(flipped);

    const first = await prisma.yap.findUniqueOrThrow({ where: { id: a } });
    const second = await prisma.yap.findUniqueOrThrow({ where: { id: b } });

    assert.equal(first.battleWins, 0, "the record that lost the re-vote keeps no win");
    assert.equal(first.battleLosses, 1);
    assert.equal(second.battleWins, 1);
    assert.equal(second.battleLosses, 0);
    assert.ok(second.eloRating > first.eloRating, "the new winner is now ahead");
    assert.equal(
      await prisma.battle.count({ where: { voterId: voter } }),
      1,
      "a change of mind revises the record, it does not append to it",
    );
  });

  test("two people may each judge the same pair", async () => {
    const other = await makeUser("Other judge");
    assert.ok(await recordBattle(a, b, TEAM, other.id));
    assert.equal(await prisma.battle.count(), 2, "the pair is shared; the verdict is personal");
  });

  test("simultaneous votes do not overwrite each other", async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    const x = (await makeYap({ authorId: author.id })).id;
    const y = (await makeYap({ authorId: author.id })).id;
    const judges = await Promise.all(
      Array.from({ length: 8 }, (_, i) => makeUser(`Judge ${i}`)),
    );

    // All at once, reading the same "before" if the transaction let them.
    const results = await Promise.all(
      judges.map((judge) => recordBattle(x, y, TEAM, judge.id)),
    );

    const landed = results.filter((result) => result !== null).length;
    const journalled = await prisma.battle.count();
    assert.equal(
      landed,
      journalled,
      "every vote reported as recorded must be in the journal, and no other",
    );

    const winner = await prisma.yap.findUniqueOrThrow({ where: { id: x } });
    assert.equal(winner.battleWins, journalled, "the win column matches the journal");
  });
});

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEAM_ID as TEAM, makeTeam, makeUser, makeYap, prisma, resetDatabase } from "./setup";
import { getMarket } from "@/lib/services/aura-history";
import { refreshAura } from "@/lib/services/yaps";
import { REACTION_WEIGHTS } from "@/lib/ranking/aura";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

const hour = 60 * 60 * 1000;

/** A reaction placed at a chosen moment, because the market is all about when. */
async function reactAt(yapId: number, userId: string, type: "BASED" | "DEAD", when: Date) {
  await prisma.reaction.create({ data: { yapId, userId, type, createdAt: when } });
  await refreshAura(yapId);
}

async function age(yapId: number, hoursAgo: number) {
  await prisma.yap.update({
    where: { id: yapId },
    data: { createdAt: new Date(Date.now() - hoursAgo * hour) },
  });
}

/**
 * The market used to read every record in the team and compute the same
 * history twice. These pin what it says, so the shape of the queries under it
 * can change without anyone having to trust that it still adds up.
 */
describe("the aura market", () => {
  test("the index compares now against the start of the window", async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    const reader = await makeUser("Reader");
    const yap = await makeYap({ authorId: author.id });
    await age(yap.id, 300);

    // One reaction before the window, one inside it.
    await reactAt(yap.id, reader.id, "BASED", new Date(Date.now() - 200 * hour));
    const other = await makeUser("Other");
    await reactAt(yap.id, other.id, "DEAD", new Date(Date.now() - 2 * hour));

    const market = await getMarket(TEAM, 24 * 7);
    assert.equal(market.indexNow, REACTION_WEIGHTS.BASED + REACTION_WEIGHTS.DEAD);
    assert.equal(market.indexThen, REACTION_WEIGHTS.BASED, "only what stood before the cutoff");
    assert.equal(market.tracked, 1);
  });

  test("a record nothing touched inside the window is dormant, and still listed", async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    const reader = await makeUser("Reader");
    const asleep = await makeYap({ authorId: author.id, text: "Давно и тихо." });
    await age(asleep.id, 400);
    await reactAt(asleep.id, reader.id, "BASED", new Date(Date.now() - 300 * hour));

    const market = await getMarket(TEAM, 24 * 7);
    assert.deepEqual(market.dormant.map((row) => row.id), [asleep.id]);
    assert.equal(market.dormant[0]!.delta, 0);
    assert.deepEqual(market.movers, []);
    assert.deepEqual(market.newcomers, []);
  });

  test("filed today is a newcomer; grown inside the window is a mover", async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    const reader = await makeUser("Reader");

    const fresh = await makeYap({ authorId: author.id, text: "Сегодняшнее." });
    const grown = await makeYap({ authorId: author.id, text: "Подросшее." });
    await age(grown.id, 300);
    await reactAt(grown.id, reader.id, "BASED", new Date(Date.now() - 200 * hour));
    const other = await makeUser("Other");
    await reactAt(grown.id, other.id, "DEAD", new Date(Date.now() - hour));

    const market = await getMarket(TEAM, 24 * 7);
    assert.deepEqual(market.newcomers.map((row) => row.id), [fresh.id]);
    assert.deepEqual(market.movers.map((row) => row.id), [grown.id]);
    assert.equal(market.movers[0]!.delta, REACTION_WEIGHTS.DEAD);
  });

  test("another team's market is not this one's", async () => {
    await resetDatabase();
    const other = await makeTeam("other", "Other Corp");
    const mine = await makeUser("Mine", TEAM);
    const theirs = await makeUser("Theirs", other.id);
    await makeYap({ authorId: mine.id, aura: 10 });
    await makeYap({ authorId: theirs.id, aura: 900, teamId: other.id });

    assert.equal((await getMarket(TEAM)).tracked, 1);
    assert.equal((await getMarket(TEAM)).indexNow, 10);
    assert.equal((await getMarket(other.id)).indexNow, 900);
  });

  test("an empty archive has an index of nothing, not a crash", async () => {
    await resetDatabase();
    const market = await getMarket(TEAM);
    assert.equal(market.indexNow, 0);
    assert.equal(market.indexThen, 0);
    assert.equal(market.indexPercent, null);
    assert.equal(market.tracked, 0);
  });
});

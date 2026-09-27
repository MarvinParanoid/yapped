import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEAM_ID as TEAM, makeUser, makeYap, prisma, resetDatabase } from "./setup";
import {
  MIN_ARENA_RECORDS,
  distinctPairs,
  getArenaState,
  getBattlePair,
} from "@/lib/services/battles";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

describe("the arena knows when it has nothing to ask", () => {
  test("stays shut while the field is too thin", async () => {
    await resetDatabase();
    const author = await makeUser();

    // Each pass asserts the state at `filed` records, then files one more, so
    // the suite leaves exactly MIN_ARENA_RECORDS behind for the next test.
    for (let filed = 0; filed < MIN_ARENA_RECORDS; filed += 1) {
      const state = await getArenaState(TEAM);
      assert.equal(state.open, false, `${filed} records must not open the arena`);
      if (!state.open) {
        assert.equal(state.records, filed);
        assert.equal(state.needed, MIN_ARENA_RECORDS - filed);
      }
      await makeYap({ authorId: author.id });
    }

    // With two records there is exactly one possible pair, which is why the
    // bar exists: voting would re-ask the same question forever.
    assert.equal(distinctPairs(2), 1);
  });

  test("opens once there are enough contenders", async () => {
    const state = await getArenaState(TEAM);
    assert.equal(state.open, true);
    if (state.open) {
      assert.notEqual(state.pair[0].id, state.pair[1].id, "a record cannot fight itself");
    }
  });

  test("does not offer the pair just judged", async () => {
    await resetDatabase();
    const author = await makeUser();
    const ids: number[] = [];
    for (let i = 0; i < 6; i += 1) ids.push((await makeYap({ authorId: author.id })).id);

    const first = await getBattlePair(TEAM, null);
    assert.ok(first);
    const judged = [first![0].id, first![1].id];

    for (let i = 0; i < 8; i += 1) {
      const next = await getBattlePair(TEAM, null, judged);
      assert.ok(next);
      const pair = [next![0].id, next![1].id];
      assert.notDeepEqual(
        [...pair].sort(),
        [...judged].sort(),
        "the arena repeated the pair it was told to avoid",
      );
    }
  });

  test("prefers two different mouths when it can", async () => {
    await resetDatabase();
    const anna = await makeUser("Anna");
    const misha = await makeUser("Misha");
    for (let i = 0; i < 3; i += 1) {
      await makeYap({ authorId: anna.id });
      await makeYap({ authorId: misha.id });
    }
    let sameMouth = 0;
    for (let i = 0; i < 12; i += 1) {
      const pair = await getBattlePair(TEAM, null);
      assert.ok(pair);
      if (pair![0].author.id === pair![1].author.id) sameMouth += 1;
    }
    assert.equal(sameMouth, 0, "with both authors available it should never pair one with itself");
  });
});

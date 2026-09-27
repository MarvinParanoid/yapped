import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  REACTION_WEIGHTS,
  computeAura,
  auraDelta,
  formatAura,
  trendingScore,
  EMPTY_COUNTS,
} from "@/lib/ranking/aura";
import { DEFAULT_RATING, expectedScore, nextRatings, replay, winRate } from "@/lib/ranking/elo";

describe("aura", () => {
  test("is the weighted sum of reactions", () => {
    assert.equal(computeAura({ BASED: 2, DEAD: 1 }), 2 * REACTION_WEIGHTS.BASED + REACTION_WEIGHTS.DEAD);
    assert.equal(computeAura(EMPTY_COUNTS), 0);
  });

  test("cringe subtracts", () => {
    assert.ok(REACTION_WEIGHTS.CRINGE < 0);
    assert.ok(computeAura({ CRINGE: 3 }) < 0);
  });

  test("a single reaction moves aura by exactly its weight, both ways", () => {
    for (const key of Object.keys(REACTION_WEIGHTS) as Array<keyof typeof REACTION_WEIGHTS>) {
      assert.equal(auraDelta(key, true), REACTION_WEIGHTS[key]);
      assert.equal(auraDelta(key, false), -REACTION_WEIGHTS[key]);
      assert.equal(computeAura({ [key]: 1 }), REACTION_WEIGHTS[key]);
    }
  });

  test("formats with a sign and thousands separators", () => {
    assert.equal(formatAura(1199), "+1,199");
    assert.equal(formatAura(-12), "-12");
    assert.equal(formatAura(0), "0");
  });

  test("trending decays with age", () => {
    const fresh = trendingScore(500, 1);
    const old = trendingScore(500, 240);
    assert.ok(fresh > old, "an older record with the same aura must rank lower");
    // A much louder old record can still outrank a quiet fresh one.
    assert.ok(trendingScore(5000, 48) > trendingScore(50, 1));
  });
});

describe("elo", () => {
  test("even match splits the expectation", () => {
    assert.equal(expectedScore(1500, 1500), 0.5);
  });

  test("beating a stronger opponent is worth more", () => {
    const upset = nextRatings(1400, 1600).delta;
    const expected = nextRatings(1600, 1400).delta;
    assert.ok(upset > expected, "the underdog should gain more");
  });

  test("ratings are zero-sum", () => {
    const { winnerRating, loserRating } = nextRatings(1500, 1500);
    assert.equal(winnerRating + loserRating, 3000);
  });

  test("replaying the journal reproduces ratings", () => {
    const ratings = replay([
      { winnerId: 1, loserId: 2 },
      { winnerId: 1, loserId: 2 },
    ]);
    assert.ok(ratings.get(1)! > DEFAULT_RATING);
    assert.ok(ratings.get(2)! < DEFAULT_RATING);
    assert.equal(ratings.get(1)! + ratings.get(2)!, 2 * DEFAULT_RATING);
  });

  test("win rate is null before any battle", () => {
    assert.equal(winRate(0, 0), null);
    assert.equal(winRate(3, 1), 0.75);
  });
});

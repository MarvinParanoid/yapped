import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { archivalNote, assignEmphasis, isDisputed, tagWeight } from "@/lib/archival";
import { classifyMomentum } from "@/lib/ranking/momentum";
import type { YapView } from "@/lib/types";

function record(over: Partial<YapView> = {}): YapView {
  return {
    id: 1, code: "#00001", text: "test", lore: null,
    saidAt: new Date(), createdAt: new Date(),
    status: "ARCHIVED", classification: "QUESTIONABLE",
    verification: "UNVERIFIED", witnessCount: 0, denialCount: 0,
    acknowledgedAt: null, disputedAt: null, disputeStatement: null,
    aura: 100, reactionCount: 0, viewCount: 0,
    eloRating: 1500, battleWins: 0, battleLosses: 0,
    author: { id: "a", displayName: "A", handle: null, avatarUrl: null, title: null, hasAccount: true },
    submittedBy: null, tags: [], evidence: [],
    counts: { BASED: 0, DEAD: 0, REAL: 0, CRINGE: 0, STONE: 0 },
    viewerReactions: [], viewerStance: null,
    ...over,
  };
}

describe("card emphasis", () => {
  const page = [
    record({ id: 1, aura: 1000, verification: "CERTIFIED" }),
    record({ id: 2, aura: 900, verification: "CERTIFIED" }),
    record({ id: 3, aura: 800, verification: "CERTIFIED" }),
    ...Array.from({ length: 10 }, (_, i) => record({ id: 10 + i, aura: 500 - i * 40 })),
  ];

  test("never features more than two records on a page", () => {
    const map = assignEmphasis(page);
    const featured = [...map.values()].filter((e) => e === "feature");
    assert.equal(featured.length, 2);
  });

  test("only certified records can be featured", () => {
    const map = assignEmphasis([record({ id: 1, aura: 9999, verification: "WITNESSED" })]);
    assert.notEqual(map.get(1), "feature");
  });

  test("quiet records collapse, but not if they carry lore or evidence", () => {
    const quiet = record({ id: 99, aura: 1 });
    const withLore = record({ id: 98, aura: 1, lore: "why" });
    const map = assignEmphasis([...page, quiet, withLore]);
    assert.equal(map.get(99), "compact");
    assert.equal(map.get(98), "standard", "lore is a reason to keep the card open");
  });
});

describe("archival notes", () => {
  test("a formal dispute outranks everything", () => {
    const note = archivalNote(record({ disputedAt: new Date(), evidence: [{ id: "e", url: "/x", caption: null, position: 1, width: null, height: null }] }));
    assert.equal(note, "Disputed by yapper");
    assert.ok(isDisputed(note));
  });

  test("denials make a record disputed", () => {
    assert.equal(archivalNote(record({ witnessCount: 2, denialCount: 2 })), "Disputed");
    assert.equal(archivalNote(record({ witnessCount: 8, denialCount: 1 })), null);
  });

  test("popularity is not a marker", () => {
    assert.equal(archivalNote(record({ aura: 99999, reactionCount: 500 })), null);
  });
});

describe("tag weight", () => {
  test("scales with frequency and never divides by zero", () => {
    assert.equal(tagWeight(4, 4), 3);
    assert.equal(tagWeight(1, 4), 0);
    assert.equal(tagWeight(1, 1), 1);
  });
});

describe("momentum", () => {
  const base = { ageDays: 10, filedInsideWindow: false, filedInLastDay: false };

  test("a record filed in the last day is new", () => {
    assert.equal(classifyMomentum({ ...base, now: 50, then: 0, filedInLastDay: true }).state, "NEW");
  });

  test("a record that earned everything inside the window is rising, not steady", () => {
    // This is the regression: percent is null when there is nothing to compare.
    const m = classifyMomentum({ ...base, now: 300, then: 0 });
    assert.equal(m.state, "RISING");
    assert.equal(m.percent, null);
    assert.equal(m.delta, 300);
  });

  test("no movement means dormant", () => {
    assert.equal(classifyMomentum({ ...base, now: 200, then: 200 }).state, "DORMANT");
  });

  test("an old record waking up is re-emerging", () => {
    assert.equal(classifyMomentum({ ...base, ageDays: 200, now: 300, then: 200 }).state, "REEMERGING");
    assert.equal(classifyMomentum({ ...base, ageDays: 5, now: 300, then: 200 }).state, "RISING");
  });

  test("a nudge is steady", () => {
    assert.equal(classifyMomentum({ ...base, now: 202, then: 200 }).state, "STEADY");
  });
});

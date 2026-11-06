import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decideWeek, type WeekCandidate } from "@/lib/services/weekly";

const at = (iso: string) => new Date(iso);

function said(authorId: string, aura: number, iso = "2026-11-02T09:00:00Z"): WeekCandidate {
  return { authorId, aura, saidAt: at(iso) };
}

/**
 * The rule the committee applies, with no database under it.
 *
 * Count first and aura second is the same order the archivists' table uses,
 * and for the same reason: weighing a statement against a reaction would take
 * an exchange rate nobody can defend. The tests that matter here are the ties —
 * a title that moves depending on which row the database hands back first is
 * not a title.
 */
describe("who the week belongs to", () => {
  test("the person who said the most", () => {
    const verdict = decideWeek([
      said("quiet", 500),
      said("loud", 10),
      said("loud", 10),
      said("loud", 10),
    ]);
    assert.equal(verdict.winnerId, "loud");
    assert.equal(verdict.recordCount, 3, "the grounds are the winner's, not the week's");
    assert.equal(verdict.aura, 30);
  });

  test("a week with nothing in it has no subject", () => {
    assert.deepEqual(decideWeek([]), { winnerId: null, recordCount: 0, aura: 0 });
  });

  test("one statement is enough when it is the only one", () => {
    const verdict = decideWeek([said("alone", 0)]);
    assert.equal(verdict.winnerId, "alone");
    assert.equal(verdict.recordCount, 1);
    assert.equal(verdict.aura, 0, "a statement nobody reacted to still happened");
  });

  test("equal counts are broken by what the office made of them", () => {
    const verdict = decideWeek([
      said("ignored", 1),
      said("ignored", 1),
      said("quoted", 40),
      said("quoted", 2),
    ]);
    assert.equal(verdict.winnerId, "quoted");
    assert.equal(verdict.aura, 42);
  });

  test("equal counts and equal aura go to whoever started first", () => {
    const verdict = decideWeek([
      said("later", 10, "2026-11-04T09:00:00Z"),
      said("later", 10, "2026-11-05T09:00:00Z"),
      said("earlier", 10, "2026-11-02T08:00:00Z"),
      said("earlier", 10, "2026-11-06T09:00:00Z"),
    ]);
    assert.equal(verdict.winnerId, "earlier");
  });

  test("a dead heat still produces the same answer every time", () => {
    const same = "2026-11-02T09:00:00Z";
    const records = [said("bbb", 10, same), said("aaa", 10, same)];
    assert.equal(decideWeek(records).winnerId, "aaa");
    // Reversed input, same verdict: nothing here depends on row order.
    assert.equal(decideWeek([...records].reverse()).winnerId, "aaa");
  });

  test("negative aura counts against a loud week rather than being ignored", () => {
    const verdict = decideWeek([
      said("cringe", -5),
      said("cringe", -5),
      said("solid", 12),
      said("solid", 12),
    ]);
    assert.equal(verdict.winnerId, "solid", "same count, and one of them was a worse week");
  });
});

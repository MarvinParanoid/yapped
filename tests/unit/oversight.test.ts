import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { movementFor, situationFor, verdictFor } from "@/lib/oversight";

/**
 * The department's two judgements, without a database under them.
 *
 * Both have to be functions of the numbers printed beside them. A conclusion
 * that disagrees with its own table is not a joke about bureaucracy, it is a
 * bug with a serious face on.
 */
describe("reading the current situation", () => {
  test("each band starts where the one before it ends", () => {
    assert.equal(situationFor(0), "ONGOING");
    assert.equal(situationFor(1), "STABILISED");
    assert.equal(situationFor(2), "STABILISED");
    assert.equal(situationFor(3), "SUSPICIOUS");
    assert.equal(situationFor(6), "SUSPICIOUS");
    assert.equal(situationFor(7), "NO_MATERIAL");
    assert.equal(situationFor(13), "NO_MATERIAL");
    assert.equal(situationFor(14), "LOST_CONTROL");
    assert.equal(situationFor(400), "LOST_CONTROL");
  });

  test("a nonsensical count still lands somewhere", () => {
    assert.equal(situationFor(-1), "ONGOING");
  });
});

describe("the findings of the committee", () => {
  test("no earlier period is said out loud rather than compared against zero", () => {
    assert.equal(verdictFor(0, null), "FIRST_PERIOD");
    assert.equal(verdictFor(9, null), "FIRST_PERIOD");
  });

  test("two empty weeks in a row are not the same as going quiet", () => {
    assert.equal(verdictFor(0, 0), "NOTHING_NEW");
    assert.equal(verdictFor(0, 4), "WENT_SILENT");
  });

  test("direction decides the rest", () => {
    assert.equal(verdictFor(5, 2), "UP");
    assert.equal(verdictFor(2, 5), "DOWN");
    assert.equal(verdictFor(3, 3), "STEADY");
  });

  test("the same numbers give the same finding every time", () => {
    for (const [a, b] of [[0, 0], [3, 1], [1, 3], [2, 2], [0, 7]] as const) {
      assert.equal(verdictFor(a, b), verdictFor(a, b));
    }
  });
});

describe("week-on-week movement", () => {
  test("an empty base has no percentage, only a difference", () => {
    const fromNothing = movementFor(4, 0);
    assert.equal(fromNothing.delta, 4);
    assert.equal(fromNothing.percent, null, "four times nothing is not a figure");
    assert.equal(fromNothing.direction, "UP");
    assert.equal(fromNothing.baseless, false);
  });

  test("no earlier week at all is its own state", () => {
    const first = movementFor(4, null);
    assert.equal(first.baseless, true);
    assert.equal(first.percent, null);
    assert.equal(first.delta, 4);
  });

  test("an ordinary comparison is a percentage", () => {
    assert.equal(movementFor(6, 4).percent, 50);
    assert.equal(movementFor(2, 4).percent, -50);
    assert.equal(movementFor(4, 4).percent, 0);
    assert.equal(movementFor(4, 4).direction, "FLAT");
  });

  test("zero to zero is flat, not a fall", () => {
    const nothing = movementFor(0, 0);
    assert.equal(nothing.direction, "FLAT");
    assert.equal(nothing.delta, 0);
    assert.equal(nothing.percent, null);
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  WITNESS_THRESHOLDS,
  isContested,
  nextRung,
  verificationFor,
  witnessLabel,
} from "@/lib/verification";

describe("verification ladder", () => {
  test("climbs one rung at a time", () => {
    assert.equal(verificationFor(0), "UNVERIFIED");
    assert.equal(verificationFor(1), "WITNESSED");
    assert.equal(verificationFor(2), "CONFIRMED");
    assert.equal(verificationFor(3), "CERTIFIED");
    assert.equal(verificationFor(50), "CERTIFIED");
  });

  test("thresholds stay small enough for a small team", () => {
    // A five-witness bar would certify nothing in a fifteen-person archive.
    assert.ok(WITNESS_THRESHOLDS.CERTIFIED <= 3);
  });

  test("reports what the next rung costs", () => {
    assert.deepEqual(nextRung(0), { rung: "WITNESSED", needed: 1 });
    assert.deepEqual(nextRung(2), { rung: "CERTIFIED", needed: 1 });
    assert.equal(nextRung(3), null, "certified is the top of the ladder");
  });

  test("denials contest a record but never demote it", () => {
    assert.equal(isContested(4, 0), false);
    assert.equal(isContested(4, 1), false, "one dissenter is not a dispute");
    assert.equal(isContested(2, 2), true);
    assert.equal(isContested(0, 2), true);
    // Verification itself is untouched by denials.
    assert.equal(verificationFor(3), "CERTIFIED");
  });

  test("pluralises witnesses", () => {
    assert.equal(witnessLabel(0), "no witnesses");
    assert.equal(witnessLabel(1), "1 witness");
    assert.equal(witnessLabel(4), "4 witnesses");
  });
});

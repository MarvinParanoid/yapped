import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { describeFilter, isEmptyFilter, parseSearch } from "@/lib/search";

describe("search qualifiers", () => {
  test("plain words are free text", () => {
    const f = parseSearch("плесень хайпует");
    assert.equal(f.text, "плесень хайпует");
    assert.deepEqual(f.unknown, []);
  });

  test("keeps quoted phrases together", () => {
    assert.equal(parseSearch('"рот ставлю"').text, "рот ставлю");
  });

  test("parses every supported qualifier", () => {
    const f = parseSearch(
      'плесень from:anna by:dima tag:прод aura:>500 status:certified has:evidence has:lore before:2026-10-01 after:2026-01-01 case:7',
    );
    assert.equal(f.text, "плесень");
    assert.equal(f.author, "anna");
    assert.equal(f.submitter, "dima");
    assert.equal(f.tag, "прод");
    assert.deepEqual(f.aura, { op: ">", value: 500 });
    assert.equal(f.verification, "CERTIFIED");
    assert.deepEqual(f.has.sort(), ["evidence", "lore"]);
    assert.equal(f.caseId, 7);
    assert.equal(f.before?.toISOString().slice(0, 10), "2026-10-01");
    assert.equal(f.after?.toISOString().slice(0, 10), "2026-01-01");
    assert.deepEqual(f.unknown, []);
  });

  test("every comparison operator", () => {
    for (const [input, op] of [[">", ">"], [">=", ">="], ["<", "<"], ["<=", "<="], ["", "="]] as const) {
      assert.deepEqual(parseSearch(`aura:${input}100`).aura, { op, value: 100 });
    }
  });

  test("strips a leading hash from tags", () => {
    assert.equal(parseSearch("tag:#прод").tag, "прод");
  });

  test("is:disputed is a has: filter, not a verification rung", () => {
    const f = parseSearch("is:disputed");
    assert.deepEqual(f.has, ["dispute"]);
    assert.equal(f.verification, undefined);
  });

  test("hands back what it does not understand instead of dropping it", () => {
    const f = parseSearch("bogus:x aura:banana status:sideways прод");
    assert.deepEqual(f.unknown, ["bogus:x", "aura:banana", "status:sideways"]);
    assert.equal(f.text, "прод");
  });

  test("an empty filter is recognisable as empty", () => {
    assert.equal(isEmptyFilter(parseSearch("")), true);
    assert.equal(isEmptyFilter(parseSearch("bogus:x")), true, "unknown terms narrow nothing");
    assert.equal(isEmptyFilter(parseSearch("прод")), false);
    assert.equal(isEmptyFilter(parseSearch("has:lore")), false);
  });

  test("describes each active constraint for the banner", () => {
    const chips = describeFilter(parseSearch("прод from:anna aura:>500 has:evidence"));
    assert.ok(chips.some((c) => c.includes("прод")));
    assert.ok(chips.includes("said by anna"));
    assert.ok(chips.includes("aura > 500"));
    assert.ok(chips.includes("has evidence"));
  });
});

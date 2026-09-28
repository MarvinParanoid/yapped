import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { NAME_MAX, normalizeName, validateName } from "@/lib/names";

/**
 * Nothing checked the length of a name until a reader pointed out that the
 * registration form would take a paragraph. The quote itself had been capped
 * at 400 characters since day one.
 */
describe("what counts as a name", () => {
  test("rejects the two ends", () => {
    assert.equal(validateName("").ok, false);
    assert.equal(validateName("Д").ok, false);
    assert.equal(validateName("x".repeat(NAME_MAX + 1)).ok, false);
    assert.equal(validateName("x".repeat(NAME_MAX)).ok, true);
  });

  test("a real name fits, in either alphabet", () => {
    for (const name of ["Кандидат мемологических наук", "Diana", "Анна-Мария О'Брайен"]) {
      assert.equal(validateName(name).ok, true, name);
    }
  });

  test("collapses the whitespace a pasted name arrives with", () => {
    assert.equal(normalizeName("  Diana\n Kozachenko "), "Diana Kozachenko");
    const checked = validateName("\tDiana \n");
    assert.equal(checked.ok && checked.name, "Diana", "a stray newline must not split a person in two");
  });

  test("refuses a name with nothing readable in it", () => {
    assert.equal(validateName("...").ok, false);
    assert.equal(validateName("-- --").ok, false);
    assert.equal(validateName("42").ok, true, "a number is at least something to print");
  });

  test("names which limit was hit, and carries the number", () => {
    // A code and its number, not a sentence: the module does not know which
    // language will be reading it.
    const long = validateName("x".repeat(200));
    assert.deepEqual(long.ok === false && long.problem, { code: "NAME_LONG", n: NAME_MAX });

    const short = validateName("д");
    assert.deepEqual(short.ok === false && short.problem, { code: "NAME_SHORT", n: 2 });

    const noise = validateName("...");
    assert.deepEqual(noise.ok === false && noise.problem, { code: "NAME_UNREADABLE" });
  });
});

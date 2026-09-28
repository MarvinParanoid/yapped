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

  test("says which limit was hit, not just that one was", () => {
    const long = validateName("x".repeat(200), "A display name");
    assert.equal(long.ok, false);
    assert.match(long.ok === false ? long.error : "", /display name/i);
    assert.match(long.ok === false ? long.error : "", new RegExp(String(NAME_MAX)));
  });
});

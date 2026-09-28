import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { en } from "@/lib/i18n/en";
import { ru } from "@/lib/i18n/ru";
import { fill, localeFromHeader, LOCALES, plural } from "@/lib/i18n/locale";

/**
 * The dictionaries are kept in step by the type system — `ru` is typed against
 * `en`, so a missing key fails the build. What types cannot catch is a
 * translation left as the English word, or a placeholder dropped in the
 * crossing, which is what these check.
 */
function leaves(value: unknown, path: string[] = []): Array<[string, string]> {
  if (typeof value === "string") return [[path.join("."), value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leaves(child, [...path, key]),
  );
}

describe("the two dictionaries", () => {
  test("cover exactly the same keys", () => {
    const a = leaves(en).map(([key]) => key).sort();
    const b = leaves(ru).map(([key]) => key).sort();
    assert.deepEqual(b, a);
  });

  test("keep every placeholder across the crossing", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    const russian = new Map(leaves(ru));

    for (const [key, english] of leaves(en)) {
      assert.deepEqual(
        placeholders(russian.get(key)!),
        placeholders(english),
        `${key}: a dropped placeholder prints nothing where a name or a count should be`,
      );
    }
  });

  test("are actually translated, save for the words the office already uses", () => {
    // Deliberate carry-overs, each for its own reason:
    const kept = new Set([
      // slang this office already speaks in English
      "reactions.BASED",
      // placeholder examples that are Russian in both dictionaries, because
      // they are sample content from this team rather than interface copy
      "submit.textPlaceholder",
      "submit.lorePlaceholder",
      // pure format, no words in it at all
      "submit.charCount",
    ]);
    const russian = new Map(leaves(ru));
    const untranslated = leaves(en)
      .filter(([key, english]) => !kept.has(key) && russian.get(key) === english)
      .map(([key]) => key);
    assert.deepEqual(untranslated, []);
  });
});

describe("locale mechanics", () => {
  test("fill substitutes, and leaves an unknown placeholder visible", () => {
    assert.equal(fill("{n} записей", { n: 3 }), "3 записей");
    assert.equal(fill("привет, {name}", {}), "привет, {name}");
  });

  test("Russian counts in three forms", () => {
    const forms: [string, string, string] = ["запись", "записи", "записей"];
    const say = (n: number) => plural("ru", n, forms);
    assert.equal(say(1), "запись");
    assert.equal(say(2), "записи");
    assert.equal(say(5), "записей");
    assert.equal(say(11), "записей", "eleven is the trap");
    assert.equal(say(21), "запись");
    assert.equal(say(112), "записей");
    assert.equal(say(0), "записей");
  });

  test("English counts in two", () => {
    const forms: [string, string, string] = ["record", "records", "records"];
    assert.equal(plural("en", 1, forms), "record");
    assert.equal(plural("en", 0, forms), "records");
  });

  test("reads the browser's preference, and falls back to English", () => {
    assert.equal(localeFromHeader("ru-RU,ru;q=0.9,en;q=0.8"), "ru");
    assert.equal(localeFromHeader("en-GB,en;q=0.9"), "en");
    assert.equal(localeFromHeader("de-DE"), "en");
    assert.equal(localeFromHeader(null), "en");
  });

  test("every locale has a dictionary", () => {
    assert.deepEqual([...LOCALES], ["en", "ru"]);
  });
});

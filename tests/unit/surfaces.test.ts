import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "../../src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/**
 * A light panel opened from inside an `.on-ink` block inherits that block's
 * label colours — paper-white captions on a paper-white surface, invisible.
 *
 * It has happened three times: Wrapped's figures vanished into their slabs, the
 * aura explainer lost its heading, and the record menu rendered two blank rows
 * where "copy link" and "share card" should have been. Each time it was found
 * by a person looking at the screen, which is not a strategy.
 *
 * `.on-paper` is the documented way out of an ink context. A panel that floats
 * — absolute or fixed — is the one that can end up over a dark hero without its
 * author thinking about it, so that is where the rule bites.
 */
describe("light surfaces that float", () => {
  test("carry the escape from an ink context", () => {
    const offenders: string[] = [];
    // One className attribute at a time, so a light panel is not excused by an
    // `on-paper` somewhere else in the same file.
    const classNames = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([^)]*)\))/g;

    for (const file of tsxFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(classNames)) {
        const value = match[1] ?? match[2] ?? match[3] ?? "";
        const floats = /\b(absolute|fixed)\b/.test(value);
        const light = /\bbg-paper(-[23])?\b/.test(value);
        if (floats && light && !value.includes("on-paper")) {
          offenders.push(`${path.relative(SRC, file)}: ${value.slice(0, 60)}`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `these float over whatever is beneath them and would go invisible on ink:\n  ${offenders.join("\n  ")}`,
    );
  });
});

/**
 * Interface text belongs in the dictionary, not in the markup.
 *
 * Every string in `lib/i18n` is checked for completeness by the type system, so
 * the failure mode is not a missing translation — it is a line that never asked
 * for one. Those are invisible to every other check: the build is clean, the
 * types are clean, and the page simply speaks English at a reader who does not.
 *
 * Twenty-six of them were still in place after the interface had been declared
 * translated twice. Among them the archive's own motto, written out by hand on
 * /random and on the share card while a Russian version sat in the dictionary
 * the whole time. Reading the source for them does not work: the ones that hid
 * longest were the ones broken across lines by `{" "}`.
 *
 * So: two or more English words sitting in JSX text are a mistake. A single
 * word is left alone deliberately — units, brand marks and codes are usually
 * literal, and a rule that cries wolf gets switched off.
 */
describe("interface text", () => {
  test("lives in the dictionary, not in the markup", () => {
    const offenders: string[] = [];
    // Anything between two tags. Braces mean an expression, so those are out;
    // the rest is sorted below, because `useState<T>(null)` and a /* comment */
    // both read as text nodes to a regex.
    const textNodes = />([^<>{}]+)</g;
    // Punctuation that appears in code and not in a sentence.
    const code = /[();=\\/"'`]/;
    const prose = /[A-Za-z]{3,}[ ,.]+[A-Za-z]{3,}/;
    const allowed = [
      /^yapped\.?$/i,
      // The demo archive's credentials: values to type, not words to read.
      /^(anna|yapped123)$/i,
    ];

    // Text between tags is only the first hiding place. Most of what was found
    // was somewhere else: a prop (`hint="the archive has nothing to trade"`)
    // or a ternary picking between two English strings. Both are checked, and
    // both were silent while the sentence-in-the-markup rule passed.
    const attribute = /([A-Za-z][\w-]*)="([^"\n]+)"/g;
    const ternary = /\?\s*"([^"\n]+)"\s*:\s*"([^"\n]+)"/g;
    // Props whose value is an identifier, a URL or a class list, never a
    // sentence — a match there is a false alarm, and one false alarm is how a
    // rule like this gets deleted.
    const technical =
      /^(className|class|href|src|srcSet|alt|id|key|name|type|role|rel|target|accept|autoComplete|inputMode|style|method|action|encType|pattern|value|defaultValue|charSet|sizes|as|scope|dir|lang|slot|form|list|step|min|max|data-[\w-]+|aria-[\w-]+)$/;

    for (const file of tsxFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      const where = path.relative(SRC, file);

      for (const match of source.matchAll(textNodes)) {
        // `&apos;` is text, but both its semicolon and the apostrophe it
        // stands for would read as code, so it goes before the check.
        const text = match[1]!.replace(/&[a-z]+;/g, "").trim();
        if (!text || code.test(text)) continue;
        if (allowed.some((pattern) => pattern.test(text))) continue;
        if (!prose.test(text)) continue;
        offenders.push(`${where}: ${JSON.stringify(text)}`);
      }

      for (const match of source.matchAll(attribute)) {
        const [, attr, text] = match;
        if (technical.test(attr!) || !prose.test(text!)) continue;
        offenders.push(`${where}: ${attr}=${JSON.stringify(text)}`);
      }

      for (const match of source.matchAll(ternary)) {
        for (const text of [match[1]!, match[2]!]) {
          // A hyphen or colon means a class list, not a sentence.
          if (!prose.test(text) || /[-:]/.test(text)) continue;
          offenders.push(`${where}: ${JSON.stringify(text)}`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `hardcoded interface text — give it a key in lib/i18n:\n  ${offenders.join("\n  ")}`,
    );
  });
});

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

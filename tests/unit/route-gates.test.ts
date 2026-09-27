import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const APP = path.resolve(import.meta.dirname, "../../src/app");

function segments(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    found.push(full, ...segments(full));
  }
  return found;
}

/**
 * A `loading.tsx` wraps its page in a Suspense boundary, and Next flushes the
 * shell before the page body runs. A `redirect()` raised inside such a page
 * therefore arrives as an RSC payload on a **200** — the browser follows it,
 * but a closed archive has already answered an outsider with a rendered page.
 *
 * This shipped twice: once as 404s returning 200, and once as the auth gate
 * letting a stale session cookie through. The rule is the fix.
 */
describe("routes that stream still close properly", () => {
  test("every segment with a loading.tsx gates access in a layout.tsx", () => {
    const offenders: string[] = [];

    for (const dir of segments(APP)) {
      const files = readdirSync(dir);
      if (!files.includes("loading.tsx")) continue;

      const layout = files.includes("layout.tsx")
        ? readFileSync(path.join(dir, "layout.tsx"), "utf8")
        : null;
      if (!layout?.includes("requireViewer")) {
        offenders.push(path.relative(APP, dir));
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `these segments flush a 200 shell to signed-out visitors: ${offenders.join(", ")}`,
    );
  });
});

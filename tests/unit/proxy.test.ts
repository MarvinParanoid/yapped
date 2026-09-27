import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { config } from "@/proxy";

/**
 * The proxy deliberately duplicates the cookie name instead of importing it,
 * so that it stays free of modules that reach for the database. That makes
 * drift possible, which is what this pins down.
 */
describe("the doorman and the lock agree", () => {
  test("the proxy checks the cookie the session module sets", () => {
    const source = readFileSync(new URL("../../src/proxy.ts", import.meta.url), "utf8");
    assert.match(
      source,
      new RegExp(`const SESSION_COOKIE = "${SESSION_COOKIE}"`),
      "proxy.ts checks a different cookie than createSession writes",
    );
  });

  test("the matcher lets static assets through", () => {
    const matcher = new RegExp(config.matcher[0].replace(/^\/\(/, "^/(").replace(/\)$/, ")$"));
    assert.equal(matcher.test("/_next/static/chunk.css"), false);
    assert.equal(matcher.test("/icon.svg"), false);
    assert.equal(matcher.test("/yappers"), true);
  });
});

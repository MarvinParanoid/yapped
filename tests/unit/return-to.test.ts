import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { returnTo } from "@/lib/return-to";

describe("where a sign-in may land", () => {
  test("keeps the page the visitor was actually trying to reach", () => {
    assert.equal(returnTo("/yap/42"), "/yap/42");
    assert.equal(returnTo("/market?window=168"), "/market?window=168");
    assert.equal(returnTo("/yapper/abc#history"), "/yapper/abc#history");
  });

  test("refuses to send anyone off the archive", () => {
    // Each of these is a way to leave while the address bar still said yapped
    // when the password was typed.
    for (const hostile of [
      "https://elsewhere.example",
      "http://elsewhere.example",
      "//elsewhere.example",
      "/\\elsewhere.example",
      "/\\/elsewhere.example",
      "javascript:alert(1)",
      "data:text/html,hi",
      "\n/\nhttps://elsewhere.example",
    ]) {
      assert.equal(returnTo(hostile), "/", `${JSON.stringify(hostile)} must not be honoured`);
    }
  });

  test("anything that is not a path at all falls back to the front page", () => {
    assert.equal(returnTo(""), "/");
    assert.equal(returnTo("   "), "/");
    assert.equal(returnTo(null), "/");
    assert.equal(returnTo(undefined), "/");
    assert.equal(returnTo(42), "/");
    assert.equal(returnTo("yap/42"), "/", "a relative path could resolve anywhere");
  });
});

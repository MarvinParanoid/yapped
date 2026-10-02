import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("module wiring", () => {
  test("importing the database module does not require a database", async () => {
    // `next build` walks the module graph on a machine with no DATABASE_URL —
    // including /_not-found, which pulls in the layout and the session. An
    // eager client here fails the Docker build and nothing else.
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const mod = await import("@/lib/db");
      assert.ok(mod.prisma, "the client must be importable without configuration");
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });

  test("the pure modules import nothing that touches the environment", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      for (const path of [
        "@/lib/ranking/aura",
        "@/lib/ranking/elo",
        "@/lib/ranking/momentum",
        "@/lib/verification",
        "@/lib/search",
        "@/lib/archival",
        "@/lib/titles",
        "@/lib/achievements",
        "@/lib/format",
        "@/lib/return-to",
        "@/lib/zoned",
      ]) {
        await assert.doesNotReject(() => import(path), `${path} must stay pure`);
      }
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });
});

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEAM_ID as TEAM, makeUser, makeYap, prisma, resetDatabase } from "./setup";
import {
  createYap,
  acknowledgeYap,
  disputeYap,
  listYaps,
  countYaps,
  refreshAura,
  setWitnessStance,
  softDeleteYap,
  toggleReaction,
} from "@/lib/services/yaps";
import { addYapToCase, createCase, getCase } from "@/lib/services/cases";
import { computeAura, REACTION_WEIGHTS } from "@/lib/ranking/aura";
import { parseSearch } from "@/lib/search";

before(async () => {
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

describe("witness rules", () => {
  test("the author cannot corroborate their own statement", async () => {
    const author = await makeUser("Author");
    const yap = await makeYap({ authorId: author.id });
    await assert.rejects(
      () => setWitnessStance(yap.id, TEAM, author.id, "PRESENT"),
      /AUTHOR_CANNOT_WITNESS/,
    );
    const fresh = await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } });
    assert.equal(fresh.witnessCount, 0);
    assert.equal(fresh.verification, "UNVERIFIED");
  });

  test("three independent witnesses certify a record", async () => {
    const author = await makeUser();
    const yap = await makeYap({ authorId: author.id });
    const rungs: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const witness = await makeUser();
      const state = await setWitnessStance(yap.id, TEAM, witness.id, "PRESENT");
      rungs.push(state.verification);
    }
    assert.deepEqual(rungs, ["WITNESSED", "CONFIRMED", "CERTIFIED"]);
  });

  test("a witness holds one position and can switch or withdraw it", async () => {
    const author = await makeUser();
    const witness = await makeUser();
    const yap = await makeYap({ authorId: author.id });

    let state = await setWitnessStance(yap.id, TEAM, witness.id, "PRESENT");
    assert.equal(state.witnessCount, 1);
    state = await setWitnessStance(yap.id, TEAM, witness.id, "DENIED");
    assert.equal(state.witnessCount, 0, "switching sides must not count twice");
    assert.equal(state.denialCount, 1);
    state = await setWitnessStance(yap.id, TEAM, witness.id, "DENIED");
    assert.equal(state.denialCount, 0, "pressing again withdraws");
    assert.equal(await prisma.witness.count({ where: { yapId: yap.id } }), 0);
  });

  test("acknowledgement never moves the ladder", async () => {
    const author = await makeUser();
    const yap = await makeYap({ authorId: author.id });
    const witness = await makeUser();
    await setWitnessStance(yap.id, TEAM, witness.id, "PRESENT");

    await acknowledgeYap(yap.id, TEAM, author.id);
    const fresh = await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } });
    assert.equal(fresh.verification, "WITNESSED", "owning up is not corroboration");
    assert.equal(fresh.witnessCount, 1);
    assert.ok(fresh.acknowledgedAt);
  });
});

describe("the author's own position", () => {
  test("acknowledging and disputing are mutually exclusive", async () => {
    const author = await makeUser();
    const yap = await makeYap({ authorId: author.id });

    await acknowledgeYap(yap.id, TEAM, author.id);
    await disputeYap(yap.id, TEAM, author.id, "I never said that.");
    let fresh = await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } });
    assert.equal(fresh.acknowledgedAt, null, "a dispute withdraws an acknowledgement");
    assert.ok(fresh.disputedAt);
    assert.equal(fresh.disputeStatement, "I never said that.");

    await acknowledgeYap(yap.id, TEAM, author.id);
    fresh = await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } });
    assert.equal(fresh.disputedAt, null, "owning up withdraws a dispute");
    assert.equal(fresh.disputeStatement, null);
  });

  test("only the author may take a position", async () => {
    const author = await makeUser();
    const stranger = await makeUser();
    const yap = await makeYap({ authorId: author.id });
    assert.equal((await acknowledgeYap(yap.id, TEAM, stranger.id)).ok, false);
    assert.equal((await disputeYap(yap.id, TEAM, stranger.id, "nope")).ok, false);
  });

  test("filing your own quote acknowledges it", async () => {
    const author = await makeUser();
    const id = await createYap({
      teamId: TEAM,
      text: "Я сам это записал.",
      authorId: author.id,
      submittedById: author.id,
      saidAt: new Date(),
      tags: [],
    });
    const mine = await prisma.yap.findUniqueOrThrow({ where: { id } });
    assert.ok(mine.acknowledgedAt);

    const other = await makeUser();
    const id2 = await createYap({
      teamId: TEAM,
      text: "Это записал кто-то другой.",
      authorId: author.id,
      submittedById: other.id,
      saidAt: new Date(),
      tags: [],
    });
    assert.equal((await prisma.yap.findUniqueOrThrow({ where: { id: id2 } })).acknowledgedAt, null);
  });
});

describe("aura", () => {
  test("a reaction round-trips exactly", async () => {
    const author = await makeUser();
    const reader = await makeUser();
    const yap = await makeYap({ authorId: author.id });

    const on = await toggleReaction(yap.id, TEAM, reader.id, "BASED");
    assert.equal(on.added, true);
    assert.equal(on.aura, REACTION_WEIGHTS.BASED);

    const off = await toggleReaction(yap.id, TEAM, reader.id, "BASED");
    assert.equal(off.added, false);
    assert.equal(off.aura, 0);
    assert.equal(await prisma.reaction.count({ where: { yapId: yap.id } }), 0);
  });

  test("one person cannot stack the same reaction", async () => {
    const author = await makeUser();
    const reader = await makeUser();
    const yap = await makeYap({ authorId: author.id });
    await toggleReaction(yap.id, TEAM, reader.id, "DEAD");
    await toggleReaction(yap.id, TEAM, reader.id, "DEAD");
    await toggleReaction(yap.id, TEAM, reader.id, "DEAD");
    const fresh = await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } });
    assert.equal(fresh.reactionCount, 1);
  });

  test("the cached total matches the formula", async () => {
    const author = await makeUser();
    const yap = await makeYap({ authorId: author.id });
    const counts = { BASED: 3, DEAD: 2, REAL: 1, CRINGE: 2, STONE: 1 } as const;
    for (const [type, n] of Object.entries(counts)) {
      for (let i = 0; i < n; i += 1) {
        const reader = await makeUser();
        await toggleReaction(yap.id, TEAM, reader.id, type as "BASED");
      }
    }
    const { aura } = await refreshAura(yap.id);
    assert.equal(aura, computeAura(counts));
  });
});

describe("listing", () => {
  test("pagination covers everything exactly once", async () => {
    await resetDatabase();
    const author = await makeUser();
    for (let i = 0; i < 12; i += 1) {
      await makeYap({ authorId: author.id, saidAt: new Date(Date.now() - i * 86_400_000) });
    }

    const total = await countYaps({ teamId: TEAM, sort: "fresh" });
    assert.equal(total, 12);

    const first = await listYaps({ teamId: TEAM, sort: "fresh", take: 5, skip: 0 });
    const second = await listYaps({ teamId: TEAM, sort: "fresh", take: 5, skip: 5 });
    const third = await listYaps({ teamId: TEAM, sort: "fresh", take: 5, skip: 10 });
    assert.deepEqual([first.length, second.length, third.length], [5, 5, 2]);

    const seen = [...first, ...second, ...third].map((y) => y.id);
    assert.equal(new Set(seen).size, 12, "no record appears on two pages");
  });

  test("soft-deleted records leave the archive", async () => {
    await resetDatabase();
    const author = await makeUser();
    const filer = await makeUser();
    const yap = await makeYap({ authorId: author.id, submittedById: filer.id });
    assert.equal(await countYaps({ teamId: TEAM }), 1);
    assert.equal(await softDeleteYap(yap.id, TEAM, filer.id), true);
    assert.equal(await countYaps({ teamId: TEAM }), 0);
  });

  test("only the filer or an admin may remove a record", async () => {
    await resetDatabase();
    const author = await makeUser();
    const filer = await makeUser();
    const stranger = await makeUser();
    const yap = await makeYap({ authorId: author.id, submittedById: filer.id });
    assert.equal(await softDeleteYap(yap.id, TEAM, stranger.id), false);
    assert.equal(await countYaps({ teamId: TEAM }), 1);
  });

  test("search qualifiers reach the database", async () => {
    await resetDatabase();
    const anna = await makeUser("Anna");
    const misha = await makeUser("Misha");
    await makeYap({ authorId: anna.id, text: "Плесень хайпует.", lore: "why" });
    await makeYap({ authorId: anna.id, text: "Рот ставлю." });
    await makeYap({ authorId: misha.id, text: "Интернет вывезет." });

    assert.equal(await countYaps({ teamId: TEAM, filter: parseSearch("from:anna") }), 2);
    assert.equal(await countYaps({ teamId: TEAM, filter: parseSearch("from:misha") }), 1);
    assert.equal(await countYaps({ teamId: TEAM, filter: parseSearch("has:lore") }), 1);
    assert.equal(await countYaps({ teamId: TEAM, filter: parseSearch("плесень") }), 1);
    assert.equal(await countYaps({ teamId: TEAM, filter: parseSearch("ПЛЕСЕНЬ") }), 1, "search is case-insensitive");
    assert.equal(await countYaps({ teamId: TEAM, filter: parseSearch("from:anna has:lore") }), 1);
    assert.equal(await countYaps({ teamId: TEAM, filter: parseSearch("status:certified") }), 0);
  });
});

describe("cases", () => {
  test("members are ordered by when things were said, not when they were filed", async () => {
    await resetDatabase();
    const author = await makeUser();
    const archivist = await makeUser();
    const late = await makeYap({ authorId: author.id, saidAt: new Date("2026-09-24T10:00:00Z") });
    const early = await makeYap({ authorId: author.id, saidAt: new Date("2026-09-20T10:00:00Z") });

    const caseId = await createCase({
      teamId: TEAM,
      title: "An episode",
      createdById: archivist.id,
      yapId: late.id,
    });
    await addYapToCase(caseId, early.id, TEAM);

    const file = await getCase(caseId, TEAM);
    assert.deepEqual(
      file?.records.map((r) => r.id),
      [early.id, late.id],
      "filing a record later must not put it last",
    );
    assert.equal(file?.recordCount, 2);
  });
});

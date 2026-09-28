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
  editYap,
  toggleReaction,
} from "@/lib/services/yaps";
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
  test("the author cannot score their own statement", async () => {
    const author = await makeUser("Author");
    const reader = await makeUser("Reader");
    const yap = await makeYap({ authorId: author.id });

    // The archive already refused to let them witness it. Letting them add to
    // its aura anyway was the same rule enforced in one place and not the
    // other — a reader found the gap by using the thing for a day.
    await assert.rejects(
      () => toggleReaction(yap.id, TEAM, author.id, "BASED"),
      /AUTHOR_CANNOT_REACT/,
    );
    const untouched = await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } });
    assert.equal(untouched.aura, 0);
    assert.equal(untouched.reactionCount, 0);

    // Everyone else still may, and acknowledging still moves nothing.
    await toggleReaction(yap.id, TEAM, reader.id, "BASED");
    await acknowledgeYap(yap.id, TEAM, author.id);
    const after = await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } });
    assert.equal(after.aura, REACTION_WEIGHTS.BASED);
    assert.ok(after.acknowledgedAt, "I SAID THAT is the author's channel, and it costs nothing");
  });

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

describe("the default view keeps everything", () => {
  test("trending ranks an old record low, it does not drop it", async () => {
    await resetDatabase();
    const author = await makeUser("Founder");

    // Old in both senses: said long ago and filed long ago. Trending decays by
    // when a record was *filed*, so a two-year-old quote entered today is new
    // to the archive and ranks accordingly.
    const ancient = await makeYap({
      authorId: author.id,
      text: "Раньше мы такого не записывали.",
      saidAt: new Date(Date.now() - 400 * 86_400_000),
      aura: 60,
    });
    await prisma.yap.update({
      where: { id: ancient.id },
      data: { createdAt: new Date(Date.now() - 400 * 86_400_000) },
    });

    const today = await makeYap({ authorId: author.id, text: "Свежее.", aura: 10 });

    // The window used to cut anything said more than sixty days ago, which
    // quietly removed the archive's founding records from its own front page.
    const ids = (await listYaps({ teamId: TEAM, sort: "trending" })).map((yap) => yap.id);
    assert.ok(ids.includes(ancient.id), "an old record must stay reachable from the default view");
    assert.deepEqual(ids, [today.id, ancient.id], "decay ranks it last rather than hiding it");
  });

  test("a quote said years ago but filed today is not old news", async () => {
    await resetDatabase();
    const author = await makeUser("Archivist");
    const dugUp = await makeYap({
      authorId: author.id,
      saidAt: new Date(Date.now() - 900 * 86_400_000),
      aura: 40,
    });

    const ids = (await listYaps({ teamId: TEAM, sort: "trending" })).map((yap) => yap.id);
    assert.deepEqual(ids, [dugUp.id], "filed today, so it belongs on the front page today");
  });
});

describe("correcting a misquote", () => {
  test("changes the words and nothing the record has earned", async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    const filer = await makeUser("Filer");
    const witness = await makeUser("Witness");
    const reader = await makeUser("Reader");

    const yap = await makeYap({ text: "Рот стовлю.", authorId: author.id, submittedById: filer.id });
    await toggleReaction(yap.id, TEAM, reader.id, "BASED");
    await setWitnessStance(yap.id, TEAM, witness.id, "PRESENT");
    await acknowledgeYap(yap.id, TEAM, author.id);

    const before = await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } });
    assert.equal((await editYap(yap.id, TEAM, filer.id, { text: "Рот ставлю.", lore: "опечатка" })).ok, true);

    const after = await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } });
    assert.equal(after.text, "Рот ставлю.");
    assert.equal(after.lore, "опечатка");
    // A typo fixed is not a different statement: everyone who went on the
    // record did so about these words.
    assert.equal(after.aura, before.aura);
    assert.equal(after.witnessCount, before.witnessCount);
    assert.equal(after.verification, before.verification);
    assert.ok(after.acknowledgedAt);
  });

  test("a stranger cannot rewrite someone else's filing", async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    const filer = await makeUser("Filer");
    const stranger = await makeUser("Stranger");
    const yap = await makeYap({ text: "Как было.", authorId: author.id, submittedById: filer.id });

    assert.equal((await editYap(yap.id, TEAM, stranger.id, { text: "Как не было.", lore: null })).ok, false);
    assert.equal((await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } })).text, "Как было.");
  });

  test("the same length rules as filing it in the first place", async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    const yap = await makeYap({ text: "Как было.", authorId: author.id, submittedById: author.id });

    assert.equal((await editYap(yap.id, TEAM, author.id, { text: "я", lore: null })).ok, false);
    assert.equal((await editYap(yap.id, TEAM, author.id, { text: "я".repeat(401), lore: null })).ok, false);
    assert.equal((await prisma.yap.findUniqueOrThrow({ where: { id: yap.id } })).text, "Как было.");
  });

  test("a redacted record is not quietly edited back into shape", async () => {
    await resetDatabase();
    const author = await makeUser("Author");
    const yap = await makeYap({ authorId: author.id, submittedById: author.id });
    await softDeleteYap(yap.id, TEAM, author.id);

    assert.equal((await editYap(yap.id, TEAM, author.id, { text: "Новое.", lore: null })).ok, false);
  });
});

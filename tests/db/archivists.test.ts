import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { DEFAULT_TEAM_ID as TEAM, makeTeam, makeUser, makeYap, prisma, resetDatabase } from "./setup";
import { getArchivistLeaderboard, getLeaderboard } from "@/lib/services/yappers";
import { recordBattle } from "@/lib/services/battles";
import { setWitnessStance } from "@/lib/services/yaps";

/**
 * The archive has two jobs and only one of them was ever ranked.
 *
 * getLeaderboard groups by authorId, so a person who never says anything
 * quotable but files everybody else's lines does not appear on it at all — not
 * low down, absent. In the real archive that person is the owner.
 */
describe("archivists are ranked for what they brought in", () => {
  let speaker: string;
  let archivist: string;

  before(async () => {
    await resetDatabase();
    const said = await makeUser("Speaker");
    const filed = await makeUser("Archivist");
    speaker = said.id;
    archivist = filed.id;

    // Four records, all said by one person and all filed by the other.
    for (let i = 0; i < 4; i += 1) {
      await makeYap({ authorId: speaker, submittedById: archivist, aura: 100 });
    }
  });

  test("the speakers' table cannot see them at all", async () => {
    const speakers = await getLeaderboard(TEAM);
    assert.deepEqual(
      speakers.map((entry) => entry.yapper.displayName),
      ["Speaker"],
      "filing four records earns no row on a table grouped by author",
    );
  });

  test("the archivists' table puts them first", async () => {
    const rows = await getArchivistLeaderboard(TEAM);
    assert.equal(rows[0]?.yapper.displayName, "Archivist");
    assert.equal(rows[0]?.filedCount, 4);
    assert.equal(rows[0]?.discoveredAura, 400, "aura on the records they found, not their own");
  });

  test("testimony and verdicts count even with nothing filed", async () => {
    const juror = await makeUser("Juror");
    const yaps = await prisma.yap.findMany({ where: { teamId: TEAM }, take: 2 });

    await setWitnessStance(yaps[0]!.id, TEAM, juror.id, "PRESENT");
    await recordBattle(yaps[0]!.id, yaps[1]!.id, TEAM, juror.id);

    const row = (await getArchivistLeaderboard(TEAM)).find(
      (entry) => entry.yapper.displayName === "Juror",
    );
    assert.ok(row, "somebody who only corroborates and judges still belongs here");
    assert.equal(row.filedCount, 0);
    assert.equal(row.testimonyCount, 1);
    assert.equal(row.battleVotes, 1);
  });

  test("a redacted record stops counting towards the person who filed it", async () => {
    const before = (await getArchivistLeaderboard(TEAM))[0]!;
    const one = await prisma.yap.findFirstOrThrow({ where: { submittedById: archivist } });
    await prisma.yap.update({ where: { id: one.id }, data: { deletedAt: new Date() } });

    const after = (await getArchivistLeaderboard(TEAM))[0]!;
    assert.equal(after.filedCount, before.filedCount - 1);
    assert.equal(after.discoveredAura, before.discoveredAura - 100);
  });

  test("nothing crosses in from another archive", async () => {
    const other = await makeTeam("elsewhere", "Elsewhere");
    const stranger = await makeUser("Stranger", other.id);
    await makeYap({ authorId: stranger.id, submittedById: stranger.id, teamId: other.id, aura: 999 });

    const here = await getArchivistLeaderboard(TEAM);
    assert.equal(here.some((entry) => entry.yapper.displayName === "Stranger"), false);
    assert.equal((await getArchivistLeaderboard(other.id)).length, 1);
  });
});

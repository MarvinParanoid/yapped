import "dotenv/config";
import { prisma } from "../src/lib/db";
import { replayLadder } from "../src/lib/ranking/elo";

/**
 * Rebuild the arena's cached figures from the battle journal.
 *
 *   npm run recompute:elo
 *   docker compose run --rm migrate npm run recompute:elo    (deployed)
 *
 * `Yap.eloRating`, `battleWins` and `battleLosses` are caches. The Battle table
 * is the truth, and when the two disagree this is the repair.
 *
 * They disagree after the migration that gave each person one verdict per pair:
 * it deleted the superseded rows, and Elo is path-dependent, so the ratings
 * still carried votes the journal no longer holds. They would also disagree
 * after a change to K or the expectation curve.
 *
 * Safe to run at any time, as often as you like: it derives everything from the
 * journal and writes only what differs.
 */

async function main(): Promise<void> {
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });

  for (const team of teams) {
    // Oldest first — a replay in the wrong order produces different numbers.
    const battles = await prisma.battle.findMany({
      where: { teamId: team.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { winnerId: true, loserId: true },
    });

    const ladder = replayLadder(battles);

    // Records that never fought must read as never having fought, including
    // any that used to.
    const fought = await prisma.yap.findMany({
      where: {
        teamId: team.id,
        OR: [
          { id: { in: [...ladder.keys()] } },
          { battleWins: { gt: 0 } },
          { battleLosses: { gt: 0 } },
        ],
      },
      select: { id: true, eloRating: true, battleWins: true, battleLosses: true },
    });

    let changed = 0;
    for (const yap of fought) {
      const entry = ladder.get(yap.id) ?? { rating: 1500, wins: 0, losses: 0 };
      if (
        yap.eloRating === entry.rating &&
        yap.battleWins === entry.wins &&
        yap.battleLosses === entry.losses
      ) {
        continue;
      }
      await prisma.yap.update({
        where: { id: yap.id },
        data: {
          eloRating: entry.rating,
          battleWins: entry.wins,
          battleLosses: entry.losses,
        },
      });
      changed += 1;
    }

    console.log(
      `${team.name}: ${battles.length} verdicts replayed, ${changed} of ${fought.length} records corrected.`,
    );
  }
}

main()
  .catch((error) => {
    console.error("REFUSED.", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

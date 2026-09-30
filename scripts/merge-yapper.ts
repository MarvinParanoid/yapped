import "dotenv/config";
import { prisma } from "../src/lib/db";
import { refreshVerification } from "../src/lib/services/yaps";

/**
 * Two rows, one person.
 *
 * A yapper can exist in the archive before they exist as an account: someone
 * quotes "Artem", the archive files a credential-less person under that name,
 * and later Artem registers — as `kurl`, because that is what he calls himself.
 * Now the archive holds two people who are one, and the quotes are on the wrong
 * one. Registering under the exact display name claims it automatically; any
 * other spelling deliberately does not, which is the case this repairs.
 *
 *   npm run merge:yapper -- --team подливычи --from Artem --into Kurl
 *   npm run merge:yapper -- --team подливычи --from Artem --into Kurl --commit
 *
 * Without --commit it only reports. Against a deployed instance use the
 * migrate container, which is the image that carries tsx:
 *
 *   docker compose run --rm migrate npm run merge:yapper -- … --commit
 *
 * It refuses to merge a person who has credentials: two real accounts being
 * the same human is a different problem with a different answer, and doing it
 * silently would destroy a way to sign in.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const teamSlug = arg("team");
  const fromName = arg("from");
  const intoName = arg("into");
  const commit = process.argv.includes("--commit");

  if (!teamSlug || !fromName || !intoName) {
    throw new Error("Need --team <slug> --from <display name> --into <display name>.");
  }

  const team = await prisma.team.findUnique({ where: { slug: teamSlug } });
  if (!team) throw new Error(`No archive with slug "${teamSlug}".`);

  const find = async (name: string) => {
    const rows = await prisma.user.findMany({
      where: {
        displayName: { equals: name, mode: "insensitive" },
        memberships: { some: { teamId: team.id } },
      },
    });
    if (rows.length === 0) throw new Error(`No "${name}" in ${team.name}.`);
    if (rows.length > 1) throw new Error(`"${name}" is ambiguous in ${team.name}.`);
    return rows[0]!;
  };

  const from = await find(fromName);
  const into = await find(intoName);
  if (from.id === into.id) throw new Error("Those are the same row.");
  if (from.username) {
    throw new Error(
      `"${from.displayName}" signs in as ${from.username}. Merging would delete a way into the ` +
        `archive; decide what happens to that account first.`,
    );
  }

  // Everything the losing row is attached to. Counted before, so the report
  // says what moved rather than what was asked for.
  const held = {
    said: await prisma.yap.count({ where: { authorId: from.id } }),
    filed: await prisma.yap.count({ where: { submittedById: from.id } }),
    reactions: await prisma.reaction.count({ where: { userId: from.id } }),
    witnessed: await prisma.witness.count({ where: { userId: from.id } }),
    battles: await prisma.battle.count({ where: { voterId: from.id } }),
    invites: await prisma.invite.count({ where: { createdById: from.id } }),
    badges: await prisma.userAchievement.count({ where: { userId: from.id } }),
    sessions: await prisma.session.count({ where: { userId: from.id } }),
  };

  console.log(`${from.displayName} (${from.id})  →  ${into.displayName} (${into.id})`);
  for (const [what, n] of Object.entries(held)) if (n > 0) console.log(`  ${n} ${what}`);

  // Moving an author onto someone who already witnessed those words would make
  // them their own corroboration, which the archive refuses on principle: a
  // witness is independent. The statement is still theirs, so the testimony
  // becomes what it actually meant — owning up to it.
  const selfWitnessed = await prisma.witness.findMany({
    where: { userId: into.id, yap: { authorId: from.id } },
    select: { yapId: true, stance: true },
  });
  for (const row of selfWitnessed) {
    console.log(
      `  record #${row.yapId}: ${into.displayName} witnessed it (${row.stance}) — becomes ` +
        `${row.stance === "PRESENT" ? "an acknowledgement" : "a dispute"}`,
    );
  }

  if (!commit) {
    console.log("\nDry run. Add --commit to carry it out.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Straight moves: nothing here can collide.
    await tx.yap.updateMany({ where: { authorId: from.id }, data: { authorId: into.id } });
    await tx.yap.updateMany({ where: { submittedById: from.id }, data: { submittedById: into.id } });
    await tx.invite.updateMany({ where: { createdById: from.id }, data: { createdById: into.id } });

    // Moves guarded by a unique constraint: where the survivor already holds an
    // equivalent row, the loser's is dropped rather than moved.
    for (const reaction of await tx.reaction.findMany({ where: { userId: from.id } })) {
      const taken = await tx.reaction.findUnique({
        where: { yapId_userId_type: { yapId: reaction.yapId, userId: into.id, type: reaction.type } },
      });
      if (taken) await tx.reaction.delete({ where: { id: reaction.id } });
      else await tx.reaction.update({ where: { id: reaction.id }, data: { userId: into.id } });
    }

    for (const witness of await tx.witness.findMany({ where: { userId: from.id } })) {
      const taken = await tx.witness.findUnique({
        where: { yapId_userId: { yapId: witness.yapId, userId: into.id } },
      });
      if (taken) await tx.witness.delete({ where: { id: witness.id } });
      else await tx.witness.update({ where: { id: witness.id }, data: { userId: into.id } });
    }

    for (const battle of await tx.battle.findMany({ where: { voterId: from.id } })) {
      const taken = await tx.battle.findFirst({
        where: {
          teamId: battle.teamId,
          voterId: into.id,
          pairLowId: battle.pairLowId,
          pairHighId: battle.pairHighId,
        },
      });
      if (taken) await tx.battle.delete({ where: { id: battle.id } });
      else await tx.battle.update({ where: { id: battle.id }, data: { voterId: into.id } });
    }

    for (const badge of await tx.userAchievement.findMany({ where: { userId: from.id } })) {
      const taken = await tx.userAchievement.findUnique({
        where: { userId_key: { userId: into.id, key: badge.key } },
      });
      if (taken) await tx.userAchievement.delete({ where: { id: badge.id } });
      else await tx.userAchievement.update({ where: { id: badge.id }, data: { userId: into.id } });
    }

    // Now the author owns these words, so their own testimony about them stops
    // being testimony.
    for (const row of selfWitnessed) {
      await tx.witness.delete({ where: { yapId_userId: { yapId: row.yapId, userId: into.id } } });
      await tx.yap.update({
        where: { id: row.yapId },
        data:
          row.stance === "PRESENT"
            ? { acknowledgedAt: new Date(), disputedAt: null, disputeStatement: null }
            : { disputedAt: new Date(), acknowledgedAt: null },
      });
    }

    // The losing row keeps nothing: its sessions and membership go with it.
    await tx.session.deleteMany({ where: { userId: from.id } });
    await tx.membership.deleteMany({ where: { userId: from.id } });

    const stragglers =
      (await tx.yap.count({ where: { OR: [{ authorId: from.id }, { submittedById: from.id }] } })) +
      (await tx.reaction.count({ where: { userId: from.id } })) +
      (await tx.witness.count({ where: { userId: from.id } })) +
      (await tx.battle.count({ where: { voterId: from.id } })) +
      (await tx.invite.count({ where: { createdById: from.id } })) +
      (await tx.userAchievement.count({ where: { userId: from.id } })) +
      (await tx.session.count({ where: { userId: from.id } })) +
      (await tx.membership.count({ where: { userId: from.id } }));
    if (stragglers > 0) {
      throw new Error(`${stragglers} references left behind — refusing to delete the row.`);
    }

    await tx.user.delete({ where: { id: from.id } });
  });

  // Witness counts and the verification rung are caches of the rows just moved.
  for (const row of selfWitnessed) await refreshVerification(row.yapId);

  console.log(`\nMerged. "${from.displayName}" no longer exists; the words are ${into.displayName}'s.`);
}

main()
  .catch((error) => {
    console.error("REFUSED.", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

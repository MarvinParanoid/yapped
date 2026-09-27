import "dotenv/config";
import { prisma } from "../src/lib/db";

/**
 * Grant or revoke the instance role — the one thing the application itself
 * deliberately cannot do, because an archive should not be able to hand out
 * power over the box it runs on.
 *
 *   npm run grant:admin                     list who holds it
 *   npm run grant:admin -- lesha            grant
 *   npm run grant:admin -- lesha --revoke   take it back
 *
 * Against a deployed instance, run it in the `migrate` container rather than
 * `app`: the runtime image is a Next standalone build and carries neither this
 * file nor tsx, while `migrate` is built from the `builder` stage and has both.
 *
 *   docker compose run --rm migrate npm run grant:admin -- lesha
 */
function describe(user: { username: string | null; displayName: string }): string {
  return user.username ? `${user.username} (${user.displayName})` : user.displayName;
}

async function listOperators(): Promise<void> {
  const operators = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { username: true, displayName: true },
  });

  if (operators.length === 0) {
    console.log("No instance operators. Nobody can see /admin/instance.");
    return;
  }
  console.log(`Instance operators (${operators.length}):`);
  for (const operator of operators) console.log(`  ${describe(operator)}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const username = args.find((arg) => !arg.startsWith("-"))?.trim().toLowerCase();

  if (!username) {
    await listOperators();
    console.log("\nUsage: npm run grant:admin -- <username> [--revoke]");
    return;
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    // A yapper the archive quotes has no username, so this is the likely miss.
    throw new Error(
      `No account with username "${username}". ` +
        `Being quoted in the archive is not the same as having an account.`,
    );
  }

  const wanted = revoke ? "USER" : "ADMIN";
  if (user.role === wanted) {
    console.log(`${describe(user)} already ${revoke ? "has no" : "has the"} instance role.`);
    return;
  }

  // Revoking the last operator is allowed — unlike a team's last owner, there
  // is always a way back in through this script.
  await prisma.user.update({ where: { id: user.id }, data: { role: wanted } });
  console.log(
    revoke
      ? `Revoked the instance role from ${describe(user)}.`
      : `${describe(user)} is now an instance operator. No sign-out needed.`,
  );
  console.log("");
  await listOperators();
}

main()
  .catch((error) => {
    console.error("REFUSED.", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

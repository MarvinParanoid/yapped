import "dotenv/config";
import { prisma } from "../src/lib/db";
import { issueReset } from "../src/lib/services/password-reset";

/**
 * The last door, for when nobody can open any of the others.
 *
 * Inside the app an administrator mints a reset link from /admin. That works
 * right up until the person locked out *is* the administrator — and on a fresh
 * instance with no instance operator, that is the end of the archive.
 *
 *   npm run reset:password -- --username lesha
 *   docker compose run --rm migrate npm run reset:password -- --username lesha
 *
 * It prints a link rather than setting a password, so nothing anyone types
 * ends up in a shell history or a terminal somebody is screen-sharing.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const username = arg("username")?.trim().toLowerCase();
  if (!username) throw new Error("Need --username <login>.");

  const user = await prisma.user.findUnique({
    where: { username },
    include: { memberships: { orderBy: { joinedAt: "asc" }, include: { team: true } } },
  });
  if (!user) throw new Error(`No account signs in as "${username}".`);

  const membership = user.memberships[0];
  if (!membership) throw new Error(`${user.displayName} belongs to no archive.`);

  // Run by whoever holds the server, so it answers to nobody in the app: the
  // issuer is recorded as the person themselves rather than an administrator
  // who did not do this.
  const result = await issueReset({
    teamId: membership.teamId,
    userId: user.id,
    issuedById: user.id,
    // Run by whoever holds the machine, which is above every role in the app:
    // this is the door that exists for when the app's own doors are shut.
    issuerIsOperator: true,
  });
  if (!result.ok) throw new Error(result.code);

  const origin = process.env.APP_URL ?? "http://localhost:3000";
  console.log("");
  console.log(`${user.displayName} (${username}) — ${membership.team.name}`);
  console.log(`${origin}/reset/${result.token}`);
  console.log("");
  console.log("Works once, expires in a day, and ends every session that account has.");
}

main()
  .catch((error) => {
    console.error("REFUSED.", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

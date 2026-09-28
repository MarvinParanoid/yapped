import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { hashPassword } from "../src/lib/auth/password";
import { prisma } from "../src/lib/db";
import { en } from "../src/lib/i18n/en";
import { fill } from "../src/lib/i18n/locale";
import { createTeam } from "../src/lib/services/teams";

/**
 * The first account on a fresh instance.
 *
 * Everything else is invite-only by design: registration needs a link, a link
 * needs a team, and a team needs a member. That is airtight once an archive
 * exists and unopenable before one does — so the very first door is this
 * script, run by whoever has the server.
 *
 *   npm run bootstrap
 *   npm run bootstrap -- --team "Подливычи" --username lesha --name Lesha
 *
 * Against a deployed instance, use the `migrate` container — the runtime image
 * is a Next standalone build and carries neither this file nor tsx:
 *
 *   docker compose run --rm migrate npm run bootstrap
 *
 * It refuses to run once any account exists, so it cannot be used later to mint
 * a quiet second owner.
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const accounts = await prisma.user.count();
  if (accounts > 0) {
    throw new Error(
      `This archive already has ${accounts} ${accounts === 1 ? "person" : "people"} on file. ` +
        `Bootstrapping is for an empty instance — use an invite link, or ` +
        `npm run grant:admin to hand out the instance role.`,
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (question: string, fallback?: string) => {
    if (fallback) return fallback;
    return (await rl.question(question)).trim();
  };

  try {
    const teamName = await ask("Team name (the archive): ", arg("team"));
    const displayName = await ask("Your display name (as quotes will credit you): ", arg("name"));
    const username = (await ask("Username to sign in with: ", arg("username")))
      .trim()
      .toLowerCase();
    const password = await ask("Password (at least 8 characters): ", arg("password"));

    if (teamName.length < 2) throw new Error("A team needs a name.");
    if (displayName.length < 2) throw new Error("A person needs a name.");
    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) {
      throw new Error("Username must be 3–24 characters: letters, numbers, . _ -");
    }
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");

    // The owner exists first so createTeam has someone to make owner; the
    // instance role comes with it, because on a one-team box the founder is
    // also the only person who can ever fix it.
    const owner = await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash: await hashPassword(password),
        role: "ADMIN",
      },
    });

    const team = await createTeam(teamName, owner.id);
    // A CLI run by whoever owns the box: English, straight from the source
    // dictionary, rather than guessing at a locale nobody has chosen yet.
    if (!team.ok) throw new Error(fill(en.errors[team.code], team.vars ?? {}));

    console.log("");
    console.log(`Archive "${teamName}" opened at /${team.slug}.`);
    console.log(`${displayName} is its owner, and the instance operator.`);
    console.log("");
    console.log("Sign in, then hand out an invite link from /invite.");
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error("REFUSED.", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

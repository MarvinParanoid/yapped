import { prisma } from "@/lib/db";

/**
 * Service tests run against a real Postgres, because the rules they protect
 * live half in TypeScript and half in the schema.
 *
 * They refuse to run unless TEST_DATABASE_URL is set and is the database the
 * process is actually pointed at — these tests truncate everything, and that
 * must never be someone's archive by accident.
 */
export function assertTestDatabase(): void {
  const test = process.env.TEST_DATABASE_URL;
  if (!test) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Service tests wipe the database, so they " +
        "refuse to guess. Start one with `npx prisma dev --name yapped-test`.",
    );
  }
  if (process.env.DATABASE_URL !== test) {
    throw new Error("Refusing to run: DATABASE_URL does not point at TEST_DATABASE_URL.");
  }
}

export async function resetDatabase(): Promise<string> {
  assertTestDatabase();
  await prisma.$transaction([
    prisma.battle.deleteMany(),
    prisma.reaction.deleteMany(),
    prisma.witness.deleteMany(),
    prisma.evidence.deleteMany(),
    prisma.yapTag.deleteMany(),
    prisma.userAchievement.deleteMany(),
    prisma.session.deleteMany(),
    prisma.yap.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.invite.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.user.deleteMany(),
    prisma.team.deleteMany(),
  ]);

  // Every reset leaves exactly one team behind, so a test that says nothing
  // about teams still runs inside one — which is the production shape.
  const team = await prisma.team.create({
    data: { id: DEFAULT_TEAM_ID, name: "Test Team", slug: "test" },
  });
  return team.id;
}

/** The team `makeUser` and `makeYap` file into unless told otherwise. */
export const DEFAULT_TEAM_ID = "team_test";

export async function makeTeam(slug: string, name = slug) {
  return prisma.team.create({ data: { name, slug } });
}

let counter = 0;

export async function makeUser(displayName?: string, teamId: string = DEFAULT_TEAM_ID) {
  counter += 1;
  return prisma.user.create({
    data: {
      displayName: displayName ?? `Person ${counter}`,
      memberships: { create: { teamId } },
    },
  });
}

export async function makeYap(input: {
  text?: string;
  authorId: string;
  submittedById?: string;
  saidAt?: Date;
  lore?: string | null;
  aura?: number;
  teamId?: string;
}) {
  counter += 1;
  return prisma.yap.create({
    data: {
      teamId: input.teamId ?? DEFAULT_TEAM_ID,
      text: input.text ?? `Statement ${counter}`,
      authorId: input.authorId,
      submittedById: input.submittedById ?? null,
      saidAt: input.saidAt ?? new Date(),
      lore: input.lore ?? null,
      aura: input.aura ?? 0,
      acknowledgedAt:
        input.submittedById && input.submittedById === input.authorId ? new Date() : null,
    },
  });
}

export { prisma };

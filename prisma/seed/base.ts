/**
 * The production baseline.
 *
 * It is deliberately empty, and that is the whole point: a real Yapped
 * instance starts with nothing and accumulates its own lore. Everything the
 * application needs to boot is either a Postgres enum (classifications,
 * verification rungs, reaction types) or a code catalog that needs no rows
 * (achievements, titles) — so there is nothing to insert here.
 *
 * If a future feature ever needs genuine reference rows, they belong in this
 * file, and nowhere near prisma/seed/demo.ts.
 */
export async function seedBase(): Promise<void> {
  console.log("BASE SEED — nothing to insert.");
  console.log("The archive starts empty by design. File the first yap from the app.");
}

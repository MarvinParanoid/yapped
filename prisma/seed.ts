import "dotenv/config";

/**
 * Seed entry point.
 *
 *   SEED_MODE unset | "base"  → production baseline (empty archive)
 *   SEED_MODE=demo            → the fictional demo archive
 *
 * Demo data is never reachable from a production boot by accident: it takes an
 * explicit opt-in, and the demo seed additionally refuses to overwrite a
 * database that holds anyone outside its own cast.
 */
async function main() {
  const mode = (process.env.SEED_MODE ?? "base").toLowerCase();

  if (mode === "demo") {
    const { seedDemo, assertSafeToSeed, disconnect } = await import("./seed/demo");
    try {
      await assertSafeToSeed();
      await seedDemo();
    } finally {
      await disconnect();
    }
    return;
  }

  if (mode !== "base") {
    throw new Error(`Unknown SEED_MODE "${mode}" — expected "base" or "demo".`);
  }

  const { seedBase } = await import("./seed/base");
  await seedBase();
}

main().catch((error) => {
  console.error("TOO MUCH YAPPING.", error instanceof Error ? error.message : error);
  process.exit(1);
});

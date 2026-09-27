import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * The single Prisma client. Only lib/services/* and lib/auth/* import this —
 * see docs/ARCHITECTURE.md §1.2.
 *
 * Created lazily on first use, never at import time. `next build` walks the
 * module graph to collect page data — including /_not-found, which pulls in
 * the layout and therefore the session — and a build machine has no database.
 * An import must not demand runtime configuration.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.databaseUrl,
    max: env.databasePoolMax,
  });
  return new PrismaClient({
    adapter,
    log: env.isProduction ? ["error"] : ["error", "warn"],
  });
}

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const created = createClient();
    // In development the singleton survives hot reloads; in production the
    // module is evaluated once anyway.
    globalForPrisma.prisma = created;
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const instance = client();
    const value = Reflect.get(instance, property);
    // Keep `this` bound to the real client for $transaction, $queryRaw etc.
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/** Small, explicit env surface. Read once, in one place. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  /**
   * Connection pool ceiling. Requests queue once it is reached, which is what
   * you want: a small pool that queues beats a large one that gets refused.
   */
  get databasePoolMax() {
    const raw = Number(process.env.DATABASE_POOL_MAX);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
  },
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get storageDriver() {
    return (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3";
  },
  get storageLocalDir() {
    return process.env.STORAGE_LOCAL_DIR ?? "./var/uploads";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};

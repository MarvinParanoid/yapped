import { env } from "@/lib/env";
import { createLocalDriver } from "./local";
import type { StorageDriver } from "./types";

export * from "./types";
export { buildKey } from "./local";

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  switch (env.storageDriver) {
    case "s3":
      // Drop an s3.ts implementing StorageDriver in here and return it.
      // Nothing else in the application changes.
      throw new Error("STORAGE_DRIVER=s3 is not implemented yet — see lib/storage/types.ts");
    case "local":
    default:
      driver = createLocalDriver(env.storageLocalDir);
      return driver;
  }
}

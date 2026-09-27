import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver, StoredObject } from "./types";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function extensionFor(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType] ?? "bin";
}

/** Content-addressed key: evidence/ab/cd/<sha>.webp */
export function buildKey(body: Buffer, mimeType: string): string {
  const hash = createHash("sha256").update(body).digest("hex");
  return `evidence/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${extensionFor(mimeType)}`;
}

export function createLocalDriver(rootDir: string): StorageDriver {
  // The upload directory is configured at runtime, so the bundler must not try
  // to trace it — otherwise the whole project ends up in the server output.
  const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), rootDir);

  const resolve = (key: string) => {
    const full = path.resolve(/* turbopackIgnore: true */ root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return full;
  };

  return {
    async put({ key, body, mimeType }): Promise<StoredObject> {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      return { key, mimeType, size: body.byteLength };
    },
    async get(key) {
      try {
        const body = await readFile(resolve(key));
        const ext = path.extname(key).slice(1);
        const mimeType =
          Object.entries(MIME_EXTENSIONS).find(([, value]) => value === ext)?.[0] ??
          "application/octet-stream";
        return { body, mimeType };
      } catch {
        return null;
      }
    },
    async delete(key) {
      try {
        await unlink(resolve(key));
      } catch {
        /* already gone */
      }
    },
    url(key) {
      return `/api/media/${key}`;
    },
  };
}

/**
 * Image storage lives behind this interface so the filesystem can be swapped
 * for S3 without touching a single component. Files never go in the database;
 * only the returned key does.
 */
export type StoredObject = {
  key: string;
  mimeType: string;
  size: number;
};

export interface StorageDriver {
  /** Persist bytes and return the key to store on the Evidence row. */
  put(input: { key: string; body: Buffer; mimeType: string }): Promise<StoredObject>;
  /** Read bytes back (used by the /api/media route). */
  get(key: string): Promise<{ body: Buffer; mimeType: string } | null>;
  delete(key: string): Promise<void>;
  /** Public URL, if the driver has one. Local storage streams instead. */
  url(key: string): string;
}

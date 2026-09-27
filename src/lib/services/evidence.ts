import sharp from "sharp";
import { prisma } from "@/lib/db";
import { buildKey, storage } from "@/lib/storage";

export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1600;

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export function isAcceptedImage(mimeType: string): boolean {
  return ACCEPTED.has(mimeType);
}

/**
 * Normalise an upload to a bounded webp and hand the bytes to the storage
 * driver. The database only ever learns the key.
 */
export async function attachEvidence(
  yapId: number,
  file: { buffer: Buffer; mimeType: string; caption?: string | null },
): Promise<void> {
  if (!isAcceptedImage(file.mimeType)) throw new Error("UNSUPPORTED_IMAGE");
  if (file.buffer.byteLength > MAX_EVIDENCE_BYTES) throw new Error("IMAGE_TOO_LARGE");

  const pipeline = sharp(file.buffer, { animated: file.mimeType === "image/gif" })
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

  const { data, info } = await pipeline.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });

  const key = buildKey(data, "image/webp");
  await storage().put({ key, body: data, mimeType: "image/webp" });

  const count = await prisma.evidence.count({ where: { yapId } });
  await prisma.evidence.create({
    data: {
      yapId,
      storageKey: key,
      mimeType: "image/webp",
      width: info.width,
      height: info.height,
      caption: file.caption?.trim() || null,
      position: count + 1,
    },
  });
}

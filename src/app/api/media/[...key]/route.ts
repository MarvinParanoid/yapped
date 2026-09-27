import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/team";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

/**
 * Evidence is streamed through the storage driver — never served from /public.
 *
 * The key alone is not a credential: an exhibit belongs to the record it was
 * attached to, and that record belongs to a team. A content-addressed key is
 * also shared by identical uploads, so the check is "does the viewer's team
 * hold *any* record carrying this key", not a single row lookup.
 */
export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("MEMBERS ONLY.", { status: 401 });

  const { key } = await context.params;
  const storageKey = key.join("/");

  const visible = await prisma.evidence.findFirst({
    where: { storageKey, yap: { teamId: viewer.team.id, deletedAt: null } },
    select: { id: true },
  });
  if (!visible) return new NextResponse("THIS EVIDENCE NEVER EXISTED.", { status: 404 });

  const object = await storage().get(storageKey);
  if (!object) {
    return new NextResponse("THIS EVIDENCE NEVER EXISTED.", { status: 404 });
  }
  return new NextResponse(new Uint8Array(object.body), {
    headers: {
      "Content-Type": object.mimeType,
      // Private: the response depends on who is asking.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

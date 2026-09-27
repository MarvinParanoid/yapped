import { notFound } from "next/navigation";
import { ShareCard } from "@/components/share-card";
import { requireViewer } from "@/lib/auth/team";
import { getYap } from "@/lib/services/yaps";

export const dynamic = "force-dynamic";

/**
 * A bare 1200×630 card with no chrome — screenshot it, or point a server-side
 * image generator at this route later.
 */
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { team } = await requireViewer(`/yap/${id}/share`);
  const yap = await getYap(Number(id), team.id);
  if (!yap) notFound();

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 bg-paper-3 p-4">
      {/* Scaled to fit, never resized: the card is always exactly 1200×630. */}
      <div
        className="border border-ink"
        style={{ zoom: "min(1, calc((100vw - 2rem) / 1200))" } as React.CSSProperties}
      >
        <ShareCard yap={yap} />
      </div>
      <p className="label">1200 × 630 · screenshot this</p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EditYapForm } from "@/components/edit-yap-form";
import { canModerate, requireViewer } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { getYap } from "@/lib/services/yaps";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDictionary();
  return { title: d.record.editHeading };
}

export default async function EditYapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yapId = Number(id);
  if (!Number.isInteger(yapId)) notFound();

  const viewer = await requireViewer(`/yap/${id}/edit`);
  const yap = await getYap(yapId, viewer.team.id, viewer.user.id);
  if (!yap) notFound();

  // The same rule the service enforces, asked before the form is drawn rather
  // than after it is filled in: whoever filed it, or whoever moderates here.
  const mine = yap.submittedBy?.id === viewer.user.id;
  if (!mine && !canModerate(viewer)) redirect(`/yap/${yapId}`);

  const d = await getDictionary();

  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">{yap.code}</span>
          <h1 className="quote mt-2 text-[clamp(1.8rem,4.5vw,2.8rem)]">{d.record.editHeading}</h1>
        </div>
        <Link href={`/yap/${yapId}`} className="label hover:text-ink">
          ← {d.record.back}
        </Link>
      </div>

      <div className="mt-8">
        <EditYapForm yapId={yap.id} initialText={yap.text} initialLore={yap.lore ?? ""} />
      </div>
    </div>
  );
}

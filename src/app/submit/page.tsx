import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { YapForm } from "@/components/yap-form";
import { Panel } from "@/components/ui/panel";
import { requireViewer } from "@/lib/auth/team";
import { listYappers } from "@/lib/services/yappers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Add a yap" };

export default async function SubmitPage() {
  const { team } = await requireViewer("/submit");
  const yappers = await listYappers(team.id);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="quote text-[clamp(2rem,5.5vw,3.4rem)]">Put it on record</h1>
        <Link href="/" className="label hover:text-ink">
          ← Back to the archive
        </Link>
      </div>

      <p className="label mt-3 max-w-[52ch] leading-[1.6]">
        unfortunately, it was said. the person who said it and the person filing it are recorded
        separately.
      </p>

      <div className="mt-8">
        <YapForm yappers={yappers} />
      </div>

      <div className="mt-6">
        <Panel label="Filing notes">
          <ul className="space-y-1.5 text-[13px] leading-[1.6] text-muted">
            <li>— Quote exactly. Half a quote is worse than none.</li>
            <li>— Lore is what makes it funny in six months.</li>
            <li>— Evidence is supporting material, not the point.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

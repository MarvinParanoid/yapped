import type { Metadata } from "next";
import Link from "next/link";
import { InviteManager } from "@/components/admin/invite-manager";
import { Panel } from "@/components/ui/panel";
import { canModerate, requireViewer } from "@/lib/auth/team";
import { listInvitesBy } from "@/lib/services/invites";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Invite someone" };

/**
 * Anyone in the team can bring someone in. This page shows only the links the
 * viewer handed out — the full list, across everybody, lives in /admin.
 */
export default async function InvitePage() {
  const viewer = await requireViewer("/invite");
  const mine = await listInvitesBy(viewer.team.id, viewer.user.id);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">Bring someone in</span>
          <h1 className="quote mt-2 text-[clamp(2rem,5.5vw,3.4rem)]">
            Invite to {viewer.team.name}
          </h1>
        </div>
        <Link href="/" className="label hover:text-ink">
          ← Back to the archive
        </Link>
      </div>

      <p className="label mt-3 max-w-[56ch] leading-[1.6]">
        whoever opens the link joins this archive and sees everything in it. there is no
        halfway — file the link accordingly.
      </p>

      <div className="mt-8">
        <Panel label="Your invite links" bodyClassName="p-0">
          <InviteManager invites={mine} />
        </Panel>
      </div>

      {canModerate(viewer) ? (
        <p className="label mt-4">
          every link in the team, including other people&apos;s, is in{" "}
          <Link href="/admin" className="underline underline-offset-2 hover:text-ink">
            administration
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

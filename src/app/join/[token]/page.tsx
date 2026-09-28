import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AcceptInvite } from "@/components/accept-invite";
import { getSessionUser } from "@/lib/auth/session";
import { listMemberships } from "@/lib/auth/team";
import { getDictionary } from "@/lib/i18n/server";
import { inspectInvite } from "@/lib/services/invites";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Invitation" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await inspectInvite(token);
  const d = await getDictionary();

  if (!invite.ok) {
    const refusal = { title: d.join[invite.reason], note: d.join[`${invite.reason}Hint`] };
    return (
      <div className="mx-auto max-w-[520px] px-4 py-16 pb-24 sm:px-6">
        <span className="label">{d.join.invitedTo}</span>
        <h1 className="quote mt-3 text-[clamp(1.8rem,5vw,2.8rem)]">{refusal.title}</h1>
        <p className="label mt-4 leading-[1.6]">{refusal.note}</p>
        <Link href="/login" className="btn btn-solid mt-8">
          {d.join.signInInstead} →
        </Link>
      </div>
    );
  }

  const user = await getSessionUser();

  // Already inside: nothing to accept, just go there.
  if (user) {
    const teams = await listMemberships(user.id);
    if (teams.some((team) => team.id === invite.teamId)) redirect("/");
  }

  return (
    <div className="mx-auto max-w-[520px] px-4 py-12 pb-24 sm:px-6">
      <span className="label">{d.join.invitedTo}</span>
      <h1 className="quote mt-3 text-[clamp(2rem,6vw,3.2rem)]">{invite.teamName}</h1>
      <p className="label mt-4 max-w-[42ch] leading-[1.6]">{d.join.what}</p>

      <div className="mt-8">
        {user ? (
          <AcceptInvite token={token} teamName={invite.teamName} userName={user.displayName} />
        ) : (
          <AuthForm mode="register" token={token} teamName={invite.teamName} />
        )}
      </div>
    </div>
  );
}

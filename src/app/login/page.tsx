import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSessionUser } from "@/lib/auth/session";
import { listMemberships } from "@/lib/auth/team";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

/** The team prisma/seed/demo.ts creates; its presence is what makes this a demo box. */
const DEMO_TEAM_SLUG = "demo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  const { next } = await searchParams;
  const demo = Boolean(await prisma.team.findUnique({ where: { slug: DEMO_TEAM_SLUG } }));

  if (user) {
    // Signed in but in no team: redirecting to the archive would bounce
    // straight back here, so say what is actually missing.
    const teams = await listMemberships(user.id);
    if (teams.length > 0) redirect("/");
    return (
      <div className="mx-auto max-w-[460px] px-4 py-16 pb-24 sm:px-6">
        <span className="label">Signed in as {user.displayName}</span>
        <h1 className="quote mt-3 text-[clamp(1.8rem,5vw,2.8rem)]">NO ARCHIVE ASSIGNED.</h1>
        <p className="label mt-4 leading-[1.6]">
          your account exists, but it belongs to no team yet. open an invite link to join one.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[460px] px-4 py-12 pb-20 sm:px-6">
      <h1 className="quote text-[clamp(1.8rem,5vw,2.8rem)]">Identify yourself</h1>
      <p className="label mt-3 leading-[1.6]">
        the archive is closed. members only, by invitation.
      </p>

      <div className="mt-8">
        <AuthForm mode="login" next={next?.startsWith("/") ? next : "/"} />
      </div>

      {/* Only where the demo archive is actually loaded. A real instance has
          no business advertising credentials that do not exist on it. */}
      {demo ? (
        <p className="label mt-6 leading-[1.6]">
          demo archive: <span className="text-ink">anna</span> /{" "}
          <span className="text-ink">yapped123</span>
        </p>
      ) : null}
    </div>
  );
}

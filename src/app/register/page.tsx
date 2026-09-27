import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Register" };

/**
 * There is no open registration any more. An archive belongs to one team, and
 * the only way into a team is a link someone in it handed you.
 */
export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="mx-auto max-w-[460px] px-4 py-16 pb-24 sm:px-6">
      <span className="label">Registration</span>
      <h1 className="quote mt-3 text-[clamp(1.8rem,5vw,2.8rem)]">BY INVITATION ONLY.</h1>
      <p className="label mt-4 leading-[1.6]">
        accounts are created from an invite link. ask whoever runs your team&apos;s archive for one
        — it looks like /join/&lt;token&gt;.
      </p>
      <Link href="/login" className="btn btn-solid mt-8">
        I already have an account →
      </Link>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDictionary();
  return { title: d.pageTitles.register };
}

/**
 * There is no open registration any more. An archive belongs to one team, and
 * the only way into a team is a link someone in it handed you.
 */
export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  const d = await getDictionary();

  return (
    <div className="mx-auto max-w-[460px] px-4 py-16 pb-24 sm:px-6">
      <span className="label">{d.auth.signIn}</span>
      <h1 className="quote mt-3 text-[clamp(1.8rem,5vw,2.8rem)]">{d.auth.registrationClosed}</h1>
      <p className="label mt-4 leading-[1.6]">{d.auth.registrationClosedHint}</p>
      <Link href="/login" className="btn btn-solid mt-8">
        {d.auth.haveAccount} →
      </Link>
    </div>
  );
}

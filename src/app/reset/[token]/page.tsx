import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/components/reset-form";
import { getDictionary } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/locale";
import { inspectReset } from "@/lib/services/password-reset";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const d = await getDictionary();
  return { title: d.reset.heading };
}

/**
 * Reachable without a session, like the invitation it is modelled on — the
 * whole point is that the person holding it cannot get in.
 */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const subject = await inspectReset(token);
  const d = await getDictionary();

  if (!subject.ok) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[560px] flex-col justify-center px-4 py-20">
        <span className="label">{d.reset.heading}</span>
        <h1 className="quote mt-3 text-[clamp(1.8rem,5vw,3rem)]">
          {d.reset[subject.reason]}
        </h1>
        <p className="label mt-4 leading-[1.6]">{d.reset.askForAnother}</p>
        <Link href="/login" className="btn btn-lg mt-8 self-start">
          {d.reset.backToDoor}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 py-16">
      <span className="label">{d.reset.heading}</span>
      <h1 className="quote mt-3 text-[clamp(1.8rem,5vw,3rem)]">
        {fill(d.reset.forWhom, { name: subject.displayName })}
      </h1>
      <p className="label mt-4 leading-[1.6]">
        {fill(d.reset.signingInAs, { username: subject.username })}
      </p>

      <div className="mt-8">
        <ResetForm token={token} />
      </div>

      <p className="label mt-6 leading-[1.6]">{d.reset.endsSessions}</p>
    </div>
  );
}

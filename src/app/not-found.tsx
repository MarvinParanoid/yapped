import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";

// Rendered inside the site chrome, which reads the session: never static.
export const dynamic = "force-dynamic";

export default async function NotFound() {
  const d = await getDictionary();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1400px] flex-col justify-center px-4 py-20 sm:px-6 lg:px-8">
      <span className="label">error 404</span>
      <h1 className="quote mt-3 text-[clamp(2rem,7vw,5rem)]">{d.error.notFoundTitle}</h1>
      <p className="label mt-4 max-w-[46ch] leading-[1.6]">
        {d.error.notFoundBody}
      </p>
      <Link href="/" className="btn btn-lg mt-8 self-start">
        {d.error.goHome}
      </Link>
    </div>
  );
}

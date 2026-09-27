import Link from "next/link";

// Rendered inside the site chrome, which reads the session: never static.
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1400px] flex-col justify-center px-4 py-20 sm:px-6 lg:px-8">
      <span className="label">error 404</span>
      <h1 className="quote mt-3 text-[clamp(2rem,7vw,5rem)]">This yap never happened.</h1>
      <p className="label mt-4 max-w-[46ch] leading-[1.6]">
        No record exists at this address. Either it was never said, or it has been removed from the
        historical record.
      </p>
      <Link href="/" className="btn btn-lg mt-8 self-start">
        Back to the archive
      </Link>
    </div>
  );
}

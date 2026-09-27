import Link from "next/link";
import type { ReactNode } from "react";

/** "No results for this filter" — not the same thing as an empty archive. */
export function EmptyState({
  title = "NO YAPS FOUND. SUSPICIOUS.",
  hint,
  action,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-ink bg-paper-2 px-6 py-16 text-center">
      <p className="quote text-[clamp(1.25rem,3vw,2rem)]">{title}</p>
      {hint ? <p className="label mt-3">{hint}</p> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * A genuinely empty archive, which is how every real instance starts. It should
 * read as day one of a record, not as a broken page.
 */
export function FirstRun({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="on-ink grid-ghost border border-ink px-6 py-14 text-center sm:px-10 sm:py-20">
      <p className="label">The record starts here</p>
      <h2 className="quote mt-4 text-[clamp(1.8rem,6vw,4rem)] text-paper">
        No yaps on record.
      </h2>
      <p className="mx-auto mt-5 max-w-[46ch] text-[15px] leading-[1.6] text-muted-dark">
        The organization has demonstrated suspicious levels of restraint. This will not last.
      </p>

      <dl className="mx-auto mt-10 grid max-w-[520px] grid-cols-3 border-l border-t border-paper/20">
        {[
          ["0", "yaps"],
          ["0", "aura"],
          ["0", "witnesses"],
        ].map(([value, label]) => (
          <div key={label} className="border-b border-r border-paper/20 px-3 py-4">
            <dd className="mono text-[26px] font-bold leading-none text-acid">{value}</dd>
            <dt className="label mt-2">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-10">
        <Link href={signedIn ? "/submit" : "/login?next=/submit"} className="btn btn-acid btn-lg">
          File the first yap →
        </Link>
      </div>
      <p className="label mt-4">it will be assigned #00001</p>
    </section>
  );
}

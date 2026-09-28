import Link from "next/link";
import type { ReactNode } from "react";
import { getDictionary } from "@/lib/i18n/server";

/** "No results for this filter" — not the same thing as an empty archive. */
export async function EmptyState({
  title,
  hint,
  action,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
}) {
  const d = await getDictionary();
  return (
    <div className="border border-ink bg-paper-2 px-6 py-16 text-center">
      <p className="quote text-[clamp(1.25rem,3vw,2rem)]">{title ?? d.empty.noResults}</p>
      {hint ? <p className="label mt-3">{hint}</p> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * A genuinely empty archive, which is how every real instance starts. It should
 * read as day one of a record, not as a broken page.
 */
export async function FirstRun({ signedIn }: { signedIn: boolean }) {
  const d = await getDictionary();
  return (
    <section className="on-ink grid-ghost border border-ink px-6 py-14 text-center sm:px-10 sm:py-20">
      <p className="label">{d.empty.firstRecord}</p>
      <h2 className="quote mt-4 text-[clamp(1.8rem,6vw,4rem)] text-paper">
        {d.empty.noYapsOnRecord}
      </h2>
      <p className="mx-auto mt-5 max-w-[46ch] text-[15px] leading-[1.6] text-muted-dark">
        {d.empty.restraint}
      </p>

      <dl className="mx-auto mt-10 grid max-w-[520px] grid-cols-3 border-l border-t border-paper/20">
        {[
          ["0", d.empty.yapsUnit],
          ["0", d.empty.auraUnit],
          ["0", d.empty.witnessesUnit],
        ].map(([value, label]) => (
          <div key={label} className="border-b border-r border-paper/20 px-3 py-4">
            <dd className="mono text-[26px] font-bold leading-none text-acid">{value}</dd>
            <dt className="label mt-2">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-10">
        <Link href={signedIn ? "/submit" : "/login?next=/submit"} className="btn btn-acid btn-lg">
          {d.empty.fileFirst} →
        </Link>
      </div>
      <p className="label mt-4">{d.empty.firstRecordHint}</p>
    </section>
  );
}

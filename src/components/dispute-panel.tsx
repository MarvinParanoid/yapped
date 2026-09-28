"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { withdrawDisputeAction } from "@/app/actions";
import { useD, useLocale } from "@/lib/i18n/client";
import { fill, plural } from "@/lib/i18n/locale";

/**
 * Reports a dispute that has been filed. Filing and withdrawing live in the
 * verification panel, beside the author's other move — this block exists to
 * make the contest impossible to miss.
 *
 * The statement is never removed: the archive keeps the disagreement.
 */
export function DisputePanel({
  yapId,
  authorName,
  isAuthor,
  disputed,
  statement,
  witnessCount,
}: {
  yapId: number;
  authorName: string;
  isAuthor: boolean;
  disputed: boolean;
  statement: string | null;
  witnessCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const d = useD();
  const locale = useLocale();

  // Derived from props on purpose: a useState initialiser does not re-run when
  // the server sends new props after router.refresh(), so local copies of
  // server state silently go stale.
  if (!disputed) return null;

  return (
    <section className="border border-red bg-paper">
      <header className="flex items-center justify-between gap-3 border-b border-red px-3 py-2">
        <span className="label-strong text-red">{d.note.disputedByAuthor}</span>
        <span className="label">{d.verification.contestedRecord}</span>
      </header>
      <div className="px-4 py-4">
        <p className="text-[14px] leading-[1.55]">
          {fill(d.verification.contestsAccuracy, { name: authorName })}{" "}
          <span className="text-muted">
            {witnessCount > 0
              ? fill(d.verification.standByTestimony, {
                  witnesses: fill(
                    plural(locale, witnessCount, [
                      d.note.witnessOne,
                      d.note.witnessFew,
                      d.note.witnessMany,
                    ]),
                    { n: witnessCount },
                  ),
                })
              : d.verification.noWitnessesForward}
          </span>
        </p>

        {statement ? (
          <blockquote className="mt-4 border-l-2 border-ink pl-3">
            <p className="text-[15px] italic leading-[1.5]">“{statement}”</p>
            <footer className="label mt-2">— {authorName}, yapper statement</footer>
          </blockquote>
        ) : null}

        {isAuthor ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await withdrawDisputeAction(yapId);
                if (result.ok) router.refresh();
              })
            }
            className="btn mt-4"
          >
            {d.verification.withdrawDispute}
          </button>
        ) : null}
      </div>
    </section>
  );
}

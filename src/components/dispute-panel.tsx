"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { withdrawDisputeAction } from "@/app/actions";
import { witnessLabel } from "@/lib/verification";

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

  // Derived from props on purpose: a useState initialiser does not re-run when
  // the server sends new props after router.refresh(), so local copies of
  // server state silently go stale.
  if (!disputed) return null;

  return (
    <section className="border border-red bg-paper">
      <header className="flex items-center justify-between gap-3 border-b border-red px-3 py-2">
        <span className="label-strong text-red">Disputed by yapper</span>
        <span className="label">contested record</span>
      </header>
      <div className="px-4 py-4">
        <p className="text-[14px] leading-[1.55]">
          {authorName} contests the accuracy of this record.{" "}
          <span className="text-muted">
            {witnessCount > 0
              ? `${witnessLabel(witnessCount)} stand by their testimony.`
              : "No witnesses have come forward."}
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
            Withdraw dispute
          </button>
        ) : null}
      </div>
    </section>
  );
}

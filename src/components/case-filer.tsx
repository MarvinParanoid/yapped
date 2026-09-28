"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fileUnderCaseAction, openCaseAction } from "@/app/actions";
import { cn } from "@/lib/cn";
import { useD } from "@/lib/i18n/client";
import type { FilableCase } from "@/lib/services/cases";

/** Filing a record under a case, in the archive's own vocabulary. */
export function CaseFiler({
  yapId,
  cases,
}: {
  yapId: number;
  cases: FilableCase[];
}) {
  const d = useD();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        File under a case
      </button>
    );
  }

  return (
    <div className="w-full border border-ink bg-paper-2 px-3 py-3">
      <span className="label">{d.sections.fileUnder}</span>

      {cases.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {cases.map((file) => (
            <button
              key={file.id}
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await fileUnderCaseAction(yapId, file.id);
                  if (result.ok) {
                    setOpen(false);
                    router.refresh();
                  } else setError(d.sections.couldNotFile);
                })
              }
              className={cn("btn", file.status === "CLOSED" && "border-line-soft text-muted")}
              title={file.status === "CLOSED" ? "This case is closed — filing reopens the question" : undefined}
            >
              {file.code} {file.title}
              {file.status === "CLOSED" ? <span className="label ml-1">{d.sections.closed}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="label mt-2">{d.sections.noCasesYet}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={d.sections.openNewCase}
          className="field max-w-[280px] flex-1"
        />
        <button
          type="button"
          disabled={pending || title.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              const result = await openCaseAction(yapId, title);
              if (result.ok && result.caseId) router.push(`/case/${result.caseId}`);
              else setError("A case needs a title.");
            })
          }
          className="btn btn-acid"
        >
          Open case
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      {error ? <p className="label mt-2 text-red">{error}</p> : null}
    </div>
  );
}

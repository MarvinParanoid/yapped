"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteYapAction, editYapAction, restoreYapAction } from "@/app/actions";
import { formatDate } from "@/lib/format";
import { useD } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/locale";
import type { RedactedRow } from "@/lib/services/yaps";

type Row = {
  id: number;
  code: string;
  text: string;
  lore: string | null;
  author: string;
  saidAt: Date;
};

/** Live records, with one destructive control and a confirm step in front of it. */
export function ContentTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const d = useD();
  const months = d.profile.months.split(" ");

  if (rows.length === 0) return <p className="label px-3 py-4">{d.admin.nothingOnRecord}</p>;

  return (
    <ul>
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-ink px-3 py-2 last:border-b-0"
        >
          <span className="mono text-[11px] text-muted">{row.code}</span>
          <Link href={`/yap/${row.id}`} className="max-w-[60ch] truncate text-[13px] hover:underline">
            {row.text}
          </Link>
          <span className="label">{row.author}</span>
          <span className="label tabnums">{formatDate(row.saidAt, months)}</span>
          <span className="ml-auto flex items-center gap-4">
            <button
              type="button"
              className="label hover:text-ink"
              onClick={() => setEditing(editing === row.id ? null : row.id)}
            >
              {d.admin.edit}
            </button>
            {confirming === row.id ? (
              <button
                type="button"
                disabled={pending}
                className="label text-red hover:opacity-70"
                onClick={() =>
                  startTransition(async () => {
                    await deleteYapAction(row.id);
                    setConfirming(null);
                    router.refresh();
                  })
                }
              >
                {d.admin.reallyRedact}
              </button>
            ) : (
              <button
                type="button"
                className="label hover:text-red"
                onClick={() => setConfirming(row.id)}
              >
                {d.admin.redact}
              </button>
            )}
          </span>

          {editing === row.id ? (
            <EditRow row={row} onDone={() => setEditing(null)} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Correcting a misquote. Narrow on purpose: the words and their context, and
 * nothing the record has earned since it was filed.
 */
function EditRow({ row, onDone }: { row: Row; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(row.text);
  const [lore, setLore] = useState(row.lore ?? "");
  const [error, setError] = useState<string | null>(null);
  const d = useD();

  return (
    <div className="yap-in mt-2 w-full border border-ink bg-paper-2 px-3 py-3">
      <span className="label-strong">{d.admin.editHeading}</span>

      <label htmlFor={`text-${row.id}`} className="label mt-3 block">
        {d.admin.quoteText}
      </label>
      <textarea
        id={`text-${row.id}`}
        rows={2}
        maxLength={400}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="field mt-1.5 resize-none"
      />

      <label htmlFor={`lore-${row.id}`} className="label mt-3 block">
        {d.admin.loreText}
      </label>
      <textarea
        id={`lore-${row.id}`}
        rows={2}
        maxLength={2000}
        value={lore}
        onChange={(event) => setLore(event.target.value)}
        className="field mt-1.5 resize-none"
      />

      <p className="label mt-2 leading-[1.5] normal-case tracking-normal">{d.admin.editNote}</p>
      {error ? <p className="label mt-2 text-red">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          className="btn btn-solid"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await editYapAction(row.id, text, lore);
              if (result.ok) {
                onDone();
                router.refresh();
              } else setError(result.error ?? d.admin.refused);
            })
          }
        >
          {pending ? d.admin.saving : d.admin.save}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {d.admin.cancel}
        </button>
      </div>
    </div>
  );
}

export function RedactedTable({ rows }: { rows: RedactedRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const d = useD();
  const months = d.profile.months.split(" ");

  if (rows.length === 0) {
    return <p className="label px-3 py-4">{d.admin.nothingRedacted}</p>;
  }

  return (
    <ul>
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-ink px-3 py-2 last:border-b-0"
        >
          <span className="mono text-[11px] text-muted">{row.code}</span>
          <span className="max-w-[60ch] truncate text-[13px] line-through opacity-60">
            {row.text}
          </span>
          <span className="label">{row.author}</span>
          <span className="label tabnums">
            {fill(d.admin.redactedAt, { date: formatDate(row.deletedAt, months) })}
          </span>
          <button
            type="button"
            disabled={pending}
            className="label ml-auto hover:text-ink"
            onClick={() =>
              startTransition(async () => {
                await restoreYapAction(row.id);
                router.refresh();
              })
            }
          >
            {d.admin.restore}
          </button>
        </li>
      ))}
    </ul>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteYapAction, restoreYapAction } from "@/app/actions";
import { formatDate } from "@/lib/format";
import { useD } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/locale";
import type { RedactedRow } from "@/lib/services/yaps";

type Row = { id: number; code: string; text: string; author: string; saidAt: Date };

/** Live records, with one destructive control and a confirm step in front of it. */
export function ContentTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<number | null>(null);
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
          <span className="ml-auto">
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
        </li>
      ))}
    </ul>
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

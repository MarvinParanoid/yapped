"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useD } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/locale";
import type { EvidenceView } from "@/lib/types";

/** Evidence supports the quote. It never becomes the content. */
export function EvidencePanel({ evidence }: { evidence: EvidenceView }) {
  const d = useD();
  const number = String(evidence.position).padStart(2, "0");

  return (
    <section className="border border-ink bg-paper">
      <header className="flex items-center justify-between gap-3 border-b border-ink px-3 py-2">
        <span className="label-strong">{fill(d.record.evidenceNumber, { n: number })}</span>
        <Dialog.Root>
          <Dialog.Trigger className="label-strong border border-ink px-2 py-1 transition-colors duration-100 hover:bg-ink hover:text-paper">
            {d.record.enlarge} ⤢
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/90" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(94vw,1000px)] -translate-x-1/2 -translate-y-1/2 border border-paper bg-ink p-3">
              <Dialog.Title className="label-strong mb-2 text-paper">
                {fill(d.record.evidenceNumber, { n: number })}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                {evidence.caption ?? d.record.attachedEvidence}
              </Dialog.Description>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={evidence.url}
                alt={evidence.caption ?? ""}
                className="max-h-[76vh] w-full object-contain"
              />
              <Dialog.Close className="btn mt-3 w-full border-paper/30 text-paper hover:bg-paper hover:text-ink">
                Close
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </header>
      <div className="p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={evidence.url}
          alt={evidence.caption ?? ""}
          className="w-full border border-ink object-cover"
        />
        {evidence.caption ? <p className="label mt-2">{evidence.caption}</p> : null}
      </div>
    </section>
  );
}

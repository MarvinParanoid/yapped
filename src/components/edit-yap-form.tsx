"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { editYapAction } from "@/app/actions";
import { useD } from "@/lib/i18n/client";

/**
 * Correcting a record, on the record's own page.
 *
 * Editing used to live only in the admin table, which meant the person most
 * likely to spot a typo — whoever filed the quote — had no way to fix it:
 * `/admin` is gated on moderation rights, while `editYap` has always allowed
 * the submitter. The service was more permissive than the interface, silently.
 *
 * Only the words change. Aura, witnesses, the author's position and the
 * archival number all stay, because a typo corrected is not a different
 * statement — which is what the note under the fields says out loud.
 */
export function EditYapForm({
  yapId,
  initialText,
  initialLore,
}: {
  yapId: number;
  initialText: string;
  initialLore: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [lore, setLore] = useState(initialLore);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const d = useD();

  const unchanged = text.trim() === initialText.trim() && lore.trim() === initialLore.trim();

  return (
    <div className="border border-ink bg-paper-2 px-4 py-4">
      <label htmlFor="edit-text" className="label block">
        {d.record.quoteText}
      </label>
      <textarea
        id="edit-text"
        rows={3}
        maxLength={400}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="field mt-1.5 resize-y"
      />
      <span className="label tabnums mt-1 block text-right">{text.length}/400</span>

      <label htmlFor="edit-lore" className="label mt-3 block">
        {d.record.loreText}
      </label>
      <textarea
        id="edit-lore"
        rows={5}
        maxLength={2000}
        value={lore}
        onChange={(event) => setLore(event.target.value)}
        className="field mt-1.5 resize-y"
      />

      <p className="label mt-3 leading-[1.5] normal-case tracking-normal">{d.record.editNote}</p>
      {error ? <p className="label mt-2 text-red">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || unchanged || text.trim().length < 2}
          className="btn btn-acid btn-lg"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await editYapAction(yapId, text, lore);
              if (!result.ok) {
                setError(result.error ?? d.admin.refused);
                return;
              }
              router.push(`/yap/${yapId}`);
              router.refresh();
            })
          }
        >
          {pending ? d.admin.saving : d.admin.save}
        </button>
        <button type="button" className="btn btn-lg" onClick={() => router.back()}>
          {d.admin.cancel}
        </button>
      </div>
    </div>
  );
}

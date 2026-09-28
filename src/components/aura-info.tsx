"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { REACTION_KEYS, REACTION_META, REACTION_WEIGHTS } from "@/lib/ranking/aura";

/**
 * What aura is, and what each reaction is worth.
 *
 * The archive has had a scoring system since the first day and no way to look
 * at it — a reader asked how the number is arrived at, which is a fair question
 * about a number printed this large. The weights are read from the ranking
 * module rather than retyped, so changing a weight changes this panel too and
 * the explanation can never drift from the arithmetic.
 *
 * On brand: the trigger is a bordered "?" rather than a glyph, because an
 * information symbol outside the loaded font subset renders as nothing at all —
 * which is how the search icon disappeared once already.
 */
export function AuraInfo({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="How aura is counted"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "mono flex h-[14px] w-[14px] items-center justify-center border border-current",
          "text-[9px] font-bold leading-none opacity-50 transition-opacity duration-100",
          "hover:opacity-100",
          open && "opacity-100",
        )}
      >
        ?
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="How aura is counted"
          className={cn(
            "yap-in z-50",
            // On a phone the trigger can sit anywhere across the width, so an
            // anchored panel gets cut off by whichever edge it is nearest —
            // which is exactly what happened to the left-aligned AURA label on
            // a record page. Below `sm` it is a sheet pinned inside the
            // viewport instead; from `sm` up it hangs off the trigger again.
            "fixed inset-x-4 bottom-4 max-h-[75vh] overflow-y-auto",
            "sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+6px)]",
            "sm:w-[min(19rem,calc(100vw-2rem))]",
            // `on-paper` undoes an enclosing `.on-ink`; this panel is light
            // wherever it is opened from.
            "on-paper border border-ink bg-paper text-ink shadow-[4px_4px_0_0_rgba(12,12,12,0.12)]",
            // The trigger sits inside a .label, which is mono, uppercase and
            // letter-spaced. Prose inheriting that is unreadable — and this
            // panel exists to be read — so the typography is reset here and
            // re-applied only where a caption is wanted.
            "font-sans normal-case tracking-normal",
          )}
        >
          <header className="border-b border-ink px-3 py-2">
            <span className="label-strong">How aura is counted</span>
          </header>

          <div className="px-3 py-2.5">
            <p className="text-[12px] leading-[1.5]">
              Aura is how hard the room reacted. Every reaction is worth a fixed number, and
              the total is simply their sum.
            </p>

            <dl className="mt-2.5 border-t border-ink/15">
              {REACTION_KEYS.map((key) => (
                <div
                  key={key}
                  className="flex items-center gap-2 border-b border-ink/15 py-1.5 last:border-b-0"
                >
                  <dd className="text-[13px] leading-none">{REACTION_META[key].emoji}</dd>
                  <dt className="label flex-1">{REACTION_META[key].label}</dt>
                  <dd
                    className={cn(
                      "mono tabnums text-[12px] font-bold",
                      REACTION_WEIGHTS[key] < 0 ? "text-red" : "text-ink",
                    )}
                  >
                    {REACTION_WEIGHTS[key] > 0 ? "+" : ""}
                    {REACTION_WEIGHTS[key]}
                  </dd>
                </div>
              ))}
            </dl>

            {/* The two things that surprise people, in the order they surprise them. */}
            <p className="label mt-2.5 leading-[1.5]">
              cringe subtracts. that is the point — the archive records how a statement landed,
              and some of them landed badly.
            </p>
            <p className="label mt-2 leading-[1.5]">
              you cannot react to your own statement. the author&apos;s channel is{" "}
              <span className="text-ink">i said that</span>, and it moves no numbers.
            </p>
            <p className="label mt-2 leading-[1.5]">
              aura is not proof. whether a statement was really made is a separate question,
              answered by witnesses.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

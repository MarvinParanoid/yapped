"use client";

import { useState } from "react";

/** Long context hides behind VIEW THE LORE ↓ so the quote keeps the stage. */
export function LorePanel({ lore, defaultOpen = false }: { lore: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border border-ink bg-paper">
      <header className="flex items-center justify-between gap-3 border-b border-ink px-3 py-2">
        <span className="label-strong">Lore</span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="label-strong border border-ink px-2 py-1 transition-colors duration-100 hover:bg-ink hover:text-paper"
          aria-expanded={open}
        >
          {open ? "Hide" : "View the lore ↓"}
        </button>
      </header>
      {open ? (
        <div className="yap-in px-4 py-4">
          {lore.split(/\n{2,}/).map((paragraph, index) => (
            <p
              key={index}
              className="mb-3 max-w-[62ch] text-[15px] leading-[1.55] last:mb-0 sm:text-[16px]"
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <p className="label px-4 py-4">context withheld pending request</p>
      )}
    </section>
  );
}

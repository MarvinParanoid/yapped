"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useD } from "@/lib/i18n/client";
import { SEARCH_QUALIFIERS } from "@/lib/search";

function MagnifierIcon() {
  // Inline rather than a glyph: ⌕ is not in most font subsets and reads as
  // noise when it does render.
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.5" y1="10.5" x2="14.5" y2="14.5" strokeLinecap="square" />
    </svg>
  );
}

/**
 * Search is an action, not a filter, so it lives in the header rather than
 * competing with the feed's window control — but it has to be findable, so it
 * is a labelled control, not a bare symbol.
 */
export function HeaderSearch() {
  const d = useD();
  const router = useRouter();
  // Stay open, holding the term, while looking at results — otherwise the
  // search appears to have vanished and it is unclear what is being filtered.
  const active = useSearchParams().get("q") ?? "";
  const [open, setOpen] = useState(Boolean(active));
  const [value, setValue] = useState(active);
  // The qualifier crib sheet is help, not furniture: it appears while typing
  // and gets out of the way otherwise.
  const [helping, setHelping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Only steal focus when a person opened the box, not when it was restored
  // from the URL on a results page.
  const openedByUser = useRef(false);

  useEffect(() => {
    if (open && openedByUser.current) inputRef.current?.focus();
  }, [open]);

  // The header lives in the layout and is never remounted, so a useState
  // initialiser would keep the term from the first render forever. Follow the
  // URL instead.
  useEffect(() => {
    setValue(active);
    if (active) setOpen(true);
  }, [active]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === "/" && !open && !typing) {
        event.preventDefault();
        openedByUser.current = true;
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          openedByUser.current = true;
          setOpen(true);
        }}
        aria-label={d.nav.searchAria}
        title={`${d.nav.searchAria}  ( / )`}
        className="btn gap-2"
      >
        <MagnifierIcon />
        <span className="hidden sm:inline">{d.nav.search}</span>
      </button>
    );
  }

  return (
    <form
      className="relative flex items-stretch border border-ink bg-paper"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        setOpen(false);
        router.push(query ? `/?q=${encodeURIComponent(query)}` : "/");
      }}
    >
      <span className="flex items-center pl-2.5 text-muted">
        <MagnifierIcon />
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setHelping(true)}
        onBlur={() => setTimeout(() => setHelping(false), 120)}
        placeholder={d.nav.searchPlaceholder}
        aria-label={d.nav.searchAria}
        className="w-[160px] bg-transparent px-2.5 font-mono text-[12px] outline-none placeholder:text-muted sm:w-[230px]"
      />
      <button
        type="submit"
        className="border-l border-ink px-2.5 label-strong hover:bg-ink hover:text-paper"
      >
        Go
      </button>
      <button
        type="button"
        onClick={() => {
          setValue("");
          setOpen(false);
        }}
        aria-label={d.sections.closeSearch}
        className="border-l border-ink px-2 label-strong hover:bg-ink hover:text-paper"
      >
        ✕
      </button>

      {/* The archive is read by people who live in GitHub search. */}
      <div
        hidden={!helping}
        className="absolute right-0 top-[calc(100%+1px)] z-30 w-[290px] border border-ink bg-paper"
      >
        <p className="label border-b border-ink px-3 py-1.5">{d.sections.qualifiers}</p>
        <ul>
          {SEARCH_QUALIFIERS.map((qualifier) => (
            <li key={qualifier.example}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setValue((current) =>
                    current ? `${current.trimEnd()} ${qualifier.example}` : qualifier.example,
                  );
                  inputRef.current?.focus();
                }}
                className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-paper-3"
              >
                <span className="mono text-[11px] font-bold">{qualifier.example}</span>
                <span className="label truncate">{qualifier.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

/**
 * A real navigation rather than router.refresh().
 *
 * refresh() re-renders in place without touching the URL, so when anything in
 * the client router misbehaves the button silently does nothing and there is
 * no way to tell. Replacing the URL with a nonce guarantees the page re-runs,
 * keeps Back sane (replace, not push) and makes a reload show a new record too.
 */
export function GetYappedAgain({ currentId }: { currentId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const again = () => {
    startTransition(() => {
      // Excluding the current record guarantees the screen changes — drawing
      // the same quote twice is exactly what makes a button look broken.
      router.replace(`/random?n=${Date.now().toString(36)}&not=${currentId}`, { scroll: false });
    });
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (typing) return;
      if (event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        again();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      onClick={again}
      disabled={pending}
      className="btn btn-acid btn-lg w-full sm:w-auto"
    >
      {pending ? "Retrieving..." : "Get yapped again →"}
    </button>
  );
}

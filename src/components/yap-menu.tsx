"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deleteYapAction } from "@/app/actions";

export function YapMenu({
  yapId,
  code,
  canDelete,
}: {
  yapId: number;
  code: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDetailsElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        ref.current.removeAttribute("open");
        setConfirming(false);
      }
    }
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  async function copyLink() {
    const url = `${window.location.origin}/yap/${yapId}`;
    try {
      // navigator.clipboard is undefined outside a secure context, which is
      // exactly where a self-hosted instance lives before TLS.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement("textarea");
        field.value = url;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(field);
        if (!ok) throw new Error("copy rejected");
      }
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2500);
    }
  }

  return (
    <details ref={ref} className="relative">
      <summary
        className="flex h-6 w-6 cursor-pointer list-none items-center justify-center text-muted transition-colors duration-100 hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label={`Options for yap ${code}`}
      >
        ⋮
      </summary>
      <div className="absolute right-0 top-7 z-20 w-[230px] border border-ink bg-paper">
        <button type="button" onClick={copyLink} className="block w-full px-3 py-2 text-left label-strong hover:bg-paper-3">
          {copied ? "Link copied" : copyFailed ? "Copy failed — use share card" : "Copy link"}
        </button>
        <a href={`/yap/${yapId}/share`} target="_blank" rel="noreferrer" className="block border-t border-ink px-3 py-2 label-strong hover:bg-paper-3">
          Share card
        </a>
        {canDelete ? (
          confirming ? (
            <div className="border-t border-ink bg-paper-2 px-3 py-2">
              <p className="label-strong leading-[1.4] text-red">
                Remove from the historical record?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn border-red text-red hover:bg-red hover:text-paper"
                  onClick={async () => {
                    await deleteYapAction(yapId);
                    router.refresh();
                  }}
                >
                  Remove
                </button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="block w-full border-t border-ink px-3 py-2 text-left label-strong text-red hover:bg-paper-3"
            >
              Remove
            </button>
          )
        ) : null}
      </div>
    </details>
  );
}

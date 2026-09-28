"use client";

import { useD } from "@/lib/i18n/client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const d = useD();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1400px] flex-col justify-center px-4 py-20 sm:px-6 lg:px-8">
      <span className="label">{d.error.code500}</span>
      <h1 className="quote mt-3 text-[clamp(2rem,7vw,5rem)]">{d.error.crashedTitle}</h1>
      <p className="label mt-4 max-w-[46ch] leading-[1.6]">
        {d.error.crashedBody}
      </p>
      <button type="button" onClick={reset} className="btn btn-lg mt-8 self-start">
        {d.error.retry}
      </button>
    </div>
  );
}

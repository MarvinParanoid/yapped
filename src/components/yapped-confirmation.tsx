"use client";

import { useEffect, useState } from "react";
import { useD } from "@/lib/i18n/client";

/** Shown once, right after a submission. Then it gets out of the way. */
export function YappedConfirmation() {
  const [visible, setVisible] = useState(true);
  const d = useD();
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;

  return (
    <div className="yap-in mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 border border-ink bg-acid px-4 py-3">
      <span className="wordmark text-[20px]">YAPPED.</span>
      <span className="label-strong">{d.sections.permanentlyOnRecord}</span>
    </div>
  );
}

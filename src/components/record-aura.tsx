"use client";

import { AuraInfo } from "@/components/aura-info";
import { useD } from "@/lib/i18n/client";
import { useLiveAura } from "@/lib/live-aura";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";

/** The record's headline aura, which moves when the chips below it are pressed. */
export function RecordAura({ yapId, initial }: { yapId: number; initial: number }) {
  const aura = useLiveAura(yapId, initial);
  const d = useD();

  return (
    <>
      <div
        // Keyed on the value so the number visibly ticks over rather than
        // silently swapping.
        key={aura}
        className={cn(
          "mono tabnums aura-pulse text-[34px] font-bold leading-none",
          aura < 0 ? "text-red" : "text-acid",
        )}
      >
        {aura >= 0 ? "+" : ""}
        {formatCount(aura)}
      </div>
      <div className="label mt-1.5 flex items-center gap-1.5">
        {d.reactions.aura}
        <AuraInfo />
      </div>
    </>
  );
}
